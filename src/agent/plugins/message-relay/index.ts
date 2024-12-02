import { IAgentPlugin, IEventListener, IPluginMethodMap } from "@veramo/core";
import {
  CoordinateMediation,
  DIDCommMessageMediaType,
  IPackedDIDCommMessage,
} from "@veramo/did-comm";
import { v4 } from "uuid";

import { DIDChatMediatorAgentContext } from "../../../types";
import { makeDebug } from "../../../utils";
import { makeDIDCommMessage, packDIDCommMessage } from "../../utils";

const debug = makeDebug("message-relay-plugin");

type RelayFunction = (
  packedDeliveryMessage: IPackedDIDCommMessage,
  attachmentCount: number
) => void;

export interface IMessageRelayPlugin extends IPluginMethodMap {
  addMessageRelayClient(args: {
    id: string;
    relayFn: RelayFunction;
  }): Promise<void>;
  removeMessageRelayClient(args: { id: string }): Promise<void>;
}

const MESSAGE_RECEIVED = "DIDCommV2Message-received";
const FORWARD_MESSAGE_QUEUED_EVENT = "DIDCommV2Message-forwardMessageQueued";
const DELIVERY_MESSAGE_TYPE = "https://didcomm.org/messagepickup/3.0/delivery";
const DID_ALIAS = process.env.DID_ALIAS ?? "";

export default class MessageRelayPlugin
  implements IAgentPlugin, IEventListener
{
  readonly eventTypes: string[];
  readonly methods: IMessageRelayPlugin;

  private clients: Map<string, RelayFunction>;
  private queuedMessages: Map<string, [string, string][]>;
  private timers: Map<string, NodeJS.Timeout>;

  constructor() {
    this.clients = new Map();
    this.queuedMessages = new Map();
    this.timers = new Map();

    this.eventTypes = [MESSAGE_RECEIVED, FORWARD_MESSAGE_QUEUED_EVENT];

    this.methods = {
      addMessageRelayClient: this.addMessageRelayClient.bind(this),
      removeMessageRelayClient: this.removeMessageRelayClient.bind(this),
    };
  }

  public async onEvent(
    event: { type: string; data: any },
    context: DIDChatMediatorAgentContext
  ): Promise<void> {
    if (event.type === FORWARD_MESSAGE_QUEUED_EVENT) {
      if (!event.data?.to || !event.data.id || !event.data?.raw) {
        return;
      }

      const { id, to, raw } = event.data;
      const [recipientDid] = to.split("#");

      if (!recipientDid || !this.clients.has(recipientDid)) {
        return;
      }

      this.queueMessage(recipientDid, to, id, raw, context);
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
        debug(`received recipient update from ${message.from}`);

        await Promise.all(
          message.body.updates.map(async ({ action, recipient_did }) => {
            if (action === "add" && this.clients.has(message.from)) {
              const relayFn = this.clients.get(message.from);

              if (!relayFn) {
                return;
              }

              await this.addMessageRelayClient(
                {
                  id: recipient_did,
                  relayFn,
                },
                context
              );
            } else if (action === "remove" && this.clients.has(recipient_did)) {
              await this.removeMessageRelayClient({
                id: recipient_did,
              });
            }
          })
        );
      }
    }
  }

  public async addMessageRelayClient(
    args: {
      id: string;
      relayFn: RelayFunction;
    },
    context: DIDChatMediatorAgentContext
  ) {
    const { id, relayFn } = args;

    debug("adding client", id);

    if (!this.clients.has(id)) {
      this.clients.set(id, relayFn);
    }
  }

  public async removeMessageRelayClient(args: { id: string }) {
    debug("removing client", args.id);

    if (this.clients.has(args.id)) {
      this.clients.delete(args.id);
    }

    if (this.queuedMessages.has(args.id)) {
      this.queuedMessages.delete(args.id);
    }
  }

  private async queueMessage(
    recipientDid: string,
    recipientKey: string,
    id: string,
    raw: string,
    context: DIDChatMediatorAgentContext
  ) {
    if (!this.clients.has(recipientDid)) {
      // TODO: Produce message to messagepickup topic
      return;
    }

    if (!this.queuedMessages.has(recipientDid)) {
      this.queuedMessages.set(recipientDid, []);
    }

    const queuedMessages = this.queuedMessages.get(recipientDid);

    if (!queuedMessages) {
      return;
    }

    queuedMessages.push([id, raw]);

    debug(
      `queued message for ${recipientDid}. Queue size: ${queuedMessages?.length}`
    );

    if (queuedMessages.length >= 5) {
      await this.sendQueuedMessages(recipientDid, recipientKey, context);
      return;
    }

    if (this.timers.has(recipientDid)) {
      clearTimeout(this.timers.get(recipientDid)!);
    }

    this.timers.set(
      recipientDid,
      setTimeout(async () => {
        await this.sendQueuedMessages(recipientDid, recipientKey, context);
      }, 300)
    );
  }

  private async sendQueuedMessages(
    recipientDid: string,
    recipientKey: string,
    context: DIDChatMediatorAgentContext
  ) {
    const mainQueue = this.queuedMessages.get(recipientDid);

    if (!mainQueue || mainQueue.length === 0) {
      return;
    }

    const processingQueue = [...mainQueue];
    this.queuedMessages.set(recipientDid, []);

    const deliveryMessage = makeDIDCommMessage(
      v4(),
      `did:web:${DID_ALIAS}`,
      recipientDid,
      DELIVERY_MESSAGE_TYPE,
      {
        recipient_key: recipientKey,
      },
      undefined,
      undefined,
      new Date().toISOString(),
      undefined,
      processingQueue.map(([msgId, msgRaw]) => ({
        id: msgId,
        media_type: DIDCommMessageMediaType.ENCRYPTED,
        data: {
          json: JSON.parse(msgRaw),
        },
      }))
    );

    try {
      const packedDeliveryMessage = await packDIDCommMessage(
        deliveryMessage,
        context
      );

      this.clients.get(recipientDid)?.(
        packedDeliveryMessage,
        processingQueue.length
      );

      this.timers.delete(recipientDid);
    } catch (e) {
      console.error("Failed to relay messages", e);
    }
  }
}
