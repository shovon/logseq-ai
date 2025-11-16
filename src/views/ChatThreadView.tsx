import { useState, useEffect } from "react";
import { ChatInput } from "../components/ChatInput";
import { MessageList } from "../components/MessageList";
import {
  type Message,
  type BlockMessage,
  deleteAllMessagesAfterBlock,
} from "../querier";
import { appendMessageToThread, loadThreadMessageBlocks } from "../querier";
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
  const [userInput, setUserInput] = useState<string>("");
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

  const handleSendMessage = async () => {
    const currentInput = transformDashBulletPointsToStars(userInput);
    setUserInput("");

    console.log(currentInput);

    try {
      // Append user message block
      await appendMessageToThread(pageId, {
        role: "user",
        content: currentInput,
      } as Message);

      // Build prior messages for completion
      const priorMessages: Message[] = messages.map((m) => ({
        role: m.message.role,
        content: m.message.content,
      })) as Message[];

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
        value={userInput}
        onChange={setUserInput}
        onSend={handleSendMessage}
        disabled={jobActive}
        isRunning={jobActive}
        onCancel={() => cancelCompletionJob(pageId)}
      />
    </>
  );
}
