import { visit } from "unist-util-visit";
import type { Root, Text, Link } from "mdast";

/**
 * Remark plugin to transform [[page name]] patterns into special links
 * that can be handled by a custom component for Logseq navigation
 */
export function remarkLogseqPageRefs() {
  return (tree: Root) => {
    visit(tree, "text", (node: Text, index: number | undefined, parent) => {
      if (!parent || index === undefined) return;
      if (parent.type === "link") return;

      const text = node.value;
      // Match [[page name]] patterns, but not already inside links
      const pageRefRegex = /\[\[([^\]]+)\]\]/g;
      const matches = Array.from(text.matchAll(pageRefRegex));

      if (matches.length === 0) return;

      // If the entire text is just a page reference, replace it with a link
      if (matches.length === 1 && matches[0][0] === text) {
        const pageName = matches[0][1];
        const linkNode: Link = {
          type: "link",
          url: `#`,
          children: [{ type: "text", value: `[[${pageName}]]` }],
        };
        parent.children[index] = linkNode;
        return;
      }

      // If there are multiple matches or mixed content, split the text
      const newNodes: Array<Text | Link> = [];
      let lastIndex = 0;

      for (const match of matches) {
        const matchStart = match.index!;
        const matchEnd = matchStart + match[0].length;

        // Add text before the match
        if (matchStart > lastIndex) {
          newNodes.push({
            type: "text",
            value: text.slice(lastIndex, matchStart),
          });
        }

        // Add the link node for the page reference
        const pageName = match[1];
        const linkNode = {
          type: "link",
          url: `#`,
          children: [{ type: "text", value: `[[${pageName}]]` }],
        } satisfies (typeof newNodes)[number];
        newNodes.push(linkNode);

        lastIndex = matchEnd;
      }

      // Add remaining text after the last match
      if (lastIndex < text.length) {
        newNodes.push({
          type: "text",
          value: text.slice(lastIndex),
        });
      }

      // Replace the original text node with the new nodes
      parent.children.splice(index, 1, ...newNodes);
    });
  };
}
