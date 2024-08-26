import { TAgent } from "@veramo/core";
import { Request, Router } from "express";
import type { Router as RouterWS } from "express-ws";

import { DIDChatMediator } from "../agent/setup";

interface RequestWithAgent extends Request {
  agent?: TAgent<DIDChatMediator>;
}

const SubscribeRouter = (): RouterWS => {
  const router = Router();

  router.ws("/:did", async (ws, req: RequestWithAgent, next) => {
    if (!req.agent) {
      console.error("No agent found on request");
      next();
      return;
    }

    const requesterDid = req.params.did;

    console.log({ requesterDid });

    if (!requesterDid) {
      console.error("No requester DID provided");
      next();
      return;
    }

    try {
      await req.agent.subscribeAddClient({
        id: requesterDid,
        sendEvent: (type, data) => {
          console.log(`sending server event '${type}' to ${requesterDid}`);
          console.log(JSON.stringify(data));

          ws.send(JSON.stringify({ type, data }));
        },
      });
    } catch (e) {
      console.error(e);
      next();
      return;
    }

    ws.onclose = async () => {
      try {
        await req.agent!.subscribeRemoveClient({
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

export default SubscribeRouter;
