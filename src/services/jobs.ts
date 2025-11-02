const tasks = new Set<string>();

export const isTaskActive = tasks.has.bind(tasks);

export function startTask(id: string, task: () => Promise<void>) {
  tasks.add(id);
  const endtask = () => {
    tasks.delete(id);
  };
  task().then(endtask, endtask);
}
