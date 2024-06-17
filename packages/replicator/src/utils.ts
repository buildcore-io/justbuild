import { HubResult } from "@farcaster/hub-nodejs";

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
