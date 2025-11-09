import { gate, subject } from "../../utils";
import type { Actor } from "./actor";

type CompletionResult<TResult> =
  | {
      type: "SUCCESS";
      result: TResult;
    }
  | {
      type: "ERROR";
      error: unknown;
    }
  | {
      type: "REJECTED";
    }
  | {
      type: "CANCELED";
    };

type JobRunnerEvent<TInput, TResult> =
  | {
      type: "RUN_JOB";
      input: TInput;
      onResponse: (result: CompletionResult<TResult>) => void;
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

export type JobActor<TResult, TInput> = Actor<
  JobRunnerEvent<TInput, TResult>,
  JobRunnerState<TResult>
>;

export const createJobActor = <TInput, TResult>(
  fn: (
    input: TInput,
    onStop: ReturnType<typeof gate>["listen"]
  ) => Promise<TResult>
): JobActor<TResult, TInput> => {
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

  function runJob(
    input: TInput,
    onResponse: (result: CompletionResult<TResult>) => void
  ) {
    const stopGate = gate();
    runningJobStopper = stopGate.open;
    const promise = (async () => {
      return fn(input, stopGate.listen);
    })();
    stopGate.listen(() => {
      onResponse({ type: "CANCELED" });
    });
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
          onResponse({ type: "SUCCESS", result });
        }
      },
      (error) => {
        clearRunningJobStopper();
        if (currentState.type === "RUNNING") {
          setState({ type: "FAILED", error });
          onResponse({ type: "ERROR", error });
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
          {
            const { onResponse } = event;
            if (currentState.type === "RUNNING") {
              onResponse({ type: "REJECTED" });
            } else {
              runJob(event.input, onResponse);
            }
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
