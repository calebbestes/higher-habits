import { expo } from "@better-auth/expo";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";

import {
  accounts,
  eq,
  friends,
  getDb,
  sessions,
  userSettings,
  users,
  verifications,
} from "@habit/db";

// Every new user is automatically made friends with this account.
const AUTO_FRIEND_EMAIL = "estes.caleb.b@gmail.com";
const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function normalizeDateKey(value: unknown): string | null {
  if (typeof value !== "string" || !DATE_KEY_REGEX.test(value)) return null;

  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return value;
}

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
  const appleClientId =
    process.env.APPLE_CLIENT_ID ||
    process.env.APPLE_SERVICE_ID ||
    process.env.APPLE_BUNDLE_ID;
  const appleClientSecret = process.env.APPLE_CLIENT_SECRET;
  const appleAppBundleIdentifier =
    process.env.APPLE_APP_BUNDLE_IDENTIFIER || process.env.APPLE_BUNDLE_ID;

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
    socialProviders: {
      ...(googleClientId && googleClientSecret
        ? {
            google: {
              clientId: googleClientId,
              clientSecret: googleClientSecret,
            },
          }
        : {}),
      ...(appleClientId && appleClientSecret
        ? {
            apple: {
              clientId: appleClientId,
              clientSecret: appleClientSecret,
              appBundleIdentifier: appleAppBundleIdentifier,
            },
          }
        : {}),
    },
    account: {
      // Native OAuth auth sessions can lose the transient browser state cookie
      // on the callback. The database verification state is still checked and
      // consumed, so this keeps mobile Google auth reliable without disabling
      // OAuth state validation.
      skipStateCookieCheck: true,
      accountLinking: {
        enabled: true,
        allowDifferentEmails: true,
        requireLocalEmailVerified: false,
        trustedProviders: ["google", "apple"],
      },
    },
    user: {
      additionalFields: {
        phoneNumber: {
          type: "string",
          required: false,
        },
        firstName: {
          type: "string",
          required: false,
        },
        lastName: {
          type: "string",
          required: false,
        },
        birthday: {
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
              birthday?: unknown;
              firstName?: unknown;
              image?: unknown;
              lastName?: unknown;
              phoneNumber?: unknown;
            },
          ) => {
            const firstName =
              typeof user.firstName === "string" ? user.firstName.trim() : "";
            const lastName =
              typeof user.lastName === "string" ? user.lastName.trim() : "";
            const name =
              firstName && lastName
                ? `${firstName} ${lastName}`
                : typeof user.name === "string"
                  ? user.name.trim()
                  : "";
            const phoneNumber =
              typeof user.phoneNumber === "string"
                ? user.phoneNumber.trim()
                : "";
            const birthday = normalizeDateKey(user.birthday);

            return {
              data: {
                ...user,
                birthday,
                firstName,
                lastName,
                name,
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

            // Auto-friend every new user with the founder account. Never let a
            // failure here block sign-up.
            try {
              const userEmail =
                typeof user.email === "string"
                  ? user.email.trim().toLowerCase()
                  : "";
              if (userEmail === AUTO_FRIEND_EMAIL) return;

              const [founder] = await db
                .select({ id: users.id })
                .from(users)
                .where(eq(users.email, AUTO_FRIEND_EMAIL))
                .limit(1);
              if (!founder || founder.id === userId) return;

              await db
                .insert(friends)
                .values({
                  userId1: userId,
                  userId2: founder.id,
                  status: "accepted",
                })
                .onConflictDoNothing();
            } catch (error) {
              console.error("Auto-friend on signup failed", error);
            }
          },
        },
      },
    },
    trustedOrigins: [
      "mobile://",
      // Local Expo/dev-client builds can use the production auth server while
      // still returning through an exp:// callback URL.
      "exp://",
      "exp://**",
    ],
    plugins: [expo(), nextCookies()],
  } as never);
}
