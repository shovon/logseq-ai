import { subject } from "../../utils/subject/subject";
import { onReady } from "./ready-service";

const routeChangedSubject = subject<void>();

onReady(() => {
  logseq.App.onRouteChanged(() => routeChangedSubject.next());
});

/**
 * Listener for listening to events when the user navigates between pages and
 * blocks on Logseq.
 */
export const onRouteChanged = routeChangedSubject.listen;
