import {
  type BlockEntity,
  type PageEntity,
} from "@logseq/libs/dist/LSPlugin.user";

// Common
const advancedQuery = async <T>(
  query: string,
  ...input: Array<unknown>
): Promise<T | null> => {
  try {
    const result = await logseq.DB.datascriptQuery(query, ...input);
    return result?.flat() as T;
  } catch (err) {
    console.warn("Query execution failed:", err);
    return null;
  }
};

// Utility: deduplicate entities by uuid if present
const dedupeByUuid = <T extends { uuid?: string }>(items: T[] | null): T[] => {
  if (!items) return [];
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const item of items) {
    const id = item?.uuid ? String(item.uuid) : undefined;
    if (!id) {
      deduped.push(item);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    deduped.push(item);
  }
  return deduped;
};

// Get the UUID matching the page name
export const getPageUuid = async (
  pageName: string
): Promise<PageEntity["uuid"] | null> => {
  const result = await advancedQuery<{ uuid: PageEntity["uuid"] }[]>(
    `
    [:find (pull ?p [:block/uuid])
     :in $ ?input
     :where
     [?p :block/name ?name]
     [(= ?name ?input)]
     [?p :block/uuid ?uuid]]
     `,
    pageName
  );
  return result?.[0]?.uuid ?? null;
};

// Get the content matching the uuid for file-based model (Logseq v0.10.*)
export const getContentFromUuid = async (
  uuid: BlockEntity["uuid"]
): Promise<BlockEntity["content"] | null> => {
  const result = await advancedQuery<{ content: BlockEntity["content"] }[]>(`
    [:find (pull ?p [:block/content])
     :where
     [?p :block/uuid ?uuid]
     [(str ?uuid) ?str]
     [(= ?str "${uuid}")]]
     `);
  return result?.[0]?.content ?? null;
};

// Get all pages that have a specific property with a specific value
export const getPagesByProperty = async (
  propertyName: string,
  propertyValue: string
): Promise<PageEntity[]> => {
  const result = await advancedQuery<PageEntity[]>(
    `
    [:find (pull ?page [:block/uuid :block/name :block/content :block/properties])
     :where
     [?page :block/name]
     [?page :block/properties ?props]
     [(get ?props "${propertyName}") "${propertyValue}"]]
    `
  );
  return dedupeByUuid(result ?? []);
};

// Alternative approach using page-property query (more similar to Logseq's query syntax)
export const getPagesByPropertyAlternative = async (
  propertyName: string,
  propertyValue: string
): Promise<PageEntity[]> => {
  const result = await advancedQuery<PageEntity[]>(
    `
    [:find (pull ?page [:block/uuid :block/name :block/content])
     :where
     [?page :block/name]
     [?page :block/properties ?props]
     [(contains? ?props "${propertyName}")]
     [(get ?props "${propertyName}") "${propertyValue}"]]
    `
  );
  return dedupeByUuid(result ?? []);
};

// Get all pages that have a specific property (regardless of value)
export const getPagesWithProperty = async (
  propertyName: string
): Promise<PageEntity[]> => {
  const result = await advancedQuery<PageEntity[]>(
    `
    [:find (pull ?page [:block/uuid :block/name :block/content :block/properties])
     :where
     [?page :block/name]
     [?page :block/properties ?props]
     [(contains? ?props "${propertyName}")]]
    `
  );
  return dedupeByUuid(result ?? []);
};

// Get all pages that have a specific property (regardless of value)
export const getAllPages = async (): Promise<PageEntity[]> => {
  const result = await advancedQuery<PageEntity[]>(
    `
    [:find (pull ?p [:block/original-name])
      :where
      [?p :block/properties ?props]
      [(get ?props :type) ?type]
      [(= ?type "chat-thread")]]
    `
  );
  return dedupeByUuid(result ?? []);
};

export const getAllChatThreads = async (): Promise<PageEntity[]> => {
  const result = await advancedQuery<PageEntity[]>(
    `
    [:find (pull ?p [*])
      :where
      [?p :block/properties ?props]
      [(get ?props :type) ?type]
      [(= ?type "logseq ai chat thread")]
      [?p :block/name _]]
    `
  );
  return result ?? [];
};
