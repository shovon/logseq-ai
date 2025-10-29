import z from "zod";

// Note: this comment on GitHub helped a lot.

const PageType = z.object({
  name: z.string().optional(),
  uuid: z.string(),
  id: z.number().optional(),
});

type PageType = z.infer<typeof PageType>;

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
