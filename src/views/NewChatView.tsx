import { useState } from "react";
import { ChatInput } from "../components/ChatInput";
import {
  appendMessageToThread,
  createChatThreadPage,
  type Message,
} from "../querier";
import { spawnCompletionJobForPage } from "../services/chat-completion";

interface NewChatViewProps {
  onThreadCreated: (pageId: string) => void;
}

export function NewChatView({ onThreadCreated }: NewChatViewProps) {
  const [userInput, setUserInput] = useState<string>("");

  const handleSendMessage = async () => {
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

      // Spawn completion job for assistant reply (no prior messages for new chat)
      await spawnCompletionJobForPage(pageId, {
        input: currentInput,
        messages: [],
      });

      // Transition to CHAT_THREAD view
      onThreadCreated(pageId);
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
        disabled={false}
      />
    </>
  );
}
