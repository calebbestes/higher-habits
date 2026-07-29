import "server-only";

import {
  friends,
  type getDb,
  goalCheckpointPhotos,
  goalCheckpoints,
  goalLogPhotos,
  goalLogs,
  goals,
  habits,
  users,
} from "@habit/db";
import { and, eq, or } from "drizzle-orm";

import { getGoalIdsTiedToFriend } from "@/lib/goal-visibility";
import { sendPushToUser } from "@/lib/push";

type Db = NonNullable<ReturnType<typeof getDb>>;

function getPostContentVerb(hasNotes: boolean, hasPhoto: boolean) {
  if (hasNotes && hasPhoto) return "posted an update";
  if (hasPhoto) return "posted a photo";
  return "posted a note";
}

async function getAcceptedFriendIds(db: Db, userId: string) {
  const rows = await db
    .select({
      userId1: friends.userId1,
      userId2: friends.userId2,
    })
    .from(friends)
    .where(
      and(
        eq(friends.status, "accepted"),
        or(eq(friends.userId1, userId), eq(friends.userId2, userId)),
      ),
    );

  return rows.map((row) =>
    row.userId1 === userId ? row.userId2 : row.userId1,
  );
}

export async function notifyFriendsOfVisibleHabitPost(
  db: Db,
  goalLogId: string,
) {
  try {
    const [entry] = await db
      .select({
        goalLogId: goalLogs.id,
        ownerId: goalLogs.userId,
        ownerName: users.name,
        goalId: habits.id,
        goalName: habits.name,
        goalPeriod: habits.period,
        goalPriority: habits.priority,
        notes: goalLogs.notes,
        status: goalLogs.status,
        visibility: goalLogs.visibility,
      })
      .from(goalLogs)
      .innerJoin(habits, eq(goalLogs.goalId, habits.id))
      .innerJoin(users, eq(goalLogs.userId, users.id))
      .where(
        and(eq(goalLogs.id, goalLogId), eq(habits.userId, goalLogs.userId)),
      )
      .limit(1);

    if (
      !entry ||
      entry.status !== "complete" ||
      entry.visibility === "only_me"
    ) {
      return;
    }

    const hasNotes = Boolean(entry.notes.trim());
    const [photo] = await db
      .select({ id: goalLogPhotos.id })
      .from(goalLogPhotos)
      .where(
        and(
          eq(goalLogPhotos.goalLogId, goalLogId),
          eq(goalLogPhotos.userId, entry.ownerId),
        ),
      )
      .limit(1);

    const hasPhoto = Boolean(photo);
    if (!hasNotes && !hasPhoto) return;

    let recipientIds = await getAcceptedFriendIds(db, entry.ownerId);
    if (entry.visibility === "goal_friends") {
      const visibleChecks = await Promise.all(
        recipientIds.map(async (friendId) => {
          const tiedGoalIds = await getGoalIdsTiedToFriend(
            db,
            friendId,
            entry.ownerId,
            [
              {
                id: entry.goalId,
                period: entry.goalPeriod,
                priority: entry.goalPriority,
              },
            ],
          );
          return tiedGoalIds.has(entry.goalId) ? friendId : null;
        }),
      );
      recipientIds = visibleChecks.filter((id): id is string => id !== null);
    }

    await Promise.all(
      recipientIds.map((recipientId) =>
        sendPushToUser(recipientId, "notifyFriendPosts", {
          title: entry.ownerName,
          body: `${getPostContentVerb(hasNotes, hasPhoto)} for ${entry.goalName}.`,
          data: { goalLogId, kind: "journal", type: "friend_post" },
        }),
      ),
    );
  } catch (error) {
    console.error("notifyFriendsOfVisibleHabitPost failed", error);
  }
}

export async function notifyFriendsOfVisibleCheckpointPost(
  db: Db,
  checkpointId: string,
) {
  try {
    const [entry] = await db
      .select({
        checkpointId: goalCheckpoints.id,
        checkpointTitle: goalCheckpoints.title,
        completedAt: goalCheckpoints.completedAt,
        goalTitle: goals.title,
        notes: goalCheckpoints.notes,
        ownerId: goalCheckpoints.userId,
        ownerName: users.name,
        visibility: goalCheckpoints.visibility,
      })
      .from(goalCheckpoints)
      .innerJoin(goals, eq(goalCheckpoints.goalId, goals.id))
      .innerJoin(users, eq(goalCheckpoints.userId, users.id))
      .where(
        and(
          eq(goalCheckpoints.id, checkpointId),
          eq(goals.userId, goalCheckpoints.userId),
        ),
      )
      .limit(1);

    if (!entry || !entry.completedAt || entry.visibility !== "all_friends") {
      return;
    }

    const hasNotes = Boolean(entry.notes?.trim());
    const [photo] = await db
      .select({ id: goalCheckpointPhotos.id })
      .from(goalCheckpointPhotos)
      .where(
        and(
          eq(goalCheckpointPhotos.checkpointId, checkpointId),
          eq(goalCheckpointPhotos.userId, entry.ownerId),
        ),
      )
      .limit(1);

    const hasPhoto = Boolean(photo);
    if (!hasNotes && !hasPhoto) return;

    const recipientIds = await getAcceptedFriendIds(db, entry.ownerId);
    await Promise.all(
      recipientIds.map((recipientId) =>
        sendPushToUser(recipientId, "notifyFriendPosts", {
          title: entry.ownerName,
          body: `${getPostContentVerb(hasNotes, hasPhoto)} for ${entry.goalTitle} · ${entry.checkpointTitle}.`,
          data: { checkpointId, kind: "journal", type: "friend_post" },
        }),
      ),
    );
  } catch (error) {
    console.error("notifyFriendsOfVisibleCheckpointPost failed", error);
  }
}
