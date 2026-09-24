import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { ensureDbEnv } from "./env";
import * as schema from "./schema";

export type HabitDb = ReturnType<typeof drizzle<typeof schema>>;

type PostgresClient = ReturnType<typeof postgres>;

const globalForHabitDb = globalThis as typeof globalThis & {
  __habitDb?: HabitDb;
  __habitDbClient?: PostgresClient;
  __habitDbConfigLogged?: boolean;
};

function getPoolMax(url: string): number {
  if (process.env.VERCEL || url.includes("pooler.supabase.com")) {
    return 1;
  }

  const configuredMax = Number.parseInt(
    process.env.POSTGRES_POOL_MAX ?? "",
    10,
  );
  if (Number.isFinite(configuredMax) && configuredMax > 0) {
    return configuredMax;
  }

  return 10;
}

function getIdleTimeout(url: string): number | null {
  if (process.env.VERCEL || url.includes("pooler.supabase.com")) {
    return 5;
  }

  const configuredTimeout = Number.parseInt(
    process.env.POSTGRES_IDLE_TIMEOUT ?? "",
    10,
  );
  if (Number.isFinite(configuredTimeout) && configuredTimeout > 0) {
    return configuredTimeout;
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
    const poolMax = getPoolMax(url);
    const maxLifetime =
      process.env.VERCEL || url.includes("pooler.supabase.com") ? 60 : null;

    if (!globalForHabitDb.__habitDbConfigLogged) {
      try {
        const databaseUrl = new URL(url);
        console.info(
          "[DB Pool] initialized",
          JSON.stringify({
            host: databaseUrl.hostname,
            deployment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
            region: process.env.VERCEL_REGION ?? null,
            max: poolMax,
            idleTimeout,
            maxLifetime,
          }),
        );
      } catch {
        console.error("[DB Pool] initialized with invalid database URL");
      }
      globalForHabitDb.__habitDbConfigLogged = true;
    }

    const client = postgres(url, {
      prepare: false,
      // Serverless instances scale horizontally, so each instance must keep a
      // tiny local pool or Supabase session pools can run out of clients.
      max: poolMax,
      max_lifetime: maxLifetime,
      ...(idleTimeout ? { idle_timeout: idleTimeout } : {}),
    });

    globalForHabitDb.__habitDbClient = client;
    globalForHabitDb.__habitDb = drizzle(client, { schema });
  }

  return globalForHabitDb.__habitDb;
}
