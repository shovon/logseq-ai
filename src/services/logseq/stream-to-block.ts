import type { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";
import { propsToString } from "../../utils/logseq/logseq";

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
  let content = blockProperties;

  if (!block) return block;

  console.log("Trying to stream");

  for await (const segment of stream) {
    console.log("Got character");
    content += segment;
    await logseq.Editor.updateBlock(block?.uuid, content);
  }
};
