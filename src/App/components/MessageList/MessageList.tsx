import { useRef, useEffect, useState, useCallback, useMemo, memo } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
import {
  filterPropertyLines,
  sanitizeMarkdownHeadersToRfcBullets,
} from "../../../utils/utils";
import type { BlockMessage } from "../../../services/threading/threading";
import type { BlockEntity } from "@logseq/libs/dist/LSPlugin.user";
import type { Components } from "react-markdown";
import { remarkLogseqPageRefs } from "./remark-logseq-page-refs";
import { IconPencil, IconAlertTriangle } from "@tabler/icons-react";
import { BeatLoader } from "react-spinners";
import { useVirtualizer } from "@tanstack/react-virtual";

interface MessageListProps {
  messages: BlockMessage[];
  isJobActive: boolean;
  isStreaming: boolean;
  onEdit?: (blockId: string, newContent: string) => void;
}

const urlTransform = (url: string) => {
  return url.startsWith("data:") ? url : defaultUrlTransform(url);
};

// Module-level plugin arrays to prevent ReactMarkdown re-initialization
const remarkPlugins = [remarkMath, remarkLogseqPageRefs];
const rehypePlugins = [rehypeKatex];

// Shared markdown component configuration for handling Logseq page references
const markdownComponents: Components = {
  a: ({ node: _, href, children, ...remainder }) => {
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
    // Default link behavior for regular links - open in external browser
    return (
      <a
        href={href}
        {...remainder}
        onClick={(e) => {
          e.preventDefault();
          if (href) {
            logseq.App.openExternalLink(href);
          }
        }}
        className="text-blue-600 hover:text-blue-800 hover:underline cursor-pointer font-medium"
      >
        {children}
      </a>
    );
  },
  img: ({ node: _, src, alt, ...remainder }) => {
    // Render images including base64 data URIs
    return (
      <img
        src={src}
        alt={alt}
        {...remainder}
        className="max-w-full h-auto rounded-lg my-4"
      />
    );
  },
};

// Shared prose classes for markdown content
const proseClasses =
  "prose prose-sm max-w-none [&_p]:my-4 [&_li]:my-2 [&_h1]:mt-6 [&_h1]:mb-4 [&_h2]:mt-5 [&_h2]:mb-3 [&_h3]:mt-4 [&_h3]:mb-3 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:ml-6 [&_ol]:ml-6 [&_ul]:space-y-1 [&_ol]:space-y-1 [&_li]:pl-2";

interface MessageContentProps {
  content: string;
}

interface AssistantMessageProps extends MessageContentProps {
  block: BlockEntity;

  // TODO: move this to `MessageContentProps`
  blockReferences: Promise<BlockEntity[]>;
}

interface UserMessageProps extends MessageContentProps {
  blockId: string;
  onEdit: (blockId: string, newContent: string) => void;
  blockReferences: Promise<BlockEntity[]>;
}

