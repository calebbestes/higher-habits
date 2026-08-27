import "server-only";

import { type UserSettings, getDb, pushTokens, userSettings } from "@habit/db";
import { eq, inArray } from "drizzle-orm";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// The boolean notification-preference columns on user_settings.
export type NotificationPreferenceKey = {
  [K in keyof UserSettings]: UserSettings[K] extends boolean ? K : never;
}[keyof UserSettings];

export type PushMessage = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

type ExpoPushTicket = {
  status: "ok" | "error";
  message?: string;
  details?: { error?: string };
};

/**
 * Sends a push notification to every device a user has registered, but only if
 * they have the given preference enabled. Fire-and-forget and fully guarded:
 * push failures never affect the calling request.
 */
export async function sendPushToUser(
  userId: string,
  preferenceKey: NotificationPreferenceKey,
  message: PushMessage,
): Promise<void> {
  try {
    const db = getDb();
    if (!db) return;

    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, userId))
      .limit(1);

    // Default to enabled when the user has no settings row yet.
    if (settings && settings[preferenceKey] === false) return;

    const tokens = await db
      .select({ token: pushTokens.token })
      .from(pushTokens)
      .where(eq(pushTokens.userId, userId));

    if (tokens.length === 0) return;

    await deliver(
      db,
      tokens.map((row) => row.token),
      message,
    );
  } catch (error) {
    console.error("sendPushToUser failed", error);
  }
}

async function deliver(
  db: NonNullable<ReturnType<typeof getDb>>,
  tokens: string[],
  message: PushMessage,
): Promise<void> {
  const messages = tokens.map((to) => ({
    to,
    title: message.title,
    body: message.body,
    data: message.data ?? {},
    sound: "default" as const,
  }));

  const response = await fetch(EXPO_PUSH_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    console.error("Expo push request failed", response.status);
    return;
  }

  const result = (await response.json()) as { data?: ExpoPushTicket[] };
  const tickets = result.data ?? [];

  // Remove tokens Expo reports as no longer valid.
  const deadTokens = tickets
    .map((ticket, index) =>
      ticket.status === "error" &&
      ticket.details?.error === "DeviceNotRegistered"
        ? tokens[index]
        : null,
    )
    .filter((token): token is string => token !== null);

  if (deadTokens.length > 0) {
    await db.delete(pushTokens).where(inArray(pushTokens.token, deadTokens));
  }
}
