import { useRef, useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { filterPropertyLines } from "../utils";
import type { BlockMessage } from "../querier";
import type { Components } from "react-markdown";
import { remarkLogseqPageRefs } from "../plugins/remark-logseq-page-refs";

interface MessageListProps {
  messages: BlockMessage[];
  jobActive?: boolean;
}

export function MessageList({ messages, jobActive = false }: MessageListProps) {
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

  // Auto-scroll when new messages are added
  useEffect(() => {
    scrollToBottom();
  }, [messages.length, scrollToBottom]);

  // Auto-scroll when job status changes
  useEffect(() => {
    scrollToBottom();
  }, [jobActive, scrollToBottom]);

  // Custom component for handling Logseq page references
  const markdownComponents: Components = {
    a: ({ node: _, href, children, ...remainder }) => {
      console.log(children);
      // Check if this is a Logseq page reference link
      if (
        href === "#" &&
        typeof children === "string" &&
        /^\[\[([^\]]+)\]\]$/.test(children)
      ) {
        // const pageName = decodeURIComponent(href.replace("logseq://page/", ""));
        return (
          <a
            {...remainder}
            href="#"
            onClick={(e) => {
              e.preventDefault();
              logseq.App.pushState("page", {
                name: children.slice(2, -2),
              });
            }}
            className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-medium"
          >
            {children}
          </a>
        );
      }
      // Default link behavior for regular links
      return (
        <a
          href={href}
          {...remainder}
          className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-medium"
        >
          {children}
        </a>
      );
    },
  };

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-auto p-6 space-y-4"
    >
      {messages.length === 0 && !jobActive && (
        <div className="text-gray-500 text-center">Ask me anything!</div>
      )}
      {messages.map((message, index) => (
        <div
          key={index}
          className={`rounded-lg ${
            message.message.role === "user" ? "px-3 py-2 bg-blue-50 ml-8" : ""
          }`}
        >
          <div className="prose prose-sm max-w-none [&_p]:my-4 [&_li]:my-2 [&_h1]:mt-6 [&_h1]:mb-4 [&_h2]:mt-5 [&_h2]:mb-3 [&_h3]:mt-4 [&_h3]:mb-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown
              remarkPlugins={[remarkMath, remarkLogseqPageRefs]}
              rehypePlugins={[rehypeKatex]}
              components={markdownComponents}
            >
              {filterPropertyLines(message.message.content)}
            </ReactMarkdown>
          </div>
        </div>
      ))}
      {jobActive && (
        <div className="rounded-lg">
          <div className="prose prose-sm max-w-none [&_p]:my-4 [&_li]:my-2 [&_h1]:mt-6 [&_h1]:mb-4 [&_h2]:mt-5 [&_h2]:mb-3 [&_h3]:mt-4 [&_h3]:mb-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
            <ReactMarkdown
              remarkPlugins={[remarkMath, remarkLogseqPageRefs]}
              rehypePlugins={[rehypeKatex]}
              components={markdownComponents}
            >
              {filterPropertyLines("Thinking...")}
            </ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}
