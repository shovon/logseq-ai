import { useEffect, useState } from "react";
import { loadThreadMessageBlocks } from "../querier";
import type { BlockMessage } from "../querier";

/**
 * A hook to get all messages that are stored in the graph.
 * @param pageId The page ID to read the curren state from.
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
    if (!pageId) return;

    const unsubscribe = logseq.DB.onChanged(async () => {
      let cancelled = false;

      try {
        const newMessages = await loadThreadMessageBlocks(pageId);

        if (cancelled) return;

        // Efficiently diff and update messagesx
        // TODO: this updates *everything* if *any* of the children has changed.
        //   this is deeply inefficient, but much better than just naîvely
        //   reloading everything. We can definitely do better than that.
        setMessages((prevMessages) => {
          // Create a map of new messages by UUID for O(1) lookup
          const newMessagesMap = new Map(
            newMessages.map((msg) => [msg.block.uuid, msg])
          );

          // If lengths are the same and all UUIDs match, check if content changed
          if (
            prevMessages.length === newMessages.length &&
            prevMessages.every((prev) => newMessagesMap.has(prev.block.uuid))
          ) {
            // Check if any content actually changed
            const hasChanges = prevMessages.some((prev, index) => {
              const newMsg = newMessages[index];
              return (
                newMsg.block.uuid !== prev.block.uuid ||
                newMsg.message.content !== prev.message.content ||
                newMsg.message.role !== prev.message.role
              );
            });

            // Only update if there are actual changes (avoid unnecessary re-renders)
            return hasChanges ? newMessages : prevMessages;
          }

          // Different set of messages - update with new ones
          return newMessages;
        });
      } catch (error) {
        console.error("Error loading thread messages:", error);
      }

      return () => {
        cancelled = true;
      };
    });

    return () => {
      unsubscribe();
    };
  }, [pageId]);

  return messages;
}
