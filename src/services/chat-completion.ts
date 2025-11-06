import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { Message } from "../querier";
import {
  extractPageReferences,
  buildReferencedPagesContext,
  buildSystemPromptWithoutCurrentPage,
} from "./context-builder";
import { onTaskEnd, startTask } from "./jobs";

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

const openai = createOpenAI({
  apiKey: OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are a helpful AI assistant integrated with Logseq. Help users with their questions and tasks.

Just note, when a user uses the \`[[SOME PAGE NAME]]\` syntax, they are referring to a page, and you can find it in the page references list.`;

export async function streamChatCompletion(
  input: string,
  messages: Message[]
): Promise<AsyncIterable<string>> {
  // Extract page references
  const extractedBrackets = extractPageReferences(input);
  console.log("Extracted brackets:", extractedBrackets);

  // Build referenced pages context
  const extractedPagesContent = await buildReferencedPagesContext(
    extractedBrackets
  );
  console.log("Extracted pages content:", extractedPagesContent);

  const systemPromptWithContext = buildSystemPromptWithoutCurrentPage(
    SYSTEM_PROMPT,
    extractedPagesContent
  );

  const newMessage: Message = { role: "user", content: input };

  console.log(systemPromptWithContext, messages);

  // Stream AI response
  const result = await streamText({
    model: openai("gpt-4"),
    messages: [
      { role: "system" as const, content: systemPromptWithContext },
      ...messages,
      newMessage,
    ],
  });

  return result.textStream;
}

const newCompletionJobId = (pageId: string) => `completion-job-${pageId}`;

export function spawnCompletionJobForPage(
  pageId: string,
  { input, messages }: { input: string; messages: Message[] }
) {
  return startTask(newCompletionJobId(pageId), async () => {
    const stream = streamChatCompletion(input, messages);
    const properties = () => ({ role: "assistant" });

    // First, append a new block to the page and get its uuid
    const newBlock = await logseq.Editor.appendBlockInPage(pageId, "", {
      properties: properties(),
    }); // empty string for initial content
    if (!newBlock?.uuid)
      throw new Error("Failed to create block for streaming response.");

    // We'll accumulate streaming text here so we can update the block content
    let content = "";

    // Await the stream and update block as we go
    for await (const delta of await stream) {
      content += delta;
      await logseq.Editor.updateBlock(newBlock.uuid, content, {
        properties: properties(),
      });
    }
  });
}

export function onCompletionJobDone(pageId: string, listener: () => void) {
  onTaskEnd(newCompletionJobId(pageId), listener);
}
