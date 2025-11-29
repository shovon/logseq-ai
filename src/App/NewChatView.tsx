import { useEffect, useRef, useState } from "react";
import { ChatInput } from "./components/ChatInput";
import {
  appendMessageToThread,
  createChatThreadPage,
  type Message,
  searchPagesByName,
} from "../services/logseq/querier";
import { completionTaskRunnerRepository } from "../services/chat-completion/task-runner";
import { simpleCompletion } from "../services/chat-completion/completion-task";
import { transformDashBulletPointsToStars } from "../utils/utils";

interface NewChatViewProps {
  onThreadCreated: (pageId: string) => void;
}

export function NewChatView({ onThreadCreated }: NewChatViewProps) {
  const [hasRunningJob, setHasRunningJob] = useState(false);
  const runningPagesRef = useRef<Set<string>>(new Set());
  const unsubscribeRef = useRef<Map<string, () => void>>(new Map());

  useEffect(() => {
    const unsubscribeMap = unsubscribeRef.current;
    const runningPages = runningPagesRef.current;

    return () => {
      // Cleanup all listeners on unmount
      unsubscribeMap.forEach((unsubscribe) => unsubscribe());
      unsubscribeMap.clear();
      runningPages.clear();
      setHasRunningJob(false);
    };
  }, []);

  const handleSendMessage = async (value: string) => {
    if (hasRunningJob) return;

    const currentInput = transformDashBulletPointsToStars(value);

    try {
      // Create thread using first 64 chars of input as title
      const title = currentInput.slice(0, 64);
      const pageId = await createChatThreadPage(title);
      if (!pageId) throw new Error("Failed to create a new chat thread");

      // Append user message block
      await appendMessageToThread(pageId, {
        role: "user",
        content: currentInput,
      } as Message);

      // Set up listener for this page
      const unsubscribe = completionTaskRunnerRepository.listen(
        pageId,
        (state) => {
          const runningPages = runningPagesRef.current;
          if (state.type === "running") {
            runningPages.add(pageId);
          } else {
            runningPages.delete(pageId);
            // Clean up listener when job completes
            const unsub = unsubscribeRef.current.get(pageId);
            if (unsub) {
              unsub();
              unsubscribeRef.current.delete(pageId);
            }
          }
          setHasRunningJob(runningPages.size > 0);
        }
      );
      unsubscribeRef.current.set(pageId, unsubscribe);

      // Spawn completion job for assistant reply (no prior messages for new chat)
      try {
        const stateNode =
          completionTaskRunnerRepository.getTaskRunnerStateNode(pageId);
        if (stateNode.type === "idle") {
          stateNode.run(
            simpleCompletion(transformDashBulletPointsToStars(currentInput), [])
          );
        }
      } catch (error) {
        console.error("Failed to start assistant reply.", error);
        logseq.UI.showMsg("Failed to start assistant reply.", "error");
        runningPagesRef.current.delete(pageId);
        setHasRunningJob(runningPagesRef.current.size > 0);
        const unsub = unsubscribeRef.current.get(pageId);
        if (unsub) {
          unsub();
          unsubscribeRef.current.delete(pageId);
        }
      }

      // Transition to CHAT_THREAD view
      onThreadCreated(pageId);
    } catch (e) {
      logseq.UI.showMsg(`${e ?? ""}`, "error");
    }
  };

  return (
    <>
      <div className="flex-1"></div>
      <div className=" overflow-auto p-6">
        <div className="text-gray-500 text-center font-bold text-2xl">
          Ask me anything!
        </div>
      </div>
      <ChatInput
        className="mt-auto bg-white dark:bg-logseq-cyan-low-saturation-900 border-t border-gray-200 dark:border-logseq-cyan-low-saturation-800"
        onSend={handleSendMessage}
        disabled={hasRunningJob}
        isRunning={hasRunningJob}
        onCancel={() => {
          const runningPages = Array.from(runningPagesRef.current);
          for (const pageId of runningPages) {
            const stateNode =
              completionTaskRunnerRepository.getTaskRunnerStateNode(pageId);
            if (stateNode.type === "running") {
              stateNode.stop();
            }
          }
        }}
        searchPage={searchPagesByName}
      />
    </>
  );
}
