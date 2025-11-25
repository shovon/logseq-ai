import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, streamText } from "ai";
import { z } from "zod";
import { type Task } from "../../utils/task-runner-repository/task-runner-repository";
import type { Message } from "../logseq/querier";
import { runCompletion } from "./chat-completion";
import { transformDashBulletPointsToStars } from "../../utils/utils";
import { from, merge } from "rxjs";
import type { JobKey, RunningState } from "./task-runner";
import { buildEnhancedMessage } from "./agent-orchestrator";

const SYSTEM_PROMPT = `You are a helpful AI assistant integrated with Logseq. Help users with their questions and tasks.

Just note, when a user uses the \`[[SOME PAGE NAME]]\` syntax, they are referring to a page, and you can find it in the page references list.

If the user asks to create a page, do not create the page, but instead just tell them something along the lines of you being glad to create a page, and leave it at that. There will be another background job creating the page.

For example:

User: "Could you create a page about cats?"

Assistant: "I will gladly create a page."

And then leave it at that.`;

const OPENAI_API_KEY_ERROR =
  "OpenAI API key is not configured. Please set it in the plugin settings.";

const TITLE_SCHEMA = z.object({
  title: z.string().trim().min(1).max(120),
});

function getOpenAIClient() {
  const apiKeyValue = logseq.settings?.openAiApiKey;

  if (typeof apiKeyValue !== "string" || apiKeyValue.trim() === "") {
    throw new Error(OPENAI_API_KEY_ERROR);
  }

  return createOpenAI({ apiKey: apiKeyValue.trim() });
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

async function* chatThreadMessage(
  jobKey: string,
  messages: Message[],
  abortSignal: AbortSignal
): AsyncIterable<RunningState> {
  const stream = await runCompletion({
    messages: messages,
    signal: abortSignal,
  });

  let content = "role:: assistant\n";
  const block = await logseq.Editor.appendBlockInPage(jobKey, content);
  if (!block?.uuid) throw new Error("Failed to append block");

  let isStreaming = false;
  for await (const chunk of stream) {
    if (!isStreaming) yield { type: "streaming" };
    isStreaming = true;
    if (abortSignal.aborted) return;
    content += chunk;
    await logseq.Editor.updateBlock(
      block.uuid,
      transformDashBulletPointsToStars(content)
    );
  }
}

async function newPage(
  prompt: string,
  abortSignal: AbortSignal
): Promise<void> {
  console.log("Creating page");
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
    await logseq.Editor.updateBlock(
      block.uuid,
      transformDashBulletPointsToStars(content)
    );
  }
}

export const simpleCompletion: (
  input: string,
  messages: Message[]
) => Task<JobKey, RunningState> =
  (input, messages) =>
  ({ jobKey, abortSignal }) => {
    return merge(
      from(
        (async function* fn() {
          const { enhancedMessage, shouldCreatePage } =
            await buildEnhancedMessage(input);

          const m = [
            { role: "system" as const, content: SYSTEM_PROMPT },
            ...messages,
            { role: "user" as const, content: enhancedMessage },
          ] satisfies Message[];
          yield* chatThreadMessage(jobKey, m, abortSignal);

          if (shouldCreatePage) {
            await newPage(input, abortSignal);
          }
        })()
      )
    );
  };
