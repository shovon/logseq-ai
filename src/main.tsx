import "@logseq/libs";

import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App/App.tsx";
import { onReady } from "./services/logseq/ready-service.ts";
import { initializeSidebarStuff } from "./sidebar-stuff.ts";
import { indexAllEmbeddings } from "./services/embedding/indexer.ts";
import { onRouteChanged } from "./services/logseq/route-change-service.ts";
import { loadMCPServers } from "./services/chat-completion/mcp.ts";
import { Hub } from "./job-manager/examples/hub.tsx";
import { debouncePromiseHandler } from "./utils/utils.ts";

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
    {
      key: "falApiKey",
      type: "string",
      default: "",
      title: "FAL API Key",
      description:
        "FAL API key for image generation. Get your key at https://fal.ai/dashboard/keys",
    },
  ]);

  initializeSidebarStuff();

  const runIndexing = async () => {
    await indexAllEmbeddings();
  };

  // TODO: this really doesn't stop all 3 from firing `runIndexing` at once.
  //   Gotta fix this.
  debouncePromiseHandler(logseq.DB.onChanged.bind(logseq.DB))(runIndexing);
  debouncePromiseHandler(onRouteChanged)(runIndexing);
  indexAllEmbeddings();

  loadMCPServers();
};

onReady(main);

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(<App />);
  // createRoot(rootEl).render(<Hub />);
}
