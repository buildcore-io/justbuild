import { HubRpcClient } from "@farcaster/hub-nodejs";
import Knex from "knex";
import {
  getMinFid,
  getMaxFid,
  getQueue,
  BACKFILL_QEUE_NAME,
  cleanupQueue,
} from "./utils";
import { POSTGRES_MAX_POOL, POSTGRES_URL, REDIS_URL } from "../env";
import { chunk } from "lodash";
import Redis from "ioredis";
import { createWorker } from "./worker";
import dayjs from "dayjs";

const db = Knex({
  client: "pg",
  connection: POSTGRES_URL,
  pool: { min: POSTGRES_MAX_POOL, max: POSTGRES_MAX_POOL },
  migrations: {
    directory: "./lib/migrations",
  },
});

export const backfill = async (hub: HubRpcClient, redis: Redis) => {
  await db.migrate.latest();

  const queue = getQueue(redis, BACKFILL_QEUE_NAME);
  await cleanupQueue(queue);

  const minFid = await getMinFid(db);
  const maxFid = await getMaxFid(hub);
  console.log(`Starting backfill between ${minFid} and ${maxFid} fids`);

  console.log("Prepearing queue");
  const fids = Array.from(Array(maxFid - minFid + 1)).map(
    (_, index) => minFid + index
  );
  const batches = chunk(fids, 100);
  const promises = batches.map((batch) =>
    queue.add(BACKFILL_QEUE_NAME, { fids: batch })
  );
  await Promise.all(promises);

  const startTime = dayjs();

  const interval = setInterval(async () => {
    const waitingCount = await queue.getWaitingCount();
    const activeCount = await queue.getActiveCount();
    const completedCount = await queue.getCompletedCount();
    const failedCount = await queue.getFailedCount();

    console.log(
      `Queue Status: Waiting: ${waitingCount},` +
        ` Active: ${activeCount},` +
        ` Completed: ${completedCount},` +
        ` Failed: ${failedCount}` +
        ` Progress: ${((completedCount * 100) / promises.length).toFixed(3)}` +
        ` Elapsed time: ${dayjs().diff(startTime, "minutes")} minutes`
    );
  }, 5000);

  console.log("Starting workers");
  await createWorker(db, hub, redis).run();

  clearInterval(interval);

  await db.destroy();
  console.log("Backfill completed");
};
