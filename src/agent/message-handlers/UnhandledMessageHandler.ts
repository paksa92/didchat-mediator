import { Message, AbstractMessageHandler } from "@veramo/message-handler";

export class UnhandledMessageHandler extends AbstractMessageHandler {
  async handle(message: Message): Promise<Message> {
    console.log("RECEIVED UNHANDLED MESSAGE", JSON.stringify(message, null, 2));

    return message;
  }
}
