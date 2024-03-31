import { IAgentContext } from "@veramo/core";
import { DIDCommMessageMediaType } from "@veramo/did-comm";

import { DIDChatMediator } from "./setup";

export async function createResponseMessage(
  data: { from: string; to: string; type: string; thid: string; body: any },
  context: IAgentContext<DIDChatMediator>
) {
  const message = {
    id: crypto.randomUUID(),
    thid: data.thid,
    type: data.type,
    from: data.from,
    to: data.to,
    body: data.body,
    created_time: new Date().toISOString(),
  };

  const packedMessage = await context.agent.packDIDCommMessage({
    message,
    packing: "authcrypt",
  });

  return {
    id: message.id,
    message: packedMessage.message,
    contentType: DIDCommMessageMediaType.ENCRYPTED,
  };
}
