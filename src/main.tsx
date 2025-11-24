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
      description: "We use the OpenAI API for inference and chat completion.",
    },
    {
      key: "embeddingApiKey",
      type: "string",
      default: "",
      title: "Embedding API Key",
      description:
        "OpenAI API key for generating embeddings (text-embedding-ada-002 model). Used for automatic page indexing.",
    },
  ]);

  initializeSidebarStuff();

  // Initialize auto-indexer if embedding API key is configured
  const settings = logseq.settings;
  const embeddingApiKey =
    settings?.embeddingApiKey && typeof settings.embeddingApiKey === "string"
      ? settings.embeddingApiKey
      : "";
  if (embeddingApiKey !== "") {
    try {
      console.log("Initializing embedding auto-indexer...");
      const oramaInstance = await loadVectorDatabase(settings, false);
      startPageIndexingOnChange(oramaInstance, embeddingApiKey);
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
