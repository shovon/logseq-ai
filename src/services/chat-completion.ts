import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { Message } from "../querier";
import {
  extractPageReferences,
  buildReferencedPagesContext,
  buildSystemPromptWithoutCurrentPage,
} from "./context-builder";

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
