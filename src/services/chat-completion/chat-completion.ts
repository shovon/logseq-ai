import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { Message } from "../logseq/querier";
import { buildEnhancedMessage } from "./agent-orchestrator";

const SYSTEM_PROMPT = `You are a helpful AI assistant integrated with Logseq. Help users with their questions and tasks.

Just note, when a user uses the \`[[SOME PAGE NAME]]\` syntax, they are referring to a page, and you can find it in the page references list.`;

export async function* runCompletion({
  input,
  messages,
  signal,
}: {
  input: string;
  messages: Message[];
  signal: AbortSignal;
}): AsyncIterable<string> {
  const apiKeyValue = logseq.settings?.openAiApiKey;

  if (typeof apiKeyValue !== "string" || apiKeyValue.trim() === "") {
    throw new Error(
      "OpenAI API key is not configured. Please set it in the plugin settings."
    );
  }

  const openai = createOpenAI({
    apiKey: apiKeyValue,
  });

  const stream = await streamText({
    model: openai("gpt-4"),
    messages: await buildPromptWithContext(input, messages),
  });

  for await (const delta of stream.textStream) {
    if (signal.aborted) return;
    yield delta;
  }
}

async function buildPromptWithContext(
  input: string,
  messages: Message[]
): Promise<Message[]> {
  // Use agentic orchestrator to enhance the message with page context if needed
  const { enhancedMessage } = await buildEnhancedMessage(input);

  return [
    { role: "system", content: SYSTEM_PROMPT },
    ...messages,
    { role: "user" as const, content: enhancedMessage },
  ];
}
