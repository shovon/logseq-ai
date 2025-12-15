import type { Message } from "../logseq/querier";
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
import { updateBlock } from "../logseq/helpers";
import { filter } from "../../utils/async-iterables/filter";
import type { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";
import { first } from "../../utils/async-iterables/first";
import { dumbYesChatbot } from "./chatbots/dumb-say-yes";

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
 */
const streamInText = async (
  events: AsyncIterable<TextDeltaEvent>,
  props: Record<string, string>,
  block: BlockEntity
) => {
  await startPipe(events)
    .pipe(map((event) => event.delta))
    .pipe(scan((c, el) => c.concat(el), ""))
    .pipe(map(sanitizeMarkdown))
    .pipe(map((content) => `${propsToString(props)}\n${content}`))
    .pipe(forEach(updateBlock(block.uuid))).value;
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
  jobKey: JobKey
) => Job<CompletionState, CompletionAction> = (input, messages, jobKey) => {
  // Perhaps this is where we can introduce

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

    const block = await logseq.Editor.appendBlockInPage(
      jobKey,
      propsToString(props)
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

      const textStream = streamInText(textDeltaStream(t1), props, block);
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
