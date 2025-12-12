import { curryFirst } from "../../utils/functional/currying";
import { filterPropertyLines } from "../../utils/utils";
import type { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";

export const updateBlock = curryFirst(
  logseq.Editor.updateBlock.bind(logseq.Editor)
);

/**
 * Extracts only the text content of a block, removing property lines.
 * Property lines are lines in the format "key:: value" that appear at the
 * beginning of a block's content.
 *
 * @param block - The Logseq block entity
 * @returns The block's text content without property lines
 */
export function extractBlockTextContent(block: BlockEntity): string {
  const content = block.content ?? "";
  return filterPropertyLines(content);
}
