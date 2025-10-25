import "@logseq/libs";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";
import packageJson from "../package.json";

const providedUiId = "logseq-ai-plugin";
const applicationId = packageJson.logseq.id;
const elementId = `${applicationId}--${providedUiId}`;

const onAiButtonClick = "onAiButtonClick";

const main = () => {
  logseq.provideStyle(`
    #root { display: flex; }
    .theme-container { flex: 1; }
  `);

  logseq.provideUI({
    key: providedUiId,
    path: "#root",
    template:
      '<div style="border: 1px solid red; height: 100vh; min-width: 250px"></div>',
  });

  logseq.provideModel({
    [onAiButtonClick]() {
      logseq.UI.showMsg("Hello, World!");
    },
  });

  setTimeout(() => {
    const element = parent.document.querySelector(`#${elementId} > div`)!;
    createRoot(element).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });
};

logseq.ready(main).catch(console.error);
