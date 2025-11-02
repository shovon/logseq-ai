import { useState } from "react";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { useChatThread } from "./useChatThread";
import {
  extractPageReferences,
  buildPageContext,
  buildReferencedPagesContext,
  buildSystemPrompt,
  type PageContext,
} from "../services/context-builder";

type CurrentPageState =
  | { type: "LOADING" }
  | {
      type: "LOADED";
      name: string;
    };

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

const openai = createOpenAI({
  apiKey: OPENAI_API_KEY,
});

export const SYSTEM_PROMPT = `You are a helpful AI assistant integrated with Logseq. Help users with their questions and tasks.

Just note, when a user uses the \`[[SOME PAGE NAME]]\` syntax, they are referring to a page, and you can find it in the page references list.`;

export function useChatCompletion(
  chatThread: ReturnType<typeof useChatThread>,
  currentPageState: CurrentPageState
) {
  const [isLoading, setIsLoading] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  const sendMessage = async (input: string) => {
    if (!input.trim() || isLoading) return;

    setIsLoading(true);

    // Extract page references
    const extractedBrackets = extractPageReferences(input);
    console.log("Extracted brackets:", extractedBrackets);

    setStreamingContent("");

    const newMessage = { role: "user" as const, content: input };

    // Add user message to conversation
    chatThread.addMessage(newMessage);

    // Handle thread storage
    let threadUuid = chatThread.currentThreadPageUuid;
    try {
      // Create new thread if needed
      if (threadUuid === null) {
        threadUuid = await chatThread.createThread(input);
      }

      // Store user message
      await chatThread.appendMessage(newMessage);
    } catch (error) {
      console.error("Error storing user message:", error);
    }

    try {
      let contextString: string | null = null;

      // Build current page context
      if (currentPageState.type === "LOADED") {
        contextString = await buildPageContext(currentPageState.name);
      }

      // Build referenced pages context
      const extractedPagesContent = await buildReferencedPagesContext(
        extractedBrackets
      );
      console.log("Extracted pages content:", extractedPagesContent);

      // Build system prompt with context
      const currentPageContext: PageContext | null =
        currentPageState.type === "LOADED" && contextString
          ? { name: currentPageState.name, content: contextString }
          : null;

      const systemPromptWithContext = buildSystemPrompt(
        SYSTEM_PROMPT,
        currentPageContext,
        extractedPagesContent
      );

      console.log(systemPromptWithContext, chatThread.messages);

      // Stream AI response
      const result = await streamText({
        model: openai("gpt-4"),
        messages: [
          { role: "system" as const, content: systemPromptWithContext },
          ...chatThread.messages,
          newMessage,
        ],
      });

      let assistantResponse = "";
      for await (const delta of result.textStream) {
        assistantResponse += delta;
        setStreamingContent(assistantResponse);
      }

      // Add assistant's response to conversation
      chatThread.addMessage({ role: "assistant", content: assistantResponse });

      // Store assistant message
      try {
        if (threadUuid) {
          await chatThread.appendMessage({
            role: "assistant",
            content: assistantResponse,
          });
        }
      } catch (error) {
        console.error("Error storing assistant message:", error);
      }
    } catch (error) {
      console.error("Error generating text:", error);
      const errorMessage = "Error: Unable to generate response";
      chatThread.addMessage({ role: "assistant", content: errorMessage });

      // Store error message too
      try {
        if (threadUuid) {
          await chatThread.appendMessage({
            role: "assistant",
            content: errorMessage,
          });
        }
      } catch (storageError) {
        console.error("Error storing error message:", storageError);
      }
    } finally {
      setIsLoading(false);
      setStreamingContent("");
    }
  };

  return { sendMessage, isLoading, streamingContent };
}
