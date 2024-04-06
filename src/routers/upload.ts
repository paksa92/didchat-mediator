import { PrismaClient, User } from "@prisma/client";
import { TAgent } from "@veramo/core";
import sizeOf from "buffer-image-size";
import { Response, Request, Router, json } from "express";
import * as Minio from "minio";
import multer from "multer";
import Mux from "@mux/mux-node";
import { v4 } from "uuid";

import { DIDChatMediator } from "../agent/setup";

interface RequestWithAgent extends Request {
  agent?: TAgent<DIDChatMediator>;
}

const POST_MEDIA_BUCKET = "post-media";
const IMAGE_MAX_FILE_SIZE = 8 * 1024 * 1024; // 8MB

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT!,
  port: parseInt(process.env.MINIO_PORT!),
  useSSL: process.env.MINIO_USE_SSL === "true",
  accessKey: process.env.MINIO_ACCESS_KEY!,
  secretKey: process.env.MINIO_SECRET_KEY!,
});

const mux = new Mux({
  tokenId: process.env.MUX_TOKEN_ID!,
  tokenSecret: process.env.MUX_SECRET_KEY!,
});

const memoryStorage = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: IMAGE_MAX_FILE_SIZE },
  fileFilter: function (_, file, cb) {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only images are allowed."));
    }

    cb(null, true);
  },
});

const prisma = new PrismaClient();

const UploadRouter = (): Router => {
  const router = Router();

  router.use(json());

  router.post(
    "/image",
    memoryStorage.single("file"),
    async (req: RequestWithAgent, res: Response) => {
      const file = req.file as Express.Multer.File;
      const { did, order } = req.body;

      if (!file) {
        res.status(400).json({ error: "No file uploaded" }).end();
        return;
      }

      // TODO: validate? use jwt tokens? make sure not to leak to non-owners?
      if (!did) {
        res.status(400).json({ error: "No DID provided" }).end();
        return;
      }

      let user: User | null = null;

      try {
        user = await prisma.user.findUnique({
          where: { did },
        });

        // TODO: check user privileges

        if (!user) {
          res.status(400).json({ error: "User not found" }).end();
          return;
        }
      } catch (e: any) {
        res.status(500).json({ error: e.message }).end();
        return;
      }

      try {
        const bucketExists = await minioClient.bucketExists(POST_MEDIA_BUCKET);

        if (!bucketExists) {
          res
            .status(400)
            .json({ error: "Could not upload image, contact support." })
            .end();
          return;
        }
      } catch (e) {
        res.status(500).json({ error: e.message }).end();
        return;
      }

      try {
        const id = v4();
        const ext = file.originalname.split(".").pop();
        const filename = `${id}.${ext}`;

        await minioClient.putObject(POST_MEDIA_BUCKET, filename, file.buffer, {
          "Content-Type": file.mimetype,
        });

        const { width, height } = sizeOf(file.buffer);

        const createdMedia = await prisma.media.create({
          data: {
            url: `https://${process.env.DID_ALIAS}/media/${filename}`,
            type: "IMAGE",
            width,
            height,
            order: order ? parseInt(order) : 0,
            user: { connect: { id: user!.id } },
          },
        });

        res.status(200).json({ media: createdMedia });
        res.end();
      } catch (e) {
        console.error({ e });

        res
          .status(500)
          .json({
            error: e.message,
          })
          .end();
      }
    }
  );

  router.post("/video", async (req: RequestWithAgent, res: Response) => {
    try {
      const { did, playbackUrl, thumbnailUrl, order, duration, width, height } =
        req.body;

      if (!playbackUrl) {
        res.status(400).json({ error: "No playback url provided" }).end();
        return;
      }

      // TODO: validate? use jwt tokens? make sure not to leak to non-owners?
      if (!did) {
        res.status(400).json({ error: "No DID provided" }).end();
        return;
      }

      let user: User | null = null;

      try {
        user = await prisma.user.findUnique({
          where: { did },
        });

        // TODO: check user privileges

        if (!user) {
          res.status(400).json({ error: "User not found" }).end();
          return;
        }
      } catch (e: any) {
        res.status(500).json({ error: e.message }).end();
        return;
      }

      const createdMedia = await prisma.media.create({
        data: {
          url: playbackUrl,
          thumbnailUrl,
          type: "VIDEO",
          order: order ? parseInt(order) : 0,
          duration,
          width,
          height,
          user: { connect: { id: user!.id } },
        },
      });

      res.status(200).json({ media: createdMedia });
      res.end();
    } catch (e: any) {
      console.error({ e });

      res
        .status(500)
        .json({
          error: e.message,
        })
        .end();
    }
  });

  router.get(
    "/signed-upload-url",
    async (req: RequestWithAgent, res: Response) => {
      try {
        const signedUploadUrl = await mux.video.uploads.create({
          cors_origin: "*",
          new_asset_settings: {
            playback_policy: ["public"],
          },
        });

        res.status(200).json(signedUploadUrl);
      } catch (e: any) {
        res.status(500).json({ error: e.message }).end();
      }
    }
  );

  router.get(
    "/status/:uploadId",
    async (req: RequestWithAgent, res: Response) => {
      try {
        const status = await mux.video.uploads.retrieve(req.params.uploadId);

        if (status.asset_id) {
          const asset = await mux.video.assets.retrieve(status.asset_id);

          if (asset.status === "ready") {
            res.status(200).json(asset);
            return;
          }
        }

        res.status(200).json(status);
      } catch (e: any) {
        console.log({ e: JSON.stringify(e, null, 2) });
        res.status(500).json({ error: e.message });
      }
    }
  );

  return router;
};

export default UploadRouter;
