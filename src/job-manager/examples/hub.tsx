import { use, useEffect, useReducer, useState } from "react";
import { JobManagerContext } from "./context";
import { gate } from "../../utils/utils";
import { type Action } from "./action";
import type { State } from "./state";
import { subject } from "../../utils/subject/subject";

export function JobView() {}

export function Hub() {
  const jobManager = use(JobManagerContext);
  const [contexts, setContexts] = useState<{ key: string }[]>([]);
  const [, update] = useReducer(() => ({}), {});

  return (
    <div className="w-screen h-screen">
      <button
        onClick={() => {
          const uuid = crypto.randomUUID();

          setContexts([...contexts, { key: uuid }]);
        }}
      >
        Add context
      </button>
      <ul className="[&_button]:bg-black [&_button]:text-white">
        {contexts.map((job) => (
          <li>
            {jobManager.getRunningJob(job.key) ? (
              <span>{"Running"}</span>
            ) : (
              <button
                onClick={() => {
                  jobManager.runJob(job.key, () => {
                    setTimeout(() => {
                      stopGate.open();
                    }, 4000);

                    let state: State = { type: "DOING_NOTHING" };

                    const stopGate = gate();
                    const sub = subject<State>();

                    return {
                      stop: async () => {
                        stopGate.open();
                      },
                      onStopped: stopGate.listen,
                      get state(): State {
                        return state;
                      },
                      dispatch(action: Action) {
                        if (action.type === "DO_SOMETHING") {
                          state = { type: "DOING_SOMETHING" };
                          sub.next(state);
                        }
                      },
                      onStateChange: (listener) => sub.listen(listener, true),
                    };
                  });

                  update();

                  jobManager.getRunningJob(job.key)?.onStateChange(update);
                  jobManager.getRunningJob(job.key)?.onStopped(update);
                }}
              >
                {"Run job"}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
