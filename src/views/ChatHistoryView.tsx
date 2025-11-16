import { useState, useEffect, useCallback, useMemo } from "react";
import { getAllChatThreads, type PageType } from "../querier";
import { categorizeDateByPeriod, type TimePeriod } from "../utils";

interface ChatHistoryViewProps {
  onThreadSelect: (threadUuid: string) => void;
}

export function ChatHistoryView({ onThreadSelect }: ChatHistoryViewProps) {
  const [chatThreads, setChatThreads] = useState<PageType[]>([]);
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

  // Group threads by time period
  const threadsByPeriod = useMemo(() => {
    const grouped: Record<TimePeriod, PageType[]> = {
      today: [],
      yesterday: [],
      "past week": [],
      "past month": [],
      "past year": [],
      older: [],
    };

    for (const thread of chatThreads) {
      const period = categorizeDateByPeriod(thread.updatedAt);
      grouped[period].push(thread);
    }

    return grouped;
  }, [chatThreads]);

  // Define the order of time periods to display
  const periodOrder: TimePeriod[] = [
    "today",
    "yesterday",
    "past week",
    "past month",
    "past year",
    "older",
  ];

  if (isLoadingThreads) {
    return (
      <div className="flex-1 overflow-auto p-4">
        <div className="text-gray-500 text-center">Loading chat history...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4">
      {chatThreads.length === 0 ? (
        <div className="text-gray-500 text-center">No chat threads found</div>
      ) : (
        <div className="space-y-4">
          {periodOrder.map((period) => {
            const threads = threadsByPeriod[period];
            if (threads.length === 0) return null;

            return (
              <div key={period} className="space-y-1">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide px-3 py-2">
                  {period}
                </div>
                {threads.map((thread, index) => (
                  <div
                    key={thread.uuid || index}
                    onClick={() => onThreadSelect(thread.uuid)}
                    className="mb-0 py-2 px-3 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                  >
                    <div className="text-gray-800 truncate">
                      {thread.originalName || `Chat Thread ${index + 1}`}
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
