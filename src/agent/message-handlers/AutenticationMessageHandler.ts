import { PrismaClient } from "@prisma/client";
import { IAgentContext } from "@veramo/core";
import { AbstractMessageHandler, Message } from "@veramo/message-handler";
import * as yup from "yup";

import { DIDChatMediator } from "../setup";
import { DIDCommMessageMediaType } from "@veramo/did-comm";

enum AuthenticationProtocol {
  REGISTER = "https://didchat.app/authentication/1.0/register",
  REGISTER_RESPONSE = "https://didchat.app/authentication/1.0/register-response",
  LOGIN = "https://didchat.app/authentication/1.0/login",
  LOGIN_RESPONSE = "https://didchat.app/authentication/1.0/login-response",
}

const usernameSchema = yup.string().min(2).max(15).required();
const profileSchema = yup.object({
  displayPicture: yup.string().required(),
  displayName: yup.string().max(20).required(),
  bio: yup.string().max(80).nullable(),
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
          await createRegisterResponseMessage(
            {
              from: to!,
              to: from!,
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
          await createRegisterResponseMessage(
            {
              from: to!,
              to: from!,
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
          await createRegisterResponseMessage(
            {
              from: to!,
              to: from!,
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
          await createRegisterResponseMessage(
            {
              from: to!,
              to: from!,
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
      await prisma.user.create({
        data: {
          did: from!,
          username,
          profile: {
            create: profile,
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
          await createRegisterResponseMessage(
            {
              from: to!,
              to: from!,
              thid: id,
              body: {
                result: "success",
                user,
                token: "TODO",
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
          await createRegisterResponseMessage(
            {
              from: to!,
              to: from!,
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
}

async function createRegisterResponseMessage(
  data: { from: string; to: string; thid: string; body: any },
  context: IAgentContext<DIDChatMediator>
) {
  const message = {
    id: crypto.randomUUID(),
    thid: data.thid,
    type: AuthenticationProtocol.REGISTER_RESPONSE,
    from: data.from,
    to: data.to,
    body: data.body,
    created_time: new Date().toISOString(),
  };

  const packedMessage = await context.agent.packDIDCommMessage({
    message,
    packing: "authcrypt",
  });

  return {
    id: message.id,
    message: packedMessage.message,
    contentType: DIDCommMessageMediaType.ENCRYPTED,
  };
}
