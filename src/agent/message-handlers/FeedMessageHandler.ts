import { PrismaClient, ReactionType } from "@prisma/client";
import { IAgentContext } from "@veramo/core";
import { AbstractMessageHandler, Message } from "@veramo/message-handler";
import * as yup from "yup";

import { DIDChatMediator } from "../setup";
import { createResponseMessage } from "../utils";

enum FeedProtocol {
  GET = "https://didchat.app/feed/1.0/get",
  GET_RESPONSE = "https://didchat.app/feed/1.0/get-response",
  GET_POST = "https://didchat.app/feed/1.0/get-post",
  GET_POST_RESPONSE = "https://didchat.app/feed/1.0/get-post-response",
  POST = "https://didchat.app/feed/1.0/post",
  POST_RESPONSE = "https://didchat.app/feed/1.0/post-response",
  REPOST = "https://didchat.app/feed/1.0/repost",
  REPOST_RESPONSE = "https://didchat.app/feed/1.0/repost-response",
  QUOTE = "https://didchat.app/feed/1.0/quote",
  QUOTE_RESPONSE = "https://didchat.app/feed/1.0/quote-response",
  REACT = "https://didchat.app/feed/1.0/react",
  REACT_RESPONSE = "https://didchat.app/feed/1.0/react-response",
  REPLY = "https://didchat.app/feed/1.0/reply",
  REPLY_RESPONSE = "https://didchat.app/feed/1.0/reply-response",
}

interface FeedProtocolParams {
  [FeedProtocol.GET]: {
    username?: string;
    take?: number;
    cursor?: string;
  };
  [FeedProtocol.POST]: {
    body?: string;
    media?: string[];
  };
  [FeedProtocol.REACT]: {
    postId: string;
    reaction: ReactionType;
  };
  [FeedProtocol.REPOST]: {
    postId: string;
  };
  [FeedProtocol.QUOTE]: {
    postId: string;
    body?: string;
    media?: string[];
  };
  [FeedProtocol.REPLY]: {
    postId: string;
    body?: string;
    media?: string[];
  };
  [key: string]: unknown;
}

type FeedMessageType<T extends string> = Message & {
  type: T;
  data: FeedProtocolParams[T];
};

type FeedMessage = FeedMessageType<FeedProtocol>;

const prisma = new PrismaClient();

export class FeedMessageHandler extends AbstractMessageHandler {
  async handle(
    message: FeedMessage,
    context: IAgentContext<DIDChatMediator>
  ): Promise<Message> {
    switch (message.type) {
      case FeedProtocol.GET:
        return this.handleGet(message, context);
      case FeedProtocol.POST:
        return this.handlePost(message, context);
      case FeedProtocol.REPOST:
        return this.handleRepost(message, context);
      case FeedProtocol.QUOTE:
        return this.handleQuote(message, context);
      case FeedProtocol.REACT:
        return this.handleReact(message, context);
      case FeedProtocol.REPLY:
        return this.handleReply(message, context);
      default:
        break;
    }

    return super.handle(message, context);
  }

