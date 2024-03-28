import { TAgent } from "@veramo/core";
import { Request, Response, Router } from "express";

import { DIDChatMediator } from "../agent/setup";

interface RequestWithAgent extends Request {
  agent?: TAgent<DIDChatMediator>;
}

const ShortUrlRouter = (): Router => {
  const router = Router();

  router.get("/", async (req: RequestWithAgent, res: Response) => {
    if (!req.agent) {
      res.status(500);
      res.end();
      return;
    }

    if (!req.query._oobid) {
      res.status(400);
      res.end();
      return;
    }

    try {
      const longUrl = await req.agent.shortenedUrlResolve({
        id: req.query._oobid.toString(),
      });

      if (!longUrl) {
        res.status(404);
        res.end();
        return;
      }

      res.setHeader("Content-Type", "application/json");
      res.status(200).json({
        longUrl,
      });
      res.end();
    } catch (e) {
      console.error(e);
      res.status(500);
      res.end();
    }
  });

  return router;
};

export default ShortUrlRouter;
