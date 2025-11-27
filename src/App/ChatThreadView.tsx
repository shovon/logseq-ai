import { useState, useEffect, useMemo } from "react";
import { ChatInput } from "./components/ChatInput";
import { MessageList } from "./components/MessageList/MessageList";
import {
  type Message,
  type BlockMessage,
  deleteAllMessagesAfterBlock,
  searchPagesByName,
} from "../services/logseq/querier";
import {
  appendMessageToThread,
  loadThreadMessageBlocks,
} from "../services/logseq/querier";
import { completionTaskRunnerRepository } from "../services/chat-completion/task-runner";
import { simpleCompletion } from "../services/chat-completion/completion-task";
import { transformDashBulletPointsToStars } from "../utils/utils";

interface ChatThreadViewProps {
  pageId: string;
}

function useTaskStateMachine(pageId: string) {
  const [stateNode, setStateNode] = useState(() => {
    return completionTaskRunnerRepository.getTaskRunnerStateNode(pageId);
  });

  useEffect(() => {
    const stateNode =
      completionTaskRunnerRepository.getTaskRunnerStateNode(pageId);
    setStateNode(stateNode);

    const unsubscribe = completionTaskRunnerRepository.listen(pageId, () => {
      setStateNode(
        completionTaskRunnerRepository.getTaskRunnerStateNode(pageId)
      );
    });

    return () => {
      unsubscribe();
    };
  }, [pageId]);

  return stateNode;
}

export function ChatThreadView({ pageId }: ChatThreadViewProps) {
  const [messages, setMessages] = useState<BlockMessage[]>([]);
  const completionStateNode = useTaskStateMachine(pageId);

  // TODO: is this even necessary?
  const jobActive = completionStateNode.type === "running";

  const loadMessages = useMemo(
    () => () => {
      loadThreadMessageBlocks(pageId)
        .then((loadedMessages) => {
          console.log(loadedMessages);
          setMessages(loadedMessages);
        })
        .catch((error) => {
          console.error("Error loading thread messages:", error);
          logseq.UI.showMsg(`Error loading messages: ${error}`, "error");
        });
    },
    [pageId]
  );

  useEffect(() => logseq.DB.onChanged(loadMessages), [loadMessages]);
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleSendMessage = async (value: string) => {
    const currentInput = transformDashBulletPointsToStars(value);

    try {
      // Build prior messages BEFORE appending the new message
      // Filter out the last user message if it matches currentInput (safety check)
      // This ensures we don't include the message we're about to send
      const priorMessages: Message[] = messages.map((m) => ({
        role: m.message.role,
        content: m.message.content,
      }));

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
        completionMachineNode={completionStateNode}
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
