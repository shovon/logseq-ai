import { createTaskRunnerRepository } from "../../utils/task-runner-repository/task-runner-repository";

export type JobKey = string;
export type RunningState = { type: "streaming" };
export const completionTaskRunnerRepository = createTaskRunnerRepository<
  JobKey,
  RunningState
>();

export type CompletionMachineNode = ReturnType<
  typeof completionTaskRunnerRepository.getTaskRunnerStateNode
>;
