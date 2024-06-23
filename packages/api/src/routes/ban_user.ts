import { HubRpcClient, Message } from "@farcaster/hub-nodejs";
import { database } from "../db";
import { Cast } from "../interfaces/casts";

export const banUserFromChannel = async (
  hub: HubRpcClient,
  message: Message
) => {
  try {
    const result = await hub.validateMessage(message);
    if (result.isOk() && result.value.valid) {
      const target_fid =
        result.value.message?.data?.frameActionBody?.castId?.fid;
      const hash = result.value.message?.data?.frameActionBody?.castId?.hash;

      const cast: Cast | undefined = await database("casts")
        .where({ fid: target_fid, hash })
        .first();

      const root = "https://warpcast.com/~/channel/";
      const channelId = cast?.parent_url?.replace(root, "") || "";

      const channel = await database("channels")
        .where({ channel_id: channelId })
        .first();

      const fid = result.value.message?.data?.fid!;
      if (!channel?.hosts?.includes(fid)) {
        throw {
          status: 400,
          error: "You must be a channel host to ban a user",
        };
      }

      const blockedUsername = await database("user_data")
        .where({ fid: target_fid, type: 2 })
        .first();

      if (channel?.banned?.includes(target_fid)) {
        return {
          type: "message",
          message: `${blockedUsername.value} already blocked from ${channelId}.`,
        };
      }

      await database("channels")
        .where({ channel_id: channelId })
        .update({
          banned: database.raw("array_append(banned, ?)", [target_fid]),
        });

      return {
        type: "message",
        message: `${blockedUsername.value} blocked from ${channelId}.`,
      };
    }

    console.log(result.unwrapOr(""));
    throw { status: 400, error: "Could not ban user" };
  } catch (er) {
    console.error(er);
    throw { status: 400, error: "Could not ban user" };
  }
};
