import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { useState, useRef, useEffect, useCallback } from "react";
import type { CoreMessage } from "ai";

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

console.log(OPENAI_API_KEY);

const openai = createOpenAI({
  apiKey: OPENAI_API_KEY,
});

interface Message {
  role: "user" | "assistant";
  content: string;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [streamingContent, setStreamingContent] = useState<string>("");
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
  }, [messages.length, scrollToBottom]);

  const handleSendMessage = () => {
    (async () => {
      if (!userInput.trim() || isLoading) return;

      setIsLoading(true);
      const currentInput = userInput;
      setUserInput(""); // Clear input
      setStreamingContent(""); // Clear streaming content

      // Add user message to conversation
      const updatedMessages = [
        ...messages,
        { role: "user" as const, content: currentInput },
      ];
      setMessages(updatedMessages);

      try {
        const result = await streamText({
          model: openai("gpt-4"),
          messages: updatedMessages as CoreMessage[],
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

  return (
    <aside className="w-80 text-gray-800 h-screen">
      <section className="bg-white bg-opacity-90 shadow-lg h-full border-l-4 border-gradient-to-t from-blue-400 via-purple-400 to-pink-400 flex flex-col overflow-hidden w-full">
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
              className={`p-3 rounded-lg ${
                message.role === "user"
                  ? "bg-blue-100 ml-4"
                  : "bg-gray-100 mr-4"
              }`}
            >
              <div className="font-semibold text-sm mb-1">
                {message.role === "user" ? "You" : "Assistant"}
              </div>
              <div className="whitespace-pre-wrap">{message.content}</div>
            </div>
          ))}
          {isLoading && (
            <div className="p-3 rounded-lg bg-gray-100 mr-4">
              <div className="font-semibold text-sm mb-1">Assistant</div>
              <div className="whitespace-pre-wrap">
                {streamingContent || "Thinking..."}
              </div>
            </div>
          )}
        </div>

        {/* Chat input area */}
        <div className="p-4 pt-0">
          <div className="mt-auto border-2 rounded-xl">
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message here..."
              className="rounded-xl flex-1 resize-none border-none outline-none focus:outline-none focus:ring-0 focus-visible:outline-none block"
              rows={2}
              disabled={isLoading}
              style={{ outline: "none", boxShadow: "none" }}
            />
            <div className="flex p-1">
              <div className="flex-1"></div>
              <button
                onClick={handleSendMessage}
                disabled={!userInput.trim() || isLoading}
                className="block px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors text-sm"
              >
                {isLoading ? "..." : "Send"}
              </button>
            </div>
          </div>

          <div className="h-12"></div>
        </div>
      </section>
    </aside>
  );
}

export default App;
