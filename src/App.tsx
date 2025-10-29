import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { useState, useRef, useEffect, useCallback } from "react";
import { useCurrentPageState } from "./useCurrentPageState";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { onReady } from "./ready-service";
import { getAllChatThreads } from "./querier";

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

console.log(OPENAI_API_KEY);

const openai = createOpenAI({
  apiKey: OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are a helpful AI assistant integrated with Logseq. Help users with their questions and tasks.

Just note, when a user uses the \`[[SOME PAGE NAME]]\` syntax, they are referring to a page, and you can find it in the page references list.`;

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

type AppView =
  | { type: "NEW_CHAT" }
  | { type: "CHAT_HISTORY" }
  | { type: "CHAT_THREAD" };

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [viewState, setViewState] = useState<AppView>({ type: "NEW_CHAT" });

  // Determine button state
  const isButtonDisabled = !userInput.trim() || isLoading;
  const [streamingContent, setStreamingContent] = useState<string>("");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isUserAtBottom, setIsUserAtBottom] = useState<boolean>(true);
  const currentPageState = useCurrentPageState();

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
  }, [messages.length, scrollToBottom]);

  useEffect(() => {
    onReady(() => {
      setInterval(() => {
        getAllChatThreads().then(async (pages) => {
          console.log("All chat threads:", pages);

          for (const page of pages) {
            console.log(
              "Chat thread",
              page.uuid,
              (await logseq.Editor.getPageBlocksTree(page.uuid)).filter(
                (block) => typeof block.properties?.role === "string"
              )
            );
          }
        });
      }, 5000); // Increased interval to 5 seconds to avoid spam
    });
  }, []);

  const handleSendMessage = () => {
    (async () => {
      if (!userInput.trim() || isLoading) return;

      setIsLoading(true);
      const currentInput = userInput;

      // Extract strings from [[...]] format
      const extractedBrackets = (
        currentInput.match(/\[\[([^\]]+)\]\]/g) || []
      ).map((match) => match.slice(2, -2)); // Remove [[ and ]]
      console.log("Extracted brackets:", extractedBrackets);

      setUserInput(""); // Clear input
      setStreamingContent(""); // Clear streaming content

      // Add user message to conversation
      const updatedMessages: Message[] = [
        ...messages,
        { role: "user" as const, content: currentInput },
      ];
      setMessages(updatedMessages);

      try {
        let contextString: string | null = null;

        if (currentPageState.type === "LOADED") {
          const blocks = await logseq.Editor.getPageBlocksTree(
            currentPageState.name
          ); // e.g., page content, block content, etc.
          contextString = blocks.map((b) => b.content).join("\n\n");

          const links =
            (await logseq.Editor.getPageLinkedReferences(
              currentPageState.name
            )) ?? [];

          if (links.length > 0) {
            contextString += "\n\n## Backlinks";
            for (const link of links) {
              for (const block of link[1]) {
                if (
                  block.content &&
                  block.content.includes(`[[${currentPageState.name}]]`)
                ) {
                  contextString += "\n\n" + block.content;
                }
              }
            }
          }
        }

        // Extract page content from here.
        const extractedPagesContent = [];
        for (const pageName of extractedBrackets) {
          console.log(pageName);
          try {
            const blocks = await logseq.Editor.getPageBlocksTree(pageName);
            const pageContent = blocks.map((b) => b.content).join("\n\n");

            console.log(pageContent);

            const backlinks =
              (await logseq.Editor.getPageLinkedReferences(pageName)) ?? [];

            extractedPagesContent.push({
              pageName,
              content: pageContent,
              backlinks: backlinks
                .map((link) => link[1].map((block) => block.content))
                .flat(),
            });
          } catch (error) {
            console.log(`Error fetching page ${pageName}:`, error);
          }
        }
        console.log("Extracted pages content:", extractedPagesContent);

        // Build a dynamic system prompt with context
        let systemPromptWithContext =
          currentPageState.type === "LOADED"
            ? `${SYSTEM_PROMPT}\n\nCurrent Page:\n# ${currentPageState.name}\n\n${contextString}`
            : SYSTEM_PROMPT;

        // Add referenced pages to the context
        if (extractedPagesContent.length > 0) {
          let referencedPagesSection = "\n\n## Referenced Pages\n";
          for (const page of extractedPagesContent) {
            referencedPagesSection += `\nPage Name: ${
              page.pageName
            }\n\n## Backlinks\n${page.content}\n${page.backlinks.join("\n\n")}`;
          }
          systemPromptWithContext += referencedPagesSection;
        }

        console.log(systemPromptWithContext);

        const result = await streamText({
          model: openai("gpt-4"),
          messages: [
            { role: "system" as const, content: systemPromptWithContext },
            ...updatedMessages,
          ],
        });

        let assistantResponse = "";
        // Stream the text as it comes in
        for await (const delta of result.textStream) {
          assistantResponse += delta;
          setStreamingContent(assistantResponse);
        }

        // Add assistant's response to conversation
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: assistantResponse },
        ]);
      } catch (error) {
        console.error("Error generating text:", error);
        const errorMessage = "Error: Unable to generate response";
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: errorMessage },
        ]);
      } finally {
        setIsLoading(false);
        setStreamingContent("");
      }
    })().catch((e) => {
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
    setViewState({ type: "NEW_CHAT" });
    setMessages([]);
    setUserInput("");
  };

  const navigateToHistory = () => {
    setViewState({ type: "CHAT_HISTORY" });
  };

  const navigateToThread = () => {
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
                onClick={navigateToThread}
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
              viewState.type === "NEW_CHAT" || viewState.type === "CHAT_THREAD"
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
              {messages.length === 0 && !isLoading && (
                <div className="text-gray-500 text-center">
                  Ask me anything!
                </div>
              )}
              {messages.map((message, index) => (
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
                      {message.content}
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
                      {streamingContent || "Thinking..."}
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
