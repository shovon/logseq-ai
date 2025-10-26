import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { useState } from "react";

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

console.log(OPENAI_API_KEY);

const openai = createOpenAI({
  apiKey: OPENAI_API_KEY,
});

function App() {
  const [response, setResponse] = useState<string>("");
  const [userInput, setUserInput] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleSendMessage = () => {
    (async () => {
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
        <div className="flex-1 overflow-auto p-6">
          {response || (isLoading ? "Thinking..." : "Ask me anything!")}
        </div>

        {/* Chat input area */}
        <div className="p-4">
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
