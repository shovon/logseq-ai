import { z } from "zod";
import { filterPropertyLines } from "./utils";
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
    content: z.string().optional(),
  })
  .transform(
    ({ name, uuid, id, ["original-name"]: originalName, content }) => ({
      name,
      uuid,
      id,
      originalName,
      content,
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

  console.log(result);

  const pages = z.union([z.array(z.array(PageType)), z.null()]).parse(result);

  return (pages ?? []).flat();
};

export const loadThreadMessageBlocks = async (
  pageUuid: string
): Promise<BlockMessage[]> => {
  const blocks = await logseq.Editor.getPageBlocksTree(pageUuid);

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
