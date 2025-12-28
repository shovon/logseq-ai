import { useState } from "react";
import { ChatInput } from "./components/ChatInput";
import {
  createNewChatThread,
  searchPagesByName,
} from "../services/threading/threading";
import { completionJobManager } from "../services/chat-completion/completion-job-manager";
import { createCompletionJob } from "../services/chat-completion/completion-task";
import { sanitizeMarkdown } from "../utils/utils";

interface NewChatViewProps {
  onThreadCreated: (pageId: string) => void;
}

export function NewChatView({ onThreadCreated }: NewChatViewProps) {
  const [isCreating, setIsCreating] = useState(false);

  const handleSendMessage = async (value: string) => {
    if (isCreating) return;

    const currentInput = sanitizeMarkdown(value);
    setIsCreating(true);

    try {
      // Create thread and append user message
      const pageId = await createNewChatThread(currentInput);

      // Start completion job for assistant reply (no prior messages for new chat)
      completionJobManager.runJob(pageId, () =>
        createCompletionJob(currentInput, [], pageId)
      );

      // Transition to CHAT_THREAD view
      onThreadCreated(pageId);
    } catch (e) {
      logseq.UI.showMsg(`${e ?? ""}`, "error");
    } finally {
      setIsCreating(false);
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
        disabled={isCreating}
        isRunning={isCreating}
        onCancel={() => {
          // No-op: we transition immediately, so cancellation is handled by ChatThreadView
        }}
        searchPage={searchPagesByName}
      />
    </>
  );
}
