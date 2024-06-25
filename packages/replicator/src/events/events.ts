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
import { POSTGRES_URL } from "../env";
import { Redis } from "ioredis";
import { LAST_EVENT_ID_KEY, runWithRetry } from "../utils";
import { last } from "lodash";
import { EVENTS_QEUE_NAME, cleanupQueue, getQueue } from "../backfill/utils";
import { Job, Queue, Worker } from "bullmq";
import dayjs from "dayjs";

const db = Knex({
  client: "pg",
  connection: POSTGRES_URL,
  pool: { min: 5, max: 5, idleTimeoutMillis: 30000 },
  migrations: {
    directory: "./lib/migrations",
  },
});

const hubEvents: HubEvent[] = [];

export const processEvents = async (hub: HubRpcClient, redis: Redis) => {
  const queue = getQueue(redis, EVENTS_QEUE_NAME);
  await cleanupQueue(queue);

  const interval = monitorQueue(queue);

  const worker = createEventsWorker(redis);
  await Promise.all([
    subscribeToEvent(hub, redis),
    moveEventsToRedis(redis, worker),
    worker.run(),
  ]);

  clearInterval(interval);
  process.exit(-1);
};

const monitorQueue = (queue: Queue) =>
  setInterval(async () => {
    console.log(`Queue Status: Waiting: ${await queue.getWaitingCount()}`);
  }, 10000);

const subscribeToEvent = async (hub: HubRpcClient, redis: Redis) => {
  try {
    const fromId = Number(await redis.get(LAST_EVENT_ID_KEY)) || undefined;
    console.log(`Streaming events from ${fromId}`);
    const stream = await runWithRetry(() =>
      hub.subscribe({ fromId, eventTypes: [HubEventType.MERGE_MESSAGE] })
    );
    for await (const event of stream) {
      if (!isHealthy) {
        break;
      }
      hubEvents.push(event);
    }
  } catch (error) {
    console.log("Event subscription error", error);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
};

const PROCESS_BATCH_SIZE = 10000;

const moveEventsToRedis = async (redis: Redis, worker: Worker) => {
  const queue = getQueue(redis, EVENTS_QEUE_NAME);

  for (;;) {
    const take = Math.min(hubEvents.length, PROCESS_BATCH_SIZE);
    const events = hubEvents.splice(0, take);

    if (!isHealthy) {
      await cleanupQueue(queue);
      await worker.close();
      break;
    }

    if (!events.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }

    await queue.add(EVENTS_QEUE_NAME, {
      events: events.map((e) => HubEvent.toJSON(e)),
    });
  }
};

let castsToAdd: any[] = [];
let castsToRemove: Uint8Array[] = [];
let reactionsToAdd: any[] = [];
let reactionsToRemove: any[] = [];
let userDataToAdd: { [key: string]: any } = [];
let isHealthy = true;

const createEventsWorker = (redis: Redis) =>
  new Worker(
    EVENTS_QEUE_NAME,
    async (job: Job) => {
      if (!isHealthy) {
        return;
      }

      let error: any = undefined;
      for (let i = 0; i < 10; ++i) {
        try {
          const events = decodeEvents(job.data.events as unknown[]);
          convertEventsToPg(events);
          await saveEvents();
          await saveLastProcessedId(events, redis);
          return;
        } catch (err) {
          error = err;
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
      isHealthy = false;
      console.error(error);
    },
    {
      autorun: false,
      concurrency: 1,
      connection: redis,
      removeOnComplete: { count: 0 },
    }
  );

const decodeEvents = (events: unknown[]) =>
  events.map((b) => HubEvent.fromJSON(b));

const convertEventsToPg = (events: HubEvent[]) => {
  castsToAdd = [];
  castsToRemove = [];
  reactionsToAdd = [];
  reactionsToRemove = [];
  userDataToAdd = [];

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
        const target_cast_fid = message.data.reactionBody?.targetCastId?.fid;
        const target_cast_hash = message.data.reactionBody?.targetCastId?.hash;
        if (target_cast_fid && target_cast_hash) {
          reactionsToRemove.push({
            fid: message.data.fid,
            target_cast_fid,
            target_cast_hash,
          });
        }
        break;
      case MessageType.USER_DATA_ADD:
        const userData = userDataToPg(message);
        userDataToAdd[`${userData.fid}${userData.type}`] = userData;
        break;
      default:
        break;
    }
  }
};

const saveEvents = async () => {
  if (castsToAdd.length) {
    await db("casts").insert(castsToAdd).onConflict(["fid", "hash"]).ignore();
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
};

const saveLastProcessedId = async (events: HubEvent[], redis: Redis) => {
  const lastEventId = last(events)?.id?.toString()!;
  await redis.set(LAST_EVENT_ID_KEY, lastEventId);
  console.log(`Last processed event id ${lastEventId}, ${dayjs().format()}`);
};
