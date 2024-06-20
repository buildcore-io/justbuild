import { HubRpcClient } from '@farcaster/hub-nodejs';
import { Dayjs } from 'dayjs';

export const dateBetween = (date: Dayjs, after: Dayjs, before: Dayjs) =>
  date.isAfter(after) && date.isBefore(before);

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
