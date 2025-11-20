import { subject } from "../utils/subject/subject";
import { onReady } from "./ready-service";

const routeChangedSubject = subject<void>();

onReady(() => {
  logseq.App.onRouteChanged(() => routeChangedSubject.next());
});

export const onRouteChanged = routeChangedSubject.listen;
