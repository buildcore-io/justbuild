import Knex from "knex";
import { HubRpcClient } from "@farcaster/hub-nodejs";
import { Job, Worker } from "bullmq";
import { castToPg } from "./cast";
import { reactionToPg } from "./reactionts";
import { userDataToPg } from "./user";
import { BACKFILL_QEUE_NAME, moveAllByFidToPg } from "./utils";
import { Redis } from "ioredis";
import os from "os";
import { linksToPg } from "./links";

export const createWorker = (
  db: Knex.Knex,
  hub: HubRpcClient,
  redis: Redis
) => {
  const worker = new Worker(
    BACKFILL_QEUE_NAME,
    async (job: Job) => {
      const fids = job.data.fids as number[];
      const promises = fids.map(async (fid) => {
        await Promise.all(migrateAllDataForFid(hub, db, fid));
        await saveFid(db, fid);
      });
      await Promise.all(promises);
    },
    {
      autorun: false,
      concurrency: os.cpus().length * 2,
      connection: redis,
    }
  );

  worker.on("failed", (job, err) => {
    console.error(`Job ${job?.id} failed with error: ${err.message}`);
  });

  worker.on("drained", async () => {
    await worker.close();
  });

  return worker;
};

const migrateAllDataForFid = (
  hub: HubRpcClient,
  db: Knex.Knex,
  fid: number
): Promise<void>[] => [
  moveAllByFidToPg(db, "casts", hub.getCastsByFid, castToPg, fid),
  moveAllByFidToPg(db, "reactions", hub.getReactionsByFid, reactionToPg, fid),
  moveAllByFidToPg(db, "user_data", hub.getUserDataByFid, userDataToPg, fid, [
    "fid",
    "type",
  ]),
  moveAllByFidToPg(db, "links", hub.getLinksByFid, linksToPg, fid, ["hash"]),
];

const saveFid = async (db: Knex.Knex, fid: number) => {
  await db("fids").insert({ fid }).onConflict("fid").ignore();
};
