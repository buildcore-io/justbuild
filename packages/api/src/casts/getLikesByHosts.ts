import { Dayjs } from "dayjs";
import { database } from "../db";
import { Cast } from "../interfaces/casts";
import { bytesToHexString } from "@farcaster/hub-nodejs";
import { getBannedFids } from "../users/getBanned";

export const getCastsLikedByHosts = async (
  channelId: string,
  hosts: number[],
  startTime: Dayjs,
  endTime: Dayjs
) => {
  const bannedFids = await getBannedFids(channelId);
  const casts = await database("casts as c")
    .select("c.*")
    .where({ parent_url: `https://warpcast.com/~/channel/${channelId}` })
    .whereNotIn("c.fid", [...hosts, ...bannedFids])
    .whereBetween("c.timestamp", [startTime.toDate(), endTime.toDate()])
    .join("reactions as r", function () {
      this.on("c.hash", "=", "r.target_cast_hash")
        .andOnVal("r.type", 1)
        .andOnIn("r.fid", hosts);
    });
  return (casts as Cast[]).reduce((acc, act) => {
    const hash = bytesToHexString(act.hash).unwrapOr("");
    return { ...acc, [hash]: act };
  }, {} as { [key: string]: Cast });
};
