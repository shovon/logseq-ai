// TODO: perhaps get rid of this.

import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { buildPageContext } from "./context-builder";
import { generateEmbedding } from "../embedding/embedding";
import { vectorSearch } from "../embedding/db";
import { filterPropertyLines } from "../../utils/utils";

/**
 * Detects user intent from their message
 */
const IntentSchema = z.object({
  intent: z.enum([
    "analyze_current_page",
    "general_query",
    "analyze_specific_page",
  ]),
  reasoning: z
    .string()
    .describe("Brief explanation of why this intent was chosen"),
  pageName: z
    .string()
    .optional()
    .describe("If analyzing a specific page, the page name"),
});

export type DetectedIntent = z.infer<typeof IntentSchema>;

/**
 * Detects the user's intent from their message
 */
export async function detectIntent(
  userMessage: string
): Promise<DetectedIntent> {
  const apiKeyValue = logseq.settings?.openAiApiKey;

  if (typeof apiKeyValue !== "string" || apiKeyValue.trim() === "") {
    throw new Error(
      "OpenAI API key is not configured. Please set it in the plugin settings."
    );
  }

  const openai = createOpenAI({
    apiKey: apiKeyValue,
  });

  const { object } = await generateObject({
    model: openai("gpt-4o-mini"),
    schema: IntentSchema,
    prompt: `Analyze the user's message and determine their intent.

User message: "${userMessage}"

Determine if the user wants to:
1. "analyze_current_page" - They want to analyze or get information about the page they're currently viewing (e.g., "take a look at the current page", "what's this page about", "analyze this page", "tell me about this page")
2. "analyze_specific_page" - They want to analyze a specific page mentioned by name (e.g., "tell me about [[Project X]]", "what's in the [[Notes]] page")
3. "general_query" - A general question that doesn't require page analysis

Be liberal in detecting "analyze_current_page" - if the user mentions "current page", "this page", "the page", or asks what something is about without specifying a page, assume they mean the current page.`,
  });

  return object;
}

/**
 * Gets the current page that the user is viewing in Logseq
 */
export async function getCurrentPage(): Promise<{
  name: string;
  uuid: string;
  content: string | null;
} | null> {
  try {
    // Try to get the current page using Logseq's API
    // The API method may vary, so we'll try a few approaches
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const logseqAny = logseq as any;

    let currentPage: {
      name?: string;
      originalName?: string;
      uuid?: string;
    } | null = null;

    // Try the Editor API first (if available)
    if (logseqAny.Editor?.getCurrentPage) {
      try {
        currentPage = await logseqAny.Editor.getCurrentPage();
      } catch {
        // Continue to next method
      }
    }

    // Fallback to api.get_current_page if Editor method didn't work
    if (!currentPage && logseqAny.api?.get_current_page) {
      try {
        currentPage = logseqAny.api.get_current_page();
      } catch {
        // Continue
      }
    }

    if (!currentPage) {
      return null;
    }

    // Determine the page identifier to use for getting content
    const pageIdentifier =
      currentPage.name || currentPage.originalName || currentPage.uuid || null;

    if (!pageIdentifier) {
      return null;
    }

    // Get the page content
    const content = await buildPageContext(String(pageIdentifier));

    return {
      name: currentPage.name || currentPage.originalName || "Untitled",
      uuid: currentPage.uuid || "",
      content: content || null,
    };
  } catch (error) {
    console.error("Error getting current page:", error);
    return null;
  }
}

/**
 * Gets a specific page by name
 */
export async function getPageByName(pageName: string): Promise<{
  name: string;
  uuid: string;
  content: string | null;
} | null> {
  try {
    const page = await logseq.Editor.getPage(pageName);

    if (!page) {
      return null;
    }

    const content = await buildPageContext(pageName);

    return {
      name: page.name || page.originalName || pageName,
      uuid: page.uuid,
      content: content || null,
    };
  } catch (error) {
    console.error(`Error getting page "${pageName}":`, error);
    return null;
  }
}

