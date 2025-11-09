import { gate, subject } from "../../utils";
import type { Actor } from "./actor";

type JobRunnerEvent<TInput> =
  | {
      type: "RUN_JOB";
      input: TInput;
    }
  | {
      type: "CANCEL_RUNNING_JOB";
    };

type JobRunnerState<TResult> =
  | {
      type: "IDLE";
    }
  | {
      type: "RUNNING";
    }
  | {
      type: "DONE";
      result: TResult;
    }
  | {
      type: "STOPPED";
    }
  | {
      type: "CANCELED";
    }
  | {
      type: "FAILED";
      error: unknown;
    };

export type JobActor<TInput, TResult> = Actor<
  JobRunnerEvent<TInput>,
  JobRunnerState<TResult>
>;

export type JobRunner<TInput, TResult> = (
  input: TInput,
  onStop: ReturnType<typeof gate>["listen"]
) => Promise<TResult>;

export const createJobActor = <TInput, TResult>(
  fn: JobRunner<TInput, TResult>
): JobActor<TInput, TResult> => {
  type LocalState = JobRunnerState<TResult>;

  const jobSubject = subject<LocalState>();
  let currentState: LocalState = { type: "IDLE" };
  let runningJobStopper: (() => void) | null = null;
  const stopRunningJob = () => {
    runningJobStopper?.();
    runningJobStopper = null;
  };

  function setState(state: JobRunnerState<TResult>) {
    currentState = state;
    jobSubject.next(state);
  }

  function runJob(input: TInput) {
    const stopGate = gate();
    runningJobStopper = stopGate.open;
    const promise = (async () => {
      return fn(input, stopGate.listen);
    })();
    const runningState = { type: "RUNNING" } satisfies LocalState;
    setState(runningState);
    const clearRunningJobStopper = () => {
      runningJobStopper = null;
    };
    promise.then(
      (result) => {
        clearRunningJobStopper();
        if (currentState.type === "RUNNING") {
          setState({ type: "DONE", result });
        }
      },
      (error) => {
        clearRunningJobStopper();
        if (currentState.type === "RUNNING") {
          setState({ type: "FAILED", error });
        }
      }
    );
  }

  return {
    send: (event) => {
      if (currentState.type === "STOPPED") {
        console.error("The actor has already been stopped");
        return;
      }
      switch (event.type) {
        case "RUN_JOB":
          if (currentState.type !== "RUNNING") {
            runJob(event.input);
          }
          break;
        case "CANCEL_RUNNING_JOB":
          if (currentState.type === "RUNNING") {
            setState({ type: "CANCELED" });
            stopRunningJob();
          }
          break;
      }
    },
    subscribe: (listener, option) => {
      if (option?.immediate && currentState.type === "IDLE") {
        listener(currentState);
      }
      return jobSubject.listen(listener, option?.immediate ?? false);
    },
    getSnapshot: () => currentState,
    stop: () => {
      setState({ type: "STOPPED" });
      stopRunningJob();
    },
  };
};
