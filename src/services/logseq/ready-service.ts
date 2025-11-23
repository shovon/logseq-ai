import { gate } from "../../utils/utils";

const readyGate = gate();

logseq.ready(readyGate.open).catch((e) => {
  logseq.UI.showMsg(`${e ?? ""}`, "error");
});

/**
 * Listener for the event when Logseq is ready.
 */
export const onReady = readyGate.listen;
