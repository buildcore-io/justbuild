import cors from "cors";
import dayjs from "dayjs";
import express, { json } from "express";
import { leaderboard } from "./routes/leaderboard";
import {
  Message,
  getInsecureHubRpcClient,
  hexStringToBytes,
} from "@farcaster/hub-nodejs";
import { waitForReadyHubClient } from "./utils";
import { banUserFromChannel } from "./routes/ban_user";

const port = 8080;
const app = express();

app.use(cors());

app.use("/*", (_req, _res, next) => {
  next();
});

app.get(
  "/farcaster/leaderboard",
  async (req: express.Request, res: express.Response) => {
    try {
      const channelId = req.query.channelId as string;
      const castedAfter = dayjs.unix(Number(req.query.castedAfter));
      const castedBefore = dayjs.unix(Number(req.query.castedBefore));

      const offset = Number(req.query.offset) || 0;
      const limit = Number(req.query.limit) || 10;
      const fid = req.query.fid as string | undefined;
      res.send(
        await leaderboard(
          channelId,
          castedBefore,
          castedAfter,
          fid,
          Math.max(Math.min(offset, fid ? 0 : 100), 0),
          Math.max(Math.min(limit, 100), 10)
        )
      );
    } catch (err: any) {
      console.log(err);
      res.status(err.status || 400).send({ error: err.error || "Unkown" });
    }
  }
);

const hub = getInsecureHubRpcClient(process.env.HUB_HOST!);

app.post("/farcaster/ban", json(), async (req, res) => {
  await waitForReadyHubClient(hub);
  try {
    const messageBytes = req.body.trustedData.messageBytes;
    const buffer = Buffer.from(hexStringToBytes(messageBytes).unwrapOr([]));
    const message = Message.decode(buffer);
    res.send(await banUserFromChannel(hub, message));
  } catch (err: any) {
    res.status(err.status || 400).send({ error: err.error || "Unkown" });
  }
});

app.get("/farcaster/ban", (req, res) => {
  res.send({
    name: "Ban User! /justbuild",
    icon: "mute",
    description: "Custom Action to ban users from the justbuild.",
    aboutUrl: "https://api.buildcore.io/farcaster/ban",
    action: {
      type: "post",
      postUrl: "https://api.buildcore.io/farcaster/ban",
    },
  });
});

const server = app.listen(port);

server.setTimeout(0);
