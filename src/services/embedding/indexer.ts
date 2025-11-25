// This is the indexer service that both batch runs indexing on startup and
// updates the persisted embeddings upon change.

import Bottleneck from "bottleneck";
import {
  deleteDebounceSave,
  getAllIds,
  getEmbeddingDoc,
  upsertDebouncedSave,
} from "./db";
import { generateEmbedding, HTTPError } from "./embedding";
import { onRouteChanged } from "../logseq/route-change-service";

let isRunning = false;
let runningEmbeddings = 0;

const limiter = new Bottleneck({
  minTime: 0,
  maxConcurrent: 10000,

  reservoir: null,
  reservoirRefreshInterval: null,
  reservoirRefreshAmount: null,
});

limiter.on("failed", async (error: unknown, jobInfo) => {
  if (error instanceof HTTPError && error.response.status === 429) {
    const retryCount = jobInfo.retryCount || 0;

    // Exponential backoff: 1s, 2s, 4s, 8s, etc.

    const retryAfter = Number(error.response.headers.get("retry-after")) || 1;
    return (
      retryAfter * Math.min(Math.pow(2, retryCount) * 1000, 60000) +
      Math.random() * 5000
    );
  }

  // TODO: add more sophisticated retry logic.
  // For other errors, don't retry
  return null;
});

async function computeChecksum(value: string): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error("Web Crypto API is not available in this environment.");
  }

  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const digest = await subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function getOpenApiKey() {
  const currentApiKey = () => {
    const apiKey = logseq.settings?.openAiApiKey;
    if (typeof apiKey === "string" && apiKey.trim() !== "") {
      return apiKey.trim();
    }
    return null;
  };

  const apiKey = currentApiKey();
  if (apiKey) {
    return apiKey;
  }

  // Wait for the user to update the settings before proceeding.
  return new Promise<string>((resolve) => {
    const unsubscribe = logseq.onSettingsChanged(() => {
      const nextKey = currentApiKey();
      if (nextKey) {
        unsubscribe();
        resolve(nextKey);
      }
    });
  });
}

export async function indexAllEmbeddings() {
  console.log("Trying to index");
  if (isRunning || runningEmbeddings > 0) {
    return;
  }
  isRunning = true;

  const abortController = new AbortController();

  const graphName = (await logseq.App.getCurrentGraph())?.path ?? "";
  const lookForGraphSwap = () => {
    logseq.App.getCurrentGraph().then((g) => {
      if (graphName !== g?.path) abortController.abort();
    });
  };

  const blockSet = new Set<string>();

  const unsubscribeOnChange = logseq.DB.onChanged(lookForGraphSwap);
  const unsubscribeOnOnRouteChanged = onRouteChanged(lookForGraphSwap);

  try {
    const apiKey = await getOpenApiKey();
    const pages = (await logseq.Editor.getAllPages()) ?? [];

    for (const page of pages) {
      if (abortController.signal.aborted) return;

      const blocks = await logseq.Editor.getPageBlocksTree(page.uuid);

      for (const block of blocks ?? []) {
        blockSet.add(block.uuid);
        if (abortController.signal.aborted) return;
        const inputText =
          typeof block.content === "string" ? block.content.trim() : "";

        if (!inputText) {
          continue;
        }

        const existingEmbedding = await getEmbeddingDoc(block.uuid);
        const checksum = await computeChecksum(inputText);
        if (existingEmbedding?.checksum === checksum) continue;

        limiter.schedule(async () => {
          runningEmbeddings++;
          try {
            const [embedding, checksum] = await Promise.all([
              generateEmbedding({
                inputText,
                apiKey,
                signal: abortController.signal,
              }),
              computeChecksum(inputText),
            ]);
            await upsertDebouncedSave({
              id: block.uuid,
              embedding,
              checksum,
            });
          } finally {
            runningEmbeddings--;
          }
        });
      }
    }
  } finally {
    isRunning = false;
    unsubscribeOnChange();
    unsubscribeOnOnRouteChanged();
  }

  // const allIds = await getAllIds();
  // for (const id of allIds) {
  //   if (!blockSet.has(id)) {
  //     deleteDebounceSave(id);
  //   }
  // }
}
