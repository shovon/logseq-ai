import { useState, useEffect } from "react";
import { NewChatView } from "./views/NewChatView";
import { ChatThreadView } from "./views/ChatThreadView";
import { ChatHistoryView } from "./views/ChatHistoryView";
import { ApiKeySetupView } from "./views/ApiKeySetupView";

type AppView =
  | { type: "CHAT_HISTORY" }
  | { type: "CHAT_THREAD"; pageId: string }
  | { type: "NEW_CHAT" };

function App() {
  const [viewState, setViewState] = useState<AppView>({ type: "NEW_CHAT" });
  const [apiKeyLoading, setApiKeyLoading] = useState(true);
  const [hasApiKey, setHasApiKey] = useState(false);

  // Check API key on mount and when settings change
  useEffect(() => {
    const apiKey = logseq.settings?.openAiApiKey;
    if (typeof apiKey === "string" && apiKey.trim() !== "") {
      setHasApiKey(true);
    } else {
      setHasApiKey(false);
    }
    setApiKeyLoading(false);
  }, []);

  useEffect(() => {
    return logseq.onSettingsChanged(() => {
      const apiKey = logseq.settings?.openAiApiKey;
      if (typeof apiKey === "string" && apiKey.trim() !== "") {
        setHasApiKey(true);
      } else {
        setHasApiKey(false);
      }
    });
  }, []);

  const handleApiKeySaved = () => {
    // Re-check API key after it's saved
    const apiKey = logseq.settings?.openAiApiKey;
    if (typeof apiKey === "string" && apiKey.trim() !== "") {
      setHasApiKey(true);
    }
  };

  // Early return if loading or no API key
  if (apiKeyLoading || !hasApiKey) {
    return (
      <aside className="logseq-ai-plugin text-gray-800 h-screen flex">
        <section className="bg-white bg-opacity-90 shadow-lg h-full border-l border-gray-200 flex flex-col overflow-hidden flex-1">
          <ApiKeySetupView onApiKeySaved={handleApiKeySaved} />
        </section>
      </aside>
    );
  }

  const navigateToNewChat = () => {
    setViewState({ type: "NEW_CHAT" });
  };

  const navigateToHistory = () => {
    setViewState({ type: "CHAT_HISTORY" });
  };

  const navigateToThread = async (threadUuid: string) => {
    setViewState({ type: "CHAT_THREAD", pageId: threadUuid });
  };

  return (
    <aside className="logseq-ai-plugin text-gray-800 h-screen flex">
      <section className="bg-white bg-opacity-90 shadow-lg h-full border-l border-gray-200 flex flex-col overflow-hidden flex-1">
        {/* Navigation Header */}
        <div className="flex p-4 border-b border-gray-200 bg-gray-50">
          <button
            onClick={navigateToNewChat}
            className={`px-3 py-2 text-sm font-medium rounded-lg mr-2 ${
              viewState.type === "CHAT_THREAD"
                ? "bg-blue-500 text-white"
                : "bg-gray-200 text-gray-700 hover:bg-gray-300"
            }`}
          >
            New Chat
          </button>
          {viewState.type !== "CHAT_HISTORY" && (
            <button
              onClick={navigateToHistory}
              className="px-3 py-2 text-sm font-medium rounded-lg bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              History
            </button>
          )}
        </div>

        {/* Conditional Content */}
        {viewState.type === "CHAT_HISTORY" ? (
          <ChatHistoryView onThreadSelect={navigateToThread} />
        ) : viewState.type === "NEW_CHAT" ? (
          <NewChatView onThreadCreated={navigateToThread} />
        ) : (
          <ChatThreadView pageId={viewState.pageId} />
        )}
      </section>
    </aside>
  );
}

export default App;
