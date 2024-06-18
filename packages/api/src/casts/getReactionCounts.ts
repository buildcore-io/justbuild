import { bytesToHexString } from "@farcaster/hub-nodejs";
import { database } from "../db";
import { Cast, CastWithReactionCounts } from "../interfaces/casts";

export const getReactionCounts = async (casts: { [key: string]: Cast }) => {
  const hashes = Object.values(casts).map((c) => c.hash);
  const likesAndRecastsPromise = database("reactions")
    .select(
      "target_cast_fid as fid",
      "target_cast_hash as hash",
      database.raw("COUNT(CASE WHEN type = 1 THEN 1 END)::integer as likes"),
      database.raw("COUNT(CASE WHEN type = 2 THEN 1 END)::integer as recasts")
    )
    .whereIn("target_cast_hash", hashes)
    .groupBy("target_cast_hash", "target_cast_fid");

  const repliesPromise = database("casts")
    .select(
      "parent_hash as hash",
      database.raw("COUNT(parent_hash)::integer as replies")
    )
    .whereIn("parent_hash", hashes)
    .groupBy("parent_hash");

  const [likesAndRecasts, replies] = await Promise.all([
    likesAndRecastsPromise,
    repliesPromise,
  ]);

  const response: { [key: string]: CastWithReactionCounts } = {};
  for (const { hash: hashBytes, likes, recasts } of likesAndRecasts) {
    const hash = bytesToHexString(hashBytes).unwrapOr("");
    response[hash] = {
      ...casts[hash],
      likes_count: likes,
      recasts_count: recasts,
      replies_count: 0,
    };
  }
  for (const { hash: hashBytes, replies: replies_count } of replies) {
    const hash = bytesToHexString(hashBytes).unwrapOr("");
    response[hash] = { ...response[hash], replies_count };
  }

  return response;
};
