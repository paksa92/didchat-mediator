import { IAgentContext } from "@veramo/core";
import { Message, AbstractMessageHandler } from "@veramo/message-handler";
import { DIDChatMediator } from "../setup";
import { DIDCommMessageMediaType } from "@veramo/did-comm";

const REGISTER_DID_ALIAS = "https://didchat.app/did-alias/1.0/register";
const REGISTER_DID_ALIAS_RESPONSE =
  "https://didchat.app/did-alias/1.0/register-response";
const DELETE_DID_ALIAS = "https://didchat.app/did-alias/1.0/delete";

export class DidAliasMessageHandler extends AbstractMessageHandler {
  async handle(
    message: Message,
    context: IAgentContext<DIDChatMediator>
  ): Promise<Message> {
    if (message.type === REGISTER_DID_ALIAS) {
      try {
        const { id, from } = message;
        const { alias, did } = message.data;

        if (!alias || !did) {
          throw new Error("Alias or DID not provided.");
        }

        if (from !== did) {
          throw new Error("Can only register alias for own DID.");
        }

        if (
          !/^(?=.{4,20}$)(?![_.])(?!.*[_.]{2})[a-zA-Z0-9._]+(?<![_.])$/.test(
            alias
          )
        ) {
          throw new Error("Invalid alias.");
        }

        const exists = await context.agent.didAliasResolve({
          alias,
        });

        if (exists) {
          throw new Error("Alias is already taken.");
        }

        const success = await context.agent.didAliasCreate({
          alias,
          did,
        });

        if (!success) {
          throw new Error(`Could not register alias: ${alias} ${did}.`);
        }

        const response = {
          type: REGISTER_DID_ALIAS_RESPONSE,
          from: process.env.DID_ALIAS,
          to: message.from!,
          id: crypto.randomUUID(),
          pthid: id,
          body: {
            aliasDid: `did:web:${process.env.DID_ALIAS}:${alias}`,
          },
          created_time: new Date().toISOString(),
        };

        const packedResponse = await context.agent.packDIDCommMessage({
          message: response,
          packing: "none",
        });

        const returnResponse = {
          id: response.id,
          message: packedResponse.message,
          contentType: DIDCommMessageMediaType.ENCRYPTED,
        };

        message.addMetaData({
          type: "ReturnRouteResponse",
          value: JSON.stringify(returnResponse),
        });
      } catch (e) {
        console.error(e);
      }

      return message;
    }

    return super.handle(message, context);
  }
}
