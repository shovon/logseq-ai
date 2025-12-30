import { createOpenAI } from "@ai-sdk/openai";
import { stepCountIs, streamText, type Tool, tool } from "ai";
import type { Message } from "../threading/threading";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import { loadMCPServers } from "./mcp";
import { z } from "zod";

export interface GeneratedImage {
  url: string;
  width: number;
  height: number;
}

/**
 * This is just a simple completion helper; abstracts prompting to text stream
 * conversion, and it is not exclusive to prompts to generate text that shows up
 * on screen; could also be used for multi-shot prompting.
 * @param options Parameters for the run completion job
 * @returns An async iterable containing all the message deltas
 */
export async function runCompletion({
  messages,
  abortSignal,
}: {
  messages: Message[];
  abortSignal: AbortSignal;
  imageResults?: GeneratedImage[];
}) {
  const apiKeyValue = logseq.settings?.openAiApiKey;

  if (typeof apiKeyValue !== "string" || apiKeyValue.trim() === "") {
    throw new Error(
      "OpenAI API key is not configured. Please set it in the plugin settings."
    );
  }

  const servers = loadMCPServers();
  const clients: Awaited<ReturnType<typeof createMCPClient>>[] = [];

  for (const server of servers) {
    clients.push(await createMCPClient({ transport: server }));
  }

  const tools = {} as Record<string, Tool>;

  for (const client of clients) {
    const clientTools = await client.tools();
    Object.assign(tools, clientTools);
  }

  const openai = createOpenAI({
    apiKey: apiKeyValue,
  });

  const stream = await streamText({
    stopWhen: stepCountIs(10),
    model: openai("gpt-3.5-turbo"),
    abortSignal,

    tools,

    onFinish: () => {
      for (const client of clients) {
        client.close();
      }
    },

    messages: messages,
  });

  return stream;
}
