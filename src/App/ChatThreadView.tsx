import { useState, useEffect, useMemo, useReducer } from "react";
import { ChatInput } from "./components/ChatInput";
import { MessageList } from "./components/MessageList/MessageList";
import {
  type Message,
  type BlockMessage,
  deleteAllMessagesAfterBlock,
  searchPagesByName,
} from "../services/threading/threading";
import {
  appendMessageToThread,
  loadThreadMessageBlocks,
} from "../services/threading/threading";
import { completionJobManager } from "../services/chat-completion/completion-job-manager";
import { createCompletionJob } from "../services/chat-completion/completion-task";
import { sanitizeMarkdown } from "../utils/utils";

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
  const { isJobActive, isStreaming, job } = useCompletionJob(pageId);

  const loadMessages = useMemo(
    () => () => {
      loadThreadMessageBlocks(pageId)
        .then((loadedMessages) => {
          setMessages(loadedMessages);
        })
        .catch((error) => {
          console.error("Error loading thread messages:", error);
          logseq.UI.showMsg(`Error loading messages: ${error}`, "error");
        });
    },
    [pageId]
  );

  useEffect(() => logseq.DB.onChanged(loadMessages), [loadMessages]);
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

      // Append user message block
      await appendMessageToThread(pageId, {
        role: "user",
        content: currentInput,
      } as Message);

      // Spawn completion job for assistant reply
      completionJobManager.runJob(pageId, () =>
        createCompletionJob(currentInput, priorMessages, pageId)
      );
    } catch (e) {
      logseq.UI.showMsg(`${e ?? ""}`, "error");
    }
  };

  const handleEditMessage = async (blockId: string, newContent: string) => {
    newContent = sanitizeMarkdown(newContent);

    try {
      await logseq.Editor.updateBlock(blockId, newContent, {
        properties: { role: "user" },
      });

      await deleteAllMessagesAfterBlock({ pageId, blockId });

      // Build prior messages for completion
      const priorMessages: Message[] = messages.map((m) => ({
        role: m.message.role,
        content: m.message.content,
      })) as Message[];

      // Spawn completion job for assistant reply
      completionJobManager.runJob(pageId, () =>
        createCompletionJob(newContent, priorMessages, pageId)
      );
    } catch (e) {
      console.error("Error updating message:", e);
      logseq.UI.showMsg(`Error updating message: ${e ?? ""}`, "error");
    }
  };

  console.log("Is streaming", isStreaming);

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
