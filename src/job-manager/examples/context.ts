import { createContext } from "react";
import { JobManager } from "../job-manager";
import type { State } from "./state";
import type { Action } from "./action";

export const JobManagerContext = createContext(
  new JobManager<string, State, Action>()
);
