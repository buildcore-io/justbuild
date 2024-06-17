import { HubRpcClient, getInsecureHubRpcClient } from "@farcaster/hub-nodejs";
import { FROM_EVENT_ID, HUB_HOST, REDIS_URL } from "./env";
import { Redis } from "ioredis";
import { backfill } from "./backfill/backfill";
import { LAST_EVENT_ID_KEY, runWithRetry } from "./utils";
import { processEvents } from "./events/events";

const hub = getInsecureHubRpcClient(HUB_HOST);

const redis = new Redis(REDIS_URL, {
  connectTimeout: 5_000,
  maxRetriesPerRequest: null,
});

const main = async () => {
  await waitForReadyHubClient(hub);
  console.log(`Connected to hub on ${HUB_HOST} `);

  await setLastEventId();
  console.log("Last processed event ", await redis.get(LAST_EVENT_ID_KEY));

  await backfill(hub, redis);

  await processEvents(hub, redis);
};

const setLastEventId = async () => {
  if (FROM_EVENT_ID) {
    await redis.set(LAST_EVENT_ID_KEY, FROM_EVENT_ID);
  }

  const lastProcessedEvent = await redis.get(LAST_EVENT_ID_KEY);
  if (lastProcessedEvent) {
    return;
  }

  const result = await runWithRetry(() => hub.subscribe({ eventTypes: [] }));
  for await (const event of result) {
    await redis.set(LAST_EVENT_ID_KEY, event.id);
    break;
  }
};

const waitForReadyHubClient = (hub: HubRpcClient) =>
  new Promise<void>((res, rej) => {
    hub.$.waitForReady(Date.now() + 5000, (e) => {
      if (e) {
        console.error("Could not connect to hub");
        return rej(e);
      }
      return res();
    });
  });

main();
