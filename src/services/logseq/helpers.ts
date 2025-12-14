import { curryFirst } from "../../utils/functional/currying";

export const updateBlock = curryFirst(
  logseq.Editor.updateBlock.bind(logseq.Editor)
);
