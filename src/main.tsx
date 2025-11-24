import "@logseq/libs";

import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App/App.tsx";
import { onReady } from "./services/logseq/ready-service.ts";
import { initializeSidebarStuff } from "./sidebar-stuff.ts";
import {
  loadVectorDatabase,
  startPageIndexingOnChange,
} from "./services/embedding-service.ts";

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

  // Initialize auto-indexer if OpenAI API key is configured
  const settings = logseq.settings;
  const openAiApiKey =
    settings?.openAiApiKey && typeof settings.openAiApiKey === "string"
      ? settings.openAiApiKey
      : "";
  if (openAiApiKey !== "") {
    try {
      console.log("Initializing embedding auto-indexer...");
      const oramaInstance = await loadVectorDatabase(settings, false);
      startPageIndexingOnChange(oramaInstance, openAiApiKey);
      console.log("Embedding auto-indexer initialized successfully");
    } catch (error) {
      console.error("Failed to initialize embedding auto-indexer:", error);
    }
  }
};

onReady(main);

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
