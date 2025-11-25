import "@logseq/libs";

import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App/App.tsx";
import { onReady } from "./services/logseq/ready-service.ts";
import { initializeSidebarStuff } from "./sidebar-stuff.ts";
import { indexAllEmbeddings } from "./services/embedding/indexer.ts";
import { onRouteChanged } from "./services/logseq/route-change-service.ts";

function debounce(callback: () => unknown, delay: number) {
  let timer: ReturnType<typeof setTimeout>;
  return function () {
    clearTimeout(timer);
    timer = setTimeout(() => {
      callback();
    }, delay);
  };
}

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

  const debouncedIndex = debounce(indexAllEmbeddings, 1000);

  const debouncedIndexing = () => {
    debouncedIndex();
  };

  logseq.DB.onChanged(debouncedIndexing);
  onRouteChanged(debouncedIndexing);

  indexAllEmbeddings();
};

onReady(main);

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<App />);
}