/**
 * Builds an enhanced user message with page context if needed
 */
export async function buildEnhancedMessage(originalMessage: string): Promise<{
  enhancedMessage: string;
  contextAdded: boolean;
}> {
  // Detect intent
  const intent = await detectIntent(originalMessage);

  let enhancedMessage = originalMessage;
  let contextAdded = false;

  if (intent.intent === "analyze_current_page") {
    const currentPage = await getCurrentPage();

    if (currentPage && currentPage.content) {
      enhancedMessage = `User is asking about the current page they're viewing.

Current Page: ${currentPage.name}

Page Content:
${currentPage.content}

User's Question: ${originalMessage}

Please analyze the page content and provide a helpful response to the user's question.`;
      contextAdded = true;
    } else {
      enhancedMessage = `${originalMessage}

Note: The user asked about the current page, but no page is currently open or the page has no content.`;
    }
  } else if (intent.intent === "analyze_specific_page" && intent.pageName) {
    const page = await getPageByName(intent.pageName);

    if (page && page.content) {
      enhancedMessage = `User is asking about a specific page.

Page: ${page.name}

Page Content:
${page.content}

User's Question: ${originalMessage}

Please analyze the page content and provide a helpful response to the user's question.`;
      contextAdded = true;
    } else {
      enhancedMessage = `${originalMessage}

Note: The user asked about the page "${intent.pageName}", but it could not be found or has no content.`;
    }
  }

  // Always-on vector retrieval - retrieve relevant blocks from all notes
  try {
    const apiKeyValue = logseq.settings?.openAiApiKey;

    if (
      typeof apiKeyValue === "string" &&
      apiKeyValue.trim() !== "" &&
      apiKeyValue !== "sk-proj-1234"
    ) {
      // Generate embedding for the user's message
      const queryEmbedding = await generateEmbedding({
        inputText: originalMessage,
        apiKey: apiKeyValue,
      });

      // Search vector database for relevant blocks
      const searchResults = await vectorSearch(queryEmbedding);

      if (searchResults.hits && searchResults.hits.length > 0) {
        // Group results by page for better formatting
        const resultsByPage = new Map<
          string,
          Array<{ content: string; score: number }>
        >();

        for (const hit of searchResults.hits) {
          const doc = hit.document;
          const blockId =
            typeof doc.id === "string" ? doc.id.trim() : undefined;

          if (!blockId) {
            continue;
          }

          const block = await logseq.Editor.getBlock(blockId);
          const rawContent =
            typeof block?.content === "string" ? block.content.trim() : "";

          if (!block || !rawContent) {
            continue;
          }

          const content = filterPropertyLines(rawContent).trim();
          if (!content) {
            continue;
          }

          const pageName =
            block.page?.originalName ||
            block.page?.name ||
            block.page?.uuid ||
            String(block.page?.id || "Unknown Page");

          if (!resultsByPage.has(pageName)) {
            resultsByPage.set(pageName, []);
          }

          resultsByPage.get(pageName)?.push({
            content,
            score: hit.score || 0,
          });
        }

        // Format the retrieved context
        let retrievalContext =
          "\n\n---\n\n[Relevant context from your notes:]\n\n";

        for (const [pageName, blocks] of resultsByPage.entries()) {
          retrievalContext += `📄 ${pageName}:\n`;
          for (const block of blocks) {
            retrievalContext += `• ${block.content}\n`;
          }
          retrievalContext += "\n";
        }

        retrievalContext +=
          "[Please use the context above to inform your answer if relevant.]\n";

        // Append retrieval context to enhanced message
        enhancedMessage = enhancedMessage + retrievalContext;
        contextAdded = true;
      }
    }
  } catch (error) {
    console.error("Error during vector retrieval:", error);
    // Continue without vector context if it fails
  }

  return { enhancedMessage, contextAdded };
}
