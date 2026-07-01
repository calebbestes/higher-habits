import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { ensureDbEnv } from "./env";
import * as schema from "./schema";

export type HabitDb = ReturnType<typeof drizzle<typeof schema>>;

type PostgresClient = ReturnType<typeof postgres>;

const globalForHabitDb = globalThis as typeof globalThis & {
  __habitDb?: HabitDb;
  __habitDbClient?: PostgresClient;
};

function getPoolMax(url: string): number {
  const configuredMax = Number.parseInt(process.env.POSTGRES_POOL_MAX ?? "", 10);
  if (Number.isFinite(configuredMax) && configuredMax > 0) {
    return configuredMax;
  }

  if (process.env.VERCEL || url.includes("pooler.supabase.com")) {
    return 1;
  }

  return 10;
}

function getIdleTimeout(url: string): number | null {
  const configuredTimeout = Number.parseInt(
    process.env.POSTGRES_IDLE_TIMEOUT ?? "",
    10,
  );
  if (Number.isFinite(configuredTimeout) && configuredTimeout > 0) {
    return configuredTimeout;
  }

  if (process.env.VERCEL || url.includes("pooler.supabase.com")) {
    return 5;
  }

  return null;
}

export function getDb(): HabitDb | null {
  ensureDbEnv();

  const url = process.env.POSTGRES_URL;

  if (!url) {
    return null;
  }

  if (!globalForHabitDb.__habitDb) {
    const idleTimeout = getIdleTimeout(url);
    const client = postgres(url, {
      prepare: false,
      // Serverless instances scale horizontally, so each instance must keep a
      // tiny local pool or Supabase session pools can run out of clients.
      max: getPoolMax(url),
      ...(idleTimeout ? { idle_timeout: idleTimeout } : {}),
    });

    globalForHabitDb.__habitDbClient = client;
    globalForHabitDb.__habitDb = drizzle(client, { schema });
  }

  return globalForHabitDb.__habitDb;
}
