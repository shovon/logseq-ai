import { useEffect, useState } from "react";

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

  async function getCurrentPageName(): Promise<string | null> {
    const p = await logseq.Editor.getCurrentPage();

    if (!p) return null;
    if (typeof p.name !== "string") return null;
    return p.name;
  }

  useEffect(() => {
    let isClosed = false;

    getCurrentPageName().then((p) => {
      if (isClosed) return;
      if (p === null) return;
      setCurrentPageState({
        type: "LOADED",
        name: p,
      });
    });

    return () => {
      isClosed = true;
    };
  }, []);

  useEffect(() => {
    let isClosed = false;
    logseq.App.onRouteChanged(() => {
      if (isClosed) return;
      getCurrentPageName().then((p) => {
        if (isClosed) return;
        if (p === null) return;
        setCurrentPageState({
          type: "LOADED",
          name: p,
        });
      });
    });

    return () => {
      isClosed = true;
    };
  }, []);

  return currentPageState;
};
