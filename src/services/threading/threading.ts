import { z } from "zod";
import Fuse from "fuse.js";
import {
  filterPropertyLines,
  sanitizeMarkdownHeadersToRfcBullets,
} from "../../utils/utils";
import type {
  BlockEntity,
  EntityID,
  BlockUUID,
  IEntityID,
  BlockUUIDTuple,
} from "@logseq/libs/dist/LSPlugin.user";

const EntityID: z.ZodType<EntityID> = z.number();
const BlockUUID: z.ZodType<BlockUUID> = z.string();
const IEntityID: z.ZodType<IEntityID> = z
  .object({
    id: EntityID,
  })
  .catchall(z.any());
const BlockUUIDTuple = z.tuple([z.literal("uuid"), BlockUUID]);

const BlockEntity: z.ZodType<BlockEntity> = z
  .object({
    id: EntityID,
    uuid: BlockUUID,
    left: IEntityID,
    format: z.union([z.literal("markdown"), z.literal("org")]),
    parent: IEntityID,
    content: z.string(),
    page: IEntityID,
    properties: z.record(z.string(), z.any()).optional(),
    anchor: z.string().optional(),
    body: z.any().optional(),
    children: z
      .lazy(() => z.array(z.union([BlockEntity, BlockUUIDTuple])))
      .optional(),
    container: z.string().optional(),
    file: IEntityID.optional(),
    level: z.number().optional(),
    meta: z
      .object({
        timestamps: z.any(),
        properties: z.any(),
        startPos: z.number(),
        endPos: z.number(),
      })
      .optional(),
    title: z.array(z.any()).optional(),
    marker: z.string().optional(),
  })
  .catchall(z.any());

// TODO: quite a lot of this stuff is domain-specific. De domainify things here.

// Note: this comment on GitHub helped a lot:
// https://github.com/logseq/plugins/issues/30#issuecomment-2926495102

// A lot of datalog querying going on.
//
// This page helped me prompt engineer my way into finding the right query:
// https://docs.logseq.com/#/page/advanced%20queries

const PageType = z
  .object({
    name: z.string().optional(),
    uuid: z.string(),
    id: z.number().optional(),
    ["original-name"]: z.string().optional(),
    ["updated-at"]: z.number().transform((ts) => new Date(ts)),
    content: z.string().optional(),
  })
  .transform(
    ({
      name,
      uuid,
      id,
      ["original-name"]: originalName,
      ["updated-at"]: updatedAt,
      content,
    }) => ({
      name,
      uuid,
      id,
      originalName,
      content,
      updatedAt,
    })
  );

export type PageType = z.infer<typeof PageType>;

type Role = "user" | "assistant" | "system";
const Role = z.enum(["user", "assistant", "system"]);

export type Message = {
  role: Role;
  content: string;
};

export type BlockMessage = {
  message: Message;
  block: BlockEntity;
  blockReferences: BlockEntity[];
};

export type ThreadMetadata = {
  threadId?: string; // UUID for forked threads only
  referenceId?: string; // Block UUID, only on root of forked thread
  threadHash?: string; // SHA-256 hash of predecessor block IDs
};

export type ThreadedBlock = BlockEntity & {
  threadMetadata?: ThreadMetadata;
};

export type Thread = {
  threadId: string | null; // null for main thread
  blocks: ThreadedBlock[];
  referenceId?: string; // Only for forked threads
  isValid: boolean; // Hash validation result
};

/**
 * Computes a SHA-256 hash of block IDs concatenated in order.
 * Used to validate thread integrity.
 */
export const computeThreadHash = async (
  blockIds: string[]
): Promise<string> => {
  // Concatenate block IDs in order and hash with SHA-256
  const concatenated = blockIds.join("|");
  const encoder = new TextEncoder();
  const data = encoder.encode(concatenated);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
};

/**
 * Extracts thread metadata from block properties.
 */
