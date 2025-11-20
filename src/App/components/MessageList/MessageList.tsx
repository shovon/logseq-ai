import { useRef, useEffect, useState, useCallback } from "react";
import ReactMarkdown from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import { filterPropertyLines } from "../../../utils/utils";
import type { BlockMessage } from "../../../services/querier";
import type { Components } from "react-markdown";
import { remarkLogseqPageRefs } from "./remark-logseq-page-refs";
import { IconPencil } from "@tabler/icons-react";

interface MessageListProps {
  messages: BlockMessage[];
  jobActive?: boolean;
  onEdit?: (blockId: string, newContent: string) => void;
}

// Shared markdown component configuration for handling Logseq page references
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
      const pageName = children.slice(2, -2);
      return (
        <a
          {...remainder}
          href="#"
          onClick={async (e) => {
            e.preventDefault();
            if (e.shiftKey) {
              // Shift-click: open page in sidebar
              try {
                const page = await logseq.Editor.getPage(pageName);
                if (page?.uuid) {
                  await logseq.Editor.openInRightSidebar(page.uuid);
                }
              } catch (error) {
                console.error("Error opening page in sidebar:", error);
              }
            } else {
              // Regular click: navigate to page
              logseq.App.pushState("page", {
                name: pageName,
              });
            }
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

// Shared prose classes for markdown content
const proseClasses =
  "prose prose-sm max-w-none [&_p]:my-4 [&_li]:my-2 [&_h1]:mt-6 [&_h1]:mb-4 [&_h2]:mt-5 [&_h2]:mb-3 [&_h3]:mt-4 [&_h3]:mb-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:ml-6 [&_ol]:ml-6 [&_ul]:space-y-1 [&_ol]:space-y-1 [&_li]:pl-2";

interface MessageContentProps {
  content: string;
}

interface UserMessageProps extends MessageContentProps {
  blockId: string;
  onEdit: (blockId: string, newContent: string) => void;
}

// User message component for user prompts
function UserMessage({ content, blockId, onEdit }: UserMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);
  const [isHovered, setIsHovered] = useState(false);

  // Sync editedContent when content prop changes (e.g., after external update)
  useEffect(() => {
    if (!isEditing) {
      setEditedContent(content);
    }
  }, [content, isEditing]);

  const handleSave = () => {
    onEdit(blockId, editedContent);
    setIsEditing(false);
  };

  const handleCancel = () => {
    setEditedContent(content);
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="rounded-lg px-3 py-2 bg-blue-50 ml-8">
        <textarea
          value={editedContent}
          onChange={(e) => setEditedContent(e.target.value)}
          className="w-full min-h-[100px] p-2 border border-blue-200 rounded resize-y focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
        <div className="flex gap-2 mt-2">
          <button
            onClick={handleSave}
            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
          >
            Save
          </button>
          <button
            onClick={handleCancel}
            className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg px-3 py-2 bg-blue-50 ml-8 relative group"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isHovered && (
        <button
          onClick={() => setIsEditing(true)}
          className="absolute top-2 right-2 p-1 text-gray-600 hover:text-gray-800 hover:bg-blue-100 rounded transition-colors"
          title="Edit message"
        >
          <IconPencil size={16} />
        </button>
      )}
      <div className={proseClasses}>
        <ReactMarkdown
          remarkPlugins={[remarkMath, remarkLogseqPageRefs]}
          rehypePlugins={[rehypeKatex]}
          components={markdownComponents}
        >
          {filterPropertyLines(content)}
        </ReactMarkdown>
      </div>
    </div>
  );
}

// Assistant message component for assistant responses
function AssistantMessage({ content }: MessageContentProps) {
  return (
    <div className="rounded-lg">
      <div className={proseClasses}>
        <ReactMarkdown
          remarkPlugins={[remarkMath, remarkLogseqPageRefs]}
          rehypePlugins={[rehypeKatex]}
          components={markdownComponents}
        >
          {filterPropertyLines(content)}
        </ReactMarkdown>
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  jobActive = false,
  onEdit,
}: MessageListProps) {
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

  // Auto-scroll when content changes (e.g., during streaming)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Track previous scrollHeight to detect changes
    let lastScrollHeight = container.scrollHeight;

    const mutationObserver = new MutationObserver(() => {
      // Check if scrollHeight changed
      if (container.scrollHeight !== lastScrollHeight) {
        lastScrollHeight = container.scrollHeight;
        // Only scroll if user was already at bottom
        if (isUserAtBottom) {
          scrollToBottom();
        }
      }
    });

    // Observe changes to child elements (content additions/modifications)
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      mutationObserver.disconnect();
    };
  }, [isUserAtBottom, scrollToBottom]);

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-auto p-6 pb-4 space-y-4"
    >
      {messages.length === 0 && !jobActive && (
        <div className="text-gray-500 text-center">Ask me anything!</div>
      )}
      {messages.map((message, index) =>
        message.message.role === "user" ? (
          <UserMessage
            key={index}
            content={message.message.content}
            blockId={message.block.uuid || ""}
            onEdit={onEdit || (() => {})}
          />
        ) : (
          <AssistantMessage key={index} content={message.message.content} />
        )
      )}
      {jobActive && <AssistantMessage content="Thinking..." />}
    </div>
  );
}
