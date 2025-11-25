import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { Message } from "../logseq/querier";
/**
 * This is just a simple completion helper; abstracts prompting to text stream
 * conversion, and it is not exclusive to prompts to generate text that shows up
 * on screen; could also be used for multi-shot prompting.
 * @param options Parameters for the run completion job
 * @returns An async iterable containing all the message deltas
 */
export async function* runCompletion({
  messages,
  signal,
}: {
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
    messages: messages,
  });

  for await (const delta of stream.textStream) {
    if (signal.aborted) return;
    yield delta;
  }
}
