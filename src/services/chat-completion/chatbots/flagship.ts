import { z } from "zod";
import type { Message } from "../../logseq/querier";
import { buildEnhancedMessage } from "../agent-orchestrator";
import type { Chatbot } from "../chatbot";
import type { ChatCompletionJobEvent } from "../chat-completion-job-event";
import type { GeneratedImage } from "../chat-completion";
import { runCompletion } from "../chat-completion";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, streamText } from "ai";
import { sanitizeMarkdown } from "../../../utils/utils";

const OPENAI_API_KEY_ERROR =
  "OpenAI API key is not configured. Please set it in the plugin settings.";

const TITLE_SCHEMA = z.object({
  title: z.string().trim().min(1).max(120),
});

const SYSTEM_PROMPT = `You are a helpful AI assistant integrated with Logseq. Help users with their questions and tasks.

Just note, when a user uses the \`[[SOME PAGE NAME]]\` syntax, they are referring to a page, and you can find it in the page references list.

Also note, wehn the user uses the second person "you" (such as when they are asking "what are you capable of?"), they are referring to the Logseq AI Plugin. In fact, that's exactly what you are.

Bear in mind, because the user would ask "what can you do", and the RAG system doesn't realize that by "you", it's referring to "Logseq AI Plugin", for this reason, here's some more context, in case the RAG context gives some bullshit:

* persisting and resuming sessions
* retrieval-augmented generation
* linking to pages directly from inside the threads
* image generation
* creating pages upon a prompt
* invoking MCP tools

If the user asks to create a page, do not write out the entire page in your response, but instead just tell them something along the lines of you being glad to create a page, and leave it at that. There will be another background job creating the page.

For example:

User: "Could you create a page about cats?"

Assistant: "I will gladly create a page."

And then leave it at that.`;

async function* chatThreadMessage(
  messages: Message[],
  abortSignal: AbortSignal
): AsyncIterable<ChatCompletionJobEvent> {
  const imageResults: GeneratedImage[] = [];

  const stream = await runCompletion({
    messages: messages,
    abortSignal: abortSignal,
    imageResults,
  });

  for await (const part of stream.fullStream) {
    if (abortSignal.aborted) return;

    if (part.type === "text-delta") {
      yield { type: "text-delta", delta: part.text };
    }

    // Flush any generated images as separate events
    while (imageResults.length > 0) {
      const image = imageResults.shift()!;
      yield { type: "image", image };
    }
  }

  // After streaming is done, check for any remaining images
  while (imageResults.length > 0) {
    const image = imageResults.shift()!;
    yield { type: "image", image };
  }
}

function buildFallbackTitle(request: string): string {
  const trimmed = request
    .split(/\r?\n/)[0]
    .trim()
    .replace(/\[\[|\]\]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();

  return trimmed || "Logseq AI Page";
}

function sanitizeTitle(value: string, fallback: string): string {
  const cleaned = value
    .replace(/\[\[|\]\]/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 120)
    .trim();

  return cleaned || fallback;
}

function getOpenAIClient() {
  const apiKeyValue = logseq.settings?.openAiApiKey;

  if (typeof apiKeyValue !== "string" || apiKeyValue.trim() === "") {
    throw new Error(OPENAI_API_KEY_ERROR);
  }

  return createOpenAI({ apiKey: apiKeyValue.trim() });
}

async function newPage(
  prompt: string,
  abortSignal: AbortSignal
): Promise<void> {
  const openai = getOpenAIClient();
  const fallbackTitle = buildFallbackTitle(prompt);

  const titleResponse = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: TITLE_SCHEMA,
    schemaDescription:
      "Return a short, descriptive Logseq page title that summarizes the user's request.",
    prompt: `Create a short, descriptive Logseq page title for the following user request. Avoid boilerplate such as "Logseq" or "Page", do not use Markdown, and keep it under 120 characters.\n\nUser request: ${prompt}`,
    abortSignal,
  });

  if (abortSignal.aborted) {
    return;
  }

  const pageTitle = sanitizeTitle(titleResponse.object.title, fallbackTitle);

  const page = await logseq.Editor.createPage(
    pageTitle,
    { type: "logseq ai generated page" },
    { createFirstBlock: false }
  );

  if (!page?.uuid) {
    throw new Error("Failed to create Logseq page for the generated title.");
  }

  const initialContent = "role:: assistant\n";
  const block = await logseq.Editor.appendBlockInPage(
    page.uuid,
    initialContent
  );

  if (!block?.uuid) {
    throw new Error("Failed to append assistant block to the new page.");
  }

  const stream = await streamText({
    model: openai("gpt-4"),
    messages: [
      {
        role: "user",
        content: `You are writing the contents of the Logseq page titled "${pageTitle}". Build a helpful, polished response that addresses the following user prompt:\n\n${prompt}`,
      },
    ],
    abortSignal,
  });

  let content = initialContent;

  for await (const chunk of stream.textStream) {
    if (abortSignal.aborted) return;
    content += chunk;
    await logseq.Editor.updateBlock(block.uuid, sanitizeMarkdown(content));
  }
}

export async function* flagshipChatbot(
  input: string,
  messages: Message[],
  abortSignal: AbortSignal
): ReturnType<Chatbot> {
  const { enhancedMessage, shouldCreatePage } =
    await buildEnhancedMessage(input);

  const m = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...messages,
    { role: "user" as const, content: enhancedMessage },
  ] satisfies Message[];

  yield* chatThreadMessage(m, abortSignal);

  // TODO: this should really be embedded as a tool.
  if (shouldCreatePage) {
    await newPage(input, abortSignal);
  }

  yield { type: "nothing" };
}
const _flagSshipCompletionTypeTest: Chatbot = flagshipChatbot;
