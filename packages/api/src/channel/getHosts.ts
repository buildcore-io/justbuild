import axios from "axios";

export const getChannelHosts = async (channelId: string) => {
  try {
    const options = {
      url: `https://api.warpcast.com/v1/channel`,
      method: "GET",
      headers: { accept: "application/json" },
      params: { channelId },
    };
    const response = await axios(options);
    return response.data.result.channel.hostFids as number[];
  } catch {
    return [];
  }
};
