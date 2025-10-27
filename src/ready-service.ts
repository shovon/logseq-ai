import { gate } from "./utils";

const readyGate = gate();

logseq.ready(readyGate.open).catch((e) => {
  logseq.UI.showMsg(`${e ?? ""}`, "error");
});

export const onReady = readyGate.listen;
