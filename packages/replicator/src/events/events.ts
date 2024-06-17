import {
  HubEvent,
  HubEventType,
  HubRpcClient,
  MessageType,
} from "@farcaster/hub-nodejs";
import Knex from "knex";
import { castToPg } from "../backfill/cast";
import { reactionToPg } from "../backfill/reactionts";
import { userDataToPg } from "../backfill/user";
import { POSTGRES_MAX_POOL, POSTGRES_URL } from "../env";
import { Redis } from "ioredis";
import { LAST_EVENT_ID_KEY, runWithRetry } from "../utils";
import { last } from "lodash";
import { EVENTS_QEUE_NAME, cleanupQueue, getQueue } from "../backfill/utils";
import { Job, Queue, Worker } from "bullmq";

const db = Knex({
  client: "pg",
  connection: POSTGRES_URL,
  pool: { min: 5, max: POSTGRES_MAX_POOL, idleTimeoutMillis: 30000 },
  migrations: {
    directory: "./lib/migrations",
  },
});

const hubEvents: HubEvent[] = [];

export const processEvents = async (hub: HubRpcClient, redis: Redis) => {
  const queue = getQueue(redis, EVENTS_QEUE_NAME);
  await cleanupQueue(queue);

  monitorQueue(queue);

  const worker = createEventsWorker(redis);
  await Promise.all([
    subscribeToEvent(hub, redis),
    moveEventsToRedis(redis),
    worker.run(),
  ]);
};

const monitorQueue = (queue: Queue) =>
  setInterval(async () => {
    const waitingCount = await queue.getWaitingCount();
    const activeCount = await queue.getActiveCount();
    const failedCount = await queue.getFailedCount();

    console.log(
      `Queue Status: Waiting: ${waitingCount},` +
        ` Active: ${activeCount},` +
        ` Failed: ${failedCount}`
    );
  }, 5000);

const subscribeToEvent = async (hub: HubRpcClient, redis: Redis) => {
  for (;;) {
    try {
      const fromId = Number(await redis.get(LAST_EVENT_ID_KEY)) || undefined;
      console.log(`Streaming events from ${fromId}`);
      const stream = await runWithRetry(() =>
        hub.subscribe({ fromId, eventTypes: [HubEventType.MERGE_MESSAGE] })
      );
      for await (const event of stream) {
        hubEvents.push(event);
      }
    } catch (error) {
      console.log("Event subscription error", error);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
};

const PROCESS_BATCH_SIZE = 10000;

const moveEventsToRedis = async (redis: Redis) => {
  const queue = getQueue(redis, EVENTS_QEUE_NAME);

  for (;;) {
    const take = Math.min(hubEvents.length, PROCESS_BATCH_SIZE);
    const events = hubEvents.splice(0, take);

    if (!events.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    await queue.add(EVENTS_QEUE_NAME, {
      events: events.map((e) => HubEvent.toJSON(e)),
    });
  }
};

const createEventsWorker = (redis: Redis) =>
  new Worker(
    EVENTS_QEUE_NAME,
    async (job: Job) => {
      const events = (job.data.events as unknown[]).map((b) =>
        HubEvent.fromJSON(b)
      );

      console.log(`Saving ${events.length} messages to db`);

      const castsToAdd: any[] = [];
      const castsToRemove: Uint8Array[] = [];
      const reactionsToAdd: any[] = [];
      const reactionsToRemove: any[] = [];
      const userDataToAdd: { [key: string]: any } = [];

      for (const event of events) {
        const message = event.mergeMessageBody?.message;
        switch (message?.data?.type) {
          case MessageType.CAST_ADD:
            castsToAdd.push(castToPg(message));
            break;
          case MessageType.CAST_REMOVE:
            castsToRemove.push(message.data.castRemoveBody?.targetHash!);
            break;
          case MessageType.REACTION_ADD:
            reactionsToAdd.push(reactionToPg(message));
            break;
          case MessageType.REACTION_REMOVE:
            reactionsToRemove.push({
              fid: message.data.fid,
              target_cast_fid: message.data.reactionBody?.targetCastId?.fid,
              target_cast_hash: message.data.reactionBody?.targetCastId?.hash!,
            });
            break;
          case MessageType.USER_DATA_ADD:
            const userData = userDataToPg(message);
            userDataToAdd[`${userData.fid}${userData.type}`] = userData;
            break;
          default:
            break;
        }
      }

      if (castsToAdd.length) {
        await db("casts")
          .insert(castsToAdd)
          .onConflict(["fid", "hash"])
          .ignore();
      }

      if (castsToRemove.length) {
        await db("casts").delete().whereIn("hash", castsToRemove);
      }

      if (reactionsToAdd.length) {
        await db("reactions")
          .insert(reactionsToAdd)
          .onConflict(["fid", "hash"])
          .ignore();
      }

      if (reactionsToRemove.length) {
        const promises = reactionsToRemove.map((key) =>
          db("reactions").delete().where(key)
        );
        await Promise.all(promises);
      }

      if (Object.values(userDataToAdd).length) {
        await db("user_data")
          .insert(Object.values(userDataToAdd))
          .onConflict(["fid", "type"])
          .merge();
      }

      await redis.set(LAST_EVENT_ID_KEY, last(events)?.id?.toString()!);
    },
    {
      autorun: false,
      concurrency: 1,
      connection: redis,
      removeOnComplete: { count: 0 },
    }
  );
