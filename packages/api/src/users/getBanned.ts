import { database } from "../db";

export const getBannedFids = async (channelId: string) => {
  const result = await database("blocked_fids")
    .select("target_fid")
    .where({ channel_id: channelId });
  return result.map((r) => r.target_fid) as string[];
};
