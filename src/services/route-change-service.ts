import { onReady } from "./ready-service";
import { subject } from "../utils";

const routeChangedSubject = subject<void>();

onReady(() => {
  logseq.App.onRouteChanged(() => routeChangedSubject.next());
});

export const onRouteChanged = routeChangedSubject.listen;