// User message component for user prompts
function UserMessage({
  content,
  blockId,
  onEdit,
  blockReferences,
}: UserMessageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState(content);
  const [isHovered, setIsHovered] = useState(false);
  const [refCount, setRefCount] = useState<number | null>(null);

  // Memoize processed markdown content to prevent re-parsing
  const processedContent = useMemo(
    () => sanitizeMarkdownHeadersToRfcBullets(filterPropertyLines(content)),
    [content]
  );

  // Lazily load block references count
  useEffect(() => {
    blockReferences
      .then((refs) => setRefCount(refs.length))
      .catch(() => {
        setRefCount(0);
      });
  }, [blockReferences]);

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

  const baseClass =
    "rounded-lg px-3 py-2 bg-blue-50 dark:bg-logseq-cyan-low-saturation-800/30 ml-8";

  if (isEditing) {
    return (
      <div className={`${baseClass}`}>
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
    <div className="flex items-start gap-3 ml-8">
      <div
        className={`${baseClass} relative group flex-1 min-w-0`}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {isHovered && (
          <button
            onClick={() => setIsEditing(true)}
            className="absolute top-2 right-2 p-1 text-gray-600 hover:text-gray-800 hover:bg-blue-100 rounded transition-colors z-10"
            title="Edit message"
          >
            <IconPencil size={16} />
          </button>
        )}
        <div className={proseClasses}>
          <ReactMarkdown
            urlTransform={urlTransform}
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={markdownComponents}
          >
            {processedContent}
          </ReactMarkdown>
        </div>
      </div>
      {refCount !== null && refCount > 0 && (
        <div className="flex-shrink-0 mt-1">
          <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 text-xs font-medium rounded-full bg-gray-200 dark:bg-logseq-cyan-low-saturation-800 text-gray-700 dark:text-logseq-cyan-low-saturation-300">
            {refCount}
          </span>
        </div>
      )}
    </div>
  );
}

// Assistant message component for assistant responses
function AssistantMessage({
  content,
  block,
  blockReferences,
}: AssistantMessageProps) {
  const isFailed = block.properties?.status === "failed";
  const [refCount, setRefCount] = useState<number | null>(null);

  // Memoize processed markdown content to prevent re-parsing
  const processedContent = useMemo(
    () => sanitizeMarkdownHeadersToRfcBullets(filterPropertyLines(content)),
    [content]
  );

  // Lazily load block references count
  useEffect(() => {
    blockReferences
      .then((refs) => setRefCount(refs.length))
      .catch(() => {
        setRefCount(0);
      });
  }, [blockReferences]);

  return (
    <div className="rounded-lg flex items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className={proseClasses}>
          <ReactMarkdown
            remarkPlugins={remarkPlugins}
            rehypePlugins={rehypePlugins}
            components={markdownComponents}
            urlTransform={urlTransform}
          >
            {processedContent}
          </ReactMarkdown>
        </div>
        {isFailed && (
          <div className="mt-4 pt-3 border-t border-yellow-300 dark:border-yellow-600/50 flex items-start gap-2 text-yellow-700 dark:text-yellow-400">
            <IconAlertTriangle size={20} className="shrink-0 mt-0.5" />
            <span className="text-sm font-medium">
              Something went wrong during the completion.
            </span>
          </div>
        )}
      </div>
      {refCount !== null && refCount > 0 && (
        <div className="flex-shrink-0 mt-1">
          <span className="inline-flex items-center justify-center min-w-[24px] h-6 px-2 text-xs font-medium rounded-full bg-gray-200 dark:bg-logseq-cyan-low-saturation-800 text-gray-700 dark:text-logseq-cyan-low-saturation-300">
            {refCount}
          </span>
        </div>
      )}
    </div>
  );
}

// Memoized UserMessage component to prevent unnecessary re-renders
const MemoizedUserMessage = memo(UserMessage, (prevProps, nextProps) => {
  return (
    prevProps.content === nextProps.content &&
    prevProps.blockId === nextProps.blockId &&
    prevProps.onEdit === nextProps.onEdit &&
    prevProps.blockReferences === nextProps.blockReferences
  );
});

// Memoized AssistantMessage component to prevent unnecessary re-renders
const MemoizedAssistantMessage = memo(
  AssistantMessage,
  (prevProps, nextProps) => {
    return (
      prevProps.content === nextProps.content &&
      prevProps.block === nextProps.block &&
      prevProps.blockReferences === nextProps.blockReferences
    );
  }
);

interface TextCarouselProps {
  phrases: string[];
  interval?: number;
}

function TextCarousel({ phrases, interval = 2000 }: TextCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [randomizedPhrases] = useState(() => {
    return [...phrases].sort(() => Math.random() - 0.5);
  });

  useEffect(() => {
    if (randomizedPhrases.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % randomizedPhrases.length);
    }, interval);

    return () => clearInterval(timer);
  }, [randomizedPhrases.length, interval]);

  if (randomizedPhrases.length === 0) return null;
  if (randomizedPhrases.length === 1) {
    return <div className="text-gray-500 italic">{randomizedPhrases[0]}</div>;
  }

  return (
    <div className="relative h-6 overflow-hidden">
      {randomizedPhrases.map((phrase, index) => (
        <div
          key={index}
          className={`absolute inset-0 text-gray-500 dark:text-logseq-cyan-low-saturation-300 italic transition-all duration-500 ease-in-out ${
            index === currentIndex
              ? "opacity-100 translate-y-0"
              : index ===
                  (currentIndex - 1 + randomizedPhrases.length) %
                    randomizedPhrases.length
                ? "opacity-0 -translate-y-2"
                : "opacity-0 translate-y-2"
          }`}
        >
          {phrase}
        </div>
      ))}
    </div>
  );
}

