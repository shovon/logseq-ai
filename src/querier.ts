import z from "zod";

// Note: this comment on GitHub helped a lot:
// https://github.com/logseq/plugins/issues/30#issuecomment-2926495102

// A lot of datalog querying going on.
//
// This page helped me prompt engineer my way into finding the right query:
// https://docs.logseq.com/#/page/advanced%20queries

const PageType = z.object({
  name: z.string().optional(),
  uuid: z.string(),
  id: z.number().optional(),
});

type PageType = z.infer<typeof PageType>;

export interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

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

  return (pages ?? []).flat();
};

export const loadThreadMessages = async (
  pageUuid: string
): Promise<Message[]> => {
  const blocks = await logseq.Editor.getPageBlocksTree(pageUuid);

  // Filter top-level blocks with role property set to "user" or "assistant"
  const messageBlocks = blocks.filter(
    (block) =>
      block.properties?.role === "user" ||
      block.properties?.role === "assistant"
  );

  // Convert blocks to Message objects, preserving order
  const messages: Message[] = messageBlocks.map((block) => ({
    role: block.properties!.role as "user" | "assistant",
    content: block.content,
  }));

  return messages;
};
