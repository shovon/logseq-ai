import "@logseq/libs";

import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App/App.tsx";
import { onReady } from "./services/ready-service.ts";
import { initializeSidebarStuff } from "./sidebar-stuff.ts";

const main = () => {
  logseq.useSettingsSchema([
    {
      key: "openAiApiKey",
      type: "string",
      default: "",
      title: "Open AI API Key",
      description: "We use the OpenAI API for inference and chat completion.",
    },
  ]);

  initializeSidebarStuff();
};

onReady(main);

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
