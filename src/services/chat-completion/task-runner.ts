import { JobManager } from "../../job-manager/job-manager";

export type JobKey = string;

export type CompletionState =
  | { type: "idle" }
  | { type: "starting" }
  | { type: "streaming" };

export type CompletionAction = {
  // Actions can be added here in the future if needed
  type?: never;
};

export const completionJobManager = new JobManager<
  JobKey,
  CompletionState,
  CompletionAction
>();
