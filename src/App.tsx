import { useState } from "react";
import { NewChatView } from "./views/NewChatView";
import { ChatThreadView } from "./views/ChatThreadView";
import { ChatHistoryView } from "./views/ChatHistoryView";

type AppView =
  | { type: "CHAT_HISTORY" }
  | { type: "CHAT_THREAD"; pageId: string }
  | { type: "NEW_CHAT" };

function App() {
  const [viewState, setViewState] = useState<AppView>({ type: "NEW_CHAT" });

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
      {/* <div
        style={{ width: SIDEBAR_HANDLE_WIDTH }}
        className={`h-full cursor-ew-resize select-none bg-gray-300 hover:bg-gray-400 transition-colors shrink-0`}
        role="separator"
        aria-orientation="vertical"
      >
      </div> */}
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
