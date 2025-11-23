import { useState, useEffect, useMemo } from "react";
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
import { completionTaskRunnerRepository } from "../services/completion-task-runners";
import { simpleCompletion } from "../services/chat-completion-tasks";
import { transformDashBulletPointsToStars } from "../utils/utils";

interface ChatThreadViewProps {
  pageId: string;
}

// TODO: this should really be placed
function useIsJobActive(pageId: string) {
  const [jobActive, setJobActive] = useState<boolean>(false);

  useEffect(() => {
    const stateNode =
      completionTaskRunnerRepository.getTaskRunnerStateNode(pageId);
    setJobActive(stateNode.type === "running");

    const unsubscribe = completionTaskRunnerRepository.listen(
      pageId,
      (state) => {
        setJobActive(state.type === "running");
      }
    );

    return () => {
      unsubscribe();
    };
  }, [pageId]);

  return jobActive;
}

export function ChatThreadView({ pageId }: ChatThreadViewProps) {
  const [messages, setMessages] = useState<BlockMessage[]>([]);

  // TODO: is this even necessary?
  const jobActive = useIsJobActive(pageId);

  const laodMessages = useMemo(
    () => () => {
      loadThreadMessageBlocks(pageId)
        .then((loadedMessages) => {
          setMessages(loadedMessages);
        })
        .catch((error) => {
          console.error("Error loading thread messages:", error);
          logseq.UI.showMsg(`Error loading messages: ${error}`, "error");
        });
    },
    [pageId]
  );

  useEffect(() => logseq.DB.onChanged(laodMessages), [laodMessages]);
  useEffect(() => {
    laodMessages();
  }, [laodMessages]);

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
      const stateNode =
        completionTaskRunnerRepository.getTaskRunnerStateNode(pageId);
      if (stateNode.type === "idle") {
        stateNode.run(simpleCompletion(currentInput, priorMessages));
      }
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
      const stateNode =
        completionTaskRunnerRepository.getTaskRunnerStateNode(pageId);
      if (stateNode.type === "idle") {
        stateNode.run(
          simpleCompletion(
            transformDashBulletPointsToStars(newContent),
            priorMessages
          )
        );
      }
    } catch (e) {
      console.error("Error updating message:", e);
      logseq.UI.showMsg(`Error updating message: ${e ?? ""}`, "error");
    }
  };

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
        onCancel={() => {
          const stateNode =
            completionTaskRunnerRepository.getTaskRunnerStateNode(pageId);
          if (stateNode.type === "running") {
            stateNode.stop();
          }
        }}
        searchPage={searchPagesByName}
      />
    </>
  );
}
