import { useState, useEffect } from "react";
import { NewChatView } from "./NewChatView";
import { ChatThreadView } from "./ChatThreadView";
import { ChatHistoryView } from "./ChatHistoryView";
import { ApiKeySetupView } from "./ApiKeySetupView";
import { onRouteChanged } from "../services/logseq/route-change-service";
import { IconEdit, IconHistory } from "@tabler/icons-react";
import { debouncePromiseHandler } from "../utils/utils";

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

    const lookForPageChanges = async () => {
      if (isDone) return;

      if (currentViewState.type === "CHAT_THREAD") {
        await logseq.Editor.getPage(currentViewState.pageId)
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

    const unsubscribeOnChange = debouncePromiseHandler(
      logseq.DB.onChanged.bind(logseq.DB)
    )(lookForPageChanges);
    const unsubscribeOnOnRouteChanged =
      debouncePromiseHandler(onRouteChanged)(lookForPageChanges);

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

  const navigateToNewChat = () => {
    setViewState({ type: "NEW_CHAT" });
  };

  const navigateToHistory = () => {
    setViewState({ type: "CHAT_HISTORY" });
  };

  const navigateToThread = async (threadUuid: string) => {
    setViewState({ type: "CHAT_THREAD", pageId: threadUuid });
  };

  const Main = () => {
    const baseButtonClass =
      "flex px-3 py-2 text-sm font-medium rounded-lg text-gray-700 dark:text-logseq-cyan-low-saturation-300 hover:bg-gray-200 dark:hover:bg-logseq-cyan-low-saturation-800/70 cursor-pointer";

    return (
      <>
        {/* Navigation Header */}
        <div className="flex py-2 px-3 border-b border-gray-100 dark:border-logseq-cyan-low-saturation-800/70">
          {viewState.type !== "CHAT_HISTORY" && (
            <button onClick={navigateToHistory} className={baseButtonClass}>
              <div className="mt-0.5 mr-2">
                <IconHistory size={16} />
              </div>
              <div>History</div>
            </button>
          )}

          <div className="flex-1"></div>

          {viewState.type !== "NEW_CHAT" && (
            <button onClick={navigateToNewChat} className={baseButtonClass}>
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
      </>
    );
  };

  return (
    <aside className="logseq-ai-plugin text-gray-800 dark:text-logseq-cyan-low-saturation-100 h-screen flex [&_a]:text-blue-600 [&_a]:dark:text-logseq-cyan-300">
      <section className="bg-white dark:bg-logseq-cyan-low-saturation-950 shadow-lg h-full border-l border-gray-200 dark:border-logseq-cyan-low-saturation-800/70 flex flex-col overflow-hidden flex-1">
        {apiKeyLoading || !hasApiKey ? (
          <ApiKeySetupView onApiKeySaved={handleApiKeySaved} />
        ) : (
          <Main />
        )}
      </section>
    </aside>
  );
}

export default App;
