import { PrismaClient } from "@prisma/client";
import { IAgentContext, TAgent } from "@veramo/core";
import { AbstractMessageHandler, Message } from "@veramo/message-handler";
import * as yup from "yup";

import { DIDChatMediator } from "../setup";
import { createResponseMessage } from "../utils";

enum UserProfileProtocol {
  GET_BY_USERNAME = "https://didchat.app/user-profile/1.0/get-by-username",
  GET_BY_USERNAME_RESPONSE = "https://didchat.app/user-profile/1.0/get-by-username-response",
  UPDATE_USERNAME = "https://didchat.app/user-profile/1.0/update-username",
  UPDATE_USERNAME_RESPONSE = "https://didchat.app/user-profile/1.0/update-username-response",
  UPDATE_PROFILE = "https://didchat.app/user-profile/1.0/update-profile",
  UPDATE_PROFILE_RESPONSE = "https://didchat.app/user-profile/1.0/update-profile-response",
  DELETE_PROFILE = "https://didchat.app/user-profile/1.0/delete-profile",
  DELETE_PROFILE_RESPONSE = "https://didchat.app/user-profile/1.0/delete-profile",
}

interface UserProfileProtocolParams {
  [UserProfileProtocol.GET_BY_USERNAME]: {
    from: string;
    to: string;
    username: string;
  };
  [UserProfileProtocol.UPDATE_USERNAME]: {
    from: string;
    to: string;
    username: string;
  };
  [UserProfileProtocol.UPDATE_PROFILE]: {
    from: string;
    to: string;
    profile: {
      displayName?: string;
      displayPicture?: string;
      bio?: string;
      dateOfBirth?: Date;
      country?: string;
    };
  };
}

interface UserProfileProtocolMessageTypes {
  [UserProfileProtocol.GET_BY_USERNAME]: Message & {
    type: UserProfileProtocol.GET_BY_USERNAME;
    data: UserProfileProtocolParams[UserProfileProtocol.GET_BY_USERNAME];
  };
  [UserProfileProtocol.UPDATE_USERNAME]: Message & {
    type: UserProfileProtocol.UPDATE_USERNAME;
    data: UserProfileProtocolParams[UserProfileProtocol.UPDATE_USERNAME];
  };
  [UserProfileProtocol.UPDATE_PROFILE]: Message & {
    type: UserProfileProtocol.UPDATE_PROFILE;
    data: UserProfileProtocolParams[UserProfileProtocol.UPDATE_PROFILE];
  };
}

const prisma = new PrismaClient();

const usernameSchema = yup.string().min(2).max(20);
const profileSchema = yup.object().shape({
  displayName: yup.string().max(30),
  displayPicture: yup.string().url(),
  bio: yup.string().max(100),
  dateOfBirth: yup.date(),
  country: yup.string().length(2),
});

export class UserProfileMessageHandler extends AbstractMessageHandler {
  async handle(
    message: UserProfileProtocolMessageTypes[keyof UserProfileProtocolMessageTypes],
    context: IAgentContext<TAgent<DIDChatMediator>>
  ): Promise<Message> {
    switch (message.type) {
      case UserProfileProtocol.GET_BY_USERNAME:
        return this.handleGetByUsername(message, context);
      case UserProfileProtocol.UPDATE_USERNAME:
        return this.handleUpdateUsername(message, context);
      case UserProfileProtocol.UPDATE_PROFILE:
        return this.handleUpdateProfile(message, context);
      default:
        break;
    }

    return super.handle(message, context);
  }

