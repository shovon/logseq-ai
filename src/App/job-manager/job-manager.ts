interface Stoppable {
  stop(): Promise<unknown>;
  onStopped(listener: () => void): () => void;
}

interface Actor<State, Action> {
  readonly state: State;
  dispatch(action: Action): void;
}

type Job<T, Action> = Stoppable & Actor<T, Action>;

/**
 * Returns an event emitter.
 * @returns An object containing a function to add an event listener, and one
 *   to push events to add to the listener.
 */
function subject<T>() {
  const listeners = new Set<(v: T) => void>();
  let last: [T] | null = null;
  return {
    listen: (listener: (v: T) => void, immediate = false) => {
      if (last !== null && immediate) listener(last[0]);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    next: (v: T) => {
      last = [v];
      for (const listener of listeners) {
        listener(v);
      }
    },
  };
}

// TODO: document usage.

export class JobManager<Key, State, Action> {
  private jobs = new Map<Key, Job<State, Action>>();
  private jobStartedSubject = subject<Key>();
  private jobStoppedSubject = subject<Key>();

  killJob(id: Key) {
    if (!this.jobs.has(id)) return;
    this.jobs.get(id)?.stop()?.catch(console.error);
    this.jobs.delete(id);
  }

  runJob(id: Key, task: () => Job<State, Action>) {
    if (this.jobs.has(id)) {
      // Let's model this as something that is idempotent.
      return;
    }

    const job = task();
    job.onStopped(() => {
      if (!this.jobs.has(id)) return;
      this.jobs.delete(id);
      this.jobStoppedSubject.next(id);
    });

    this.jobs.set(id, job);
    this.jobStartedSubject.next(id);
  }

  async stopJob(id: Key) {
    if (!this.jobs.has(id)) return;
    this.jobs.get(id)?.stop()?.catch(console.error);
  }

  get runningJobs(): readonly Key[] {
    return [...this.jobs.keys()];
  }
}
