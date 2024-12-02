import { IPackedDIDCommMessage } from "@veramo/did-comm";
import { Request, Router } from "express";
import type { Router as RouterWS } from "express-ws";

import { DIDChatMediatorAgent } from "../../../types";
import { makeDebug } from "../../../utils";

const debug = makeDebug("message-relay-router");

interface RequestWithAgent extends Request {
  agent?: DIDChatMediatorAgent;
}

const MessageRelayRouter = (): RouterWS => {
  const router = Router();

  router.ws("/:did", async (ws, req: RequestWithAgent, next) => {
    if (!req.agent) {
      console.error("No agent found on request");
      next();
      return;
    }

    const requesterDid = req.params.did;

    if (!requesterDid) {
      console.error("No requester DID provided");
      next();
      return;
    }

    try {
      const isGrantedMediation =
        await req.agent.mediationManagerIsMediationGranted({
          recipientDid: requesterDid,
        });

      if (!isGrantedMediation) {
        debug(`mediation not granted for ${requesterDid}. ignoring`);
        next();
        return;
      }
    } catch (e) {
      console.error(e);
      next();
      return;
    }

    try {
      await req.agent.addMessageRelayClient({
        id: requesterDid,
        relayFn: (
          packedDeliveryMessage: IPackedDIDCommMessage,
          attachmentCount: number
        ) => {
          debug(
            `relaying ${attachmentCount} message${
              attachmentCount !== 1 ? "s" : ""
            } to ${requesterDid}`
          );

          ws.send(
            JSON.stringify({
              type: "delivery_message",
              data: packedDeliveryMessage.message,
            })
          );
        },
      });
    } catch (e) {
      console.error(e);
      next();
      return;
    }

    ws.onclose = async () => {
      if (!req.agent) {
        console.error("No agent found on request");
        next();
        return;
      }

      try {
        await req.agent.removeMessageRelayClient({
          id: requesterDid,
        });
        next();
      } catch (e) {
        console.error(e);
        next();
      }
    };

    const sendTime = () => {
      ws.send(
        JSON.stringify({ type: "server_time", data: new Date().toISOString() })
      );
    };

    sendTime(); // Some clients need to receive some data before they "open" the connection
    setInterval(sendTime, 55000);
  });

  return router;
};

export default MessageRelayRouter;
