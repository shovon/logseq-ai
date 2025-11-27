export interface PageContext {
  name: string;
  content: string;
}

export interface ReferencedPage {
  pageName: string;
  content: string;
  backlinks: string[];
}

/**
 * Extract page references from text in the format [[Page Name]]
 */
export function extractPageReferences(text: string): string[] {
  return (text.match(/\[\[([^\]]+)\]\]/g) || []).map((match) =>
    match.slice(2, -2)
  ); // Remove [[ and ]]
}

/**
 * Build context for a single page, including content and backlinks
 */
export async function buildPageContext(
  pageName: string
): Promise<string | null> {
  const blocks = await logseq.Editor.getPageBlocksTree(pageName);
  let contextString = blocks.map((b) => b.content).join("\n\n");

  const links = (await logseq.Editor.getPageLinkedReferences(pageName)) ?? [];

  if (links.length > 0) {
    contextString += "\n\n## Backlinks";
    for (const link of links) {
      for (const block of link[1]) {
        if (block.content && block.content.includes(`[[${pageName}]]`)) {
          contextString += "\n\n" + block.content;
        }
      }
    }
  }

  return contextString;
}

/**
 * Build context for multiple referenced pages
 */
export async function buildReferencedPagesContext(
  pageNames: string[]
): Promise<ReferencedPage[]> {
  const extractedPagesContent: ReferencedPage[] = [];

  for (const pageName of pageNames) {
    try {
      const blocks = await logseq.Editor.getPageBlocksTree(pageName);
      const pageContent = blocks.map((b) => b.content).join("\n\n");

      const backlinks =
        (await logseq.Editor.getPageLinkedReferences(pageName)) ?? [];

      extractedPagesContent.push({
        pageName,
        content: pageContent,
        backlinks: backlinks
          .map((link) => link[1].map((block) => block.content))
          .flat(),
      });
    } catch (error) {
      console.error(`Error fetching page ${pageName}:`, error);
    }
  }

  return extractedPagesContent;
}

/**
 * Build a complete system prompt with current page and referenced pages context
 */
export function buildSystemPrompt(
  basePrompt: string,
  currentPageContext: PageContext | null,
  referencedPages: ReferencedPage[]
): string {
  let systemPromptWithContext = basePrompt;

  // Add current page context
  if (currentPageContext) {
    systemPromptWithContext += `\n\nCurrent Page:\n# ${currentPageContext.name}\n\n${currentPageContext.content}`;
  }

  // Add referenced pages context
  if (referencedPages.length > 0) {
    let referencedPagesSection = "\n\n## Referenced Pages\n";
    for (const page of referencedPages) {
      referencedPagesSection += `\nPage Name: ${
        page.pageName
      }\n\n## Backlinks\n${page.content}\n${page.backlinks.join("\n\n")}`;
    }
    systemPromptWithContext += referencedPagesSection;
  }

  return systemPromptWithContext;
}

/**
 * Build a complete system prompt with current page and referenced pages context
 */
export function buildSystemPromptWithoutCurrentPage(
  basePrompt: string,
  referencedPages: ReferencedPage[]
): string {
  let systemPromptWithContext = basePrompt;

  // Add referenced pages context
  if (referencedPages.length > 0) {
    let referencedPagesSection = "\n\n## Referenced Pages\n";
    for (const page of referencedPages) {
      referencedPagesSection += `\nPage Name: ${
        page.pageName
      }\n\n## Backlinks\n${page.content}\n${page.backlinks.join("\n\n")}`;
    }
    systemPromptWithContext += referencedPagesSection;
  }

  return systemPromptWithContext;
}
