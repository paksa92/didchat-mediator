import { PrismaClient, User } from "@prisma/client";
import { TAgent } from "@veramo/core";
import { Request, Response, Router } from "express";
import * as Minio from "minio";
import multer from "multer";
import getImageDimensions from "buffer-image-size";

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

const prisma = new PrismaClient();

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
      const { did, bucket, postId, metadata } = req.body;

      if (!files || files.length === 0) {
        res.status(400).json({ error: "No files uploaded" }).end();
        return;
      }

      if (!did) {
        res.status(400).json({ error: "No DID provided" }).end();
        return;
      }

      if (!bucket) {
        res.status(400).json({ error: "No bucket provided" }).end();
        return;
      }

      let user: User | null = null;

      try {
        user = await prisma.user.findUnique({
          where: { did },
        });

        // TODO: check if user is allowed to upload to bucket

        if (!user) {
          res.status(400).json({ error: "User not found" }).end();
          return;
        }
      } catch (e: any) {
        res.status(500).json({ error: e.message }).end();
        return;
      }

      try {
        const bucketExists = await minioClient.bucketExists(bucket);

        if (!bucketExists) {
          res.status(400).json({ error: "Bucket does not exist" }).end();
          return;
        }
      } catch (e) {
        res.status(500).json({ error: e.message }).end();
        return;
      }

      if (postId) {
        try {
          const post = await prisma.post.findUnique({
            where: {
              id: postId,
              user: {
                did,
              },
            },
            include: {
              _count: {
                select: {
                  media: true,
                },
              },
            },
          });

          if (!post) {
            res
              .status(400)
              .json({ error: "Post belonging to user not found" })
              .end();
            return;
          }

          if (post._count.media >= 8) {
            res.status(400).json({ error: "Post media limit reached" }).end();
            return;
          }
        } catch (e: any) {
          res.status(500).json({ error: e.message }).end();
          return;
        }
      }

      const parsedMetadata = metadata ? JSON.parse(metadata) : {};

      try {
        await Promise.all(
          files.map((file) =>
            minioClient.putObject(bucket, file.originalname, file.buffer, {
              "Content-Type": file.mimetype,
            })
          )
        );

        const media = await prisma.$transaction(
          files.map((file) => {
            const fileMetadata = parsedMetadata[file.originalname] ?? {};

            console.log({ fileMetadata });

            return prisma.media.create({
              data: {
                url: `https://${process.env.DID_ALIAS}/media/${bucket}/${file.originalname}`,
                type: file.mimetype.startsWith("image") ? "IMAGE" : "VIDEO",
                width: file.mimetype.startsWith("image")
                  ? getImageDimensions(file.buffer).width
                  : fileMetadata.width ?? undefined,
                height: file.mimetype.startsWith("image")
                  ? getImageDimensions(file.buffer).height
                  : fileMetadata.height ?? undefined,
                duration: fileMetadata.duration ?? undefined,
                user: { connect: { id: user!.id } },
                post: postId ? { connect: { id: postId } } : undefined,
              },
            });
          })
        );

        res.status(200).json({ media });
        res.end();
      } catch (e) {
        console.error({ e });
        res
          .status(500)
          .json({
            error: e.message,
          })
          .end();
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
          res.status(404).json({ error: "File not found" }).end();
          return;
        }
      } catch (e) {
        res.status(500).json({ error: e.message }).end();
        return;
      }

      try {
        const stream = await minioClient.getObject(bucket, filename);
        stream.pipe(res);
      } catch (e) {
        res.status(500).json({ error: e.message }).end();
        return;
      }
    }
  );

  return router;
};

export default MediaRouter;
