import {
  create,
  getByID,
  insert,
  insertMultiple,
  remove,
  search,
  save,
  load,
  type Orama,
} from "@orama/orama";
import packageJson from "../../../package.json" with { type: "json" };
import { EmbeddingType } from "./embedding";

export type VectorDBSchema = Readonly<{
  id: "string";
  checksum: "string";
  embedding: EmbeddingType;
}>;

const VectorDBSchema: VectorDBSchema = Object.freeze({
  id: "string",
  checksum: "string",
  embedding: EmbeddingType,
});

type EmbeddingDoc = {
  id: string;
  checksum: string;
  embedding: number[];
};

const saveDb = async (dbInstance: Orama<VectorDBSchema>) => {
  const serialized = await save(dbInstance);
  await logseq.updateSettings({ vectorDb: JSON.stringify(serialized) });
};

/**
 * Gets the persisted vector DB as a string format.
 * @returns A string that is hopefully the vector DB as a string.
 */
const getPersistedVectorDbString = () => {
  const vectorDb = logseq.settings?.vectorDb;
  return typeof vectorDb === "string" ? vectorDb.trim() : null;
};

/**
 * Loads the vector database where all vector embeddings are going to be stored.
 * @returns A promise that contains the vector DB
 */
export async function loadVectorDatabase(): Promise<Orama<VectorDBSchema>> {
  const persistedData = getPersistedVectorDbString();

  const dbInstance = await create({
    schema: VectorDBSchema,
    id: packageJson.logseq.id,
  });

  if (persistedData) {
    try {
      await load(dbInstance, JSON.parse(persistedData));
    } catch {
      // If loading fails, start with fresh database
      await saveDb(dbInstance);
    }
  } else {
    // No persisted data, save initial empty database
    await saveDb(dbInstance);
  }

  return dbInstance;
}

/**
 * Inserts the supplied embeddings into the DB.
 * @param dbInstance An instance of Orama DB
 * @param embeddings The embeddings to insert
 */
export async function insertEmbeddings(embeddings: EmbeddingDoc[]) {
  const dbInstance = await loadVectorDatabase();
  insertMultiple(dbInstance, embeddings);
  await saveDb(dbInstance);
}

/**
 * Runs a vector lookup based on supplied vector.
 * @param vector The vector to search by.
 * @returns Get all documents that are the most similar to the supplied vector.
 */
export async function vectorSearch(vector: number[]) {
  const dbInstance = await loadVectorDatabase();
  return search(dbInstance, {
    mode: "vector",
    vector: {
      value: vector,
      property: "embedding",
    },
    similarity: 0.65,
    includeVectors: false,
    limit: 5,
    offset: 0,
  });
}

/**
 * Gets a doc associated with the supplied ID.
 * @param id The ID associated with the document.
 * @returns The document associated with the ID.
 */
export async function getEmbeddingDoc(id: string) {
  const dbInstance = await loadVectorDatabase();
  return getByID(dbInstance, id);
}

/**
 * Upserts a doc into the DB.
 * @param doc The doc to upsert
 */
export async function upsert(doc: EmbeddingDoc) {
  const dbInstance = await loadVectorDatabase();
  remove(dbInstance, doc.id);
  insert(dbInstance, doc);
  await saveDb(dbInstance);
}