export const extractThreadMetadata = (
  block: BlockEntity
): ThreadMetadata | undefined => {
  const props = block.properties;
  if (!props) {
    return undefined;
  }

  const threadId =
    typeof props.threadId === "string" ? props.threadId : undefined;
  const referenceId =
    typeof props.referenceId === "string" ? props.referenceId : undefined;
  const threadHash =
    typeof props.threadHash === "string" ? props.threadHash : undefined;

  if (!threadId && !referenceId && !threadHash) {
    return undefined;
  }

  return {
    threadId,
    referenceId,
    threadHash,
  };
};

/**
 * Gets all blocks that come before a given block in the page.
 * Used to compute thread hash from predecessors.
 */
export const getPredecessorBlocks = async (
  blockId: string,
  pageId: string
): Promise<BlockEntity[]> => {
  // Get all blocks from the page
  const allBlocks =
    ((await logseq.Editor.getPageBlocksTree(
      pageId
    )) as Array<BlockEntity> | null) ?? [];

  // Find the index of the target block
  const targetIndex = allBlocks.findIndex((block) => block.uuid === blockId);
  if (targetIndex === -1) {
    throw new Error(`Block ${blockId} not found in page ${pageId}`);
  }

  // Return all blocks before the target block
  return allBlocks.slice(0, targetIndex + 1);
};

/**
 * Validates thread integrity for a given set of blocks.
 * Internal helper that doesn't cause circular dependencies.
 */
const validateThreadIntegrityForBlocks = async (
  threadBlocks: ThreadedBlock[],
  pageId: string
): Promise<boolean> => {
  if (threadBlocks.length === 0) {
    return false;
  }

  // Get the first block's predecessors to compute expected hash
  const firstBlock = threadBlocks[0];
  const predecessors = await getPredecessorBlocks(firstBlock.uuid, pageId);
  const predecessorIds = predecessors.map((b) => b.uuid);

  // Compute expected hash
  const expectedHash = await computeThreadHash(predecessorIds);

  // Check if the first block's hash matches
  const firstBlockMetadata = extractThreadMetadata(firstBlock);
  if (!firstBlockMetadata?.threadHash) {
    return false;
  }

  return firstBlockMetadata.threadHash === expectedHash;
};

/**
 * Gets all blocks in a specific thread by threadId.
 */
export const getThreadByThreadId = async (
  threadId: string,
  pageId: string
): Promise<Thread> => {
  // Get all blocks from the page
  const allBlocks =
    ((await logseq.Editor.getPageBlocksTree(
      pageId
    )) as Array<BlockEntity> | null) ?? [];

  // Filter blocks that belong to this thread
  let referenceId: string | undefined;

  let threadBlocks: BlockEntity[] = allBlocks.filter(
    (block) => block.properties?.threadId === threadId
  );

  let withReference = threadBlocks[0].properties?.referenceId
    ? threadBlocks[0]
    : null;

  while (withReference) {
    const referenceId = withReference.properties?.referenceId;
    const predecessorBlocks = await getPredecessorBlocks(referenceId, pageId);
    const blockOfReference = predecessorBlocks.find((block) => {
      return block.uuid === referenceId;
    });
    if (!blockOfReference) {
      break;
    }
    if (!blockOfReference.properties?.threadId) {
      threadBlocks = [
        ...predecessorBlocks.filter(
          (block) => !block.properties?.threadId && block.uuid !== referenceId
        ),
        ...threadBlocks,
      ];
    } else {
      threadBlocks = [
        ...predecessorBlocks.filter((block) => {
          return (
            block.properties?.threadId ===
              blockOfReference.properties?.threadId &&
            block.uuid !== referenceId
          );
        }),
        ...threadBlocks,
      ];
    }
    withReference = threadBlocks[0].properties?.referenceId
      ? threadBlocks[0]
      : null;
  }

  const isValid =
    threadBlocks.length > 0
      ? await validateThreadIntegrityForBlocks(threadBlocks, pageId)
      : false;

  return {
    threadId,
    blocks: threadBlocks,
    referenceId,
    isValid,
  };
};

/**
 * Gets the thread containing a specific block by traversing up the graph.
 * Returns null if the block is not part of any thread (main thread).
 */
