import { Message } from "@farcaster/hub-nodejs";
import { farcasterTimeToDate } from "./utils";

export const userDataToPg = (m: Message) => ({
  timestamp: farcasterTimeToDate(m.data!.timestamp) || new Date(),

  fid: m.data!.fid,
  hash: m.hash,

  type: m.data?.userDataBody?.type,
  value: m.data?.userDataBody?.value,
});
