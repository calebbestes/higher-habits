import {
  type GoalVisibility,
  friendGroupMembers,
  friendMessages,
  type getDb,
  habitAudienceFriends,
  habitAudienceGroups,
  sharedGoalParticipants,
} from "@habit/db";
import { and, eq, inArray, or } from "drizzle-orm";

type VisibilityDb = NonNullable<ReturnType<typeof getDb>>;

type GoalRelationshipRow = {
  id: string;
  period?: "daily" | "weekly" | "monthly";
  priority?: "high" | "low";
};

export async function getGoalIdsTiedToFriend(
  db: VisibilityDb,
  viewerId: string,
  ownerId: string,
  goalRows: GoalRelationshipRow[],
): Promise<Set<string>> {
  const tiedGoalIds = goalRows.map((goal) => goal.id);
  const relatedGoalIds = new Set<string>();

  if (tiedGoalIds.length === 0) {
    return relatedGoalIds;
  }

  const [
    audienceFriendLinks,
    audienceGroupLinks,
    incentiveLinks,
    ownerSharedLinks,
  ] = await Promise.all([
    db
      .select({
        goalId: habitAudienceFriends.habitId,
      })
      .from(habitAudienceFriends)
      .where(
        and(
          eq(habitAudienceFriends.userId, ownerId),
          eq(habitAudienceFriends.friendUserId, viewerId),
          inArray(habitAudienceFriends.habitId, tiedGoalIds),
        ),
      ),
    db
      .select({
        goalId: habitAudienceGroups.habitId,
      })
      .from(habitAudienceGroups)
      .innerJoin(
        friendGroupMembers,
        eq(habitAudienceGroups.groupId, friendGroupMembers.groupId),
      )
      .where(
        and(
          eq(habitAudienceGroups.userId, ownerId),
          eq(friendGroupMembers.memberUserId, viewerId),
          inArray(habitAudienceGroups.habitId, tiedGoalIds),
        ),
      ),
    db
      .select({
        goalId: friendMessages.goalId,
        goalScope: friendMessages.goalScope,
      })
      .from(friendMessages)
      .where(
        and(
          eq(friendMessages.type, "incentive"),
          eq(friendMessages.accepted, true),
          or(
            and(
              eq(friendMessages.senderId, viewerId),
              eq(friendMessages.recipientId, ownerId),
            ),
            and(
              eq(friendMessages.senderId, ownerId),
              eq(friendMessages.recipientId, viewerId),
            ),
          ),
        ),
      ),
    db
      .select({
        goalId: sharedGoalParticipants.personalGoalId,
        sharedGoalId: sharedGoalParticipants.sharedGoalId,
      })
      .from(sharedGoalParticipants)
      .where(
        and(
          eq(sharedGoalParticipants.userId, ownerId),
          eq(sharedGoalParticipants.status, "accepted"),
          inArray(sharedGoalParticipants.personalGoalId, tiedGoalIds),
        ),
      ),
  ]);

  for (const link of [...audienceFriendLinks, ...audienceGroupLinks]) {
    relatedGoalIds.add(link.goalId);
  }

  for (const link of incentiveLinks) {
    if (link.goalScope === "single" && link.goalId) {
      if (tiedGoalIds.includes(link.goalId)) relatedGoalIds.add(link.goalId);
      continue;
    }

    if (link.goalScope === "all") {
      for (const goal of goalRows) {
        if (goal.period === "daily") {
          relatedGoalIds.add(goal.id);
        }
      }
      continue;
    }

    if (link.goalScope === "high") {
      for (const goal of goalRows) {
        if (goal.period === "daily" && goal.priority === "high") {
          relatedGoalIds.add(goal.id);
        }
      }
    }
  }

  const sharedGoalIds = [
    ...new Set(ownerSharedLinks.map((link) => link.sharedGoalId)),
  ];
  if (sharedGoalIds.length === 0) {
    return relatedGoalIds;
  }

  const viewerSharedLinks = await db
    .select({ sharedGoalId: sharedGoalParticipants.sharedGoalId })
    .from(sharedGoalParticipants)
    .where(
      and(
        eq(sharedGoalParticipants.userId, viewerId),
        eq(sharedGoalParticipants.status, "accepted"),
        inArray(sharedGoalParticipants.sharedGoalId, sharedGoalIds),
      ),
    );
  const viewerSharedGoalIds = new Set(
    viewerSharedLinks.map((link) => link.sharedGoalId),
  );

  for (const link of ownerSharedLinks) {
    if (link.goalId && viewerSharedGoalIds.has(link.sharedGoalId)) {
      relatedGoalIds.add(link.goalId);
    }
  }

  return relatedGoalIds;
}

export async function getVisibleGoalIdsForFriend(
  db: VisibilityDb,
  viewerId: string,
  ownerId: string,
  goalRows: Array<
    GoalRelationshipRow & {
      visibility: GoalVisibility;
    }
  >,
): Promise<Set<string>> {
  const visibleGoalIds = new Set(
    goalRows
      .filter((goal) => goal.visibility === "all_friends")
      .map((goal) => goal.id),
  );
  const goalFriendRows = goalRows.filter(
    (goal) => goal.visibility === "goal_friends",
  );
  const relatedGoalIds = await getGoalIdsTiedToFriend(
    db,
    viewerId,
    ownerId,
    goalFriendRows,
  );

  for (const goalId of relatedGoalIds) {
    visibleGoalIds.add(goalId);
  }

  return visibleGoalIds;
}
