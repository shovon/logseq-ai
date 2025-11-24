export {
  useGenerateEmbedding,
  getEmbedingsAllNotes,
  getEmbedingSinglePage,
  type VectorDBSchemaDynamic,
} from "./embedding/embed-manager";

export {
  loadVectorDatabase,
  batchInsertEmbeddings,
  vectorSearchOramaDB,
  type VectorDBSchema,
} from "./embedding/vector-db-manager";

export {
  checkAndIndexUpdatedPages,
  startPageIndexingOnChange,
} from "./embedding/index-manager";