export const getThreadByBlockId = async (
  blockId: string,
  pageId: string
): Promise<Thread | null> => {
  const block = await logseq.Editor.getBlock(blockId);
  if (!block) {
    return null;
  }

  const metadata = extractThreadMetadata(block);

  // If block has no threadId, it's part of the main thread
  if (!metadata?.threadId) {
    // Return main thread (null threadId)
    return getAllThreadsInPage(pageId).then(
      (threads) => threads.get(null) || null
    );
  }

  // Block is part of a forked thread
  return getThreadByThreadId(metadata.threadId, pageId);
};

/**
 * Gets all threads in a page, including the main thread (null threadId)
 * and all forked threads.
 */
export const getAllThreadsInPage = async (
  pageId: string
): Promise<Map<string | null, Thread>> => {
  // Get all blocks from the page
  const allBlocks =
    ((await logseq.Editor.getPageBlocksTree(
      pageId
    )) as Array<BlockEntity> | null) ?? [];

  const threadsMap = new Map<string | null, Thread>();
  const threadBlocksMap = new Map<string | null, ThreadedBlock[]>();
  const referenceIdsMap = new Map<string | null, string>();

  // Separate blocks into threads
  for (const block of allBlocks) {
    const metadata = extractThreadMetadata(block);
    const threadId = metadata?.threadId || null;

    if (!threadBlocksMap.has(threadId)) {
      threadBlocksMap.set(threadId, []);
    }

    threadBlocksMap.get(threadId)!.push({
      ...block,
      threadMetadata: metadata,
    });

    // Capture referenceId for forked threads
    if (metadata?.referenceId && threadId !== null) {
      referenceIdsMap.set(threadId, metadata.referenceId);
    }
  }

  // Build Thread objects and validate integrity
  for (const [threadId, blocks] of threadBlocksMap.entries()) {
    const isValid =
      threadId !== null && blocks.length > 0
        ? await validateThreadIntegrityForBlocks(blocks, pageId)
        : true; // Main thread is always considered valid

    threadsMap.set(threadId, {
      threadId,
      blocks,
      referenceId: referenceIdsMap.get(threadId || ""),
      isValid,
    });
  }

  return threadsMap;
};

/**
 * Validates thread integrity by checking if the stored hash matches
 * the current block order. Returns false if the thread is invalid
 * (blocks have been reordered or deleted).
 */
export const validateThreadIntegrity = async (
  threadId: string,
  pageId: string
): Promise<boolean> => {
  // Get all blocks in the thread
  const thread = await getThreadByThreadId(threadId, pageId);
  return thread.isValid;
};

/**
 * Finds all blocks that reference a specific block (all forks of a message).
 * These are blocks that have the given blockId as their referenceId.
 */
export const getAlternativeVersions = async (
  referenceBlockId: string,
  pageId: string
): Promise<ThreadedBlock[]> => {
  // Get all blocks from the page
  const allBlocks =
    ((await logseq.Editor.getPageBlocksTree(
      pageId
    )) as Array<BlockEntity> | null) ?? [];

  // Filter blocks that have this block as their referenceId
  const alternatives: ThreadedBlock[] = [];
  for (const block of allBlocks) {
    const metadata = extractThreadMetadata(block);
    if (metadata?.referenceId === referenceBlockId) {
      alternatives.push({
        ...block,
        threadMetadata: metadata,
      });
    }
  }

  return alternatives;
};

/**
 * Reconstructs a thread by traversing up from a given block.
 * Returns the full thread containing the block, or null if not found.
 */
export const reconstructThreadFromBlock = async (
  blockId: string,
  pageId: string
): Promise<Thread | null> => {
  return getThreadByBlockId(blockId, pageId);
};

// TODO: based on the comment, this does not actually edit anything; just return
// some "thread ID", but with guardrails.
/**
 * Creates a new thread fork starting at a reference block.
 * Returns a new threadId (UUID) that should be used when appending
 * messages to this fork. The actual fork is created when the first
 * message is appended with this threadId and the referenceId.
 */
