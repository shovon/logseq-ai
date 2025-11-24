export type VectorDBSchemaDynamic = {
  id: string;
  content: string;
  lastUpdated: number;
  embedding: number[];
};

export async function useGenerateEmbedding(
  inputText: string,
  apiKey: string
): Promise<number[]> {
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "text-embedding-ada-002",
      input: inputText,
    }),
  });

  const json = await res.json();

  if (!res.ok || json.error) {
    console.error("Embedding API error:", json.error);
    throw new Error(json.error?.message || "Failed to generate embedding.");
  }

  return json.data[0].embedding;
}

export async function getEmbedingsAllNotes(
  apiKey: string
): Promise<VectorDBSchemaDynamic[]> {
  const pages = (await logseq.Editor.getAllPages()) ?? [];
  const allNotesEmbeddings: VectorDBSchemaDynamic[] = [];

  for (let index = 0; index < pages.length; index++) {
    const page = pages[index];
    const pagecontent = await logseq.Editor.getPageBlocksTree(page.uuid);
    let WholePageContent: string =
      "note_id: " +
      page.id +
      "\n" +
      "note_name: " +
      page.name +
      "\n" +
      "note_content: " +
      "\n" +
      "\n";

    for (let index = 0; index < pagecontent.length; index++) {
      const element = pagecontent[index];
      WholePageContent = WholePageContent + "- " + element.content + "\n";
    }

    try {
      const MyNewEmbedding: VectorDBSchemaDynamic = {
        id: page.id.toString(),
        lastUpdated: page.updatedAt ?? 0,
        content: WholePageContent,
        embedding: await useGenerateEmbedding(WholePageContent, apiKey),
      };
      allNotesEmbeddings.push(MyNewEmbedding);
    } catch (err) {
      console.error("Embedding failed for page:", page.name, err);
      throw new Error(
        `Embedding failed. Verify your Embedding OpenAI API key in the settings and try again.`
      );
    }
  }
  return allNotesEmbeddings;
}

export async function getEmbedingSinglePage(
  pageId: string,
  apiKey: string
): Promise<VectorDBSchemaDynamic> {
  const page = await logseq.Editor.getPage(pageId);
  if (!page) {
    throw new Error(`Page not found: ${pageId}`);
  }

  const pagecontent = await logseq.Editor.getPageBlocksTree(page.uuid);
  let WholePageContent: string =
    "note_id: " +
    page.id +
    "\n" +
    "note_name: " +
    page.name +
    "\n" +
    "note_content: " +
    "\n" +
    "\n";

  for (let index = 0; index < pagecontent.length; index++) {
    const element = pagecontent[index];
    WholePageContent = WholePageContent + "- " + element.content + "\n";
  }

  const embedding: VectorDBSchemaDynamic = {
    id: page.id.toString(),
    lastUpdated: page.updatedAt ?? 0,
    content: WholePageContent,
    embedding: await useGenerateEmbedding(WholePageContent, apiKey),
  };

  return embedding;
}
