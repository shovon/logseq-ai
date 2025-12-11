import type { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";
import { propsToString } from "../../utils/logseq/logseq";
import { sanitizeMarkdown } from "../../utils/utils";

/**
 * Streams in a block into a page.
 * @param pageId The page to append the block to.
 * @param stream The delta stream from which to create the block.
 * @param opts An optional set of properties.
 */
export const appendBlockInPageThroughStream = async (
  pageId: string,
  stream: AsyncIterable<string>,
  opts: { properties: Record<string, string> } = { properties: {} }
) => {
  const blockProperties = propsToString(opts.properties);

  const block = await logseq.Editor.appendBlockInPage(pageId, blockProperties);

  if (!block) return null;

  await streamToBlock(block, stream, opts);

  return block;
};

export const streamToBlock = async (
  block: BlockEntity,
  stream: AsyncIterable<string>,
  opts: { properties: Record<string, string> }
) => {
  const blockProperties = propsToString(opts.properties);
  let content = "";

  if (!block) return block;

  for await (const segment of stream) {
    console.log("Got character");
    content += segment;
    await logseq.Editor.updateBlock(
      block?.uuid,
      `${blockProperties}\n${sanitizeMarkdown(content)}`
    );
  }
};
