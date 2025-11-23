import { type Task } from "../../utils/task-runner-repository/task-runner-repository";
import type { Message } from "../logseq/querier";
import { runCompletion } from "./chat-completion";
import { transformDashBulletPointsToStars } from "../../utils/utils";
import { from } from "rxjs";
import type { JobKey, RunningState } from "./task-runner";

export const simpleCompletion: (
  input: string,
  messages: Message[]
) => Task<JobKey, RunningState> =
  (input, messages) =>
  ({ jobKey, abortSignal }) => {
    return from(
      (async function* fn(): AsyncIterable<RunningState> {
        const stream = await runCompletion({
          input,
          messages,
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
      })()
    );
  };
