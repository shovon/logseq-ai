import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { useState, useRef, useEffect, useCallback } from "react";
import { useCurrentPageState } from "./useCurrentPageState";

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

console.log(OPENAI_API_KEY);

const openai = createOpenAI({
  apiKey: OPENAI_API_KEY,
});

const SYSTEM_PROMPT =
  "You are a helpful AI assistant integrated with Logseq. Help users with their questions and tasks.";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

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

  const handleSendMessage = () => {
    (async () => {
      if (!userInput.trim() || isLoading) return;

      setIsLoading(true);
      const currentInput = userInput;
      setUserInput(""); // Clear input
      setStreamingContent(""); // Clear streaming content

      // Add user message to conversation
      const updatedMessages: Message[] = [
        ...messages,
        { role: "user" as const, content: currentInput },
      ];
      setMessages(updatedMessages);

      try {
        // TODO: Replace this with your actual context string
        let contextString: string | null = null;

        if (currentPageState.type === "LOADED") {
          const blocks = await logseq.Editor.getPageBlocksTree(
            currentPageState.name
          ); // e.g., page content, block content, etc.
          contextString = blocks.map((b) => b.content).join("\n\n");
        }

        // Build a dynamic system prompt with context
        const systemPromptWithContext = contextString
          ? `${SYSTEM_PROMPT}\n\nCurrent Context:\n${contextString}`
          : SYSTEM_PROMPT;

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

  console.log(
    currentPageState.type === "LOADED"
      ? currentPageState.name
      : "----------<No current page>--------------"
  );

  return (
    <aside className="logseq-ai-plugin text-gray-800 h-screen">
      <section className="bg-white bg-opacity-90 shadow-lg h-full border-l border-gray-200 flex flex-col overflow-hidden w-full">
        <div
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto p-6 space-y-4"
        >
          {messages.length === 0 && !isLoading && (
            <div className="text-gray-500 text-center">Ask me anything!</div>
          )}
          {messages.map((message, index) => (
            <div
              key={index}
              className={`rounded-lg ${
                message.role === "user" ? "p-3 bg-blue-100 ml-8" : ""
              }`}
            >
              {/* <div className="font-semibold text-sm mb-1">
                {message.role === "user" ? "You" : "Assistant"}
              </div> */}
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
          ))}
          {isLoading && (
            <div className="p-4">
              <div className="font-semibold text-sm mb-1">Assistant</div>
              <div className="whitespace-pre-wrap">
                {streamingContent || "Thinking..."}
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
      </section>
    </aside>
  );
}

export default App;
