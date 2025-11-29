const DEFAULT_WIDTH = 400;
export const MIN_WIDTH = 300;
const MAX_WIDTH = 640;
export const SIDEBAR_HANDLE_WIDTH = 2;
const STORAGE_KEY = "logseq-ai-plugin.sidebar-width";

type SidebarContext = {
  applicationId: string;
  providedUiId: string;
};

type WidthOptions = {
  persist?: boolean;
};

let context: SidebarContext | null = null;
let sidebarWidth = DEFAULT_WIDTH;
let cleanupFns: Array<() => void> = [];

const clampWidth = (width: number) =>
  Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, width));

const getElementId = () => {
  if (!context) {
    throw new Error("Sidebar context has not been initialized.");
  }

  return `${context.applicationId}--${context.providedUiId}`;
};

const getInjectedContainerId = () => `${getElementId()}-injected-container`;

const readStoredWidth = () => {
  try {
    const raw = parent?.window?.localStorage?.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_WIDTH;
    }

    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : DEFAULT_WIDTH;
  } catch {
    return DEFAULT_WIDTH;
  }
};

const persistWidth = (width: number) => {
  try {
    parent?.window?.localStorage?.setItem(STORAGE_KEY, String(width));
  } catch {
    // noop
  }
};

const updateMainUIWidth = (width: number) => {
  const px = `${width}px`;

  logseq.setMainUIInlineStyle({
    position: "absolute",
    zIndex: 11,
    width: px,
    top: "0",
    left: `calc(100vw - ${px})`,
    height: "100vh",
  });
};

const updateInjectedContainerWidth = (width: number) => {
  const container = parent?.document?.getElementById(
    getInjectedContainerId()
  ) as HTMLDivElement | null;

  if (container) {
    container.style.width = `${width}px`;
  }
};

const applySidebarWidth = (width: number, options?: WidthOptions) => {
  sidebarWidth = width;

  updateMainUIWidth(sidebarWidth);
  updateInjectedContainerWidth(sidebarWidth);

  if (options?.persist !== false) {
    persistWidth(sidebarWidth);
  }
};

export const initializeSidebarResizer = (ctx: SidebarContext) => {
  context = ctx;
  sidebarWidth = clampWidth(readStoredWidth());

  applySidebarWidth(sidebarWidth, { persist: false });
};

export const getSidebarWidth = () => sidebarWidth;

export const getInjectedContainerTemplate = () => {
  return `<div id="${getInjectedContainerId()}" style="width: ${sidebarWidth}px"></div>`;
};

export const setSidebarWidth = (width: number, options?: WidthOptions) => {
  applySidebarWidth(clampWidth(width), options);
};

export const startSidebarResize = (
  event: PointerEvent,
  handleElement: HTMLElement
) => {
  if (!context) {
    return;
  }

  event.preventDefault();

  try {
    handleElement.setPointerCapture(event.pointerId);
  } catch {
    // Some environments may not support pointer capture (e.g. tests).
  }

  const startX = event.clientX;
  const startingWidth = sidebarWidth;

  const handlePointerMove = (moveEvent: PointerEvent) => {
    const delta = startX - moveEvent.clientX;
    setSidebarWidth(startingWidth + delta, { persist: false });
  };

  const handlePointerUp = (upEvent: PointerEvent) => {
    try {
      handleElement.releasePointerCapture(upEvent.pointerId);
    } catch {
      // ignore
    }

    setSidebarWidth(startingWidth + (startX - upEvent.clientX));
    cleanupResizeListeners();
  };

  const handlePointerCancel = (cancelEvent: PointerEvent) => {
    try {
      handleElement.releasePointerCapture(cancelEvent.pointerId);
    } catch {
      // ignore
    }

    cleanupResizeListeners();
    setSidebarWidth(sidebarWidth);
  };

  const registerListener = (target: Window) => {
    target.addEventListener("pointermove", handlePointerMove);
    target.addEventListener("pointerup", handlePointerUp);
    target.addEventListener("pointercancel", handlePointerCancel);

    cleanupFns.push(() => {
      target.removeEventListener("pointermove", handlePointerMove);
      target.removeEventListener("pointerup", handlePointerUp);
      target.removeEventListener("pointercancel", handlePointerCancel);
    });
  };

  const cleanupResizeListeners = () => {
    cleanupFns.forEach((fn) => fn());
    cleanupFns = [];
  };

  cleanupResizeListeners();

  registerListener(window);

  if (parent && parent.window && parent.window !== window) {
    registerListener(parent.window);
  }
};

export const syncInjectedContainer = () => {
  updateInjectedContainerWidth(sidebarWidth);
};
