import "dotenv/config";
import {
  MessagingRouter,
  RequestWithAgentRouter,
  WebDidDocRouter,
} from "@veramo/remote-server";
import express from "express";
import expressWs from "express-ws";
import morgan from "morgan";

import { MessageRelayRouter } from "./agent/plugins";
import { createAgent } from "./agent/setup";
import { makeDebug } from "./utils";

const debug = makeDebug("main");

const PORT = process.env.PORT ?? 3000;

const server = express();
expressWs(server);

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

server.use("/message-relay", MessageRelayRouter());

server.listen(PORT, () => {
  debug(`server listening on :${PORT}`);
});
