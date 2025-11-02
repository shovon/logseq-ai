import { useState } from "react";
import type { Message } from "../querier";
import {
  loadThreadMessageBlocks,
  createChatThreadPage,
  appendMessageToThread,
} from "../querier";

export function useChatThread() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [currentThreadPageUuid, setCurrentThreadPageUuid] = useState<
    string | null
  >(null);

  const loadThread = async (uuid: string) => {
    try {
      const loadedMessages = await loadThreadMessageBlocks(uuid);
      setMessages(loadedMessages);
      setCurrentThreadPageUuid(uuid);
    } catch (error) {
      console.error("Error loading thread messages:", error);
      throw error;
    }
  };

  const createThread = async (firstMessage: string): Promise<string> => {
    const threadUuid = await createChatThreadPage(firstMessage);
    setCurrentThreadPageUuid(threadUuid);
    return threadUuid;
  };

  const appendMessage = async (message: Message) => {
    if (currentThreadPageUuid === null) {
      throw new Error("No thread UUID available");
    }
    await appendMessageToThread(currentThreadPageUuid, message);
  };

  const addMessage = (message: Message) => {
    setMessages((prev) => [...prev, message]);
  };

  const clearThread = () => {
    setMessages([]);
    setCurrentThreadPageUuid(null);
  };

  return {
    messages,
    currentThreadPageUuid,
    loadThread,
    createThread,
    appendMessage,
    addMessage,
    clearThread,
  };
}
