import { PrismaClient } from "@prisma/client";
import { IAgentContext } from "@veramo/core";
import { AbstractMessageHandler, Message } from "@veramo/message-handler";
import * as yup from "yup";

import { DIDChatMediator } from "../setup";
import { createResponseMessage } from "../utils";

enum AuthenticationProtocol {
  REGISTER = "https://didchat.app/authentication/1.0/register",
  REGISTER_RESPONSE = "https://didchat.app/authentication/1.0/register-response",
  LOGIN = "https://didchat.app/authentication/1.0/login",
  LOGIN_RESPONSE = "https://didchat.app/authentication/1.0/login-response",
  ME = "https://didchat.app/authentication/1.0/me",
  ME_RESPONSE = "https://didchat.app/authentication/1.0/me-response",
}

const usernameSchema = yup.string().min(2).max(20).required();
const profileSchema = yup.object({
  displayPicture: yup.string().required(),
  displayName: yup.string().max(30).required(),
  bio: yup.string().max(100).nullable(),
  dateOfBirth: yup.date().nullable(),
  country: yup.string().nullable(),
});

const prisma = new PrismaClient();

export class AuthenticationMessageHandler extends AbstractMessageHandler {
  async handle(
    message: Message,
    context: IAgentContext<DIDChatMediator>
  ): Promise<Message> {
    switch (message.type) {
      case AuthenticationProtocol.REGISTER:
        return this.handleRegister(message, context);
      case AuthenticationProtocol.LOGIN:
        return this.handleLogin(message, context);
      case AuthenticationProtocol.ME:
        return this.handleMe(message, context);
      default:
        break;
    }

    return super.handle(message, context);
  }

  async handleRegister(
    message: Message,
    context: IAgentContext<DIDChatMediator>
  ): Promise<Message> {
    const { id, from, to, data } = message;
    const { username, profile } = data ?? {};

    if (!username || !profile) {
      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: AuthenticationProtocol.REGISTER_RESPONSE,
              thid: id,
              body: {
                result: "client_error",
                error: "No profile data provided",
              },
            },
            context
          )
        ),
      });

      return message;
    }

    if (!usernameSchema.isValidSync(username)) {
      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: AuthenticationProtocol.REGISTER_RESPONSE,
              thid: id,
              body: {
                result: "client_error",
                error: "Invalid username provided",
              },
            },
            context
          )
        ),
      });

      return message;
    }

    const usernameExists = await prisma.user.count({
      where: {
        username,
      },
    });

    if (usernameExists > 0) {
      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: AuthenticationProtocol.REGISTER_RESPONSE,
              thid: id,
              body: {
                result: "client_error",
                error: "Username already exists",
              },
            },
            context
          )
        ),
      });

      return message;
    }

    if (!profileSchema.isValidSync(profile)) {
      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: AuthenticationProtocol.REGISTER_RESPONSE,
              thid: id,
              body: {
                result: "client_error",
                error: "Invalid profile data provided",
              },
            },
            context
          )
        ),
      });

      return message;
    }

    try {
      const createPostPrivilege = await prisma.privilege.findFirst({
        where: {
          name: "create-post",
        },
      });

      if (!createPostPrivilege) {
        message.addMetaData({
          type: "ReturnRouteResponse",
          value: JSON.stringify(
            await createResponseMessage(
              {
                from: to!,
                to: from!,
                type: AuthenticationProtocol.REGISTER_RESPONSE,
                thid: id,
                body: {
                  result: "server_error",
                  error: "Privilege create-post not found, contact support",
                },
              },
              context
            )
          ),
        });

        return message;
      }

      await prisma.user.create({
        data: {
          did: from!,
          username,
          profile: {
            create: profile,
          },
          privileges: {
            create: [
              {
                privilegeId: createPostPrivilege.id,
              },
            ],
          },
        },
      });

      const user = await prisma.user.findUnique({
        where: {
          did: from!,
          username,
        },
        include: {
          profile: true,
        },
      });

      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: AuthenticationProtocol.REGISTER_RESPONSE,
              thid: id,
              body: {
                result: "success",
                user,
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
              type: AuthenticationProtocol.REGISTER_RESPONSE,
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

  async handleLogin(
    message: Message,
    context: IAgentContext<DIDChatMediator>
  ): Promise<Message> {
    return message;
  }

  async handleMe(
    message: Message,
    context: IAgentContext<DIDChatMediator>
  ): Promise<Message> {
    const { id, from, to, data } = message;

    const user = await prisma.user.findUnique({
      where: {
        did: from!,
      },
      include: {
        profile: true,
        privileges: {
          include: {
            privilege: true,
          },
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
              type: AuthenticationProtocol.ME_RESPONSE,
              thid: id,
              body: {
                result: "not_found",
                error: "User not found",
              },
            },
            context
          )
        ),
      });

      return message;
    }

    message.addMetaData({
      type: "ReturnRouteResponse",
      value: JSON.stringify(
        await createResponseMessage(
          {
            from: to!,
            to: from!,
            type: AuthenticationProtocol.ME_RESPONSE,
            thid: id,
            body: {
              result: "success",
              user: {
                ...user,
                privileges: user.privileges.map((p) => p.privilege),
              },
            },
          },
          context
        )
      ),
    });

    return message;
  }
}
