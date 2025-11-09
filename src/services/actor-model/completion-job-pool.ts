import type { Message } from "../../querier";
import { streamChatCompletion } from "../chat-completion";
import { createJobPool } from "./job-pool";

type JobInput = {
  input: string;
  messages: Message[];
};

export const completionPool = createJobPool<string, JobInput, void>(
  (key) =>
    async ({ input, messages }) => {
      const stream = streamChatCompletion(input, messages);
      const properties = () => ({ role: "assistant" });

      // First, append a new block to the page and get its uuid
      const newBlock = await logseq.Editor.appendBlockInPage(key, "", {
        properties: properties(),
      }); // empty string for initial content
      if (!newBlock?.uuid)
        throw new Error("Failed to create block for streaming response.");

      // We'll accumulate streaming text here so we can update the block content
      let content = "";

      // Await the stream and update block as we go
      for await (const delta of await stream) {
        content += delta;
        await logseq.Editor.updateBlock(newBlock.uuid, content, {
          properties: properties(),
        });
      }
    }
);
