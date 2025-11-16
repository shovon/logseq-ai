import { useEffect, useRef, useState } from "react";
import { ChatInput } from "../components/ChatInput";
import {
  appendMessageToThread,
  createChatThreadPage,
  type Message,
} from "../querier";
import {
  spawnCompletionJobForPage,
  subscribeToCompletionJobs,
  cancelCompletionJob,
} from "../services/chat-completion";

interface NewChatViewProps {
  onThreadCreated: (pageId: string) => void;
}

export function NewChatView({ onThreadCreated }: NewChatViewProps) {
  const [userInput, setUserInput] = useState<string>("");
  const [hasRunningJob, setHasRunningJob] = useState(false);
  const runningPagesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const runningPages = runningPagesRef.current;
    const unsubscribe = subscribeToCompletionJobs((pageId, status) => {
      if (status.state === "running") {
        runningPages.add(pageId);
      } else {
        runningPages.delete(pageId);
      }
      setHasRunningJob(runningPages.size > 0);
    });

    return () => {
      runningPages.clear();
      setHasRunningJob(false);
      unsubscribe();
    };
  }, []);

  const handleSendMessage = async () => {
    if (hasRunningJob) return;

    const currentInput = userInput;
    setUserInput("");

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

      runningPagesRef.current.add(pageId);
      setHasRunningJob(true);

      // Spawn completion job for assistant reply (no prior messages for new chat)
      const startPromise = spawnCompletionJobForPage(pageId, {
        input: currentInput,
        messages: [],
      }).catch((error) => {
        console.error("Failed to start assistant reply.", error);
        logseq.UI.showMsg("Failed to start assistant reply.", "error");
        runningPagesRef.current.delete(pageId);
        setHasRunningJob(runningPagesRef.current.size > 0);
      });

      // Transition to CHAT_THREAD view
      onThreadCreated(pageId);
      await startPromise;
    } catch (e) {
      logseq.UI.showMsg(`${e ?? ""}`, "error");
    }
  };

  return (
    <>
      <div className="flex-1 overflow-auto p-6">
        <div className="text-gray-500 text-center">Ask me anything!</div>
      </div>
      <ChatInput
        value={userInput}
        onChange={setUserInput}
        onSend={handleSendMessage}
        disabled={hasRunningJob}
        isRunning={hasRunningJob}
        onCancel={() => {
          const runningPages = Array.from(runningPagesRef.current);
          for (const pageId of runningPages) {
            cancelCompletionJob(pageId);
          }
        }}
      />
    </>
  );
}
