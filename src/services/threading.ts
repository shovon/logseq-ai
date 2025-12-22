import { createChatThreadPage, type Message } from "./logseq/querier";

// Things to be effective with threads.
//
//

export const appendMessageToThread = async (
  pageUuid: string,
  role: Role
  message: Message,
  rootThreadUuid?: string
): Promise<void> => {
  await logseq.Editor.appendBlockInPage(pageUuid, message.content, {
    properties: { role: message.role },
  });
};

// export const createNewChatThread = async (userMessage: string) => {
//   const title = userMessage.slice(0, 64);
//   const pageId = await createChatThreadPage(title);
//   if (!pageId) {
//     throw new Error("Failed to create a new chat thread");
//   }

//   await appendMessageToThread(pageId, {
//     role: "user",
//     content: userMessage,
//   } as Message);

//   return pageId;
// };
