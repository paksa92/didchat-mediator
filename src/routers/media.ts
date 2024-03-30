import { TAgent } from "@veramo/core";
import { Request, Response, Router } from "express";
import * as Minio from "minio";
import multer from "multer";

import { DIDChatMediator } from "../agent/setup";

const memoryStorage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 },
});

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

  router.post(
    "/upload",
    memoryStorage.array("media", 10),
    async (req: RequestWithAgent, res: Response) => {
      const files = req.files as Express.Multer.File[];
      const { bucket } = req.body;

      if (!files || files.length === 0) {
        res.status(400).json("No files uploaded");
        res.end();
        return;
      }

      try {
        const bucketExists = await minioClient.bucketExists(bucket);

        if (!bucketExists) {
          res.status(400).json("Bucket does not exist");
          res.end();
          return;
        }
      } catch (e) {
        res.status(500).json(e.message);
        res.end();
        return;
      }

      try {
        await Promise.all(
          files.map((file) =>
            minioClient.putObject(bucket, file.originalname, file.buffer, {
              "Content-Type": file.mimetype,
            })
          )
        );

        res.status(200).json(files.map((result) => result.originalname));
        res.end();
      } catch (e) {
        res.status(500).json(e.message);
        res.end();
        return;
      }
    }
  );

  router.get(
    "/:bucket/:filename",
    async (req: RequestWithAgent, res: Response) => {
      const { bucket, filename } = req.params;

      try {
        const exists = await minioClient.statObject(bucket, filename);

        if (!exists) {
          res.status(404).json("File not found");
          res.end();
          return;
        }
      } catch (e) {
        res.status(500).json(e.message);
        res.end();
        return;
      }

      try {
        const stream = await minioClient.getObject(bucket, filename);

        stream.pipe(res);
      } catch (e) {
        res.status(500).json(e.message);
        res.end();
        return;
      }
    }
  );

  return router;
};

export default MediaRouter;
