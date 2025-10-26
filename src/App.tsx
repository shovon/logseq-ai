import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { useEffect, useState } from "react";

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

console.log(OPENAI_API_KEY);

const openai = createOpenAI({
  apiKey: OPENAI_API_KEY,
});

function App() {
  const [response, setResponse] = useState<string>("");

  useEffect(() => {
    let isMounted = true;

    const fetchData = async () => {
      try {
        const result = await generateText({
          model: openai("gpt-4"),
          prompt: "What is love?",
        });

        // Only update state if component is still mounted
        if (isMounted) {
          setResponse(result.text);
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

  return (
    <div className="flex text-gray-800 h-screen min-h-screen items-start justify-end">
      <aside className="w-480 bg-white bg-opacity-90 shadow-lg h-full min-h-screen border-l-4 border-gradient-to-t from-blue-400 via-purple-400 to-pink-400 p-6 flex flex-col">
        <h2 className="text-2xl font-bold mb-4">AI Assistant</h2>
        <div className="flex-1">{response || "Loading..."}</div>
      </aside>
    </div>
  );
}

export default App;
