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
  pageUuid: string
): Promise<BlockMessage[]> => {
  // TODO: once logseq/logseq#12212 gets merged and deployed, we need to get rid
  //   of the type assertion.
  const blocks =
    ((await logseq.Editor.getPageBlocksTree(
      pageUuid
    )) as Array<BlockEntity> | null) ?? [];

  // Filter top-level blocks with role property set to "user" or "assistant"
  const messageBlocks = blocks.filter(
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
  message: Message
): Promise<void> => {
  await logseq.Editor.appendBlockInPage(pageUuid, message.content, {
    properties: { role: message.role },
  });
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
