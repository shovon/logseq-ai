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

const VECTOR_DB_INDEXEDDB_NAME = "logseq-ai-vector-db";
const VECTOR_DB_INDEXEDDB_STORE = "vector-db-store";
const DEFAULT_GRAPH_KEY = "logseq-ai-default-graph";

type AppGraphInfoFields = {
  name?: string;
  path?: string;
  url?: string;
};

const getGraphKey = async () => {
  try {
    const graph =
      (await logseq.App.getCurrentGraph()) as AppGraphInfoFields | null;
    const parts = [graph?.name ?? "", graph?.path ?? "", graph?.url ?? ""];
    const concatenated = parts.join("|");
    return concatenated || DEFAULT_GRAPH_KEY;
  } catch (error) {
    console.error("Failed to compute graph key", error);
    return `${DEFAULT_GRAPH_KEY}`;
  }
};

const openVectorDbIndexedDb = () =>
  new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(VECTOR_DB_INDEXEDDB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(VECTOR_DB_INDEXEDDB_STORE)) {
        db.createObjectStore(VECTOR_DB_INDEXEDDB_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const readVectorDbString = async (key: string) => {
  const db = await openVectorDbIndexedDb();
  return new Promise<string | null>((resolve, reject) => {
    const tx = db.transaction(VECTOR_DB_INDEXEDDB_STORE, "readonly");
    const store = tx.objectStore(VECTOR_DB_INDEXEDDB_STORE);
    const request = store.get(key);
    request.onsuccess = () => {
      resolve(typeof request.result === "string" ? request.result : null);
    };
    request.onerror = () => reject(request.error);
    const closeDb = () => db.close();
    tx.oncomplete = closeDb;
    tx.onabort = closeDb;
    tx.onerror = closeDb;
  });
};

const writeVectorDbString = async (key: string, value: string) => {
  const db = await openVectorDbIndexedDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(VECTOR_DB_INDEXEDDB_STORE, "readwrite");
    const store = tx.objectStore(VECTOR_DB_INDEXEDDB_STORE);
    const request = store.put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    const closeDb = () => db.close();
    tx.oncomplete = closeDb;
    tx.onabort = closeDb;
    tx.onerror = closeDb;
  });
};

const saveDb = async (dbInstance: Orama<VectorDBSchema>) => {
  const serialized = await save(dbInstance);
  const graphKey = await getGraphKey();
  await writeVectorDbString(graphKey, JSON.stringify(serialized));
};

/**
 * Gets the persisted vector DB for the current graph as a serialized string.
 * @returns A promise resolving to the serialized vector DB string.
 */
const getPersistedVectorDbString = async () => {
  const graphKey = await getGraphKey();
  try {
    return await readVectorDbString(graphKey);
  } catch (error) {
    console.error("Failed to read persisted vector DB", error);
    return null;
  }
};

let dbInstance: ReturnType<
  typeof create<
    Readonly<{
      id: "string";
      checksum: "string";
      embedding: EmbeddingType;
    }>
  >
> | null = null;

/**
 * Loads the vector database where all vector embeddings are going to be stored.
 * @returns A promise that contains the vector DB
 */
export async function getDb(): Promise<Orama<VectorDBSchema>> {
  if (dbInstance) return dbInstance;

  const persistedData = await getPersistedVectorDbString();

  dbInstance = await create({
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
  const dbInstance = await getDb();
  insertMultiple(dbInstance, embeddings);
  await saveDb(dbInstance);
}

/**
 * Runs a vector lookup based on supplied vector.
 * @param vector The vector to search by.
 * @returns Get all documents that are the most similar to the supplied vector.
 */
export async function vectorSearch(vector: number[]) {
  const dbInstance = await getDb();
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
  const dbInstance = await getDb();
  return getByID(dbInstance, id);
}

function debounce<T, R>(callback: (arg: T) => Promise<R>, delay: number) {
  let timer: ReturnType<typeof setTimeout>;
  return function (arg: T) {
    clearTimeout(timer);
    return new Promise((resolve) => {
      timer = setTimeout(() => {
        resolve(callback(arg));
      }, delay);
    });
  };
}

const debounceSaveDb = debounce(saveDb, 1000);

/**
 * Upserts a doc into the DB, but actual persistence to disc is debounced.
 * Especially useful for bulk inserts.
 * @param doc The doc to upsert
 */
export async function upsertDebouncedSave(doc: EmbeddingDoc) {
  const dbInstance = await getDb();
  remove(dbInstance, doc.id);
  insert(dbInstance, doc);
  await debounceSaveDb(dbInstance);
}

export async function deleteDebounceSave(id: string) {
  const dbInstance = await getDb();
  remove(dbInstance, id);
  await debounceSaveDb(dbInstance);
}

/**
 * Get all embedding documeents
 */
export async function getAllIds() {
  return (await getDb()).internalDocumentIDStore.internalIdToId;
}
