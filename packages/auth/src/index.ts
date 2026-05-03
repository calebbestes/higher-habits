import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import { accounts, getDb, sessions, users, verifications } from "@habit/db";

export function createAuth() {
    const db = getDb();
    const secret =
        process.env.BETTER_AUTH_SECRET ||
        (process.env.NODE_ENV === "production"
            ? undefined
            : "higher-habits-local-dev-secret");
    const baseURL =
        process.env.BETTER_AUTH_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        "http://localhost:3000";

    if (!db || !secret) {
        return null;
    }

    return betterAuth({
        secret,
        baseURL,
        basePath: "/api/auth",
        database: drizzleAdapter(db, {
            provider: "pg",
            camelCase: true,
            schema: {
                user: users,
                session: sessions,
                account: accounts,
                verification: verifications,
            },
        }),
        emailAndPassword: {
            enabled: true,
        },
        plugins: [nextCookies()],
    } as never);
}
