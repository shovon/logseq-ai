import type { Observable } from "rxjs";
import { pubSub, pubSubRegistry } from "../pub-sub/pub-sub";
import { firstFromSubjectSync } from "../subject/subject";

/**
 * Represents an idle state for a job.
 */
type Idle = {
  type: "idle";
  error: [unknown] | null;
};

/**
 * Represents a running state for a job.
 */
type Running<Status> = {
  type: "running";
  data: [Status] | null;
};

/**
 * A function that represents a job, returning an observable which will signal
 * any updates from the job being run.
 */
export type Task<Key, RunningState> = (options: {
  jobKey: Key;
  abortSignal: AbortSignal;
}) => Observable<RunningState>;

// Considering that we have effectively a 2-state automata, and each state is a
// node in a graph, then I might as well call them "nodes".

type IdleNode<Key, RunningState> = Idle & {
  run: (
    runJob: Task<Key, RunningState>,
    abortController?: AbortController
  ) => void;
};
type RunningNode<RunningState> = Running<RunningState> & {
  stop: (reason?: [unknown] | null) => void;
};

type JobState<RunningState> = Idle | Running<RunningState>;

type MachineNode<Key, RunningState> =
  | IdleNode<Key, RunningState>
  | RunningNode<RunningState>;

/**
 * Creates a new job runner for a specific class of jobs.
 *
 * For example, in the context of this repo, a job runner could—for example—
 * focus on prompt completion tasks.
 *
 * Usage:
 *
 *     const myJob: JobRunner<unknown, unknown> = (abortSignal): Observable<void> => {
 *       signal.addEventListener('abort', () => {
 *         // Cleanup here.
 *         //
 *         // The job should have been stopped already.
 *       });
 *
 *
 *
 *       // For a while
 *       progress({ type: 'some progress' });
 *
 *       // Eventually
 *       stop({ reason: 'done' });
 *     }
 *
 *     const runner = jobRunner<string, unknown, unknown>();
 *
 *     let state = runner.getState('foo');
 *
 *     if (state.type === 'idle') {
 *       state.start(myJob, new AbortController());
 *     }
 *
 *     // Perhaps later.
 *
 *     state = runner.getState('foo');
 *
 *     if (state.type === 'running' && someCondition(state)) {
 *       state.stop();
 *     }
 * @returns an object to get the current state, as well as listen on job status
 *   change events.
 */
export function createTaskRunnerRepository<Key, RunningState>() {
  const ps = pubSub<Key, JobState<RunningState>>(
    pubSubRegistry<Key, JobState<RunningState>>({
      initialValue: () => ({
        type: "idle",
        error: null,
      }),
      shouldCleanup: (_, lastEmittedValue): boolean => {
        return lastEmittedValue.type !== "running";
      },
    })
  );

  const stop = (key: Key, stoppedState: [unknown] | null = null) => {
    if (currentJobs.has(key)) {
      currentJobs.get(key)!.abortController.abort();
    }
    ps.next(key, { type: "idle", error: stoppedState });
    currentJobs.delete(key);
  };

  const currentJobs = new Map<Key, { abortController: AbortController }>();

  return {
    getTaskRunnerStateNode: (key: Key): MachineNode<Key, RunningState> => {
      const node = firstFromSubjectSync(ps.subject(key));

      if (node === null) throw new Error("No first value available");
      const status = node[0];

      switch (status.type) {
        case "idle":
          return (() => {
            let hasRun = false;
            return {
              type: "idle",
              error: status.error,
              run: (
                task: Task<Key, RunningState>,
                abortController = new AbortController()
              ) => {
                if (hasRun) return;
                hasRun = true;

                const node = firstFromSubjectSync(ps.subject(key));
                if (node !== null && node[0].type === "running") return;

                currentJobs.set(key, {
                  abortController,
                });
                ps.next(key, { type: "running", data: null });

                task({
                  jobKey: key,
                  abortSignal: abortController.signal,
                }).subscribe({
                  next: (data) => {
                    ps.next(key, { type: "running", data: [data] });
                  },
                  complete: () => {
                    stop(key);
                  },
                  error: (error: unknown) => {
                    stop(key, [error]);
                  },
                });
              },
            };
          })();
        case "running":
          return (() => {
            let hasStopped = false;

            return {
              type: "running",
              data: status.data,
              stop: (data: [unknown] | null = null) => {
                if (hasStopped) return;
                hasStopped = true;

                const node = firstFromSubjectSync(ps.subject(key));
                if (node !== null && node[0].type === "idle") return;

                stop(key, data);
              },
            };
          })();
      }

      const _exhaustiveCheck: never = status;
      return _exhaustiveCheck;
    },
    listen: ps.listen,
  };
}
