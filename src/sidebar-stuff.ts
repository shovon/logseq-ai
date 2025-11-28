import packageJson from "../package.json" with { type: "json" };

// TODO: perhaps get the provided ID base from package.json
//   Here's the rationale for the `provided` prefix: it's because we want some
//   strongly unique identifier. I guess I was half asleep at the wheel when I
//   came up with this, but I have no idea why this is even necessary.
//   it should be perfectly fine to go without this.
const providedUiIdBase = "logseq-ai-plugin";

// TODO: this should really not be a compound; it should really just be `spacer`
//   and build some `${providedUiIdBase}` using some intermediate function.
const spacerId = `${providedUiIdBase}-spacer`;

// TODO: this should really not be a compound; it should really just be
//   `overlay` and build some `${providedUiIdBase}` using some intermediate
//   function.
const overlayId = `${providedUiIdBase}-overlay`;

const applicationId = packageJson.logseq.id;

const sidebarWidthStorageKey = `${applicationId}-logseq-ai-plugin.sidebar-width`;

const defaultWidth = 400;

const sidebarHandleWidth = 4;
const spacerLeftPadding = 10;

// Local state -----------------------------------------------------------------

let isUiShowing = false;
let isResizing = false;
let overlayInjected = false;
let sidebarWidth = NaN;

let lastMousePosition = 0;

// Sidebar width ---------------------------------------------------------------

const getSidebarWidth = () => {
  if (isNaN(sidebarWidth)) {
    sidebarWidth = readStoredWidth();
  }
  return sidebarWidth;
};

const setSidebarWidth = (width: number) => {
  sidebarWidth = width;
  persistWidth(width);
};

// Element ID ------------------------------------------------------------------

/**
 * Derives a unique ID associated with an injected element.
 * @param providedUiId The ID to associate a specific DOM element.
 * @returns A string that represents a DOM element ID that could be picked up
 *   by `document.getElementByid`.
 */
const deriveProvidedElementId = (providedUiId: string) => {
  return `${applicationId}--${providedUiId}`;
};

// TODO: is this even necessary?
const getParentViewportDocument = () => {
  try {
    const parentWindow = window.parent;
    if (parentWindow && parentWindow !== window) {
      return parentWindow.document;
    }
  } catch {
    return null;
  }

  return document;
};

// Overlay ---------------------------------------------------------------------

const injectOverlay = () => {
  if (overlayInjected) {
    return;
  }

  logseq.provideUI({
    key: overlayId,
    path: "#root",
    template: `<div style="width: ${getSidebarWidth()}px; height: 100vh; background: rgba(0, 0, 0, 0.001); z-index: 1000; position: absolute; right: 0;"></div>`,
  });

  overlayInjected = true;
};

const updateOverlayWidth = (sidebarWidth: number) => {
  const doc = getParentViewportDocument();
  if (!doc) {
    return;
  }

  const element = doc.querySelector(
    `#${deriveProvidedElementId(overlayId)} > div`
  ) as HTMLDivElement | null;

  if (element) {
    element.style.width = `${sidebarWidth}px`;
  }
};

const removeOverlay = () => {
  if (!overlayInjected) {
    return;
  }

  logseq.provideUI({
    key: overlayId,
    path: "#root",
    template: "",
  });

  overlayInjected = false;
};

// Spacer ----------------------------------------------------------------------

const computeSpacerWidth = (targetSidebarWidth: number) =>
  targetSidebarWidth + sidebarHandleWidth + spacerLeftPadding;

// Note: this is supposed to update the width the spacer.
//
// Question: does it? Let's read through this to find out.
const updateSpacerWidth = (newSidebarWidth: number) => {
  // This is
  const doc = getParentViewportDocument();
  if (!doc) {
    return;
  }

  const element = doc.querySelector(
    `#${deriveProvidedElementId(spacerId)} > div`
  ) as HTMLDivElement | null;

  if (element) {
    element.style.width = `${computeSpacerWidth(newSidebarWidth)}px`;
  }
};

const injectSpacer = () => {
  // Here's the general idea of the spacer: we've had #root turned into a
  // flexbox. When we inject the DOM element, we have a root div that is ID'd
  // as `${applicationId}--${providedUiIdBase}-${spacer}`
  logseq.provideUI({
    key: spacerId,
    path: "#root",
    template: `<div style="width: ${computeSpacerWidth(
      getSidebarWidth()
    )}px; background: transparent; height: 100vh; cursor: ew-resize"></div>`,
  });
};

const removeSpacer = () => {
  logseq.provideUI({
    key: spacerId,
    path: "#root",
    template: "",
  });
};

// Main UI helpers -------------------------------------------------------------

const setMainUIStyle = (width: number) => {
  const px = `${width}px`;

  // TODO: this should be more dynamic.
  logseq.setMainUIInlineStyle({
    position: "absolute",
    zIndex: 11,
    width: px,
    top: "0",
    left: `calc(100vw - ${px})`,
    height: "100vh",
  });
};

// UI width --------------------------------------------------------------------

// UI --------------------------------------------------------------------------

const displayUI = () => {
  isUiShowing = true;

  // Remember, the overlay is just there to deal with giving full control over
  // mouse events back to the Logseq UI, and not be captured by the iframe.
  //
  // We don't actually need this by default.
  removeOverlay();

  injectSpacer();

  logseq.showMainUI();

  setMainUIStyle(getSidebarWidth());

  // syncInjectedContainer();
  updateSpacerWidth(getSidebarWidth());
};

