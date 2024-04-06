import { TAgent } from "@veramo/core";
import { Request, Response, Router } from "express";
import * as Minio from "minio";

import { DIDChatMediator } from "../agent/setup";

const POST_MEDIA_BUCKET = "post-media";

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT!,
  port: parseInt(process.env.MINIO_PORT!),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
});

interface RequestWithAgent extends Request {
  agent?: TAgent<DIDChatMediator>;
}

const MediaRouter = (): Router => {
  const router = Router();

  router.get("/:filename", async (req: RequestWithAgent, res: Response) => {
    const { filename } = req.params;

    try {
      const exists = await minioClient.statObject(POST_MEDIA_BUCKET, filename);

      if (!exists) {
        res.status(404).json({ error: "File not found" }).end();
        return;
      }
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message }).end();
      return;
    }

    try {
      const stream = await minioClient.getObject(POST_MEDIA_BUCKET, filename);
      stream.pipe(res);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: e.message }).end();
      return;
    }
  });

  return router;
};

export default MediaRouter;
