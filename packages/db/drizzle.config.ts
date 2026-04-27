import { defineConfig } from "drizzle-kit";

import { ensureDbEnv } from "./src/env";

ensureDbEnv();

export default defineConfig({
    dialect: "postgresql",
    schema: "./src/schema.ts",
    out: "./drizzle",
    dbCredentials: {
        url:
            process.env.POSTGRES_URL ??
            "postgres://postgres:postgres@localhost:5432/habit_tracker",
    },
    verbose: true,
    strict: true,
});
