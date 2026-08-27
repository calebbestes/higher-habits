import {
  type NotificationPreferenceKey,
  type PushMessage,
  sendPushToUser,
} from "@/lib/push";
import { type getDb, notificationDeliveries } from "@habit/db";

type Database = NonNullable<ReturnType<typeof getDb>>;

/**
 * Claims a notification before sending it. The unique key makes retries from
 * overlapping cron invocations harmless.
 */
export async function sendNotificationOnce({
  db,
  dedupeKey,
  message,
  preferenceKey,
  userId,
}: {
  db: Database;
  dedupeKey: string;
  message: PushMessage;
  preferenceKey: NotificationPreferenceKey;
  userId: string;
}) {
  const [claimed] = await db
    .insert(notificationDeliveries)
    .values({ userId, dedupeKey })
    .onConflictDoNothing()
    .returning({ id: notificationDeliveries.id });

  if (!claimed) return false;

  await sendPushToUser(userId, preferenceKey, message);
  return true;
}
