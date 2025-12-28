import type { Message } from "../../threading/threading";
import type { Chatbot } from "../chatbot";

async function* _dumbYesChatbot(
  _: string,
  _message: Message[]
): ReturnType<Chatbot> {
  yield { type: "text-delta", delta: "Yes" };
}
export const dumbYesChatbot: Chatbot = _dumbYesChatbot;
