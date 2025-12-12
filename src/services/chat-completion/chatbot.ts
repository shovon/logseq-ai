import type { Message } from "../logseq/querier";
import type { ChatCompletionJobEvent } from "./chat-completion-job-event";

/**
 * The interface that represnts a "chatbot".
 */
export type Chatbot = (
  input: string,
  message: Message[],
  abortSignal: AbortSignal
) => AsyncIterable<ChatCompletionJobEvent>;
