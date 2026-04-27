import { betterAuth } from "better-auth";

import { getDb } from "@habit/db";

export function createAuth() {
    const db = getDb();
    const secret = process.env.BETTER_AUTH_SECRET;

    if (!db || !secret) {
        return null;
    }

    return betterAuth({
        secret,
        baseURL: process.env.BETTER_AUTH_URL,
        database: db,
        emailAndPassword: {
            enabled: true,
        },
    } as never);
}
