import debug from "debug";

export const makeDebug = (namespace: string) =>
  debug(`didchat-mediator:${namespace}`);
