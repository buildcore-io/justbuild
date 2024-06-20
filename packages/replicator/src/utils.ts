import { HubResult, HubRpcClient } from "@farcaster/hub-nodejs";

export const runWithRetry = async <T>(
  func: () => Promise<HubResult<T>>,
  retry = 10
) => {
  let error: any | undefined = undefined;
  for (let i = 0; i <= retry; ++i) {
    const response = await func();
    if (response.isOk()) {
      return response.value;
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * i + 1));
    error = response.error;
  }
  throw error;
};

export const LAST_EVENT_ID_KEY = "last-hub-event-id";

export const waitForReadyHubClient = (hub: HubRpcClient) =>
  new Promise<void>((res, rej) => {
    hub.$.waitForReady(Date.now() + 5000, (e) => {
      if (e) {
        console.error("Could not connect to hub");
        return rej(e);
      }
      return res();
    });
  });