  async handleGetByUsername(
    message: UserProfileProtocolMessageTypes[UserProfileProtocol.GET_BY_USERNAME],
    context: IAgentContext<TAgent<DIDChatMediator>>
  ): Promise<Message> {
    const { id, from, to, data } = message;
    const { username } = data ?? {};

    if (!username) {
      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: UserProfileProtocol.GET_BY_USERNAME_RESPONSE,
              thid: id,
              body: {
                result: "client_error",
                error: "No username provided",
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
              type: UserProfileProtocol.GET_BY_USERNAME_RESPONSE,
              thid: id,
              body: {
                result: "client_error",
                error: "Invalid username",
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
        where: { username },
        include: { profile: true },
      });

      if (!user) {
        message.addMetaData({
          type: "ReturnRouteResponse",
          value: JSON.stringify(
            await createResponseMessage(
              {
                from: to!,
                to: from!,
                type: UserProfileProtocol.GET_BY_USERNAME_RESPONSE,
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
              type: UserProfileProtocol.GET_BY_USERNAME_RESPONSE,
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
    } catch (e: any) {
      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: UserProfileProtocol.GET_BY_USERNAME_RESPONSE,
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

  async handleUpdateUsername(
    message: UserProfileProtocolMessageTypes[UserProfileProtocol.UPDATE_USERNAME],
    context: IAgentContext<TAgent<DIDChatMediator>>
  ): Promise<Message> {
    const { id, from, to, data } = message;
    const { username } = data ?? {};

    if (!username) {
      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: UserProfileProtocol.UPDATE_USERNAME_RESPONSE,
              thid: id,
              body: {
                result: "client_error",
                error: "No username provided",
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
              type: UserProfileProtocol.UPDATE_USERNAME_RESPONSE,
              thid: id,
              body: {
                result: "client_error",
                error: "Invalid username",
              },
            },
            context
          )
        ),
      });

      return message;
    }

    try {
      const existingUser = await prisma.user.findUnique({
        where: { username },
      });

      if (existingUser) {
        message.addMetaData({
          type: "ReturnRouteResponse",
          value: JSON.stringify(
            await createResponseMessage(
              {
                from: to!,
                to: from!,
                type: UserProfileProtocol.UPDATE_USERNAME_RESPONSE,
                thid: id,
                body: {
                  result: "client_error",
                  error: "Username already taken",
                },
              },
              context
            )
          ),
        });

        return message;
      }

      const updatedUser = await prisma.user.update({
        where: { did: from },
        data: {
          username,
        },
      });

      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: UserProfileProtocol.UPDATE_USERNAME_RESPONSE,
              thid: id,
              body: {
                result: "success",
                user: updatedUser,
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
              type: UserProfileProtocol.UPDATE_USERNAME_RESPONSE,
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

  async handleUpdateProfile(
    message: UserProfileProtocolMessageTypes[UserProfileProtocol.UPDATE_PROFILE],
    context: IAgentContext<TAgent<DIDChatMediator>>
  ): Promise<Message> {
    const { id, from, to, data } = message;
    const { profile } = data ?? {};

    if (!profile) {
      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: UserProfileProtocol.UPDATE_PROFILE_RESPONSE,
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

    try {
      const user = await prisma.user.findUniqueOrThrow({
        where: { did: from },
        include: { profile: true },
      });

      if (!user.profile) {
        message.addMetaData({
          type: "ReturnRouteResponse",
          value: JSON.stringify(
            await createResponseMessage(
              {
                from: to!,
                to: from!,
                type: UserProfileProtocol.UPDATE_PROFILE_RESPONSE,
                thid: id,
                body: {
                  result: "client_error",
                  error: "User profile not found",
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
                type: UserProfileProtocol.UPDATE_PROFILE_RESPONSE,
                thid: id,
                body: {
                  result: "client_error",
                  error: "Invalid profile data", // TODO: add more details
                },
              },
              context
            )
          ),
        });

        return message;
      }

      const updatedProfile = await prisma.profile.update({
        where: { id: user.profile.id },
        data: {
          ...profile,
        },
      });

      message.addMetaData({
        type: "ReturnRouteResponse",
        value: JSON.stringify(
          await createResponseMessage(
            {
              from: to!,
              to: from!,
              type: UserProfileProtocol.UPDATE_PROFILE_RESPONSE,
              thid: id,
              body: {
                result: "success",
                profile: updatedProfile,
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
              type: UserProfileProtocol.UPDATE_PROFILE_RESPONSE,
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
}
