import { IAgentPlugin, IPluginMethodMap } from "@veramo/core";
import { KeyValueStore } from "@veramo/kv-store";

export interface IDidAliasPlugin extends IPluginMethodMap {
  didAliasCreate(args: { alias: string; did: string }): Promise<Boolean>;
  didAliasResolve(args: { alias: string }): Promise<string>;
  didAliasDelete(args: { alias: string }): Promise<Boolean>;
}

type TDidAliasStore = KeyValueStore<string>;

export class DidAliasPlugin implements IAgentPlugin {
  private readonly store: TDidAliasStore;
  readonly methods: IDidAliasPlugin;

  constructor(store: TDidAliasStore) {
    this.store = store;

    this.methods = {
      didAliasCreate: this.didAliasCreate.bind(this),
      didAliasResolve: this.didAliasResolve.bind(this),
      didAliasDelete: this.didAliasDelete.bind(this),
    };
  }

  public async didAliasCreate(args: {
    alias: string;
    did: string;
  }): Promise<Boolean> {
    const exists = await this.store.get(args.alias);

    if (exists) {
      throw new Error("Alias is already taken.");
    }

    await this.store.set(args.alias, args.did);

    return true;
  }

  public async didAliasResolve(args: { alias: string }): Promise<string> {
    const did = await this.store.get(args.alias);

    if (!did) {
      return "";
    }

    return did;
  }

  public async didAliasDelete(args: { alias: string }): Promise<Boolean> {
    return this.store.delete(args.alias);
  }
}
