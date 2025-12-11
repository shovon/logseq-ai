import { type GeneratedImage } from "./chat-completion";

export type TextDeltaEvent = { type: "text-delta"; delta: string };
export type ImageEvent = { type: "image"; image: GeneratedImage };
export type NothingEvent = { type: "nothing" };
export type ChatCompletionJobEvent = TextDeltaEvent | ImageEvent | NothingEvent;