export const forkThread = async (
  referenceBlockId: string,
  pageId: string
): Promise<string> => {
  // Validate that the reference block exists and belongs to the page
  const referenceBlock = await logseq.Editor.getBlock(referenceBlockId);
  if (!referenceBlock) {
    throw new Error(`Reference block ${referenceBlockId} not found`);
  }

  // Validate page
  const page = await logseq.Editor.getPage(pageId);
  if (!page) {
    throw new Error(`Page ${pageId} not found`);
  }

  // Validate that the block belongs to the page
  const blockPageId =
    referenceBlock.page?.uuid || String(referenceBlock.page?.id || "");
  if (page.id !== referenceBlock.page?.id) {
    throw new Error(
      `Block ${referenceBlockId} does not belong to page ${pageId}. ` +
        `Block belongs to page ${blockPageId || "unknown"}`
    );
  }

  // Generate a new threadId (UUID)
  const threadId = crypto.randomUUID();

  return threadId;
};

/**
 * Gets the current-thread property from the page's first block.
 * Returns null if no current-thread is set (main thread).
 */
export const getCurrentThreadId = async (
  pageId: string
): Promise<string | null> => {
  const page = await logseq.Editor.getPage(pageId);
  if (!page) {
    throw new Error(`Page ${pageId} not found`);
  }

  // Get all blocks from the page
  const blocks =
    ((await logseq.Editor.getPageBlocksTree(
      pageId
    )) as Array<BlockEntity> | null) ?? [];

  // Get the first block (where page properties are stored)
  const firstBlock = blocks[0];
  if (!firstBlock) {
    // No blocks yet, return null (main thread)
    return null;
  }

  // Extract current-thread from properties
  const currentThreadId = firstBlock.properties?.currentThread;
  if (typeof currentThreadId === "string") {
    return currentThreadId;
  }

  return null;
};

/**
 * Sets the current-thread property on the page's first block.
 * If threadId is null, removes the property (main thread).
 */
export const setCurrentThreadId = async (
  pageId: string,
  threadId: string | null
): Promise<void> => {
  const page = await logseq.Editor.getPage(pageId);
  if (!page) {
    throw new Error(`Page ${pageId} not found`);
  }

  // Get all blocks from the page
  const blocks =
    ((await logseq.Editor.getPageBlocksTree(
      pageId
    )) as Array<BlockEntity> | null) ?? [];

  // Get or create the first block (where page properties are stored)
  let firstBlock = blocks[0];

  if (!firstBlock) {
    // Create first block if it doesn't exist
    const newBlock = await logseq.Editor.appendBlockInPage(pageId, "", {
      properties: {},
    });
    if (!newBlock) {
      throw new Error("Failed to create first block for page properties");
    }
    firstBlock = newBlock;
  }

  // Get current properties
  const currentProperties = firstBlock.properties || {};
  const updatedProperties: Record<string, unknown> = { ...currentProperties };

  // Clean up any camelCase/PascalCase variants of current-thread property
  // (e.g., currentThread, currentthread, CurrentThread) to ensure we only use kebab-case
  delete updatedProperties["currentThread"];
  delete updatedProperties["currentthread"];
  delete updatedProperties["CurrentThread"];

  if (threadId === null) {
    // Remove current-thread property for main thread
    delete updatedProperties["current-thread"];
  } else {
    // Set current-thread property
    updatedProperties["current-thread"] = threadId;
  }

  // Update the first block with new properties
  await logseq.Editor.updateBlock(firstBlock.uuid, firstBlock.content, {
    properties: updatedProperties,
  });
};

export const getAllChatThreads = async (): Promise<PageType[]> => {
  const result = await logseq.DB.datascriptQuery(`
    [:find (pull ?p [*])
      :where
      [?p :block/properties ?props]
      [(get ?props :type) ?type]
      [(= ?type "logseq ai chat thread")]
      [?p :block/name _]]
    `);

  const pages = z.union([z.array(z.array(PageType)), z.null()]).parse(result);

  return (pages ?? []).flat().sort((a, b) => {
    // Sort descending by updatedAt (most recent first)
    const aTime = a.updatedAt.getTime() || 0;
    const bTime = b.updatedAt.getTime() || 0;
    return bTime - aTime;
  });
};

