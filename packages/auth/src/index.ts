import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
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
    user: {
      additionalFields: {
        phoneNumber: {
          type: "string",
          required: true,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (
            user: Record<string, unknown> & {
              image?: unknown;
              phoneNumber?: unknown;
            },
          ) => {
            const phoneNumber =
              typeof user.phoneNumber === "string"
                ? user.phoneNumber.trim()
                : "";
            const phoneDigits = phoneNumber.replace(/\D/g, "");

            if (phoneDigits.length < 10 || phoneDigits.length > 15) {
              throw APIError.from("BAD_REQUEST", {
                code: "INVALID_PHONE_NUMBER",
                message: "Enter a valid phone number.",
              });
            }

            const image =
              typeof user.image === "string" ? user.image.trim() : "";
            const hasProfilePicture =
              image.startsWith("data:image/") ||
              image.startsWith("https://") ||
              image.startsWith("http://");

            if (!hasProfilePicture) {
              throw APIError.from("BAD_REQUEST", {
                code: "PROFILE_PICTURE_REQUIRED",
                message: "Choose a profile picture.",
              });
            }

            return {
              data: {
                ...user,
                phoneNumber,
              },
            };
          },
        },
      },
    },
    trustedOrigins: [
      "mobile://",
      ...(process.env.NODE_ENV === "production" ? [] : ["exp://", "exp://**"]),
    ],
    plugins: [expo(), nextCookies()],
  } as never);
}