  async handleGet(
    message: FeedMessage,
    context: IAgentContext<DIDChatMediator>
  ) {
    if (message.type !== FeedProtocol.GET) {
      return message;
    }

    const { id, from, to, data } = message;
    const { username, take, cursor } =
      data as FeedProtocolParams[FeedProtocol.GET];

    if (username) {
      try {
        const user = await prisma.user.findUnique({
          where: { did: from },
        });

        if (!user) {
          message.addMetaData({
            type: "ReturnRouteResponse",
            value: JSON.stringify(
              await createResponseMessage(
                {
                  from: to!,
                  to: from!,
                  type: FeedProtocol.REACT_RESPONSE,
                  thid: id,
                  body: {
                    result: "client_error",
                    error: "Request user not found",
                  },
                },
                context
              )
            ),
          });

          return message;
        }

        const feedUser = await prisma.user.findUnique({
          where: { username },
          include: {
            profile: true,
            posts: {
              take: take ?? 20,
              skip: cursor ? 1 : 0,
              cursor: cursor
                ? {
                    id: cursor ?? undefined,
                  }
                : undefined,
              orderBy: {
                createdAt: "desc",
              },
              include: {
                _count: {
                  select: {
                    replies: true,
                    reactions: true,
                    reposts: true,
                    quotes: true,
                    annotations: true,
                  },
                },
                media: true,
                replies: {
                  include: {
                    user: {
                      include: {
                        profile: true,
                      },
                    },
                  },
                  take: 2,
                },
                reposts: {
                  where: {
                    userId: user.id,
                  },
                  include: {
                    user: true,
                  },
                },
                repostedPost: {
                  include: {
                    _count: {
                      select: {
                        replies: true,
                        reactions: true,
                        reposts: true,
                        quotes: true,
                        annotations: true,
                      },
                    },
                    media: true,
                    reactions: true,
                    reposts: {
                      where: {
                        userId: user.id,
                      },
                      include: {
                        user: true,
                      },
                    },
                    user: {
                      include: {
                        profile: true,
                      },
                    },
                  },
                },
                reactions: true,
                user: true,
              },
            },
          },
        });

        if (!feedUser) {
          message.addMetaData({
            type: "ReturnRouteResponse",
            value: JSON.stringify(
              await createResponseMessage(
                {
                  from: to!,
                  to: from!,
                  type: FeedProtocol.GET_RESPONSE,
                  thid: id,
                  body: {
                    result: "client_error",
                    error: "User not found",
                  },
                },
                context
              )
            ),
          });

          return message;
        }

        const posts = feedUser.posts.map((p) => ({
          ...p,
          media: p.media.map((m) => ({
            type: m.type,
            url: m.url,
            thumbnailUrl: m.thumbnailUrl,
            width: m.width,
            height: m.height,
            order: m.order,
          })),
          user: {
            id: user.id,
            username: user.username,
            profile: {
              displayName: feedUser.profile?.displayName,
              displayPicture: feedUser.profile?.displayPicture,
            },
          },
        }));

        message.addMetaData({
          type: "ReturnRouteResponse",
          value: JSON.stringify(
            await createResponseMessage(
              {
                from: to!,
                to: from!,
                type: FeedProtocol.GET_RESPONSE,
                thid: id,
                body: {
                  result: "success",
                  posts,
                },
              },
              context
            )
          ),
        });

        return message;
      } catch (e) {
        message.addMetaData({
          type: "ReturnRouteResponse",
          value: JSON.stringify(
            await createResponseMessage(
              {
                from: to!,
                to: from!,
                type: FeedProtocol.GET_RESPONSE,
                thid: id,
                body: {
                  result: "client_error",
                  error: e.message,
                },
              },
              context
            )
          ),
        });

        return message;
      }
    }

    try {
      const user = await prisma.user.findUnique({
        where: { did: from },
      });

      if (!user) {
        message.addMetaData({
          type: "ReturnRouteResponse",
          value: JSON.stringify(
            await createResponseMessage(
              {
                from: to!,
                to: from!,
                type: FeedProtocol.REACT_RESPONSE,
                thid: id,
                body: {
                  result: "client_error",
                  error: "Request user not found",
                },
              },
              context
            )
          ),
        });

        return message;
      }

      const posts = await prisma.post.findMany({
        take: take ?? 20,
        skip: cursor ? 1 : 0,
        cursor: cursor
          ? {
              id: cursor,
            }
          : undefined,
        orderBy: {
          createdAt: "desc",
        },
        include: {
          _count: {
            select: {
              replies: true,
              reactions: true,
              reposts: true,
              quotes: true,
              annotations: true,
            },
          },
          media: true,
          replies: {
            include: {
              user: {
                include: {
                  profile: true,
                },
              },
            },
            take: 2,
          },
          reposts: {
            where: {
              userId: user.id,
            },
            include: {
              user: true,
            },
          },
          repostedPost: {
            include: {
              _count: {
                select: {
                  replies: true,
                  reactions: true,
                  reposts: true,
                  quotes: true,
                  annotations: true,
                },
              },
              media: true,
              reactions: true,
              reposts: {
                where: {
                  userId: user.id,
                },
                include: {
                  user: true,
                },
              },
              user: {
                include: {
                  profile: true,
                },
              },
            },
          },
          reactions: true,
          user: {
            include: {
              profile: true,
            },
          },
        },
      });

      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: FeedProtocol.GET_RESPONSE,
              thid: id,
              body: {
                result: "success",
                posts: posts.map((p) => ({
                  ...p,
                  media: p.media.map((m) => ({
                    type: m.type,
                    url: m.url,
                    thumbnailUrl: m.thumbnailUrl,
                    width: m.width,
                    height: m.height,
                    order: m.order,
                  })),
                  user: {
                    id: p.user.id,
                    username: p.user.username,
                    profile: {
                      displayName: p.user.profile?.displayName,
                      displayPicture: p.user.profile?.displayPicture,
                    },
                  },
                })),
              },
            },
            context
          )
        ),
      });

      return message;
    } catch (e: any) {
      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: FeedProtocol.GET_RESPONSE,
              thid: id,
              body: {
                result: "server_error",
                error: e.message,
              },
            },
            context
          )
        ),
      });

      return message;
    }
  }

  async handlePost(
    message: FeedMessage,
    context: IAgentContext<DIDChatMediator>
  ) {
    if (message.type !== FeedProtocol.POST) {
      return message;
    }

    const { id, from, to, data } = message;
    const { body, media } = data as FeedProtocolParams[FeedProtocol.POST];

    if (!body && !media) {
      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: FeedProtocol.POST_RESPONSE,
              thid: id,
              body: {
                result: "client_error",
                error: "No body or media provided",
              },
            },
            context
          )
        ),
      });

      return message;
    }

    try {
      const user = await prisma.user.findUnique({
        where: { did: from },
        include: {
          privileges: {
            include: { privilege: true },
          },
        },
      });

      if (!user) {
        message.addMetaData({
          type: "ReturnRouteResponse",
          value: JSON.stringify(
            await createResponseMessage(
              {
                from: to!,
                to: from!,
                type: FeedProtocol.POST_RESPONSE,
                thid: id,
                body: {
                  result: "client_error",
                  error: "User not found",
                },
              },
              context
            )
          ),
        });

        return message;
      }

      if (user.privileges.every((p) => p.privilege.name !== "create-post")) {
        message.addMetaData({
          type: "ReturnRouteResponse",
          value: JSON.stringify(
            await createResponseMessage(
              {
                from: to!,
                to: from!,
                type: FeedProtocol.POST_RESPONSE,
                thid: id,
                body: {
                  result: "client_error",
                  error: "Your privilege to create posts has been revoked",
                },
              },
              context
            )
          ),
        });

        return message;
      }

      if (body) {
        const maxLength = user.privileges.reduce((acc, p) => {
          if (p.privilege.name === "create-extended-post") {
            return 300;
          }

          if (p.privilege.name === "create-lengthy-post") {
            return 1000;
          }

          return acc;
        }, 150);

        const bodySchema = yup.string().max(maxLength).required();

        if (!bodySchema.isValidSync(body)) {
          message.addMetaData({
            type: "ReturnRouteResponse",
            value: JSON.stringify(
              await createResponseMessage(
                {
                  from: to!,
                  to: from!,
                  type: FeedProtocol.POST_RESPONSE,
                  thid: id,
                  body: {
                    result: "client_error",
                    error: "Post body is too long",
                  },
                },
                context
              )
            ),
          });

          return message;
        }
      }

      if (media) {
        const mediaSchema = yup.array().of(yup.string().required());

        if (!mediaSchema.isValidSync(media)) {
          message.addMetaData({
            type: "ReturnRouteResponse",
            value: JSON.stringify(
              await createResponseMessage(
                {
                  from: to!,
                  to: from!,
                  type: FeedProtocol.POST_RESPONSE,
                  thid: id,
                  body: {
                    result: "client_error",
                    error: "Invalid media provided",
                  },
                },
                context
              )
            ),
          });

          return message;
        }
      }

      const post = await prisma.post.create({
        data: {
          body,
          media:
            media && media.length > 0
              ? {
                  connect: media.map((id) => ({
                    id,
                  })),
                }
              : undefined,
          user: {
            connect: { id: user.id },
          },
        },
      });

      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: FeedProtocol.POST_RESPONSE,
              thid: id,
              body: {
                result: "success",
                post,
              },
            },
            context
          )
        ),
      });

      return message;
    } catch (e) {
      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: FeedProtocol.POST_RESPONSE,
              thid: id,
              body: {
                result: "client_error",
                error: e.message,
              },
            },
            context
          )
        ),
      });

      return message;
    }
  }

  async handleRepost(
    message: Message,
    context: IAgentContext<DIDChatMediator>
  ) {
    if (message.type !== FeedProtocol.REPOST) {
      return message;
    }

    const { id, from, to, data } = message;
    const { postId } = data as FeedProtocolParams[FeedProtocol.REPOST];

    if (!postId) {
      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: FeedProtocol.REPOST_RESPONSE,
              thid: id,
              body: {
                result: "client_error",
                error: "No post provided",
              },
            },
            context
          )
        ),
      });

      return message;
    }

    try {
      const user = await prisma.user.findUnique({
        where: { did: from },
      });

      if (!user) {
        message.addMetaData({
          type: "ReturnRouteResponse",
          value: JSON.stringify(
            await createResponseMessage(
              {
                from: to!,
                to: from!,
                type: FeedProtocol.REPOST_RESPONSE,
                thid: id,
                body: {
                  result: "client_error",
                  error: "Request user not found",
                },
              },
              context
            )
          ),
        });

        return message;
      }

      const post = await prisma.post.findUnique({
        where: { id: postId },
        include: {
          reposts: {
            where: {
              userId: user.id,
            },
          },
        },
      });

      if (!post) {
        message.addMetaData({
          type: "ReturnRouteResponse",
          value: JSON.stringify(
            await createResponseMessage(
              {
                from: to!,
                to: from!,
                type: FeedProtocol.REPOST_RESPONSE,
                thid: id,
                body: {
                  result: "client_error",
                  error: "Post not found",
                },
              },
              context
            )
          ),
        });

        return message;
      }

      if (post.reposts.length > 0) {
        message.addMetaData({
          type: "ReturnRouteResponse",
          value: JSON.stringify(
            await createResponseMessage(
              {
                from: to!,
                to: from!,
                type: FeedProtocol.REPOST_RESPONSE,
                thid: id,
                body: {
                  result: "success",
                  repost: null,
                },
              },
              context
            )
          ),
        });

        return message;
      }

      const createdRepost = await prisma.post.create({
        data: {
          repostedPost: {
            connect: { id: postId },
          },
          user: {
            connect: { id: user.id },
          },
        },
      });

      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: FeedProtocol.REPOST_RESPONSE,
              thid: id,
              body: {
                result: "success",
                repost: createdRepost,
              },
            },
            context
          )
        ),
      });
    } catch (e: any) {
      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: FeedProtocol.REPOST_RESPONSE,
              thid: id,
              body: {
                result: "server_error",
                error: e.message,
              },
            },
            context
          )
        ),
      });
    }

    return message;
  }

  async handleQuote(message: Message, context: IAgentContext<DIDChatMediator>) {
    if (message.type !== FeedProtocol.QUOTE) {
      return message;
    }

    const { id, from, to, data } = message;
    const { postId, body, media } =
      data as FeedProtocolParams[FeedProtocol.QUOTE];

    if (!postId) {
      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: FeedProtocol.QUOTE_RESPONSE,
              thid: id,
              body: {
                result: "client_error",
                error: "No post provided",
              },
            },
            context
          )
        ),
      });

      return message;
    }

    return message;
  }

  async handleReact(message: Message, context: IAgentContext<DIDChatMediator>) {
    if (message.type !== FeedProtocol.REACT) {
      return message;
    }

    const { id, from, to, data } = message;
    const { postId, reaction } = data as FeedProtocolParams[FeedProtocol.REACT];

    if (!postId || !reaction) {
      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: FeedProtocol.REACT_RESPONSE,
              thid: id,
              body: {
                result: "client_error",
                error: "No post or reaction provided",
              },
            },
            context
          )
        ),
      });

      return message;
    }

    if (!Object.values(ReactionType).includes(reaction)) {
      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: FeedProtocol.REACT_RESPONSE,
              thid: id,
              body: {
                result: "client_error",
                error: "Invalid reaction provided",
              },
            },
            context
          )
        ),
      });

      return message;
    }

    try {
      const user = await prisma.user.findUnique({
        where: { did: from },
      });

      if (!user) {
        message.addMetaData({
          type: "ReturnRouteResponse",
          value: JSON.stringify(
            await createResponseMessage(
              {
                from: to!,
                to: from!,
                type: FeedProtocol.REACT_RESPONSE,
                thid: id,
                body: {
                  result: "client_error",
                  error: "Request user not found",
                },
              },
              context
            )
          ),
        });

        return message;
      }

      const post = await prisma.post.findUnique({
        where: { id: postId },
        include: {
          reactions: {
            where: {
              userId: user.id,
            },
          },
        },
      });

      if (!post) {
        message.addMetaData({
          type: "ReturnRouteResponse",
          value: JSON.stringify(
            await createResponseMessage(
              {
                from: to!,
                to: from!,
                type: FeedProtocol.REACT_RESPONSE,
                thid: id,
                body: {
                  result: "client_error",
                  error: "Post not found",
                },
              },
              context
            )
          ),
        });

        return message;
      }

      if (post.reactions.length > 0) {
        await prisma.reaction.deleteMany({
          where: {
            postId,
            userId: user.id,
          },
        });

        if (post.reactions[0].type === reaction) {
          message.addMetaData({
            type: "ReturnRouteResponse",
            value: JSON.stringify(
              await createResponseMessage(
                {
                  from: to!,
                  to: from!,
                  type: FeedProtocol.REACT_RESPONSE,
                  thid: id,
                  body: {
                    result: "success",
                    reaction: null,
                  },
                },
                context
              )
            ),
          });

          return message;
        }
      }

      const createdReaction = await prisma.reaction.create({
        data: {
          type: reaction,
          post: {
            connect: { id: postId },
          },
          user: {
            connect: { id: user.id },
          },
        },
      });

      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: FeedProtocol.REACT_RESPONSE,
              thid: id,
              body: {
                result: "success",
                reaction: createdReaction,
              },
            },
            context
          )
        ),
      });

      return message;
    } catch (e: any) {
      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: FeedProtocol.REACT_RESPONSE,
              thid: id,
              body: {
                result: "server_error",
                error: e.message,
              },
            },
            context
          )
        ),
      });

      return message;
    }
  }

  async handleReply(message: Message, context: IAgentContext<DIDChatMediator>) {
    return message;
  }
}
