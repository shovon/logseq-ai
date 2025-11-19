import { useState, useEffect } from "react";
import { ChatInput } from "./components/ChatInput";
import { MessageList } from "./components/MessageList/MessageList";
import {
  type Message,
  type BlockMessage,
  deleteAllMessagesAfterBlock,
  searchPagesByName,
} from "../services/querier";
import {
  appendMessageToThread,
  loadThreadMessageBlocks,
} from "../services/querier";
import {
  spawnCompletionJobForPage,
  getCompletionJobStatus,
  subscribeToCompletionJobs,
  cancelCompletionJob,
} from "../services/chat-completion";
import type { JobStatus } from "../services/job-registry";
import { transformDashBulletPointsToStars } from "../utils";

interface ChatThreadViewProps {
  pageId: string;
}

export function ChatThreadView({ pageId }: ChatThreadViewProps) {
  const [messages, setMessages] = useState<BlockMessage[]>([]);
  const [jobStatus, setJobStatus] = useState<JobStatus>(() =>
    getCompletionJobStatus(pageId)
  );

  useEffect(
    () =>
      logseq.DB.onChanged(() => {
        loadThreadMessageBlocks(pageId)
          .then((loadedMessages) => {
            setMessages(loadedMessages);
          })
          .catch((error) => {
            console.error("Error loading thread messages:", error);
            logseq.UI.showMsg(`Error loading messages: ${error}`, "error");
          });
      }),
    [pageId]
  );

  useEffect(() => {
    loadThreadMessageBlocks(pageId)
      .then((loadedMessages) => {
        setMessages(loadedMessages);
      })
      .catch((error) => {
        console.error("Error loading thread messages:", error);
        logseq.UI.showMsg(`Error loading messages: ${error}`, "error");
      });
  }, [pageId]);

  useEffect(() => {
    setJobStatus(getCompletionJobStatus(pageId));
    const unsubscribe = subscribeToCompletionJobs((id, status) => {
      if (id === pageId) {
        setJobStatus(status);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [pageId]);

  const handleSendMessage = async (value: string) => {
    const currentInput = transformDashBulletPointsToStars(value);

    console.log(currentInput);

    try {
      // Build prior messages BEFORE appending the new message
      // Filter out the last user message if it matches currentInput (safety check)
      // This ensures we don't include the message we're about to send
      const priorMessages: Message[] = messages.map((m) => ({
        role: m.message.role,
        content: m.message.content,
      }));

      console.log("Appending message to thread");

      // Append user message block
      await appendMessageToThread(pageId, {
        role: "user",
        content: currentInput,
      } as Message);

      // Spawn completion job for assistant reply
      await spawnCompletionJobForPage(pageId, {
        input: currentInput,
        messages: priorMessages,
      });
    } catch (e) {
      logseq.UI.showMsg(`${e ?? ""}`, "error");
    }
  };

  const handleEditMessage = async (blockId: string, newContent: string) => {
    newContent = transformDashBulletPointsToStars(newContent);

    try {
      await logseq.Editor.updateBlock(
        blockId,
        transformDashBulletPointsToStars(newContent),
        {
          properties: { role: "user" },
        }
      );

      await deleteAllMessagesAfterBlock({ pageId, blockId });

      // Build prior messages for completion
      const priorMessages: Message[] = messages.map((m) => ({
        role: m.message.role,
        content: m.message.content,
      })) as Message[];

      // Spawn completion job for assistant reply
      await spawnCompletionJobForPage(pageId, {
        input: transformDashBulletPointsToStars(newContent),
        messages: priorMessages,
      });
    } catch (e) {
      console.error("Error updating message:", e);
      logseq.UI.showMsg(`Error updating message: ${e ?? ""}`, "error");
    }
  };

  const jobActive = jobStatus.state === "running";

  return (
    <>
      <MessageList
        messages={messages}
        jobActive={jobActive}
        onEdit={handleEditMessage}
      />
      <ChatInput
        className="mt-auto bg-white border-t border-gray-200"
        onSend={handleSendMessage}
        disabled={jobActive}
        isRunning={jobActive}
        onCancel={() => cancelCompletionJob(pageId)}
        searchPage={searchPagesByName}
      />
    </>
  );
}
