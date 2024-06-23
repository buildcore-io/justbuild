import { Dayjs } from "dayjs";
import { database } from "../db";

const justbuildTagPoints = 5000;
const pointsForCast = 10000;
const multiplierForLike = 1;
const multiplierForReplies = 2;
const multiplierForRecasts = 2;
const divider = 100;

export const leaderboard = async (
  channelId: string,
  castedBefore: Dayjs,
  castedAfter: Dayjs,
  fid: string | undefined,
  offset: number,
  limit: number
) => {
  if (!castedAfter.isValid() || !castedBefore.isValid()) {
    throw { status: 400, error: "castedBefore and castedAfter are required" };
  }
  if (castedAfter.isAfter(castedBefore)) {
    throw { status: 400, error: "castedAfter must be before castedBefore" };
  }

  const channel = await database("channels")
    .where({ channel_id: channelId })
    .first();

  const castsLikedByHosts = database("casts as c")
    .select("c.fid", "c.hash", "c.timestamp")
    .where({ parent_url: `https://warpcast.com/~/channel/${channelId}` })
    .whereNotIn("c.fid", [...(channel?.hosts || []), ...(channel?.banned || [])])
    .whereBetween("c.timestamp", [
      castedAfter.toISOString(),
      castedBefore.toISOString(),
    ])
    .join("reactions as r", function () {
      this.on("c.hash", "=", "r.target_cast_hash")
        .andOnVal("r.type", 1)
        .andOnIn("r.fid", channel?.hosts || []);
    })
    .groupBy("c.fid", "c.hash", "c.timestamp")
    .as("casts_liked_by_hosts");

  const reactionsForCasts = database(castsLikedByHosts)
    .select(
      database.raw(`
    casts_liked_by_hosts.fid as fid,
    casts_liked_by_hosts.hash as hash,
    (select COUNT(*) from reactions as likes WHERE likes.target_cast_hash = casts_liked_by_hosts.hash and likes.type = 2) as recasts,
    (select COUNT(*) from reactions as likes WHERE likes.target_cast_hash = casts_liked_by_hosts.hash and likes.type = 1) as likes,
    (select COUNT(*) from casts as repl WHERE repl.parent_hash = casts_liked_by_hosts.hash) as replies
    `)
    )
    .groupBy("casts_liked_by_hosts.hash", "casts_liked_by_hosts.fid")
    .as("reactions_for_casts");

  const reactionsForFids = database(reactionsForCasts)
    .select(
      database.raw(`
      reactions_for_casts.fid as fid,
      SUM(recasts)::integer as recasts, 
      SUM(likes)::integer  as likes, 
      SUM(replies)::integer  as replies,
      COUNT(reactions_for_casts.fid)::integer as cast_count
    `)
    )
    .groupBy("reactions_for_casts.fid")
    .as("reactions_for_fids");

  const castsForEachDay = database(castsLikedByHosts)
    .select(
      database.raw(`
    casts_liked_by_hosts.fid as fid, 
    to_char(timestamp, 'mm-dd-YYYY') as day,
    case when COUNT(*) <= 3 then COUNT(*) else 3 end as casts_per_day`)
    )
    .groupBy("casts_liked_by_hosts.fid", "day")
    .as("casts_for_each_day");

  const totalCastPerDay = database(castsForEachDay)
    .select(
      database.raw(`
      casts_for_each_day.fid as fid, 
      sum(casts_per_day)::integer as casts_per_day_sum
    `)
    )
    .groupBy("casts_for_each_day.fid")
    .as("total_cast_per_day");

  const hasJustBuildTagQuery = database("casts as cc")
    .select(
      database.raw(`
      cc.fid,
      (select ud.value from user_data as ud where ud.fid = cc.fid and type = 2) as display_name,
      (select ud.value from user_data as ud where ud.fid = cc.fid and type = 6) as username
   `)
    )
    .whereNull("parent_hash")
    .whereBetween("timestamp", [
      castedAfter.toISOString(),
      castedBefore.toISOString(),
    ])
    .whereILike("text", `%/justbuild%`)
    .whereNotIn("cc.fid", [
      ...(channel?.hosts || []),
      ...(channel?.banned || []),
    ])
    .groupBy("cc.fid")
    .as("has_just_build_tag");

  const finalReactionsQuery = database(reactionsForFids)
    .select(
      database.raw(`
          reactions_for_fids.*,
          total_cast_per_day.casts_per_day_sum,
          (select ud.value from user_data as ud where ud.fid = reactions_for_fids.fid and type = 2) as display_name,
          (select ud.value from user_data as ud where ud.fid = reactions_for_fids.fid and type = 6) as username
       `)
    )
    .leftJoin(
      totalCastPerDay,
      "reactions_for_fids.fid",
      "total_cast_per_day.fid"
    )
    .as("final_reactions");

  const [hasJustBuildTag, finalReactions] = await Promise.all([
    hasJustBuildTagQuery,
    finalReactionsQuery,
  ]);

  const result: { [key: string]: any } = {};
  for (const { fid, display_name, username } of hasJustBuildTag) {
    result[fid] = {
      fid,
      display_name,
      username,
      points: justbuildTagPoints,
      cast_count: 0,
    };
  }
  for (const s of finalReactions) {
    result[s.fid] = {
      ...result[s.fid],
      fid: s.fid,
      display_name: s.display_name,
      username: s.username,
      points:
        (result[s.fid]?.points || 0) +
        calPointsForCast(s.likes, s.replies, s.recasts) +
        s.casts_per_day_sum * pointsForCast,
      cast_count: s.cast_count,
    };
  }

  const sorted = Object.values(result)
    .sort((a, b) => b.points - a.points)
    .map((r, i) => ({ ...r, position: i + 1 }));

  return fid
    ? sorted.filter((s) => s.fid === fid)
    : sorted.slice(offset, limit);
};

const calPointsForCast = (likes: number, replies: number, recasts: number) =>
  (likes / divider) * pointsForCast * multiplierForLike +
  (replies / divider) * pointsForCast * multiplierForReplies +
  (recasts / divider) * pointsForCast * multiplierForRecasts;
