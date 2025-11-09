import { useState, useEffect, useCallback } from "react";
import { getAllChatThreads } from "../querier";

interface ChatHistoryViewProps {
  onThreadSelect: (threadUuid: string) => void;
}

export function ChatHistoryView({ onThreadSelect }: ChatHistoryViewProps) {
  const [chatThreads, setChatThreads] = useState<
    { uuid: string; name?: string; content?: string }[]
  >([]);
  const [isLoadingThreads, setIsLoadingThreads] = useState(true);

  const loadChatThreads = useCallback(async () => {
    try {
      const threads = await getAllChatThreads();
      setChatThreads(threads);
    } catch (error) {
      console.error("Error loading chat threads:", error);
    } finally {
      setIsLoadingThreads(false);
    }
  }, []);

  useEffect(() => {
    setIsLoadingThreads(true);
    loadChatThreads();
  }, [loadChatThreads]);

  useEffect(() => {
    const unsubscribe = logseq.DB.onChanged(() => {
      loadChatThreads();
    });

    return () => {
      unsubscribe();
    };
  }, [loadChatThreads]);

  if (isLoadingThreads) {
    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="text-gray-500 text-center">Loading chat history...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="space-y-2">
        {chatThreads.length === 0 ? (
          <div className="text-gray-500 text-center">No chat threads found</div>
        ) : (
          chatThreads.map((thread, index) => (
            <div
              key={thread.uuid || index}
              onClick={() => onThreadSelect(thread.uuid)}
              className="p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
            >
              <div className="font-medium text-gray-800">
                {thread.name || `Chat Thread ${index + 1}`}
              </div>
              <div className="text-sm text-gray-500">
                {thread.content
                  ? `${thread.content.substring(0, 100)}...`
                  : "No content"}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