export const getAllBlockReferences = async (
  blockId: string
): Promise<BlockEntity[]> => {
  // TODO: perhaps try-catch is a bad idea? I don't know. Let's see.

  try {
    const referencingBlocks = (await logseq.DB.datascriptQuery(
      `
      [:find (pull ?b [*])
        :where
        [?b :block/refs ?ref]]
      `
    )) as unknown;

    // Parse and return the results
    const blocks = z
      .union([z.array(z.array(z.unknown())), z.null(), z.undefined()])
      .parse(referencingBlocks);

    return z
      .parse(z.array(BlockEntity), (blocks ?? []).flat())
      .filter((b) => b.content.includes(`((${blockId}))`));
  } catch (e) {
    console.error(e);
    return [];
  }
};

export const loadThreadMessageBlocks = async (
  pageUuid: string,
  threadId?: string | null
): Promise<BlockMessage[]> => {
  // Get blocks from the specific thread only
  let threadBlocks: ThreadedBlock[];

  // TODO: check to see if this clause is even useful or not.
  if (threadId === undefined || threadId === null) {
    // Main thread: get all threads and extract the main thread (null key)
    const allThreads = await getAllThreadsInPage(pageUuid);
    const mainThread = allThreads.get(null);
    threadBlocks = mainThread?.blocks ?? [];
  } else {
    // Forked thread: get blocks from the specific thread
    const thread = await getThreadByThreadId(threadId, pageUuid);
    threadBlocks = thread.blocks;
  }

  // Filter blocks with role property set to "user" or "assistant"
  const messageBlocks = threadBlocks.filter(
    (block) =>
      block.properties?.role === "user" ||
      block.properties?.role === "assistant"
  );

  // Convert blocks to Message objects, preserving order
  const messages: BlockMessage[] = await Promise.all(
    messageBlocks.map(async (block) => ({
      block,
      message: {
        role: Role.exclude(["system"]).parse(block.properties!.role),
        content: sanitizeMarkdownHeadersToRfcBullets(
          filterPropertyLines(block.content)
        ),
      },

      // TODO: perhaps lazily load this instead. Problem with this approach is
      //   that we risk with having to revalidate stale data somehow (likely
      //   by adding some listener at the component level).
      //
      //   Why lazy-load? It's because we want to have thread messages load up
      //   much faster; defer the loading of the count until component is
      //   rendered.
      blockReferences: await getAllBlockReferences(block.uuid),
    }))
  );

  return messages;
};

export const deleteAllMessagesAfterBlock = async ({
  pageId,
  blockId,
}: {
  pageId: string;
  blockId: string;
}) => {
  // Get the target block to validate it exists and belongs to the specified page
  const targetBlock = await logseq.Editor.getBlock(blockId);
  if (!targetBlock) {
    throw new Error(`Block with id ${blockId} not found`);
  }

  // Sanitize pageId to UUID (pageId can be anything, but canonical ID is UUID)
  const page = await logseq.Editor.getPage(pageId);
  if (!page) {
    throw new Error(`Page with id ${pageId} not found`);
  }

  // Guardrail: Validate that the block belongs to the specified pageId
  const blockPageId =
    targetBlock.page?.uuid || String(targetBlock.page?.id || "");
  if (page.id !== targetBlock.page.id) {
    throw new Error(
      `Block ${blockId} does not belong to page ${pageId}. ` +
        `Block belongs to page ${blockPageId || "unknown"}`
    );
  }

  // Get all blocks from the page
  const allBlocks = await logseq.Editor.getPageBlocksTree(pageId);

  // Find the index of the target block
  const targetIndex = allBlocks.findIndex((block) => block.uuid === blockId);
  if (targetIndex === -1) {
    throw new Error(`Block ${blockId} not found in page ${pageId}`);
  }

  // Get all blocks that come after the target block
  const blocksToDelete = allBlocks.slice(targetIndex + 1);

  // Delete blocks in reverse order to avoid index shifting issues
  // (though with UUID-based deletion this shouldn't matter, but it's safer)
  for (let i = blocksToDelete.length - 1; i >= 0; i--) {
    const block = blocksToDelete[i];
    if (block.uuid) {
      await logseq.Editor.removeBlock(block.uuid);
    }
  }
};

