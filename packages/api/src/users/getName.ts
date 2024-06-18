import { database } from "../db";
import { User } from "../interfaces/user";

export const getUserNames = async (...fids: string[]) => {
  const data = await database("user_data")
    .whereIn("fid", fids)
    .whereIn("type", [2, 6]);

  return data.reduce((acc, act) => {
    const fid = act.fid;
    const key = act.type === 2 ? "display_name" : "username";
    return { ...acc, [fid]: { ...acc[fid], fid, [key]: act.value } };
  }, {}) as { [key: string]: User };
};
