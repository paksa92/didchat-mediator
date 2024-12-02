import { Message, AbstractMessageHandler } from "@veramo/message-handler";

import { DIDChatMediatorAgentContext } from "../../types";
import { makeDebug } from "../../utils";

const debug = makeDebug("unhandled-message-handler");

export class UnhandledMessageHandler extends AbstractMessageHandler {
  public supportedMessageTypes = [
    "https://didcomm.org/messagepickup/3.0/messages-received",
  ];

  async handle(
    message: Message,
    context: DIDChatMediatorAgentContext
  ): Promise<Message> {
    if (this.supportedMessageTypes.includes(message.type)) {
      return message;
    }

    debug("received unhandled message", JSON.stringify(message, null, 2));

    return super.handle(message, context);
  }
}