// Thinking indicator component for showing temporary "thinking" state
function ThinkingIndicator() {
  return (
    <div className="rounded-lg flex">
      <div className="mr-1">
        <BeatLoader color="#6b7280" size={8} />
      </div>
      <div className="flex-1">
        <TextCarousel
          phrases={[
            "Calculating",
            "Contemplating",
            "Cooking things up",
            "Twiddling my thumbs",
            "Fidgetting",
            "Thinking",
            "Philosophising",
          ]}
        />
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  isJobActive,
  isStreaming,
  onEdit,
}: MessageListProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [isUserAtBottom, setIsUserAtBottom] = useState<boolean>(true);
  const isUserAtBottomRef = useRef<boolean>(true);

  // Keep ref in sync with state
  useEffect(() => {
    isUserAtBottomRef.current = isUserAtBottom;
  }, [isUserAtBottom]);

  // Initialize the virtualizer
  const virtualizer = useVirtualizer({
    count: messages.length + (isJobActive && !isStreaming ? 1 : 0), // +1 for thinking indicator
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 150, // Estimate average message height
    overscan: 5, // Keep 5 items rendered above/below viewport for smooth scrolling
  });

  // Check if user is scrolled to bottom
  const checkIfAtBottom = () => {
    if (!scrollContainerRef.current) return false;
    const { scrollTop, scrollHeight, clientHeight } =
      scrollContainerRef.current;
    return scrollHeight - scrollTop - clientHeight < 50; // Increased threshold for better UX
  };

  // Auto-scroll to bottom using direct DOM manipulation
  const scrollToBottom = useCallback(() => {
    if (!scrollContainerRef.current || !isUserAtBottomRef.current) return;

    // Use requestAnimationFrame to ensure DOM has updated
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      }
    });
  }, []);

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
  }, [isJobActive, scrollToBottom]);

  // Monitor content changes during streaming for auto-scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Use ResizeObserver to detect when content size changes
    const resizeObserver = new ResizeObserver(() => {
      if (isUserAtBottomRef.current) {
        scrollToBottom();
      }
    });

    // Observe the inner content div
    const innerDiv = container.firstElementChild as HTMLElement;
    if (innerDiv) {
      resizeObserver.observe(innerDiv);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [scrollToBottom]);

  // Get virtual items
  const virtualItems = virtualizer.getVirtualItems();

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-auto py-6 pb-4"
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {messages.length === 0 && !isJobActive && (
          <div className="text-gray-500 text-center">Ask me anything!</div>
        )}
        {virtualItems.map((virtualItem) => {
          const isThinkingIndicator = virtualItem.index === messages.length;

          if (isThinkingIndicator) {
            return (
              <div
                key="thinking-indicator"
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  transform: `translateY(${virtualItem.start}px)`,
                }}
              >
                <div className="px-4 py-2">
                  <ThinkingIndicator />
                </div>
              </div>
            );
          }

          const message = messages[virtualItem.index];
          if (!message) return null;

          return (
            <div
              key={message.block.uuid}
              data-index={virtualItem.index}
              ref={virtualizer.measureElement}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <div className="px-4 py-2">
                {message.message.role === "user" ? (
                  <MemoizedUserMessage
                    content={message.message.content}
                    blockId={message.block.uuid || ""}
                    onEdit={onEdit || (() => {})}
                    blockReferences={message.blockReferences}
                  />
                ) : (
                  <MemoizedAssistantMessage
                    blockReferences={message.blockReferences}
                    content={message.message.content}
                    block={message.block}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
