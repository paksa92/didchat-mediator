import {
  IDIDCommMessage,
  IDIDCommMessageAttachment,
  IPackedDIDCommMessage,
} from "@veramo/did-comm";

import { DIDChatMediatorAgentContext } from "../types";

export function makeDIDCommMessage(
  id: string,
  from: string,
  to: string,
  type: string,
  data: object,
  thid?: string,
  pthid?: string,
  createdTime?: string,
  expiresTime?: string,
  attachments?: IDIDCommMessageAttachment[],
  returnRoute?: string,
  fromPrior?: string,
  next?: string
): IDIDCommMessage {
  return {
    id,
    from,
    to,
    type,
    thid,
    pthid,
    body: data,
    attachments,
    return_route: returnRoute,
    from_prior: fromPrior,
    next,
    created_time: createdTime ?? new Date().toISOString(),
    expires_time: expiresTime,
  };
}

export async function packDIDCommMessage(
  message: IDIDCommMessage,
  context: DIDChatMediatorAgentContext
): Promise<IPackedDIDCommMessage> {
  return await context.agent.packDIDCommMessage({
    message,
    packing: "authcrypt",
  });
}