const hideUI = () => {
  isUiShowing = false;

  logseq.hideMainUI();
  removeSpacer();
  removeOverlay();
};

// Resize logic ----------------------------------------------------------------

const beginResizeMode = () => {
  isResizing = true;
  injectOverlay();
};

const endResizeMode = () => {
  isResizing = false;
  removeOverlay();
};

// Parent UI event handlers ----------------------------------------------------

const handleParentWindowMouseDown = (event: MouseEvent) => {
  if (!isUiShowing) {
    return;
  }

  lastMousePosition = event.clientX;

  const viewportWidth = window.parent?.innerWidth;
  if (viewportWidth == null) return;
  const sidebarWidth = getSidebarWidth();
  const sidebarLeftEdgeLeftBoundary =
    viewportWidth - sidebarWidth - sidebarHandleWidth;
  const sidebarLeftEdgeRightBoundary = viewportWidth - sidebarWidth;

  if (
    sidebarLeftEdgeLeftBoundary <= event.clientX &&
    event.clientX <= sidebarLeftEdgeRightBoundary
  ) {
    beginResizeMode();
  }
};

const handleParentWindowMouseMove = (event: MouseEvent) => {
  if (!isResizing) {
    return;
  }

  const currentMousePosition = event.clientX;
  const nextWidth =
    getSidebarWidth() - (currentMousePosition - lastMousePosition);
  lastMousePosition = currentMousePosition;

  setSidebarWidth(nextWidth);

  const appliedWidth = getSidebarWidth();
  updateOverlayWidth(appliedWidth);
  updateSpacerWidth(appliedWidth);
  setMainUIStyle(appliedWidth);
};

const handleParentWindowMouseUp = () => {
  endResizeMode();
};

let hasRegisteredParentMouseDownListener = false;

const registerParentWindowListeners = () => {
  if (hasRegisteredParentMouseDownListener) {
    return;
  }

  window.parent.addEventListener("mousedown", handleParentWindowMouseDown);
  window.parent.addEventListener("mousemove", handleParentWindowMouseMove);
  window.parent.addEventListener("mouseup", handleParentWindowMouseUp);

  hasRegisteredParentMouseDownListener = true;
};

/**
 * The general idea is that while before, we had some
 * `div#root > div.theme-container`. Turns out, this is a perfect opportunity to
 * turn #root into a flexbox, with the left element being the main UI, and the
 * right element being the full UI.
 */
const injectGlobalStyleOverrides = () => {
  logseq.provideStyle(`
    #root { display: flex; }
    .theme-container { flex: 1; }
  `);
};

// Toolbar ---------------------------------------------------------------------

/**
 * Initializes the toolbar. By default, the sidebar is disabled. It needs to be
 * enabled when the user needs it, with the click of a button. This function
 * initializes the toolbar.
 */
const initializeToolbar = () => {
  const iconName = `${applicationId}--${providedUiIdBase}-toolbar-icon`;

  logseq.provideStyle(`
    .${iconName} {
      font-size: 20px;
      margin-top: 2px;
    }

    .${iconName}:hover {
      opacity: 1;
    }
  `);

  logseq.provideModel({
    toggle() {
      if (isUiShowing) {
        hideUI();
      } else {
        displayUI();
      }
    },
  });

  logseq.provideStyle(`
    #injected-ui-item-${iconName}-${applicationId} {
      display: flex;
      align-items: center;
      font-weight: 500;
      position: relative;
    }

    /* What is this? */
    #injected-ui-item-${iconName}-${applicationId}-overlay {
      display: flex;
      align-items: center;
      font-weight: 500;
      position: relative;
    }
  `);

  logseq.App.registerUIItem("toolbar", {
    key: iconName,
    template: `
      <a class="button relative" data-on-click="toggle">
        <span class="${iconName}"><i class="ti ti-message-chatbot"></i></span>
      </a>  
    `,
  });
};

// Persistence -----------------------------------------------------------------

const getLocalStorage = () => window.parent?.window?.localStorage;

const readStoredWidth = () => {
  try {
    // TODO: should this not be stored in the local iframe?
    const raw = getLocalStorage()?.getItem(sidebarWidthStorageKey);
    if (!raw) {
      return defaultWidth;
    }

    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) ? parsed : defaultWidth;
  } catch {
    return defaultWidth;
  }
};

const persistWidth = (width: number) => {
  try {
    getLocalStorage()?.setItem(sidebarWidthStorageKey, String(width));
  } catch {
    // noop
  }
};

// Initialization --------------------------------------------------------------

export const initializeSidebarStuff = () => {
  // The UI has three layers:
  //
  // - Spacer
  // - Main UI
  // - Overlay
  //
  // The spacer "shrinks" the main UI to make way for the sidebar, and so that
  // the sidebar does not end up obstructing Logseq's main view.
  //
  // The main UI is where all the chatbot magic happens. Not to be confused by
  // Logseq; as far as the user is concerned, to them Logseq is indeed the
  // "main UI", but as far as Logseq plugins are concrned, this plugin is the
  // "main UI", and Logseq is just Logseq (or we can call it the "parent",
  // interchangeably).
  //
  // The overlay only pops in during resizing. For some context, the main UI
  // is containerized in an iframe. When the user attempts the mouse may briefly
  // hover over the iframe, killing off any events that would have been picked
  // up by Logseq, and instead picked up by our main UI. Again, main UI is
  // housed inside an iframe. **All** mouse events are captured by the iframe
  // the during times that the user interacts from within the iframe's bounds.

  injectGlobalStyleOverrides();

  initializeToolbar();

  registerParentWindowListeners();
};
