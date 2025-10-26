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

  return (
    <aside className="w-80 text-gray-800 h-screen">
      <section className="bg-white bg-opacity-90 shadow-lg h-full border-l-4 border-gradient-to-t from-blue-400 via-purple-400 to-pink-400 p-6 flex flex-col overflow-hidden w-full">
        <div className="flex-1 overflow-auto">{response || "Loading..."}</div>
      </section>
    </aside>
  );
}

export default App;
