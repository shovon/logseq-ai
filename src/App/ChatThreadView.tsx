import { useState, useEffect, useMemo, useReducer, useCallback } from "react";
import { ChatInput } from "./components/ChatInput";
import { MessageList } from "./components/MessageList/MessageList";
import {
  type Message,
  type BlockMessage,
  searchPagesByName,
  appendMessageToThread,
  loadThreadMessageBlocks,
  getCurrentThreadId,
  setCurrentThreadId,
  forkThread,
} from "../services/threading/threading";
import { completionJobManager } from "../services/chat-completion/completion-job-manager";
import { createCompletionJob } from "../services/chat-completion/completion-task";
import { debouncePromiseHandler, sanitizeMarkdown } from "../utils/utils";

interface ChatThreadViewProps {
  pageId: string;
}

function useCompletionJob(pageId: string) {
  const [jobState, setJobState] = useState(
    () =>
      completionJobManager.getRunningJob(pageId)?.state ?? {
        type: "idle" as const,
      }
  );
  const [job, setJob] = useState(() =>
    completionJobManager.getRunningJob(pageId)
  );
  const [, update] = useReducer(() => ({}), {});

  useEffect(() => {
    let unsubscribeState: (() => void) | undefined;
    let unsubscribeStopped: (() => void) | undefined;

    const updateJobState = () => {
      const currentJob = completionJobManager.getRunningJob(pageId);

      // Unsubscribe from old job
      unsubscribeState?.();
      unsubscribeStopped?.();

      if (currentJob) {
        setJob(currentJob);
        setJobState(currentJob.state);

        // Subscribe to new job's events
        unsubscribeState = currentJob.onStateChange((state) => {
          setJobState(state);
        });

        unsubscribeStopped = currentJob.onStopped(() => {
          setJobState({ type: "idle" });
          setJob(undefined);
        });
      } else {
        setJobState({ type: "idle" });
        setJob(undefined);
        unsubscribeState = undefined;
        unsubscribeStopped = undefined;
      }
    };

    // Initial update
    updateJobState();

    // Listen for job started events for this pageId
    const unsubscribeJobStarted = completionJobManager.onJobStarted((key) => {
      if (key === pageId) {
        updateJobState();
      }
    });

    return () => {
      unsubscribeState?.();
      unsubscribeStopped?.();
      unsubscribeJobStarted();
    };
  }, [pageId]);

  useEffect(() => {
    const unsub1 = completionJobManager.onJobStarted(() => {
      update();
    }, true);
    const unsub2 = completionJobManager.onJobStopped(() => {
      update();
    }, true);

    return () => {
      unsub1();
      unsub2();
    };
  }, []);

  return {
    state: jobState,
    job: completionJobManager.getRunningJob(pageId),
    isJobActive: job !== undefined,
    isStreaming: job?.state.type === "streaming",
  };
}

export function ChatThreadView({ pageId }: ChatThreadViewProps) {
  const [messages, setMessages] = useState<BlockMessage[]>([]);
  const [currentThreadId, setCurrentThreadIdState] = useState<string | null>(
    null
  );
  const { isJobActive, isStreaming, job } = useCompletionJob(pageId);

  const loadMessages = useMemo(
    () => async () => {
      try {
        // Get current threadId from page properties
        const threadId = await getCurrentThreadId(pageId);
        setCurrentThreadIdState(threadId);

        // Load messages for the current thread
        const loadedMessages = await loadThreadMessageBlocks(pageId, threadId);
        setMessages(loadedMessages);
      } catch (error) {
        console.error("Error loading thread messages:", error);
        logseq.UI.showMsg(`Error loading messages: ${error}`, "error");
      }
    },
    [pageId]
  );

  useEffect(() => {
    return debouncePromiseHandler(logseq.DB.onChanged.bind(logseq.DB))(
      loadMessages
    );
  }, [loadMessages]);
  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const handleSendMessage = async (value: string) => {
    const currentInput = sanitizeMarkdown(value);

    try {
      // Build prior messages BEFORE appending the new message
      // Filter out the last user message if it matches currentInput (safety check)
      // This ensures we don't include the message we're about to send
      const priorMessages: Message[] = messages.map((m) => ({
        role: m.message.role,
        content: m.message.content,
      }));

      // Get current threadId (may be null for main thread)
      const threadId = currentThreadId;

      // Append user message block (with thread metadata only if in a forked thread)
      await appendMessageToThread(
        pageId,
        {
          role: "user",
          content: currentInput,
        } as Message,
        threadId
          ? {
              threadId,
              // No referenceId for regular messages, only for fork roots
            }
          : undefined
      );

      // Spawn completion job for assistant reply (with thread metadata only if in a forked thread)
      completionJobManager.runJob(pageId, () =>
        createCompletionJob(
          currentInput,
          priorMessages,
          pageId,
          threadId ? { threadId } : undefined
        )
      );
    } catch (e) {
      logseq.UI.showMsg(`${e ?? ""}`, "error");
    }
  };

  const handleEditMessage = useCallback(
    async (blockId: string, newContent: string) => {
      newContent = sanitizeMarkdown(newContent);

      try {
        // Build prior messages BEFORE forking (from the current thread)
        // We need messages up to (but not including) the edited block
        const priorMessages: Message[] = messages
          .filter((m) => m.block.uuid !== blockId)
          .map((m) => ({
            role: m.message.role,
            content: m.message.content,
          })) as Message[];

        // Fork a new thread from the edited block
        const newThreadId = await forkThread(blockId, pageId);

        // Set the new thread as the current thread
        await setCurrentThreadId(pageId, newThreadId);
        setCurrentThreadIdState(newThreadId);

        // Append the edited message as the root of the new thread fork
        // This creates a new block that serves as the root with referenceId
        // pointing to the original block (which remains for record-keeping)
        await appendMessageToThread(
          pageId,
          {
            role: "user",
            content: newContent,
          } as Message,
          {
            threadId: newThreadId,
            referenceId: blockId,
          }
        );

        // Add the new edited message to prior messages for completion
        priorMessages.push({
          role: "user",
          content: newContent,
        });

        // Reload messages from the new thread
        await loadMessages();

        // Spawn completion job for assistant reply
        completionJobManager.runJob(pageId, () =>
          createCompletionJob(newContent, priorMessages, pageId, {
            threadId: newThreadId,
          })
        );
      } catch (e) {
        console.error("Error updating message:", e);
        logseq.UI.showMsg(`Error updating message: ${e ?? ""}`, "error");
      }
    },
    [messages, pageId, loadMessages]
  );

  return (
    <>
      <MessageList
        messages={messages}
        isJobActive={isJobActive}
        isStreaming={isStreaming}
        onEdit={handleEditMessage}
      />
      <ChatInput
        className="mt-auto bg-white dark:bg-logseq-cyan-low-saturation-900 border-t border-gray-200 dark:border-logseq-cyan-low-saturation-800"
        onSend={handleSendMessage}
        disabled={isJobActive}
        isRunning={isJobActive}
        onCancel={() => {
          if (job) {
            job.stop();
          }
        }}
        searchPage={searchPagesByName}
      />
    </>
  );
}
