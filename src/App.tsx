import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { useEffect, useState } from "react";

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

console.log(OPENAI_API_KEY);

const openai = createOpenAI({
  apiKey: OPENAI_API_KEY,
});

function App() {
  const [response, setResponse] = useState<string>("");
  const [userInput, setUserInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        const result = await streamText({
          model: openai("gpt-4"),
          prompt: "What is love?",
        });

        // Stream the text as it comes in
        for await (const delta of result.textStream) {
          if (isMounted) {
            setResponse((prev) => prev + delta);
          }
        }
      } catch (error) {
        if (isMounted) {
          console.error("Error generating text:", error);
          setResponse("Error: Unable to generate response");
        }
      }
    };

    fetchData();

    // Cleanup function
    return () => {
      isMounted = false;
    };
  }, []); // Empty dependency array - only run once

  const handleSendMessage = async () => {
    if (!userInput.trim() || isLoading) return;

    setIsLoading(true);
    setResponse(""); // Clear previous response
    const currentInput = userInput;
    setUserInput(""); // Clear input

    try {
      const result = await streamText({
        model: openai("gpt-4"),
        prompt: currentInput,
      });

      // Stream the text as it comes in
      for await (const delta of result.textStream) {
        setResponse((prev) => prev + delta);
      }
    } catch (error) {
      console.error("Error generating text:", error);
      setResponse("Error: Unable to generate response");
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <aside className="w-80 text-gray-800 h-screen">
      <section className="bg-white bg-opacity-90 shadow-lg h-full border-l-4 border-gradient-to-t from-blue-400 via-purple-400 to-pink-400 p-6 flex flex-col overflow-hidden w-full">
        <div className="flex-1 overflow-auto mb-4">
          {response || (isLoading ? "Thinking..." : "Ask me anything!")}
        </div>

        {/* Chat input area */}
        <div className="flex gap-2 mt-auto">
          <textarea
            value={userInput}
            onChange={(e) => setUserInput(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder="Type your message here..."
            className="flex-1 p-3 border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            rows={2}
            disabled={isLoading}
          />
          <button
            onClick={handleSendMessage}
            disabled={!userInput.trim() || isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "..." : "Send"}
          </button>
        </div>
      </section>
    </aside>
  );
}

export default App;
