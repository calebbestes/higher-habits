import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";

import {
  accounts,
  getDb,
  sessions,
  userSettings,
  users,
  verifications,
} from "@habit/db";

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
  const googleClientId =
    process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID;
  const googleClientSecret =
    process.env.GOOGLE_CLIENT_SECRET || process.env.GOOGLE_OAUTH_CLIENT_SECRET;

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
    socialProviders:
      googleClientId && googleClientSecret
        ? {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
              accessType: "offline",
              prompt: "consent",
              scope: ["https://www.googleapis.com/auth/calendar.events"],
            },
          }
        : {},
    account: {
      // Native OAuth auth sessions can lose the transient browser state cookie
      // on the callback. The database verification state is still checked and
      // consumed, so this keeps mobile Google auth reliable without disabling
      // OAuth state validation.
      skipStateCookieCheck: true,
      accountLinking: {
        enabled: true,
        requireLocalEmailVerified: false,
        trustedProviders: ["google"],
      },
    },
    user: {
      additionalFields: {
        phoneNumber: {
          type: "string",
          required: false,
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

            const image =
              typeof user.image === "string" ? user.image.trim() : "";
            const hasProfilePicture =
              image.startsWith("data:image/") ||
              image.startsWith("https://") ||
              image.startsWith("http://");
            const isVerifiedOAuthProfile =
              user.emailVerified === true && hasProfilePicture;

            if (
              !isVerifiedOAuthProfile &&
              (phoneDigits.length < 10 || phoneDigits.length > 15)
            ) {
              throw APIError.from("BAD_REQUEST", {
                code: "INVALID_PHONE_NUMBER",
                message: "Enter a valid phone number.",
              });
            }

            if (!hasProfilePicture) {
              throw APIError.from("BAD_REQUEST", {
                code: "PROFILE_PICTURE_REQUIRED",
                message: "Choose a profile picture.",
              });
            }

            return {
              data: {
                ...user,
                phoneNumber: phoneNumber || null,
              },
            };
          },
          after: async (user: Record<string, unknown>) => {
            const userId = typeof user.id === "string" ? user.id : "";
            if (!userId) return;

            await db
              .insert(userSettings)
              .values({
                userId,
                onboardingCompleted: false,
              })
              .onConflictDoNothing({ target: userSettings.userId });
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
