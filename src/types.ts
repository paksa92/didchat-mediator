import {
  IDIDManager,
  IKeyManager,
  IResolver,
  IMessageHandler,
  IDataStore,
  IDataStoreORM,
  TAgent,
  IAgentContext,
} from "@veramo/core";
import { IDIDComm } from "@veramo/did-comm";
import { IKeyValueStore } from "@veramo/kv-store";
import { IMediationManager } from "@veramo/mediation-manager";

import { IMessageRelayPlugin } from "./agent/plugins";

export type DIDChatMediator = IDIDManager &
  IKeyManager &
  IResolver &
  IMessageHandler &
  IKeyValueStore<any> &
  IDIDComm &
  IMediationManager &
  IMessageRelayPlugin &
  IDataStore &
  IDataStoreORM;

export type DIDChatMediatorAgent = TAgent<DIDChatMediator>;

export type DIDChatMediatorAgentContext = IAgentContext<DIDChatMediator>;
