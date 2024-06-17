export const HUB_HOST = process.env.HUB_HOST || "127.0.0.1:2283";
export const REDIS_URL = process.env.REDIS_URL!;

export const POSTGRES_URL = process.env.POSTGRES_URL;
export const POSTGRES_MAX_POOL = Number(process.env.POSTGRES_MAX_POOL || 20);

export const SERVICE = process.env.SERVICE;

export const FROM_EVENT_ID = Number(process.env.FROM_EVENT_ID) || undefined;
