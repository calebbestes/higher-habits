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

export function getDb(): HabitDb | null {
    ensureDbEnv();

    const url = process.env.POSTGRES_URL;

    if (!url) {
        return null;
    }

    if (!globalForHabitDb.__habitDb) {
        const isSupabaseSessionPooler = /pooler\.supabase\.com:5432(?:\/|$)/.test(
            url,
        );
        const client = postgres(url, {
            prepare: false,
            // Supabase session poolers can be configured with a tiny pool_size.
            // Keeping this at 1 avoids exhausting the pool during local dev.
            max: isSupabaseSessionPooler ? 1 : 10,
        });

        globalForHabitDb.__habitDbClient = client;
        globalForHabitDb.__habitDb = drizzle(client, { schema });
    }

    return globalForHabitDb.__habitDb;
}
