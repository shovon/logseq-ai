import { getByID, remove } from "@orama/orama";
import type { Orama } from "@orama/orama";
import { useGenerateEmbedding } from "./embed-manager";
import type { VectorDBSchemaDynamic } from "./embed-manager";
import { batchInsertEmbeddings } from "./vector-db-manager";
import type { VectorDBSchema } from "./vector-db-manager";

let hasHooked = false;
let currentEmbeddingKey = "";
let currentOramaInstance: Orama<VectorDBSchema>;
let indexingInProgress = false;

const isInternalPage = (name: string) => {
  return (
    name.startsWith("card") ||
    name.startsWith("contents") ||
    name.startsWith("favorites") ||
    name.startsWith("__") ||
    name === "journals" ||
    name === "contents" ||
    name === "favorites"
  );
};

export async function checkAndIndexUpdatedPages(
  oramaInstance: Orama<VectorDBSchema>,
  embeddingApiKey: string
): Promise<void> {
  if (indexingInProgress) return;

  indexingInProgress = true;

  try {
    const pages = (await logseq.Editor.getAllPages()) ?? [];

    for (const page of pages) {
      if (isInternalPage(page.name)) continue;

      const dbRecord = getByID(oramaInstance, page.id.toString());
      const lastUpdated: number = page.updatedAt ?? 0;

      if (dbRecord && dbRecord.lastUpdated >= lastUpdated) continue;

      try {
        const blocks = await logseq.Editor.getPageBlocksTree(page.uuid);
        let wholePageContent = `note_id: ${page.id}\nnote_name: ${page.name}\nnote_content:\n\n`;
        for (const block of blocks) {
          if (block.content) {
            wholePageContent += `- ${block.content}\n`;
          }
        }

        const embedding = await useGenerateEmbedding(
          wholePageContent,
          embeddingApiKey
        );

        const newEmbedding: VectorDBSchemaDynamic = {
          id: page.id.toString(),
          lastUpdated,
          content: wholePageContent,
          embedding,
        };

        if (dbRecord?.id) {
          remove(oramaInstance, dbRecord.id);
        }

        batchInsertEmbeddings(oramaInstance, [newEmbedding]);
      } catch (error) {
        console.error(
          `Error indexing page ${page.name} (ID: ${page.uuid}):`,
          error
        );
      }
    }
  } finally {
    setTimeout(() => {
      indexingInProgress = false;
    }, 1000);
  }
}

export function startPageIndexingOnChange(
  oramaInstance: Orama<VectorDBSchema>,
  embeddingApiKey: string
): void {
  currentEmbeddingKey = embeddingApiKey;
  currentOramaInstance = oramaInstance;

  if (hasHooked) return;
  hasHooked = true;

  logseq.DB.onChanged(async () => {
    try {
      await checkAndIndexUpdatedPages(
        currentOramaInstance,
        currentEmbeddingKey
      );
    } catch (err) {
      console.error("Error indexing updated pages:", err);
    }
  });
}
