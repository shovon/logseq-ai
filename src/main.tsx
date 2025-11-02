import "@logseq/libs";

import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import { onReady } from "./ready-service.ts";

const providedUiId = "logseq-ai-plugin";
let applicationId = logseq.baseInfo.id;
let elementId = `${applicationId}--${providedUiId}`;

let isShowing = false;

const displayUI = () => {
  isShowing = true;

  logseq.provideUI({
    key: providedUiId,
    path: "#root",
    template: '<div style="width: 400px"></div>',
  });

  logseq.showMainUI();
};

const hideUI = () => {
  isShowing = false;

  logseq.hideMainUI();

  logseq.provideUI({
    key: providedUiId,
    path: "#root",
    template: "",
  });
};

const main = () => {
  applicationId = logseq.baseInfo.id;
  elementId = `${applicationId}--${providedUiId}`;

  const iconName = `${elementId}-toolbar-icon`;

  logseq.setMainUIInlineStyle({
    position: "absolute",
    zIndex: 11,
    width: "400px",
    top: "0",
    left: "calc(100vw - 400px)",
    height: "100vh",
  });

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

  logseq.provideStyle(`
    #injected-ui-item-${iconName}-${applicationId} {
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
        <div class="${iconName}">✨</div>
      </a>  
    `,
  });
};

onReady(main);

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
