import { HubRpcClient, Message } from "@farcaster/hub-nodejs";
import { database } from "../db";
import { Cast } from "../interfaces/casts";
import { getChannelHosts } from "../channel/getHosts";

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

      const hosts = await getChannelHosts(channelId);

      const fid = result.value.message?.data?.fid!;
      if (!hosts.includes(fid)) {
        throw {
          status: 400,
          error: "You must be a channel host to ban a user",
        };
      }

      await database("blocked_fids")
        .insert({ channel_id: channelId, fid, target_fid })
        .onConflict(["channel_id", "target_fid"])
        .ignore();

      return {
        type: "message",
        message: `${target_fid} was blocked from ${channelId} channel by ${fid}`,
      };
    }

    console.log(result.unwrapOr(""));
    throw { status: 400, error: "Could not ban user" };
  } catch (er) {
    console.error(er);
    throw { status: 400, error: "Could not ban user" };
  }
};
