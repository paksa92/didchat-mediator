import {
  IAgentContext,
  IAgentPlugin,
  IEventListener,
  IPluginMethodMap,
} from "@veramo/core";
import {
  CoordinateMediation,
  DIDCommMessageMediaType,
  IDIDCommMessage,
} from "@veramo/did-comm";
import { v4 } from "uuid";

import { DIDChatMediator } from "../setup";

type SendEventFn = (type: string, data: any) => void;

export interface ISubscribePlugin extends IPluginMethodMap {
  subscribeAddClient(args: {
    id: string;
    sendEvent: SendEventFn;
  }): Promise<void>;
  subscribeRemoveClient(args: { id: string }): Promise<void>;
}

const MESSAGE_RECEIVED = "DIDCommV2Message-received";
const FORWARD_MESSAGE_QUEUED_EVENT = "DIDCommV2Message-forwardMessageQueued";
const DELIVERY_MESSAGE_TYPE = "https://didcomm.org/messagepickup/3.0/delivery";
const DID_ALIAS = process.env.DID_ALIAS ?? "";

export class SubscribePlugin implements IAgentPlugin, IEventListener {
  readonly eventTypes: string[];
  readonly methods: ISubscribePlugin;

  private clients: Record<string, SendEventFn>;
  private recipientDids: Record<string, string>;

  constructor() {
    this.clients = {};
    this.recipientDids = {};
    this.eventTypes = [MESSAGE_RECEIVED, FORWARD_MESSAGE_QUEUED_EVENT];
    this.methods = {
      subscribeAddClient: this.subscribeAddClient.bind(this),
      subscribeRemoveClient: this.subscribeRemoveClient.bind(this),
    };
  }

  public async onEvent(
    event: { type: string; data: any },
    context: IAgentContext<DIDChatMediator>
  ): Promise<void> {
    if (event.type === FORWARD_MESSAGE_QUEUED_EVENT) {
      if (!event.data?.to) {
        return;
      }

      const recipientKey = event.data.to;
      const recipientDid = recipientKey.split("#")[0];

      if (
        this.recipientDids[recipientDid] &&
        this.clients[this.recipientDids[recipientDid]]
      ) {
        const deliveryMsg: IDIDCommMessage = {
          type: DELIVERY_MESSAGE_TYPE,
          from: `did:web:${DID_ALIAS}`,
          to: recipientDid,
          id: v4(),
          thid: event.data.threadId ?? event.data.id,
          created_time: new Date().toISOString(),
          body: {
            recipient_key: recipientKey,
          },
          attachments: [
            {
              id: event.data.id,
              media_type: DIDCommMessageMediaType.ENCRYPTED,
              data: {
                json: JSON.parse(event.data.raw),
              },
            },
          ],
        };

        await context.agent.dataStoreSaveMessage({
          message: {
            id: deliveryMsg.id,
            type: deliveryMsg.type,
            from: deliveryMsg.from,
            to: deliveryMsg.to,
            threadId: deliveryMsg.thid,
            createdAt: deliveryMsg.created_time,
            data: deliveryMsg.body,
          },
        });

        const packedResponse = await context.agent.packDIDCommMessage({
          message: deliveryMsg,
          packing: "authcrypt",
        });

        this.clients[this.recipientDids[recipientDid]](
          "didcomm_message",
          JSON.parse(packedResponse.message)
        );
      }
    } else if (event.type === MESSAGE_RECEIVED) {
      if (!event.data || !event.data.message) {
        return;
      }

      const { message } = event.data;

      if (
        message.type === CoordinateMediation.RECIPIENT_UPDATE &&
        message.from &&
        message.body &&
        message.body.updates
      ) {
        const promises = message.body.updates.map(
          ({ action, recipient_did }) => {
            if (action === "add") {
              return new Promise(async (resolve, reject) => {
                try {
                  await this.subscribeAddClientRecipient({
                    client: message.from,
                    recipient: recipient_did,
                  });
                  resolve(true);
                } catch (e) {
                  console.error("ERROR ADDING CLIENT RECIPIENT", e);
                  reject(e);
                }
              });
            } else if (action === "remove") {
              return new Promise(async (resolve, reject) => {
                try {
                  await this.subscribeRemoveClientRecipient({
                    client: message.from,
                    recipient: recipient_did,
                  });
                  resolve(true);
                } catch (e) {
                  console.log("ERROR REMOVING CLIENT RECIPIENT");
                  reject(e);
                }
              });
            }
          }
        );

        try {
          await Promise.all(promises);
        } catch (e) {
          console.error("ERROR PROCESSING RECIPIENT UPDATE", e);
        }
      }
    }
  }

  public async subscribeAddClient(
    args: {
      id: string;
      sendEvent: SendEventFn;
    },
    context: IAgentContext<DIDChatMediator>
  ) {
    console.log("ADDING CLIENT", args.id);

    if (!this.clients[args.id]) {
      this.clients[args.id] = args.sendEvent;

      const recipientDids =
        await context.agent.mediationManagerListRecipientDids({
          requesterDid: args.id,
        });

      if (recipientDids.length > 0) {
        recipientDids.forEach((recipientDid) => {
          this.subscribeAddClientRecipient({
            client: args.id,
            recipient: recipientDid,
          });
        });
      }
    }
  }

  public async subscribeRemoveClient(args: { id: string }) {
    console.log("REMOVING CLIENT", args.id);

    for (const recipientDid in this.recipientDids) {
      if (this.recipientDids[recipientDid] === args.id) {
        delete this.recipientDids[recipientDid];
      }
    }

    if (this.clients[args.id]) {
      delete this.clients[args.id];
    }
  }

  private async subscribeAddClientRecipient(args: {
    client: string;
    recipient: string;
  }) {
    console.log("ADDING CLIENT RECIPIENT", args.client, args.recipient);

    if (this.clients[args.client]) {
      this.recipientDids[args.recipient] = args.client;
    }
  }

  private async subscribeRemoveClientRecipient(args: {
    client: string;
    recipient: string;
  }) {
    console.log("REMOVING CLIENT RECIPIENT", args.client, args.recipient);

    if (this.clients[args.client]) {
      delete this.recipientDids[args.recipient];
    }
  }
}
