import "@logseq/libs";

import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App/App.tsx";
import { onReady } from "./services/logseq/ready-service.ts";
import { initializeSidebarStuff } from "./sidebar-stuff.ts";
import { indexAllEmbeddings } from "./services/embedding/indexer.ts";

const main = async () => {
  logseq.useSettingsSchema([
    {
      key: "openAiApiKey",
      type: "string",
      default: "",
      title: "Open AI API Key",
      description:
        "OpenAI API key for chat completion and embeddings. Used for AI responses and automatic page indexing.",
    },
  ]);

  initializeSidebarStuff();

  // logseq.DB.onChanged(() => {
  //   indexAllEmbeddings();
  // });
  indexAllEmbeddings();
};

onReady(main);

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
