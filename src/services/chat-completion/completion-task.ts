import { createOpenAI } from "@ai-sdk/openai";
import { generateObject, streamText } from "ai";
import { z } from "zod";
import type { Message } from "../logseq/querier";
import { runCompletion, type GeneratedImage } from "./chat-completion";
import { sanitizeMarkdown, gate } from "../../utils/utils";
import type { JobKey, CompletionState, CompletionAction } from "./task-runner";
import { buildEnhancedMessage } from "./agent-orchestrator";
import { from as fromAsyncIterable } from "ix/asynciterable";
import { filter, map, share } from "ix/asynciterable/operators";
import { streamToBlock } from "../logseq/stream-to-block";
import { propsToString } from "../../utils/logseq/logseq";
import { tee3 } from "../../utils/tee/tee";
import { subject } from "../../utils/subject/subject";
import type { Job } from "../../job-manager/job-manager";

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

type TextDeltaEvent = { type: "text-delta"; delta: string };
type ImageEvent = { type: "image"; image: GeneratedImage };
type NothingEvent = { type: "nothing" };
type ChatCompletionJobEvent = TextDeltaEvent | ImageEvent | NothingEvent;

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

// At the time of writing this, it almost feels like `buildEnhancedMessage`
// is for orchestration and `simpleCompletion` is to write the "main output"
// to the chat input.
//
// The thing is, the concept of a "main output" is kind of… Needs to be fleshed
// out.
//
// But the bottom line is, user prompts -> background tasks are done -> results
// of the background tasks are dumped into an LLM -> output of LLM is written
// in assistance box.
//
// Gotta think of an architecture around that.

async function* completion(
  input: string,
  messages: Message[],
  abortSignal: AbortSignal
) {
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

async function streamInImages(
  pageId: string,
  stream: AsyncIterable<GeneratedImage>
) {
  for await (const image of stream) {
    await logseq.Editor.appendBlockInPage(
      pageId,
      `role:: assistant\n![Generated Image](${image.url})`
    );
  }
}

export const simpleCompletion: (
  input: string,
  messages: Message[],
  jobKey: JobKey
) => Job<CompletionState, CompletionAction> = (input, messages, jobKey) => {
  const stopGate = gate();
  const stateSubject = subject<CompletionState>();
  let currentState: CompletionState = { type: "starting" };
  const abortController = new AbortController();
  let isStopped = false;

  // Emit initial starting state
  stateSubject.next(currentState);

  // Start the async work
  (async function () {
    const props = {
      role: "assistant",
    };

    const block = await logseq.Editor.appendBlockInPage(
      jobKey,
      propsToString(props)
    );

    if (!block) {
      throw new Error("Something went wrong");
    }

    let hasRun = false;

    try {
      const [t1, t2, t3] = tee3(
        completion(input, messages, abortController.signal)
      );

      const deltaStream = fromAsyncIterable(t1).pipe(
        filter((event): event is TextDeltaEvent => event.type === "text-delta"),
        map((event) => event.delta),
        share()
      );

      const imageStream = fromAsyncIterable(t2).pipe(
        filter((event): event is ImageEvent => event.type === "image"),
        map((event) => event.image),
        share()
      );

      await Promise.all([
        streamToBlock(block, deltaStream, {
          properties: props,
        }),
        streamInImages(jobKey, imageStream),
        (async () => {
          for await (const _ of t3) {
            // Update state to streaming when we start processing
            currentState = { type: "streaming" };
            stateSubject.next(currentState);
            hasRun = true;
            break;
          }
        })(),
      ]);

      if (!hasRun) {
        throw new Error("The completion task has not run");
      }
    } catch {
      if (abortController.signal.aborted) {
        // Job was stopped, don't update block
        return;
      }

      if (block?.uuid) {
        await logseq.Editor.updateBlock(
          block.uuid,
          `${propsToString(props)}\n${block.body}`
        );
      } else {
        await logseq.Editor.appendBlockInPage(
          jobKey,
          `role:: assistant\nstatus:: failed!`
        );
      }
    } finally {
      if (!isStopped) {
        stopGate.open();
      }
    }
  })();

  return {
    get state(): CompletionState {
      return currentState;
    },
    dispatch(_action: CompletionAction) {
      // No actions needed for now, but interface requires this
    },
    onStateChange(listener: (state: CompletionState) => void) {
      return stateSubject.listen(listener, true);
    },
    stop: async () => {
      if (isStopped) return;
      isStopped = true;
      abortController.abort();
      stopGate.open();
    },
    onStopped: stopGate.listen,
  };
};