export const createChatThreadPage = async (
  firstMessage: string
): Promise<string> => {
  // Use first 64 characters of the message as the base page title
  const baseTitle = firstMessage.substring(0, 64);

  // Find a unique title by checking for existing pages and appending a counter if needed
  let counter = 0;
  let pageTitle = baseTitle;

  while (true) {
    const existingPage = await logseq.Editor.getPage(pageTitle);
    if (!existingPage) {
      // Page doesn't exist, we can use this title
      break;
    }
    // Page exists, increment counter and try again
    counter++;
    pageTitle = `${baseTitle} ${counter}`;
  }

  // Create page with type property
  const page = await logseq.Editor.createPage(
    pageTitle,
    { type: "logseq ai chat thread" },
    { createFirstBlock: false, redirect: false }
  );

  if (!page) {
    throw new Error("Failed to create chat thread page");
  }

  return page.uuid;
};

export const appendMessageToThread = async (
  pageUuid: string,
  message: Message,
  options?: {
    threadId?: string;
    referenceId?: string;
  }
): Promise<string> => {
  // Build properties object
  const properties: Record<string, unknown> = { role: message.role };

  // If this is a forked thread, add thread metadata
  if (options?.threadId) {
    properties["thread-id"] = options.threadId;

    // If this is the root of a fork, add referenceId and compute hash
    if (options.referenceId) {
      properties["reference-id"] = options.referenceId;

      // Compute thread hash from all predecessor blocks (only for fork roots)
      // Get all blocks in the page to find the current position
      const allBlocks =
        ((await logseq.Editor.getPageBlocksTree(
          pageUuid
        )) as Array<BlockEntity> | null) ?? [];

      // Get all predecessor block IDs
      const predecessorIds = allBlocks.map((b) => b.uuid);

      // Compute hash
      const threadHash = await computeThreadHash(predecessorIds);
      properties["thread-hash"] = threadHash;
    }
  }

  // Append the block
  const newBlock = await logseq.Editor.appendBlockInPage(
    pageUuid,
    message.content,
    { properties }
  );

  if (!newBlock) {
    throw new Error("Failed to append message to thread");
  }

  return newBlock.uuid;
};

export const searchPagesByName = async (
  searchQuery: string
): Promise<PageType[]> => {
  // Return empty array for empty search queries
  if (!searchQuery || searchQuery.trim() === "") {
    return [];
  }

  const result = await logseq.DB.datascriptQuery(`
    [:find (pull ?p [*])
      :where
      [?p :block/name _]]
  `);

  const pages = z
    .union([z.array(z.array(z.unknown())), z.null(), z.undefined()])
    .parse(result);

  // Flatten and coerce to PageType[]
  const allPages = (pages ?? [])
    .flat()
    .map((p) =>
      PageType.safeParse(p).success ? PageType.safeParse(p).data : null
    )
    .filter((p): p is PageType => p !== null);

  // Use Fuse.js for fuzzy search on name / originalName / content
  const fuse = new Fuse(allPages, {
    keys: ["name", "originalName", "content"],
    includeScore: true,
    threshold: 0.4,
    ignoreLocation: true,
  });

  const results = fuse.search(searchQuery);

  // Map back to PageType[]
  return results.map((r) => r.item);
};

/**
 * Creates a new chat thread with the given user message and starts the completion job.
 * This encapsulates the full flow of creating a new chat thread.
 */
export const createNewChatThread = async (
  userMessage: string
): Promise<string> => {
  // Create thread using first 64 chars of input as title
  const title = userMessage.slice(0, 64);
  const pageId = await createChatThreadPage(title);
  if (!pageId) {
    throw new Error("Failed to create a new chat thread");
  }

  // Append user message block
  await appendMessageToThread(pageId, {
    role: "user",
    content: userMessage,
  } as Message);

  return pageId;
};
