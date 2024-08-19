import { TAgent } from "@veramo/core";
import { Request, Response, Router } from "express";

import { DIDChatMediator } from "../agent/setup";

interface RequestWithAgent extends Request {
  agent?: TAgent<DIDChatMediator>;
}

const SubscribeRouter = (): Router => {
  const router = Router();

  router.get("/", async (req: RequestWithAgent, res: Response) => {
    if (!req.agent) {
      res.status(500);
      res.end();
      return;
    }

    const requesterDid = req.get("x-requester-did");

    if (!requesterDid) {
      res.status(400);
      res.end();
      return;
    }

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      Connection: "keep-alive",
      "Cache-Control": "no-cache",
    });

    try {
      await req.agent.subscribeAddClient({
        id: requesterDid,
        sendEvent: (type, data) => {
          console.log(`sending server event '${type}' to ${requesterDid}`);
          console.log(JSON.stringify(data));

          res.write(`event: ${type}\n\n`);
          res.write(`data: ${JSON.stringify(data)}\n\n`);
        },
      });
    } catch (e) {
      console.error(e);
      res.status(500);
      res.end();
      return;
    }

    req.on("close", async () => {
      try {
        await req.agent!.subscribeRemoveClient({
          id: requesterDid,
        });
        res.end();
      } catch (e) {
        console.error(e);
        res.end();
      }
    });

    const sendTime = () => {
      res.write(`event: server_time\n\n`);
      res.write(`data: ${new Date().toISOString()}\n\n`);
    };

    sendTime(); // Some clients need to receive some data before they "open" the connection
    setInterval(sendTime, 55000);
  });

  return router;
};

export default SubscribeRouter;
