import "@logseq/libs";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import packageJson from "../package.json";

const providedUiId = "logseq-ai-plugin";
const applicationId = packageJson.logseq.id;
const elementId = `${applicationId}--${providedUiId}`;

let reactRoot: ReturnType<typeof createRoot> | null = null;
let observer: MutationObserver | null = null;
let isShowing = false;

const displayUI = () => {
  isShowing = true;

  logseq.provideUI({
    key: providedUiId,
    path: "#root",
    template: '<div style="width: 400px"></div>',
  });

  setTimeout(() => {
    const element = parent.document.querySelector(`#${elementId} > div`);
    if (!element) {
      logseq.UI.showMsg("Failed to find DOM element for React root", "error");
      return;
    }

    reactRoot = createRoot(element);
    reactRoot.render(
      <StrictMode>
        <App />
      </StrictMode>
    );

    // Watch for DOM element removal
    observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.removedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            const elementNode = node as Element;
            if (
              elementNode.id === elementId ||
              elementNode.querySelector(`#${elementId}`)
            ) {
              hideUI();
            }
          }
        });
      });
    });

    observer.observe(parent.document.body, {
      childList: true,
      subtree: true,
    });
  });
};

const hideUI = () => {
  isShowing = false;

  // Clean up React root when UI is hidden
  if (reactRoot) {
    reactRoot.unmount();
    reactRoot = null;
  }

  // Clean up observer
  if (observer) {
    observer.disconnect();
    observer = null;
  }

  logseq.provideUI({
    key: providedUiId,
    path: "#root",
    template: "",
  });
};

const main = () => {
  // displayUI();

  const iconName = `${elementId}-toolbar-icon`;

  logseq.provideStyle(`
    #root { display: flex; }
    .theme-container { flex: 1; }

    .${iconName} {
      font-size: 20px;
      margin-top: 4px;
    }

    .${iconName}:hover {
      opacity: 1;
    }
  `);

  logseq.provideModel({
    toggle() {
      if (isShowing) {
        hideUI();
      } else {
        displayUI();
      }
    },
  });

  logseq.App.registerUIItem("toolbar", {
    key: iconName,
    template: `
      <a class="button relative" data-on-click="toggle">
        <div class="${iconName}">✨</div>
      </a>  
    `,
  });
};

logseq.ready(main).catch(console.error);
