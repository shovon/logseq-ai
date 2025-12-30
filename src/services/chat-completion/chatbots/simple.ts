import { z } from "zod";
import type { Message } from "../../threading/threading";
import type { Chatbot } from "../chatbot";
import type { ChatCompletionJobEvent } from "../chat-completion-job-event";
import { runCompletion } from "../chat-completion";
import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, streamText } from "ai";
import { sanitizeMarkdown } from "../../../utils/utils";
import { buildPageContext } from "../context-builder";
import { generateEmbedding } from "../../embedding/embedding";
import { vectorSearch } from "../../embedding/db";
import {
  filterPropertyLines,
  sanitizeMarkdownHeadersToRfcBullets,
} from "../../../utils/utils";

/**
 * Detects user intent from their message
 */
const IntentSchema = z.object({
  intent: z.enum([
    "analyze_current_page",
    "general_query",
    "analyze_specific_page",
    "create_new_page",
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
4. "create_new_page" - User is requesting to create a new page

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
  shouldCreatePage: boolean;
}> {
  // Detect intent

  let enhancedMessage = originalMessage;
  let contextAdded = false;

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

          const content = sanitizeMarkdownHeadersToRfcBullets(
            filterPropertyLines(rawContent)
          ).trim();
          if (!content) {
            continue;
          }

          const pageName =
            block.page?.originalName ||
            block.page?.name ||
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
          retrievalContext += `${pageName}:\n`;
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

  return {
    enhancedMessage,
    contextAdded,
    shouldCreatePage: false,
  };
}

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
  const stream = await runCompletion({
    messages: messages,
    abortSignal: abortSignal,
  });

  for await (const part of stream.fullStream) {
    if (abortSignal.aborted) return;

    if (part.type === "text-delta") {
      yield { type: "text-delta", delta: part.text };
    }
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
    model: openai("gpt-4o-mini"),
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

async function* _simpleChatbot(
  input: string,
  messages: Message[],
  abortSignal: AbortSignal
): ReturnType<Chatbot> {
  console.log("Invoking simple chatbot");
  const { enhancedMessage } = await buildEnhancedMessage(input);

  const m = [
    { role: "system" as const, content: SYSTEM_PROMPT },
    ...messages,
    { role: "user" as const, content: enhancedMessage },
  ] satisfies Message[];

  yield* chatThreadMessage(m, abortSignal);

  yield { type: "nothing" };
}
export const simpleChatbot: Chatbot = _simpleChatbot;
