import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react";

interface ThreadInfo {
  blockUuid: string;
  threadId: string | null;
}

interface ThreadCarouselProps {
  threads: ThreadInfo[];
  currentThreadId: string | null;
  onSwitchThread?: (threadId: string | null) => void;
}

export function ThreadCarousel({
  threads,
  currentThreadId,
  onSwitchThread,
}: ThreadCarouselProps) {
  // Find current thread index
  const currentIndex = threads.findIndex(
    (thread) => thread.threadId === currentThreadId
  );

  // Edge case: thread not found
  if (currentIndex === -1) {
    console.warn("Current thread not found in threads list");
    return null;
  }

  // Calculate display values (1-indexed)
  const displayPosition = currentIndex + 1;
  const totalThreads = threads.length;

  // Navigation handlers
  const handlePrevious = () => {
    if (currentIndex > 0) {
      const prevThread = threads[currentIndex - 1];
      onSwitchThread?.(prevThread.threadId);
    }
  };

  const handleNext = () => {
    if (currentIndex < threads.length - 1) {
      const nextThread = threads[currentIndex + 1];
      onSwitchThread?.(nextThread.threadId);
    }
  };

  // Button states
  const canGoPrevious = currentIndex > 0;
  const canGoNext = currentIndex < threads.length - 1;

  return (
    <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
      <button
        onClick={handlePrevious}
        disabled={!canGoPrevious}
        className={`${
          canGoPrevious
            ? "text-blue-600 hover:text-blue-800 cursor-pointer"
            : "text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50"
        }`}
        title={canGoPrevious ? "Previous thread" : "At first thread"}
      >
        <IconChevronLeft size={16} />
      </button>

      <span>
        {displayPosition}/{totalThreads}
      </span>

      <button
        onClick={handleNext}
        disabled={!canGoNext}
        className={`${
          canGoNext
            ? "text-blue-600 hover:text-blue-800 cursor-pointer"
            : "text-gray-400 dark:text-gray-600 cursor-not-allowed opacity-50"
        }`}
        title={canGoNext ? "Next thread" : "At last thread"}
      >
        <IconChevronRight size={16} />
      </button>
    </div>
  );
}
