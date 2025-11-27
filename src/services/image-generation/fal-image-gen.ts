import { fal } from "@fal-ai/client";

/**
 * Configuration for FAL image generation
 */
export interface FalImageGenConfig {
  prompt: string;
  model?: "fal-ai/flux/schnell" | "fal-ai/flux/dev" | "fal-ai/flux-pro";
  imageSize?:
    | "square_hd"
    | "square"
    | "portrait_4_3"
    | "portrait_16_9"
    | "landscape_4_3"
    | "landscape_16_9";
  numImages?: number;
  outputFormat?: "jpeg" | "png";
  syncMode?: boolean; // If true, returns images as base64 data URIs instead of URLs
}

/**
 * Result from FAL image generation
 */
export interface FalImageGenResult {
  images: Array<{
    url: string;
    width: number;
    height: number;
    content_type: string;
  }>;
  prompt: string;
}

/**
 * Generates an image using FAL AI
 * @param config Configuration for image generation
 * @returns Image generation result with URLs
 */
export async function generateImage(
  config: FalImageGenConfig
): Promise<FalImageGenResult> {
  const apiKey = logseq.settings?.falApiKey;

  if (typeof apiKey !== "string" || apiKey.trim() === "") {
    throw new Error(
      "FAL API key is not configured. Please set it in the plugin settings."
    );
  }

  // Configure FAL client
  fal.config({
    credentials: apiKey.trim(),
  });

  const model = config.model || "fal-ai/flux/schnell";
  const imageSize = config.imageSize || "square_hd";
  const numImages = config.numImages || 1;
  const outputFormat = config.outputFormat || "jpeg";
  const syncMode = config.syncMode || false;

  try {
    const result = await fal.subscribe(model, {
      input: {
        prompt: config.prompt,
        image_size: imageSize,
        num_images: numImages,
        output_format: outputFormat,
        sync_mode: syncMode,
      },
      logs: false,
    });

    return {
      images: result.data.images,
      prompt: config.prompt,
    };
  } catch (error) {
    console.error("FAL image generation error:", error);
    throw new Error(
      `Failed to generate image: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}
