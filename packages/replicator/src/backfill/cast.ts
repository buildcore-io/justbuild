import { Message } from "@farcaster/hub-nodejs";
import { farcasterTimeToDate } from "./utils";

export const castToPg = (m: Message) => ({
  timestamp: farcasterTimeToDate(m.data!.timestamp) || new Date(),

  fid: m.data!.fid,
  hash: m.hash,

  parent_fid: m.data!.castAddBody?.parentCastId?.fid,
  parent_hash: m.data!.castAddBody?.parentCastId?.hash,
  parent_url: m.data!.castAddBody?.parentUrl,

  text: m.data!.castAddBody?.text?.replace(/\x00/g, "") || "",
  embeds: JSON.stringify(m.data!.castAddBody?.embeds),
  mentions: JSON.stringify(m.data!.castAddBody?.mentions),
  mentions_positions: JSON.stringify(m.data!.castAddBody?.mentionsPositions),
});
