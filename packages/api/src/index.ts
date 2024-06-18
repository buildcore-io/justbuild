import cors from "cors";
import dayjs from "dayjs";
import express from "express";
import { leaderboard } from "./routes/leaderboard";

const port = 8080;
const app = express();

app.use(cors());

app.use("/*", (req, _res, next) => {
  const baseUrl = req.baseUrl;
  console.log(`Captured base URL: ${baseUrl}`);
  next();
});

app.use("/farcaster/leaderboard", async (req: express.Request, res: express.Response) => {
  try {
    const channelId = req.query.channelId as string;
    const castedAfter = dayjs.unix(Number(req.query.castedAfter));
    const castedBefore = dayjs.unix(Number(req.query.castedBefore));
    res.send(await leaderboard(channelId, castedBefore, castedAfter));
  } catch (err: any) {
    res.status(err.status || 400).send({ error: err.error || "Unkown" });
  }
});

const server = app.listen(port);

server.setTimeout(0);
