import type {
  IDIDManager,
  IResolver,
  IKeyManager,
  TAgent,
  IAgentPlugin,
  IMessageHandler,
  IDataStore,
  IDataStoreORM,
} from "@veramo/core";
import { createAgent as createVeramoAgent } from "@veramo/core";
import {
  Entities,
  KeyStore,
  DIDStore,
  PrivateKeyStore,
  migrations,
  DataStore,
  DataStoreORM,
} from "@veramo/data-store";
import type { IDIDComm } from "@veramo/did-comm";
import {
  DIDComm,
  DIDCommMessageHandler,
  CoordinateMediationV3MediatorMessageHandler,
  PickupMediatorMessageHandler,
  TrustPingMessageHandler,
  RoutingMessageHandler,
} from "@veramo/did-comm";
import { DIDManager } from "@veramo/did-manager";
import {
  PeerDIDProvider,
  getResolver as peerDidResolver,
} from "@veramo/did-provider-peer";
import { WebDIDProvider } from "@veramo/did-provider-web";
import { getDidKeyResolver as keyDidResolver } from "@veramo/did-provider-key";
import { DIDResolverPlugin } from "@veramo/did-resolver";
import { KeyManager } from "@veramo/key-manager";
import { KeyManagementSystem, SecretBox } from "@veramo/kms-local";
import {
  KeyValueStore,
  KeyValueTypeORMStoreAdapter,
  kvStoreMigrations,
  Entities as KVEntities,
} from "@veramo/kv-store";
import type { IKeyValueStore } from "@veramo/kv-store";
import type {
  IMediationManager,
  MediationResponse,
  PreMediationRequestPolicy,
  RequesterDid,
} from "@veramo/mediation-manager";
import { MediationManagerPlugin } from "@veramo/mediation-manager";
import { MessageHandler } from "@veramo/message-handler";
import { Resolver } from "did-resolver";
import { DataSource } from "typeorm";
import { getResolver as webDidResolver } from "web-did-resolver";
import {
  ShortenUrlMessageHandler,
  UnhandledMessageHandler,
} from "./message-handlers";
import {
  ISubscribePlugin,
  IShortenUrlPlugin,
  SubscribePlugin,
  ShortenUrlPlugin,
  IDidAliasPlugin,
  DidAliasPlugin,
} from "./plugins";

export type DIDChatMediator = IDIDManager &
  IKeyManager &
  IResolver &
  IMessageHandler &
  IKeyValueStore<any> &
  IDIDComm &
  IMediationManager &
  IShortenUrlPlugin &
  IDidAliasPlugin &
  ISubscribePlugin &
  IDataStore &
  IDataStoreORM;

const KMS_SECRET = process.env.KMS_SECRET ?? "";
const DID_ALIAS = process.env.DID_ALIAS ?? "";

const provider = "did:web";

const dbConnection = new DataSource({
  type: "postgres",
  schema: "public",
  host: process.env.DATABASE_HOST,
  port: parseInt(process.env.DATABASE_PORT ?? ""),
  username: process.env.DATABASE_USER,
  password: process.env.DATABASE_PASS,
  database: process.env.DATABASE_NAME_TYPEORM,
  synchronize: false,
  migrations: migrations.concat(kvStoreMigrations),
  migrationsRun: true,
  logging: ["error", "info", "warn"],
  entities: (KVEntities as any).concat(Entities),
}).initialize();

const policyStore: any = new KeyValueStore<PreMediationRequestPolicy>({
  namespace: "mediation_policy",
  store: new KeyValueTypeORMStoreAdapter({
    dbConnection,
    namespace: "mediation_policy",
  }),
});

const mediationStore: any = new KeyValueStore<MediationResponse>({
  namespace: "mediation_response",
  store: new KeyValueTypeORMStoreAdapter({
    dbConnection,
    namespace: "mediation_response",
  }),
});

const recipientDidStore: any = new KeyValueStore<RequesterDid>({
  namespace: "recipient_did",
  store: new KeyValueTypeORMStoreAdapter({
    dbConnection,
    namespace: "recipient_did",
  }),
});

const shortenUrlStore: any = new KeyValueStore<string>({
  namespace: "shorten_url",
  store: new KeyValueTypeORMStoreAdapter({
    dbConnection,
    namespace: "shorten_url",
  }),
});

const didAliasStore: any = new KeyValueStore<string>({
  namespace: "did_alias",
  store: new KeyValueTypeORMStoreAdapter({
    dbConnection,
    namespace: "did_alias",
  }),
});

const isMediateDefaultGrantAll = true;

const plugins: IAgentPlugin[] = [
  new DataStore(dbConnection),
  new DataStoreORM(dbConnection),
  new KeyManager({
    store: new KeyStore(dbConnection),
    kms: {
      local: new KeyManagementSystem(
        new PrivateKeyStore(dbConnection, new SecretBox(KMS_SECRET))
      ),
    },
  }),
  new DIDManager({
    store: new DIDStore(dbConnection),
    defaultProvider: provider,
    providers: {
      "did:web": new WebDIDProvider({ defaultKms: "local" }),
      "did:peer": new PeerDIDProvider({ defaultKms: "local" }),
    },
  }),
  new DIDResolverPlugin({
    resolver: new Resolver({
      ...webDidResolver(),
      ...keyDidResolver(),
      ...peerDidResolver(),
    }),
  }),
  new DIDComm(),
  new MessageHandler({
    messageHandlers: [
      new DIDCommMessageHandler(),
      new CoordinateMediationV3MediatorMessageHandler(),
      new PickupMediatorMessageHandler(),
      new RoutingMessageHandler(),
      new ShortenUrlMessageHandler(),
      new TrustPingMessageHandler(),
      new UnhandledMessageHandler(),
    ],
  }),
  new MediationManagerPlugin(
    isMediateDefaultGrantAll,
    policyStore,
    mediationStore,
    recipientDidStore
  ),
  new ShortenUrlPlugin(shortenUrlStore),
  new DidAliasPlugin(didAliasStore),
  new SubscribePlugin(),
];

export async function createAgent(): Promise<TAgent<DIDChatMediator>> {
  const agent: TAgent<DIDChatMediator> = createVeramoAgent<DIDChatMediator>({
    plugins,
  });

  try {
    await agent.didManagerGetByAlias({
      alias: DID_ALIAS,
      provider,
    });

    return agent;
  } catch (e: any) {
    console.error(e);

    if (e?.message !== "Identifier not found") {
      throw new Error("Could not initialize mediator.");
    }
  }

  try {
    const did = await agent.didManagerCreate({
      alias: DID_ALIAS,
      provider,
    });

    const ed25519Key = await agent.keyManagerCreate({
      type: "Ed25519",
      kms: "local",
    });

    const x25519Key = await agent.keyManagerCreate({
      type: "X25519",
      kms: "local",
    });

    await agent.didManagerAddKey({
      did: did.did,
      key: ed25519Key,
    });

    await agent.didManagerAddKey({
      did: did.did,
      key: x25519Key,
    });

    await agent.didManagerAddService({
      did: did.did,
      service: {
        id: `${did.did}#didcomm`,
        type: "DIDCommMessaging",
        serviceEndpoint: {
          uri: `https://${DID_ALIAS}/messaging`,
          accept: ["didcomm/v2", "didcomm/aip2;env=rfc587"],
        },
      },
    });
  } catch (e) {
    console.error("could not init mediator", e);
  }

  return agent;
}
