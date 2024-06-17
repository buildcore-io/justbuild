import {
  CallOptions,
  FidRequest,
  HubResult,
  HubRpcClient,
  Message,
  MessagesResponse,
  Metadata,
  fromFarcasterTime,
} from "@farcaster/hub-nodejs";
import { Knex } from "knex";
import { chunk } from "lodash";
import { runWithRetry } from "../utils";
import Redis from "ioredis";
import { Queue } from "bullmq";

export const getMinFid = async (db: Knex) => {
  const sel = await db("fids").orderBy("fid", "desc").first();
  return Math.max((sel?.fid || 1) - 5000, 1);
};

export const getMaxFid = async (hub: HubRpcClient) => {
  const result = await runWithRetry(() =>
    hub.getFids({ reverse: true, pageSize: 1 })
  );
  return result.fids[0] || 1;
};

export const farcasterTimeToDate = (time: number | null | undefined) => {
  if (!time) {
    return time;
  }
  const result = fromFarcasterTime(time);
  if (result.isErr()) {
    throw result.error;
  }

  return new Date(result.value);
};

type GetByFid = (
  request: FidRequest,
  metadata?: Metadata | undefined,
  options?: Partial<CallOptions> | undefined
) => Promise<HubResult<MessagesResponse>>;

async function* getAllByFid(
  getByFid: GetByFid,
  fid: number
): AsyncGenerator<Message[], void, undefined> {
  let pageToken: Uint8Array | undefined = undefined;
  for (;;) {
    const response = await runWithRetry(() => getByFid({ fid, pageToken }));
    yield response.messages;
    pageToken = response.nextPageToken;
    if (!pageToken?.length) {
      break;
    }
  }
}

export const moveAllByFidToPg = async (
  db: Knex,
  table: string,
  getByFid: GetByFid,
  converter: (m: Message) => any,
  fid: number,
  onConflict = ["fid", "hash"]
) => {
  for await (const messages of getAllByFid(getByFid, fid)) {
    const batches = chunk(messages.map(converter), 1000);
    const promises = batches.map(async (batch) => {
      try {
        await db(table).insert(batch).onConflict(onConflict).ignore();
      } catch (err) {
        console.log(fid, table, err);
        throw err;
      }
    });
    await Promise.all(promises);
  }
};

export const BACKFILL_QEUE_NAME = "backfillQueue";
export const EVENTS_QEUE_NAME = "eventsQueue";

export const getQueue = (redis: Redis, name: string) => {
  return new Queue(name, {
    connection: redis,
    defaultJobOptions: {
      attempts: 3,
      backoff: { delay: 1000, type: "exponential" },
    },
  });
};

export const cleanupQueue = async (queue: Queue) => {
  await queue.drain();
  const failed = await queue.getFailed();
  for (const job of failed) {
    await job.remove();
  }
  const completed = await queue.getCompleted();
  for (const job of completed) {
    await job.remove();
  }
};
