import { createOpenAI } from "@ai-sdk/openai";
import { stepCountIs, streamText, type Tool, tool } from "ai";
import type { Message } from "../threading/querier";
import { experimental_createMCPClient as createMCPClient } from "@ai-sdk/mcp";
import { loadMCPServers } from "./mcp";
import { generateImage } from "../image-generation/fal-image-gen";
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
  imageResults = [],
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

  // Add FAL image generation tool
  tools.generate_image = tool({
    description:
      "Generate an image using AI based on a text prompt. Returns base64 data URIs for the generated images.",
    inputSchema: z.object({
      prompt: z
        .string()
        .describe("The text description of the image to generate"),
      model: z
        .enum(["fal-ai/flux/schnell", "fal-ai/flux/dev", "fal-ai/flux-pro"])
        .optional()
        .describe(
          "The model to use for image generation. schnell is fastest, dev is balanced, pro is highest quality. Defaults to schnell."
        ),
      imageSize: z
        .enum([
          "square_hd",
          "square",
          "portrait_4_3",
          "portrait_16_9",
          "landscape_4_3",
          "landscape_16_9",
        ])
        .optional()
        .describe("The size/aspect ratio of the image. Defaults to square_hd."),
      numImages: z
        .number()
        .min(1)
        .max(4)
        .optional()
        .describe("Number of images to generate (1-4). Defaults to 1."),
      outputFormat: z
        .enum(["jpeg", "png"])
        .optional()
        .describe("Output format for the image. Defaults to jpeg."),
    }),
    execute: async ({ prompt, model, imageSize, numImages, outputFormat }) => {
      try {
        const result = await generateImage({
          prompt,
          model,
          imageSize,
          numImages,
          outputFormat,
          syncMode: true, // Always use sync mode to get base64 data URIs
        });

        // Push images to the mutable array
        for (const img of result.images) {
          imageResults.push({
            url: img.url,
            width: img.width,
            height: img.height,
          });
        }

        return {
          success: true,
          message: `Generated ${result.images.length} image(s)`,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  });

  const openai = createOpenAI({
    apiKey: apiKeyValue,
  });

  const stream = await streamText({
    stopWhen: stepCountIs(10),
    model: openai("gpt-5"),
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
