import { z } from "zod";
import { filterPropertyLines } from "../utils";
import type { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";

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
const Role: z.ZodSchema<Role> = z.union([
  z.literal("user"),
  z.literal("assistant"),
  z.literal("system"),
]);

export type Message = {
  role: Role;
  content: string;
};

export type BlockMessage = {
  message: Message;
  block: BlockEntity;
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
  const messages: BlockMessage[] = messageBlocks.map((block) => ({
    block,
    message: {
      role: block.properties!.role as "user" | "assistant",
      content: filterPropertyLines(block.content),
    },
  }));

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
  // Use first 64 characters of the message as the page title
  const pageTitle = firstMessage.substring(0, 64);

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
