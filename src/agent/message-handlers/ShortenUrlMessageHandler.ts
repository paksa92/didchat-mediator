import { IAgentContext } from "@veramo/core";
import { Message, AbstractMessageHandler } from "@veramo/message-handler";
import { EconAgent } from "../setup";
import { DIDCommMessageMediaType } from "@veramo/did-comm";

const REQUEST_SHORTENED_URL =
  "https://didcomm.org/shorten-url/1.0/request-shortened-url";
const SHORTENED_URL = "https://didcomm.org/shorten-url/1.0/shortened-url";

export class ShortenUrlMessageHandler extends AbstractMessageHandler {
  async handle(
    message: Message,
    context: IAgentContext<EconAgent>
  ): Promise<Message> {
    if (message.type === REQUEST_SHORTENED_URL) {
      try {
        const { id } = message;
        const { url, goal_code, short_url_slug } = message.data;

        if (goal_code !== "shorten.oobv2") {
          throw new Error("Invalid goal code.");
        }

        if (!short_url_slug) {
          throw new Error("No short url slug provided");
        }

        const success = await context.agent.shortenUrl({
          id: short_url_slug,
          url,
        });

        if (!success) {
          throw new Error(`Could not shorten URL: ${url}.`);
        }

        const response = {
          type: SHORTENED_URL,
          from: process.env.DID_ALIAS,
          to: message.from ?? "",
          id: crypto.randomUUID(),
          thid: id,
          body: {
            shortened_url: `https://${process.env.DID_ALIAS}/s?_oobid=${short_url_slug}`,
            expires_time: 0,
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
