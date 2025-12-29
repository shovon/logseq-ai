import type { Message } from "../threading/threading";
import type {
  JobKey,
  CompletionState,
  CompletionAction,
} from "./completion-job-manager";
import { map } from "ix/asynciterable/operators";
import { propsToString } from "../../utils/logseq/logseq";
import { tee3 } from "../../utils/async-iterables/tee/tee";
import { subject } from "../../utils/subject/subject";
import type { Job } from "../../job-manager/job-manager";
import { flagshipChatbot } from "./chatbots/flagship";
import type {
  ChatCompletionJobEvent,
  ImageEvent,
  TextDeltaEvent,
} from "./chat-completion-job-event";
import { gate, sanitizeMarkdown } from "../../utils/utils";
import { start as startPipe } from "../../utils/functional/pipe";
import { scan } from "../../utils/async-iterables/scan";
import { forEach } from "../../utils/async-iterables/for-each/for-each";
import { filter } from "../../utils/async-iterables/filter";
import type { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";
import { first } from "../../utils/async-iterables/first";
import { dumbYesChatbot } from "./chatbots/dumb-say-yes";
import { computeThreadHash } from "../threading/threading";

export function acceptor(ch: (a: unknown, b: unknown) => unknown) {
  return ch(1, 2);
}

const textDeltaStream = filter(
  (event: ChatCompletionJobEvent): event is TextDeltaEvent =>
    event.type === "text-delta"
);

const imageStream = filter(
  (event: ChatCompletionJobEvent): event is ImageEvent => event.type === "image"
);

/**
 * Streams text deltas from an async iterable, accumulates them into a single
 * string, sanitizes the resulting markdown, prepends Logseq-style properties,
 * and updates the specified block in-place with the final content.
 *
 * @param events Async iterable stream of `TextDeltaEvent` representing AI model
 *   output chunks.
 * @param props Record of Logseq property key-value pairs to prefix to the block.
 * @param block The Logseq block entity to update as new content arrives.
 * @param blockProperties Optional record of Logseq block properties to set/update
 *   during streaming. These are actual block properties (not string prefixes).
 */
const streamInText = async (
  events: AsyncIterable<TextDeltaEvent>,
  props: Record<string, string>,
  block: BlockEntity,
  blockProperties?: Record<string, unknown>
) => {
  await startPipe(events)
    .pipe(map((event) => event.delta))
    .pipe(scan((c, el) => c.concat(el), ""))
    .pipe(map(sanitizeMarkdown))
    .pipe(map((content) => `${propsToString(props)}\n${content}`))
    .pipe(
      forEach(async (content) => {
        // Update both content and properties if blockProperties are provided
        if (blockProperties) {
          await logseq.Editor.updateBlock(block.uuid, content, {
            properties: blockProperties,
          });
        } else {
          await logseq.Editor.updateBlock(block.uuid, content);
        }
      })
    ).value;
};

/**
 * Streams image events from an async iterable and appends each generated image
 * as a new block to the specified Logseq page (identified by jobKey).
 *
 * For each incoming ImageEvent, constructs a block in the form:
 *   role:: assistant
 *   ![Generated Image](image.url)
 * and appends it to the page.
 *
 * @param events Async iterable stream of `ImageEvent` representing image generation results.
 * @param jobKey The Logseq page (block uuid or page name) to which images are appended.
 */
const streamInImages = async (
  events: AsyncIterable<ImageEvent>,
  jobKey: string
) => {
  await startPipe(events)
    .pipe(map((event) => event.image))
    .pipe(
      forEach(async (image) => {
        await logseq.Editor.appendBlockInPage(
          jobKey,
          `role:: assistant\n![Generated Image](${image.url})`
        );
      })
    ).value;
};

export const createCompletionJob: (
  input: string,
  messages: Message[],
  jobKey: JobKey,
  options?: {
    threadId?: string;
    referenceId?: string;
  }
) => Job<CompletionState, CompletionAction> = (
  input,
  messages,
  jobKey,
  options
) => {
  const stopGate = gate();
  const stateSubject = subject<CompletionState>();
  const abortController = new AbortController();
  let isStopped = false;

  // Emit initial starting state
  let currentState: CompletionState = { type: "idle" };

  const updateCompletion = (s: CompletionState) => {
    currentState = s;
    stateSubject.next(currentState);
  };

  updateCompletion({ type: "starting" });

  // Start the async work
  (async function () {
    const props = { role: "assistant" };

    // Build block properties object (for actual Logseq properties, not string prefixes)
    const blockProperties: Record<string, unknown> = { role: "assistant" };

    // If this is a forked thread, add thread metadata
    if (options?.threadId) {
      blockProperties["thread-id"] = options.threadId;

      // If this is the root of a fork, add referenceId and compute hash
      if (options.referenceId) {
        blockProperties["reference-id"] = options.referenceId;

        // Compute thread hash from all predecessor blocks (only for fork roots)
        // Get all blocks in the page (these are all predecessors since we're appending)
        const allBlocks =
          ((await logseq.Editor.getPageBlocksTree(
            jobKey
          )) as Array<BlockEntity> | null) ?? [];

        // Get all predecessor block IDs (all existing blocks before we append the new assistant block)
        // Since we're appending, all existing blocks are predecessors
        const predecessorIds = allBlocks.map((b) => b.uuid);

        // Compute hash from predecessor block IDs
        const threadHash = await computeThreadHash(predecessorIds);
        blockProperties["thread-hash"] = threadHash;
      }
    }

    // Create block with initial properties
    const block = await logseq.Editor.appendBlockInPage(
      jobKey,
      propsToString(props),
      { properties: blockProperties }
    );

    try {
      if (!block) {
        throw new Error("Something went wrong");
      }

      let hasRun = false;

      const [t1, t2, t3] = tee3(
        flagshipChatbot(input, messages, abortController.signal)
      );

      const notifyIsStreaming = () => {
        updateCompletion({ type: "streaming" });
        hasRun = true;
      };

      // Pass blockProperties to streamInText so it updates properties during streaming
      const textStream = streamInText(
        textDeltaStream(t1),
        props,
        block,
        blockProperties
      );
      const imagesStream = streamInImages(imageStream(t2), jobKey);
      const checkIfHasRun = first(notifyIsStreaming)(t3);

      await Promise.all([textStream, imagesStream, checkIfHasRun]);

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
          `${propsToString(props)}\n${block.body}`,
          { properties: blockProperties }
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
