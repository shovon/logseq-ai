import { gate, subject } from "../utils";

const tasks = new Map<
  string,
  {
    state: unknown;
    endTask: () => void;
    taskEndGate: ReturnType<typeof gate>;
    taskStateUpdateSubject: ReturnType<typeof subject<void>>;
  }
>();

export const isTaskActive = tasks.has.bind(tasks);
export const getTaskState = tasks.get.bind(tasks);
export const onTaskEnd = (id: string, listener: () => void) => {
  const task = tasks.get(id);
  if (!task) return listener();
  task.taskEndGate.listen(listener);
};
export const onTaskStateUpdate = (id: string, listener: () => void) => {
  const task = tasks.get(id);
  if (!task) return;
  task.taskStateUpdateSubject.listen(listener);
};

export async function stopTask(id: string) {
  if (isTaskActive(id)) {
    const task = tasks.get(id);
    if (!task) {
      throw new Error(
        `Task with id "${id}" was expected to exist when calling stopTask, but it could not be found in the tasks map. It may have already completed, been removed, or never started. Please check if the task lifecycle is being managed correctly.`
      );
    }
    task.endTask();
  }
}

export async function startTask(
  id: string,
  task: (setState: (value: unknown) => void) => Promise<void>
) {
  let isDone = false;
  const endTask = () => {
    console.log("End task has been called");
    if (isDone) return;
    isDone = true;
    const task = tasks.get(id);
    if (!task) {
      throw new Error(
        `Task with id "${id}" not found when attempting to end task. It may have already completed or been removed.`
      );
    }
    task.taskEndGate.open();
    tasks.delete(id);
  };
  const taskStateUpdateSubject = subject<void>();
  tasks.set(id, {
    state: null,
    endTask,
    taskEndGate: gate(),
    taskStateUpdateSubject,
  });
  const promise = task((value) => {
    if (isDone) return;
    const task = tasks.get(id);
    if (!task) {
      throw new Error(
        `Task with id "${id}" not found when attempting to set state. It may have already completed or been removed.`
      );
    }
    task.state = value;
    taskStateUpdateSubject.next();
  });

  promise.then(endTask, endTask);

  await promise;
}
