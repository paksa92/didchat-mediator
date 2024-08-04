import { TAgent } from "@veramo/core";
import { Resolver } from "did-resolver";
import { Request, Response, Router } from "express";
import { getResolver as peerDidResolver } from "peer-did-resolver";

import { DIDChatMediator } from "../agent/setup";

interface RequestWithAgent extends Request {
  agent?: TAgent<DIDChatMediator>;
}

const DidAliasRouter = (): Router => {
  const router = Router();

  router.get("/:alias", async (req: RequestWithAgent, res: Response) => {
    if (!req.agent) {
      res.status(500);
      res.end();
      return;
    }

    if (!req.params.alias) {
      res.status(404);
      res.end();
      return;
    }

    try {
      const did = await req.agent.didAliasResolve({
        alias: req.params.alias,
      });

      if (!did) {
        res.status(404);
        res.end();
        return;
      }

      res.setHeader("Content-Type", "application/json");
      res.status(200).json({
        did,
      });
      res.end();
    } catch (e) {
      console.error(e);
      res.status(500);
      res.end();
    }
  });

  router.get(
    "/:alias/.well-known/did.json",
    async (req: RequestWithAgent, res: Response) => {
      if (!req.agent) {
        res.status(500);
        res.end();
        return;
      }

      try {
        const did = await req.agent.didAliasResolve({
          alias: req.params.alias,
        });

        if (!did) {
          res.status(404);
          res.end();
          return;
        }

        const didResolver = new Resolver({
          ...peerDidResolver(),
        });

        const didDoc = didResolver.resolve(did);

        console.log({ didDoc });

        res.setHeader("Content-Type", "application/json");
        res.status(200).json(didDoc);
        res.end();
      } catch (e) {
        console.error(e);
        res.status(500);
        res.end();
      }
    }
  );

  return router;
};

export default DidAliasRouter;
