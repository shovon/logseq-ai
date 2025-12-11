import type { Message } from "../logseq/querier";
import type {
  JobKey,
  CompletionState,
  CompletionAction,
} from "./completion-job-manager";
import { from as fromAsyncIterable } from "ix/asynciterable";
import { filter, map, share } from "ix/asynciterable/operators";
import { streamToBlock } from "../logseq/stream-to-block";
import { propsToString } from "../../utils/logseq/logseq";
import { tee3 } from "../../utils/tee/tee";
import { subject } from "../../utils/subject/subject";
import type { Job } from "../../job-manager/job-manager";
import { flagshipChatbot } from "./chatbots/flagship";
// import { dumbYesChatbot } from "./chatbots/dumb-say-yes";
import type { ImageEvent, TextDeltaEvent } from "./chat-completion-job-event";
import type { GeneratedImage } from "./chat-completion";
import { gate } from "../../utils/utils";

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

export function acceptor(ch: (a: unknown, b: unknown) => unknown) {
  return ch(1, 2);
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

export const createCompletionJob: (
  input: string,
  messages: Message[],
  jobKey: JobKey
) => Job<CompletionState, CompletionAction> = (input, messages, jobKey) => {
  // Perhaps this is where we can introduce

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
        flagshipChatbot(input, messages, abortController.signal)
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
