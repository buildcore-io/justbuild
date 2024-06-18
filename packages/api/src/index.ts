import cors from "cors";
import dayjs from "dayjs";
import express from "express";
import { leaderboard } from "./routes/leaderboard";
import { getInsecureHubRpcClient } from "@farcaster/hub-nodejs";
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
      res.send(await leaderboard(channelId, castedBefore, castedAfter));
    } catch (err: any) {
      console.log(err);
      res.status(err.status || 400).send({ error: err.error || "Unkown" });
    }
  }
);

const hub = getInsecureHubRpcClient(process.env.HUB_HOST!);

app.post(
  "/farcaster/ban",
  async (req: express.Request, res: express.Response) => {
    await waitForReadyHubClient(hub);
    try {
      res.send(await banUserFromChannel(hub, req.body));
    } catch (err: any) {
      res.status(err.status || 400).send({ error: err.error || "Unkown" });
    }
  }
);

app.get("/farcaster/ban", (req, res) => {
  res.send({
    aboutUrl: "https://api.buildcore.io/farcaster/ban",
    action: {
      type: "post",
    },
    name: "Ban User! /justbuild",
    description: "Custom Action to ban users from the justbuild.",
    icon: "mute",
    postUrl: "https://api.buildcore.io/farcaster/ban",
  });
});

const server = app.listen(port);

server.setTimeout(0);
