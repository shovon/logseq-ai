import { createOpenAI } from "@ai-sdk/openai";
import { generateText } from "ai";
import { useEffect } from "react";

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

const openai = createOpenAI({
  apiKey: OPENAI_API_KEY,
});

function App() {
  useEffect(() => {
    generateText({
      model: openai("gpt-4"),
      prompt: "What is love?",
    });
  });

  return <div className="flex text-red-500">This is really cool</div>;
}

export default App;
