import { useState, useRef, useEffect, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { getAllChatThreads } from "./querier";
import { filterPropertyLines } from "./utils";
import { useCurrentPageState } from "./useCurrentPageState";
import { useChatThread } from "./hooks/useChatThread";
import { useChatCompletion } from "./hooks/useChatCompletion";

type AppView = { type: "CHAT_HISTORY" } | { type: "CHAT_THREAD" };

function App() {
  const [userInput, setUserInput] = useState<string>("");
  const [viewState, setViewState] = useState<AppView>({ type: "CHAT_THREAD" });
  const currentPageState = useCurrentPageState();

  // Hooks for business logic
  const chatThread = useChatThread();
  const { sendMessage, isLoading, streamingContent } = useChatCompletion(
    chatThread,
    currentPageState
  );

  // Determine button state
  const isButtonDisabled = !userInput.trim() || isLoading;

  // Scroll behavior
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isUserAtBottom, setIsUserAtBottom] = useState<boolean>(true);

  // Check if user is scrolled to bottom
  const checkIfAtBottom = () => {
    if (!scrollContainerRef.current) return false;
    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;
    return scrollHeight - scrollTop - clientHeight < 10; // 10px threshold
  };

  // Auto-scroll to bottom if user was already at bottom
  const scrollToBottom = useCallback(() => {
    if (scrollContainerRef.current && isUserAtBottom) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [isUserAtBottom]);

  // Handle scroll events to track if user is at bottom
  const handleScroll = () => {
    setIsUserAtBottom(checkIfAtBottom());
  };

  // Auto-scroll when streaming content changes
  useEffect(() => {
    scrollToBottom();
  }, [streamingContent, scrollToBottom]);

  // Auto-scroll when new messages are added
  useEffect(() => {
    scrollToBottom();
  }, [chatThread.messages.length, scrollToBottom]);

  const handleSendMessage = () => {
    const currentInput = userInput;
    setUserInput(""); // Clear input

    sendMessage(currentInput).catch((e) => {
      logseq.UI.showMsg(`${e ?? ""}`, "error");
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const navigateToNewChat = () => {
    setViewState({ type: "CHAT_THREAD" });
    chatThread.clearThread();
    setUserInput("");
  };

  const navigateToHistory = () => {
    setViewState({ type: "CHAT_HISTORY" });
  };

  const navigateToThread = async (threadUuid?: string) => {
    if (threadUuid) {
      try {
        await chatThread.loadThread(threadUuid);
      } catch (error) {
        console.error("Error loading thread messages:", error);
        logseq.UI.showMsg("Error loading thread messages", "error");
      }
    }
    setViewState({ type: "CHAT_THREAD" });
  };

  const ChatHistoryView = () => {
    const [chatThreads, setChatThreads] = useState<
      { uuid?: string; name?: string; content?: string }[]
    >([]);
    const [isLoadingThreads, setIsLoadingThreads] = useState(true);

    useEffect(() => {
      const loadChatThreads = async () => {
        try {
          const threads = await getAllChatThreads();
          setChatThreads(threads);
        } catch (error) {
          console.error("Error loading chat threads:", error);
        } finally {
          setIsLoadingThreads(false);
        }
      };
      loadChatThreads();
    }, []);

    if (isLoadingThreads) {
      return (
        <div className="flex-1 overflow-auto p-6">
          <div className="text-gray-500 text-center">
            Loading chat history...
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 overflow-auto p-6">
        <div className="space-y-2">
          {chatThreads.length === 0 ? (
            <div className="text-gray-500 text-center">
              No chat threads found
            </div>
          ) : (
            chatThreads.map((thread, index) => (
              <div
                key={thread.uuid || index}
                onClick={() => navigateToThread(thread.uuid)}
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
  };

  return (
    <aside className="logseq-ai-plugin text-gray-800 h-screen">
      <section className="bg-white bg-opacity-90 shadow-lg h-full border-l border-gray-200 flex flex-col overflow-hidden w-full">
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
          <ChatHistoryView />
        ) : (
          <>
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-auto p-6 space-y-4"
            >
              {chatThread.messages.length === 0 && !isLoading && (
                <div className="text-gray-500 text-center">
                  Ask me anything!
                </div>
              )}
              {chatThread.messages.map((message, index) => (
                <div
                  key={index}
                  className={`rounded-lg ${
                    message.role === "user" ? "px-3 py-2 bg-blue-50 ml-8" : ""
                  }`}
                >
                  {/* <div className="font-semibold text-sm mb-1">
                {message.role === "user" ? "You" : "Assistant"}
              </div> */}
                  <div className="prose prose-sm max-w-none [&_p]:my-4 [&_li]:my-2 [&_h1]:mt-6 [&_h1]:mb-4 [&_h2]:mt-5 [&_h2]:mb-3 [&_h3]:mt-4 [&_h3]:mb-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    <ReactMarkdown
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {filterPropertyLines(message.content)}
                    </ReactMarkdown>
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="rounded-lg">
                  <div className="prose prose-sm max-w-none [&_p]:my-4 [&_li]:my-2 [&_h1]:mt-6 [&_h1]:mb-4 [&_h2]:mt-5 [&_h2]:mb-3 [&_h3]:mt-4 [&_h3]:mb-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                    <ReactMarkdown
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[rehypeKatex]}
                    >
                      {filterPropertyLines(streamingContent || "Thinking...")}
                    </ReactMarkdown>
                  </div>
                </div>
              )}
            </div>

            {/* Chat input area */}
            <div className="p-4 pt-0">
              <div className=" mt-auto rounded-xl bg-gray-100">
                <div className="px-2 py-2 text-xs text-gray-600">
                  {currentPageState.type === "LOADED" ? (
                    <>
                      <span className="text-gray-400">[[</span>
                      {currentPageState.name}
                      <span className="text-gray-400">]]</span>
                    </>
                  ) : null}
                </div>
                <div className="bg-white border-2 border-gray-200 rounded-xl">
                  <textarea
                    value={userInput}
                    onChange={(e) => setUserInput(e.target.value)}
                    onKeyPress={handleKeyPress}
                    placeholder="Type your message here..."
                    className="w-full rounded-xl flex-1 resize-none border-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none block p-2"
                    rows={2}
                    disabled={isLoading}
                    style={{ outline: "none", boxShadow: "none" }}
                  />
                  <div className="flex p-2">
                    <div className="flex-1"></div>
                    <button
                      onClick={handleSendMessage}
                      disabled={isButtonDisabled}
                      className="block px-3 py-1.5 text-white rounded-lg text-sm font-bold disabled:cursor-not-allowed"
                      style={{
                        backgroundColor: isButtonDisabled ? "grey" : "#1e3a8a",
                        opacity: isButtonDisabled ? 0.5 : 1,
                      }}
                    >
                      {isLoading ? "..." : "Send"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </section>
    </aside>
  );
}

export default App;
