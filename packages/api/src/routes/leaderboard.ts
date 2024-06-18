import { getChannelHosts } from "../channel/getHosts";
import { isEmpty } from "lodash";
import { getCastsLikedByHosts } from "../casts/getLikesByHosts";
import { getReactionCounts } from "../casts/getReactionCounts";
import { CastWithReactionCounts } from "../interfaces/casts";
import { getUserNames } from "../users/getName";
import { Dayjs } from "dayjs";

const justbuildUrl = "justbuild.today";

const justbuildTagPoints = 5000;
const pointsForCast = 10000;
const multiplierForLike = 1;
const multiplierForReplies = 2;
const multiplierForRecasts = 2;
const divider = 100;

export const leaderboard = async (
  channelId: string,
  castedBefore: Dayjs,
  castedAfter: Dayjs
) => {
  const hosts = await getChannelHosts(channelId);
  if (isEmpty(hosts)) {
    throw { status: 400, error: `Channel ${channelId} has no hosts` };
  }

  if (!castedAfter.isValid() || !castedBefore.isValid()) {
    throw { status: 400, error: "castedBefore and castedAfter are required" };
  }
  if (castedAfter.isAfter(castedBefore)) {
    throw { status: 400, error: "castedAfter must be before castedBefore" };
  }

  const casts = await getCastsLikedByHosts(
    channelId,
    hosts,
    castedAfter,
    castedBefore
  );
  const castsWithReactionCounts = await getReactionCounts(casts);

  const points = Object.values(castsWithReactionCounts).reduce((acc, act) => {
    const actPoints = calPointsForCast(act);
    const fid = act.fid;
    const points = (acc[fid]?.points || 0) + actPoints;
    const cast_count = (acc[fid]?.cast_count || 0) + 1;
    return { ...acc, [fid]: { points, cast_count } };
  }, {} as { [key: string]: any });

  const castPerFidAndDate = Object.values(casts).reduce((acc, act) => {
    const key = `${act.fid}_${act.timestamp.toISOString().split("T")[0]}`;
    return { ...acc, [key]: (acc[key] || 0) + 1 };
  }, {} as { [key: string]: number });
  for (const [key, count] of Object.entries(castPerFidAndDate)) {
    const fid = key.split("_")[0];
    points[fid].points += Math.min(count, 3) * pointsForCast;
  }

  const containsJustBuildUrl = Object.values(casts).reduce((acc, act) => {
    const hasJustbuildTag = act.text.includes(justbuildUrl);
    return { ...acc, [act.fid]: acc[act.fid] || hasJustbuildTag };
  }, {} as { [key: string]: boolean });
  for (const [fid, hasJustbuildTag] of Object.entries(containsJustBuildUrl)) {
    points[fid].points += hasJustbuildTag ? justbuildTagPoints : 0;
  }

  const users = await getUserNames(...Object.keys(points));
  for (const user of Object.values(users)) {
    points[user.fid] = {
      ...points[user.fid],
      display_name: user.display_name,
      username: user.username,
    };
  }

  return Object.entries(points)
    .map(([fid, p]) => ({ fid: Number(fid), ...p }))
    .sort((a, b) => b.points - a.points);
};

export const calPointsForCast = (cast: CastWithReactionCounts) => {
  const likes = cast.likes_count;
  const replies = cast.replies_count;
  const recasts = cast.recasts_count;
  return (
    (likes / divider) * pointsForCast * multiplierForLike +
    (replies / divider) * pointsForCast * multiplierForReplies +
    (recasts / divider) * pointsForCast * multiplierForRecasts
  );
};
