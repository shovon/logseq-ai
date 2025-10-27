import { useEffect, useState } from "react";
import { onRouteChanged } from "./route-change-service";

type CurrentPageState =
  | { type: "LOADING" }
  | {
      type: "LOADED";
      name: string;
    };

export const useCurrentPageState = (): CurrentPageState => {
  const [currentPageState, setCurrentPageState] = useState<CurrentPageState>({
    type: "LOADING",
  });

  useEffect(() => {
    let isClosed = false;

    logseq.Editor.getCurrentPage().then((p) => {
      if (isClosed) return;
      if (p === null) return;
      if (typeof p.originalName !== "string") return;

      setCurrentPageState({
        type: "LOADED",
        name: p.originalName,
      });
    });

    return () => {
      isClosed = true;
    };
  }, []);

  useEffect(() => {
    let isClosed = false;
    console.log("Listening for route changes");
    if (isClosed) return;

    onRouteChanged(() => {
      console.log("Route changed");
      if (isClosed) return;

      logseq.Editor.getCurrentPage()
        .then((p) => {
          if (isClosed) return;
          if (p === null) return;
          if (typeof p.originalName !== "string") return;
          setCurrentPageState({
            type: "LOADED",
            name: p.originalName,
          });
        })
        .catch((e) => {
          logseq.UI.showMsg(`${e ?? ""}`, "error");
        });
    });

    return () => {
      isClosed = true;
    };
  }, []);

  return currentPageState;
};
