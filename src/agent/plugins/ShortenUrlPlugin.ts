import { IAgentPlugin, IPluginMethodMap } from "@veramo/core";
import { KeyValueStore } from "@veramo/kv-store";

export interface IShortenUrlPlugin extends IPluginMethodMap {
  shortenUrl(args: { id: string; url: string }): Promise<Boolean>;
  shortenedUrlResolve(args: { id: string }): Promise<string>;
  shortenedUrlInvalidate(args: { id: string }): Promise<string>;
}

type TShortUrlsStore = KeyValueStore<string>;

export class ShortenUrlPlugin implements IAgentPlugin {
  private readonly store: TShortUrlsStore;
  readonly methods: IShortenUrlPlugin;

  constructor(store: TShortUrlsStore) {
    this.store = store;

    this.methods = {
      shortenUrl: this.shortenUrl.bind(this),
      shortenedUrlResolve: this.shortenedUrlResolve.bind(this),
      shortenedUrlInvalidate: this.shortenedUrlInvalidate.bind(this),
    };
  }

  public async shortenUrl(args: { id: string; url: string }): Promise<Boolean> {
    const exists = await this.store.get(args.id);

    if (exists) {
      throw new Error("ID is already taken.");
    }

    await this.store.set(args.id, args.url);

    return true;
  }

  public async shortenedUrlResolve(args: { id: string }): Promise<string> {
    const shortenedUrl = await this.store.get(args.id);

    if (!shortenedUrl) {
      return "";
    }

    return shortenedUrl;
  }

  public async shortenedUrlInvalidate(args: { id: string }): Promise<Boolean> {
    return this.store.delete(args.id);
  }
}
