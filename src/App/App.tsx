import { useState, useEffect } from "react";
import { NewChatView } from "./NewChatView";
import { ChatThreadView } from "./ChatThreadView";
import { ChatHistoryView } from "./ChatHistoryView";
import { ApiKeySetupView } from "./ApiKeySetupView";
import { onRouteChanged } from "../services/logseq/route-change-service";
import { IconEdit, IconHistory } from "@tabler/icons-react";

type AppView =
  | { type: "CHAT_HISTORY" }
  | { type: "CHAT_THREAD"; pageId: string }
  | { type: "NEW_CHAT" };

function App() {
  const [viewState, setViewState] = useState<AppView>({ type: "NEW_CHAT" });
  const [apiKeyLoading, setApiKeyLoading] = useState(true);
  const [hasApiKey, setHasApiKey] = useState(false);

  useEffect(() => {
    let isDone = false;
    const currentViewState = viewState;

    const lookForPageChanges = () => {
      if (isDone) return;

      if (currentViewState.type === "CHAT_THREAD") {
        logseq.Editor.getPage(currentViewState.pageId)
          .then((page) => {
            if (isDone) return;
            if (!page) {
              navigateToNewChat();
            }
          })
          .catch((e) => {
            console.error(e);
          });
      }
    };

    const unsubscribeOnChange = logseq.DB.onChanged(lookForPageChanges);
    const unsubscribeOnOnRouteChanged = onRouteChanged(lookForPageChanges);

    return () => {
      isDone = true;
      unsubscribeOnChange();
      unsubscribeOnOnRouteChanged();
    };
  }, [viewState]);

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
        <div className="flex py-2 px-3 border-b border-gray-100">
          {viewState.type !== "CHAT_HISTORY" && (
            <button
              onClick={navigateToHistory}
              className="flex px-3 py-2 text-sm font-medium rounded-lg text-gray-700 hover:bg-gray-200"
            >
              <div className="mt-0.5 mr-2">
                <IconHistory size={16} />
              </div>
              <div>History</div>
            </button>
          )}

          <div className="flex-1"></div>

          {viewState.type !== "NEW_CHAT" && (
            <button
              onClick={navigateToNewChat}
              className={`flex px-3 py-2 text-sm font-medium rounded-lg text-gray-700 hover:bg-gray-200`}
            >
              <div className="mt-0.5 mr-2">
                <IconEdit size={16} />
              </div>{" "}
              <div>New Chat</div>
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
