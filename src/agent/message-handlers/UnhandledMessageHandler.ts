import { IAgentContext, TAgent } from "@veramo/core";
import { Message, AbstractMessageHandler } from "@veramo/message-handler";

import { DIDChatMediator } from "../setup";

export class UnhandledMessageHandler extends AbstractMessageHandler {
  public supportedMessageTypes = [
    "https://didcomm.org/messagepickup/3.0/messages-received",
  ];

  async handle(
    message: Message,
    context: IAgentContext<TAgent<DIDChatMediator>>
  ): Promise<Message> {
    if (this.supportedMessageTypes.includes(message.type)) {
      return message;
    }

    console.log("RECEIVED UNHANDLED MESSAGE", JSON.stringify(message, null, 2));

    return super.handle(message, context);
  }
}
