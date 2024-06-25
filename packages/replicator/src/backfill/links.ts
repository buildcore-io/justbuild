import { Message } from "@farcaster/hub-nodejs";
import { farcasterTimeToDate } from "./utils";

export const linksToPg = (m: Message) => ({
  timestamp: farcasterTimeToDate(m.data!.timestamp) || new Date(),

  fid: m.data?.fid,
  hash: m.hash,

  target_fid: m.data?.linkBody?.targetFid,
  type: m.data?.linkBody?.type,
});
