import type { Message } from "../../logseq/querier";
import type { Chatbot } from "../chatbot";

export async function* dumbYesChatbot(
  _: string,
  _message: Message[]
): ReturnType<Chatbot> {
  yield { type: "text-delta", delta: "Yes" };
}
const _dumbYesChatbotTypeTest: Chatbot = dumbYesChatbot;
