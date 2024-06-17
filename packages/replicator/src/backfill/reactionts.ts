import { Message } from "@farcaster/hub-nodejs";
import { farcasterTimeToDate } from "./utils";

export const reactionToPg = (m: Message) => ({
  timestamp: farcasterTimeToDate(m.data!.timestamp) || new Date(),

  fid: m.data!.fid,
  hash: m.hash,
  target_cast_fid: m.data?.reactionBody?.targetCastId?.fid,
  target_cast_hash: m.data?.reactionBody?.targetCastId?.hash!,
  target_url: m.data?.reactionBody?.targetUrl,

  type: m.data?.reactionBody?.type,
});
