import { useEffect, useState } from "react";
import { loadThreadMessageBlocks } from "../querier";
import type { BlockMessage } from "../querier";

/**
 * A hook to get all messages that are stored in the graph.
 * @param pageId The page ID to read the current state from.
 * @returns A list of messages
 */
export function useReadChatThread(pageId: string) {
  const [messages, setMessages] = useState<BlockMessage[]>([]);

  useEffect(() => {
    let cancelled = false;
    loadThreadMessageBlocks(pageId).then((v) => {
      if (cancelled) return;
      setMessages(v);
    });
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  useEffect(() => {
    let cancelled = false;

    if (!pageId) return;

    const unsubscribe = logseq.DB.onChanged(async () => {
      try {
        const newMessages = await loadThreadMessageBlocks(pageId);

        if (cancelled) return;

        // TODO: benchmark the impact of just naïvely assigning the
        setMessages(newMessages);
      } catch (error) {
        console.error("Error loading thread messages:", error);
      }
    });

    return () => {
      unsubscribe();
      cancelled = true;
    };
  }, [pageId]);

  return messages;
}
