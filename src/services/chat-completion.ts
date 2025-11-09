import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { Message } from "../querier";
import {
  extractPageReferences,
  buildReferencedPagesContext,
  buildSystemPromptWithoutCurrentPage,
} from "./context-builder";
import type { JobStatus } from "./job-registry";
import {
  startCompletionJob,
  cancelCompletionJob as cancelJob,
  getStatus as getJobStatus,
  subscribe as subscribeToJobs,
} from "./job-registry";

const OPENAI_API_KEY = import.meta.env.VITE_OPENAI_API_KEY;

const openai = createOpenAI({
  apiKey: OPENAI_API_KEY,
});

const SYSTEM_PROMPT = `You are a helpful AI assistant integrated with Logseq. Help users with their questions and tasks.

Just note, when a user uses the \`[[SOME PAGE NAME]]\` syntax, they are referring to a page, and you can find it in the page references list.`;

export function spawnCompletionJobForPage(
  pageId: string,
  { input, messages }: { input: string; messages: Message[] }
) {
  return startCompletionJob(pageId, input, messages, runCompletion);
}

export async function* runCompletion({
  input,
  messages,
  signal,
}: {
  input: string;
  messages: Message[];
  signal: AbortSignal;
}): AsyncIterable<string> {
  const stream = await streamText({
    model: openai("gpt-4"),
    messages: await buildPromptWithContext(input, messages),
  });

  for await (const delta of stream.textStream) {
    if (signal.aborted) return;
    yield delta;
  }
}

async function buildPromptWithContext(
  input: string,
  messages: Message[]
): Promise<Message[]> {
  const extractedBrackets = extractPageReferences(input);
  console.log("Extracted brackets:", extractedBrackets);

  const extractedPagesContent = await buildReferencedPagesContext(
    extractedBrackets
  );
  console.log("Extracted pages content:", extractedPagesContent);

  const systemPromptWithContext = buildSystemPromptWithoutCurrentPage(
    SYSTEM_PROMPT,
    extractedPagesContent
  );

  return [
    { role: "system", content: systemPromptWithContext },
    ...messages,
    { role: "user", content: input },
  ];
}

export function cancelCompletionJob(pageId: string) {
  cancelJob(pageId);
}

export function getCompletionJobStatus(pageId: string) {
  return getJobStatus(pageId);
}

export function subscribeToCompletionJobs(
  listener: (pageId: string, status: JobStatus) => void
) {
  return subscribeToJobs(listener);
}
