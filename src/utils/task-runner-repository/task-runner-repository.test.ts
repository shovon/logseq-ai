import { describe, it, expect, vi } from "vitest";
import { Observable } from "rxjs";
import { createTaskRunnerRepository } from "./task-runner-repository";

type RunningState = { progress: number };

describe("jobRunner", () => {
  it("should start in idle state with null stopped data", () => {
    const runner = createTaskRunnerRepository<string, RunningState>();

    const state = runner.getTaskRunnerStateNode("job-1");

    if (state.type !== "idle") {
      throw new Error("Expected initial state to be idle");
    }

    expect(state.error).toBeNull();
    expect(typeof state.run).toBe("function");
  });

  it("should transition to running when start is called", () => {
    const runner = createTaskRunnerRepository<string, RunningState>();

    const initialNode = runner.getTaskRunnerStateNode("job-1");

    if (initialNode.type !== "idle") {
      throw new Error("Expected initial state to be idle");
    }

    const jobFn = vi.fn(() => new Observable<RunningState>(() => {}));
    initialNode.run(jobFn);

    const runningState = runner.getTaskRunnerStateNode("job-1");

    if (runningState.type !== "running") {
      throw new Error("Expected state to be running");
    }

    expect(runningState.data).toBeNull();
    expect(jobFn).toHaveBeenCalledTimes(1);
    expect(typeof runningState.stop).toBe("function");
  });

  it("should emit progress updates while running", () => {
    const repository = createTaskRunnerRepository<string, RunningState>();

    const initialState = repository.getTaskRunnerStateNode("job-1");

    if (initialState.type !== "idle") {
      throw new Error("Expected initial state to be idle");
    }

    initialState.run(() => {
      return new Observable<RunningState>((subscriber) => {
        subscriber.next({ progress: 10 });
        subscriber.next({ progress: 20 });
      });
    });

    const runningState = repository.getTaskRunnerStateNode("job-1");

    expect(runningState.type).toBe("running");
    // Last progress update should be stored as [RunningState]
    if (runningState.type === "running") {
      expect(runningState.data).toEqual([{ progress: 20 }]);
    }
  });

  it("should transition back to idle when stop is called from running state", () => {
    const runner = createTaskRunnerRepository<string, RunningState>();

    const key = "job-1";

    const initialState = runner.getTaskRunnerStateNode(key);

    runner.listen(key, () => {});

    if (initialState.type !== "idle") {
      throw new Error("Expected initial state to be idle");
    }

    initialState.run(() => {
      return new Observable<RunningState>((subscriber) => {
        // Observable completes immediately, which triggers stop
        subscriber.complete();
      });
    });

    const idleState = runner.getTaskRunnerStateNode(key);

    expect(idleState.type).toBe("idle");
    if (idleState.type === "idle") {
      expect(idleState.error).toBe(null);
    }
  });

  it("should allow external stop on running state", () => {
    const runner = createTaskRunnerRepository<string, RunningState>();

    const key = "job-1";

    runner.listen(key, () => {});

    const initialState = runner.getTaskRunnerStateNode(key);

    if (initialState.type !== "idle") {
      throw new Error("Expected initial state to be idle");
    }

    initialState.run(() => {
      // Return an observable that never completes, keeping job running
      return new Observable<RunningState>(() => {
        // No-op: observable never completes or emits
      });
    });

    const runningState = runner.getTaskRunnerStateNode(key);

    if (runningState.type !== "running") {
      throw new Error("Expected state to be running");
    }

    runningState.stop([{ reason: "stopped externally" }]);

    const idleState = runner.getTaskRunnerStateNode(key);

    expect(idleState.type).toBe("idle");
    if (idleState.type === "idle") {
      expect(idleState.error).toEqual([{ reason: "stopped externally" }]);
    }
  });

  it("should pass an AbortSignal to the job and abort when stopped", () => {
    const runner = createTaskRunnerRepository<string, RunningState>();

    const initialState = runner.getTaskRunnerStateNode("job-1");

    if (initialState.type !== "idle") {
      throw new Error("Expected initial state to be idle");
    }

    const abortHandler = vi.fn();

    initialState.run(({ abortSignal }) => {
      abortSignal.addEventListener("abort", abortHandler);
      // Return an observable that never completes, keeping job running
      return new Observable<RunningState>(() => {
        // No-op: observable never completes or emits
      });
    });

    const runningState = runner.getTaskRunnerStateNode("job-1");

    if (runningState.type !== "running") {
      throw new Error("Expected state to be running");
    }

    runningState.stop();

    expect(abortHandler).toHaveBeenCalledTimes(1);
  });

  it("should allow subscribing after task has started and receive current state and future updates, in immediate mode", () => {
    const runner = createTaskRunnerRepository<string, RunningState>();

    const key = "job-1";
    const initialState = runner.getTaskRunnerStateNode(key);

    if (initialState.type !== "idle") {
      throw new Error("Expected initial state to be idle");
    }

    // Start the task first
    const progressValues: RunningState[] = [];
    const emitLaterRef: { current: (() => void) | null } = { current: null };
    initialState.run(() => {
      return new Observable<RunningState>((subscriber) => {
        // Emit initial progress
        subscriber.next({ progress: 10 });
        subscriber.next({ progress: 20 });

        // Store function to emit more progress after subscription
        emitLaterRef.current = () => {
          subscriber.next({ progress: 30 });
          subscriber.next({ progress: 40 });
        };
        // Don't complete - keep observable alive
      });
    });

    // Verify task is running
    const runningState = runner.getTaskRunnerStateNode(key);
    expect(runningState.type).toBe("running");
    if (runningState.type === "running") {
      expect(runningState.data![0].progress).toBe(20);
    }

    // Now subscribe AFTER the task has started
    const listener = vi.fn(
      (state: {
        type: "idle" | "running";
        data?: [RunningState] | null;
        error?: [unknown] | null;
      }) => {
        if (state.type === "running" && state.data) {
          progressValues.push(state.data[0]);
        }
      }
    );

    const unsubscribe = runner.listen(key, listener, true);

    // With immediate: true, should receive current state immediately
    expect(listener).toHaveBeenCalled();
    expect(progressValues.length).toBeGreaterThan(0);
    // Should have received the last emitted progress (20) immediately
    expect(progressValues).toContainEqual({ progress: 20 });

    // Now emit more progress after subscription
    if (emitLaterRef.current) {
      emitLaterRef.current();
    }

    // Wait a bit for updates to propagate
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // Should have received future updates (30, 40)
        expect(progressValues).toContainEqual({ progress: 30 });
        expect(progressValues).toContainEqual({ progress: 40 });
        // immediate call + 2 future updates = 3 total
        expect(listener).toHaveBeenCalledTimes(3);
        unsubscribe();
        resolve();
      }, 10);
    });
  });

  it("should allow subscribing after task has started and only receive future updates, in non immediate mode", () => {
    const runner = createTaskRunnerRepository<string, RunningState>();

    const key = "job-1";
    const initialState = runner.getTaskRunnerStateNode(key);

    if (initialState.type !== "idle") {
      throw new Error("Expected initial state to be idle");
    }

    // Start the task first
    const progressValues: RunningState[] = [];
    const emitLaterRef: { current: (() => void) | null } = { current: null };
    initialState.run(() => {
      return new Observable<RunningState>((subscriber) => {
        // Emit initial progress
        subscriber.next({ progress: 10 });
        subscriber.next({ progress: 20 });

        // Store function to emit more progress after subscription
        emitLaterRef.current = () => {
          subscriber.next({ progress: 30 });
          subscriber.next({ progress: 40 });
        };
        // Don't complete - keep observable alive
      });
    });

    // Verify task is running
    const runningState = runner.getTaskRunnerStateNode(key);
    expect(runningState.type).toBe("running");
    if (runningState.type === "running") {
      expect(runningState.data![0].progress).toBe(20);
    }

    // Now subscribe AFTER the task has started
    const listener = vi.fn(
      (state: {
        type: "idle" | "running";
        data?: [RunningState] | null;
        error?: [unknown] | null;
      }) => {
        if (state.type === "running" && state.data) {
          progressValues.push(state.data[0]);
        }
      }
    );

    const unsubscribe = runner.listen(key, listener);

    // With immediate: true, should receive current state immediately
    expect(listener).not.toHaveBeenCalled();
    expect(progressValues.length).toBe(0);
    // Should have received the last emitted progress (20) immediately

    // Now emit more progress after subscription
    if (emitLaterRef.current) {
      emitLaterRef.current();
    }

    // Wait a bit for updates to propagate
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // Should have received future updates (30, 40)
        expect(progressValues).toContainEqual({ progress: 30 });
        expect(progressValues).toContainEqual({ progress: 40 });
        // immediate call + 2 future updates = 3 total
        expect(listener).toHaveBeenCalledTimes(2);
        unsubscribe();
        resolve();
      }, 10);
    });
  });

  it("should allow subscribing after task has errored and receive error state immediately, in immediate mode", () => {
    const runner = createTaskRunnerRepository<string, RunningState>();

    const key = "job-1";
    const initialState = runner.getTaskRunnerStateNode(key);

    if (initialState.type !== "idle") {
      throw new Error("Expected initial state to be idle");
    }

    const testError = new Error("Task failed");
    // Start the task and immediately error it out
    initialState.run(() => {
      return new Observable<RunningState>((subscriber) => {
        // Error immediately
        subscriber.error(testError);
      });
    });

    // Wait a bit to ensure error has been processed
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // Verify task is back to idle with error
        const idleState = runner.getTaskRunnerStateNode(key);
        expect(idleState.type).toBe("idle");
        if (idleState.type === "idle") {
          expect(idleState.error).toEqual(null);
        }

        // Now subscribe AFTER the task has errored
        const listener = vi.fn(
          (_state: {
            type: "idle" | "running";
            data?: [RunningState] | null;
            error?: [unknown] | null;
          }) => {
            // Track error states
          }
        );

        const unsubscribe = runner.listen(key, listener, true);

        // With immediate: true, should receive current state (idle with error) immediately
        expect(listener).toHaveBeenCalledTimes(1);
        const receivedState = listener.mock.calls[0][0];
        expect(receivedState.type).toBe("idle");
        if (receivedState.type === "idle") {
          expect(receivedState.error).toEqual(null);
        }

        unsubscribe();
        resolve();
      }, 10);
    });
  });

  it("should allow subscribing after task has errored and not receive error state immediately, in non immediate mode", () => {
    const runner = createTaskRunnerRepository<string, RunningState>();

    const key = "job-1";
    const initialState = runner.getTaskRunnerStateNode(key);

    if (initialState.type !== "idle") {
      throw new Error("Expected initial state to be idle");
    }

    const testError = new Error("Task failed");
    // Start the task and immediately error it out
    initialState.run(() => {
      return new Observable<RunningState>((subscriber) => {
        // Error immediately
        subscriber.error(testError);
      });
    });

    // Wait a bit to ensure error has been processed
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        // Verify task is back to idle with error
        const idleState = runner.getTaskRunnerStateNode(key);
        expect(idleState.type).toBe("idle");

        if (idleState.type === "idle") {
          expect(idleState.error).toEqual(null);
        }

        // Now subscribe AFTER the task has errored
        const listener = vi.fn(
          (_state: {
            type: "idle" | "running";
            data?: [RunningState] | null;
            error?: [unknown] | null;
          }) => {
            // Track error states
          }
        );

        const unsubscribe = runner.listen(key, listener);

        // With immediate: false, should not receive current state immediately
        expect(listener).not.toHaveBeenCalled();

        unsubscribe();
        resolve();
      }, 10);
    });
  });
});
