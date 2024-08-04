import "dotenv/config";
import {
  MessagingRouter,
  RequestWithAgentRouter,
  WebDidDocRouter,
} from "@veramo/remote-server";
import express from "express";
import morgan from "morgan";

import { createAgent } from "./agent/setup";
import {
  DidAliasRouter,
  MediaRouter,
  ShortUrlRouter,
  SubscribeRouter,
  UploadRouter,
} from "./routers";

const PORT = process.env.PORT ?? 3000;

const server = express();

const agent = await createAgent();

server.use(morgan("combined"));

server.use(
  RequestWithAgentRouter({
    agent,
  })
);

server.use(
  WebDidDocRouter({
    services: [], // TODO: ????
  })
);

server.use(
  "/messaging",
  MessagingRouter({
    metaData: { type: "", value: "" }, // TODO: ????
    save: true,
  })
);

server.use("/media", MediaRouter());
server.use("/subscribe", SubscribeRouter());
server.use("/aka", DidAliasRouter());
server.use("/s", ShortUrlRouter());
server.use("/upload", UploadRouter());

server.listen(PORT, () => {
  console.info(`didchat-mediator listening on http://localhost:${PORT}`);
});
