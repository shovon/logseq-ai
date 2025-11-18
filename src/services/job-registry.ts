import type { Message } from "./querier";
import { transformDashBulletPointsToStars } from "../utils";

// jobRegistry.ts
export type JobStatus =
  | { state: "idle" }
  | { state: "running"; abort: AbortController }
  | { state: "done" }
  | { state: "failed"; error: unknown };

type Listener = (pageId: string, status: JobStatus) => void;

const statuses = new Map<string, JobStatus>();
const listeners = new Set<Listener>();

const notify = (pageId: string) => {
  const status = statuses.get(pageId) ?? { state: "idle" };
  listeners.forEach((fn) => fn(pageId, status));
};

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  queueMicrotask(() => {
    statuses.forEach((status, pageId) => {
      listener(pageId, status);
    });
  });
  return () => listeners.delete(listener);
}

export function getStatus(pageId: string): JobStatus {
  return statuses.get(pageId) ?? { state: "idle" };
}

export async function startCompletionJob(
  pageId: string,
  input: string,
  messages: Message[],
  runCompletion: (init: {
    input: string;
    messages: Message[];
    signal: AbortSignal;
  }) => AsyncIterable<string>
) {
  const current = getStatus(pageId);
  if (current.state === "running") {
    throw new Error("Completion already in progress");
  }

  const abort = new AbortController();
  statuses.set(pageId, { state: "running", abort });
  notify(pageId);

  try {
    const stream = runCompletion({ input, messages, signal: abort.signal });

    const block = await logseq.Editor.appendBlockInPage(pageId, "", {
      properties: { role: "assistant" },
    });
    if (!block?.uuid) throw new Error("Failed to append block");

    let content = "";
    for await (const chunk of stream) {
      content += chunk;
      await logseq.Editor.updateBlock(
        block.uuid,
        transformDashBulletPointsToStars(content),
        {
          properties: { role: "assistant" },
        }
      );
    }

    statuses.set(pageId, { state: "done" });
  } catch (error) {
    if (abort.signal.aborted) {
      statuses.set(pageId, { state: "idle" });
    } else {
      statuses.set(pageId, { state: "failed", error });
    }
  } finally {
    notify(pageId);
  }
}

export function cancelCompletionJob(pageId: string) {
  const current = getStatus(pageId);
  if (current.state === "running") {
    current.abort.abort();
  }
}
