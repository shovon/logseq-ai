import { useEffect, useRef } from "react";

type Graph = Exclude<Awaited<typeof logseq.App.getCurrentGraph>, null>;

export const useOnGraphChange = (callback: (graph: Graph | null) => void) => {
  const graphRef = useRef<Awaited<typeof logseq.App.getCurrentGraph>>(null);

  useEffect(() => {
    logseq.ready(() => {}).then((r) => {});
  }, []);
};
