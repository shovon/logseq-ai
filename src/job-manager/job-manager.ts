import { subject } from "../utils/subject/subject";

interface Stoppable {
  stop(): Promise<void>;
  onStopped(listener: () => void): () => void;
}

interface Actor<State, Action> {
  readonly state: State;
  dispatch(action: Action): void;
  onStateChange(listener: (state: State) => void): () => void;
}

export type Job<T, Action> = Stoppable & Actor<T, Action>;

export class JobManager<Key, State, Action> {
  private jobs = new Map<Key, Job<State, Action>>();
  private jobStartedSubject = subject<Key>();
  private jobStoppedSubject = subject<Key>();

  runJob(
    id: Key,
    task: () => Job<State, Action>
  ):
    | { type: "JOB_CREATED" }
    | { type: "JOB_ALREADY_RUNNING" } /*| { type: "FAILED" }*/ {
    if (this.jobs.has(id)) {
      // Run job is idempotent.
      return { type: "JOB_ALREADY_RUNNING" };
    }

    const job = task();
    job.onStopped(() => {
      if (!this.jobs.has(id)) return;
      this.jobs.delete(id);
      this.jobStoppedSubject.next(id);
    });

    this.jobs.set(id, job);
    this.jobStartedSubject.next(id);

    return { type: "JOB_CREATED" };
  }

  stopJob(id: Key) {
    if (!this.jobs.has(id)) return;
    this.jobs.get(id)?.stop()?.catch(console.error);
    this.jobs.delete(id);
  }

  getRunningJob(key: Key): Job<State, Action> | undefined {
    return this.jobs.get(key);
  }

  get runningJobs(): readonly [Key, Job<State, Action>][] {
    return [...this.jobs.entries()];
  }

  onJobStarted(listener: (key: Key) => void, immediate?: boolean): () => void {
    return this.jobStartedSubject.listen(listener, immediate);
  }

  onJobStopped(listener: (key: Key) => void, immediate?: boolean): () => void {
    return this.jobStoppedSubject.listen(listener, immediate);
  }
}
