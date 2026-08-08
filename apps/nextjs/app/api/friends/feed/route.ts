import {
  categories,
  dailyReflectionAudienceFriends,
  dailyReflectionAudienceGroups,
  dailyReflectionComments,
  dailyReflectionPhotos,
  dailyReflectionPosts,
  dailyReflectionProps,
  feedComments,
  feedProps,
  friendGroupMembers,
  friends,
  getDb,
  goalCheckpointPhotos,
  goalCheckpoints,
  goalLogPhotos,
  goalLogs,
  goals,
  habits,
  users,
} from "@habit/db";
import { and, asc, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { getGoalIdsTiedToFriend } from "@/lib/goal-visibility";
import {
  GOAL_PHOTOS_BUCKET,
  getSupabaseStorageAdmin,
} from "@/lib/supabase-storage";

const getDatabase = () => getDb() ?? null;

type FeedCommentRow = {
  id: string;
  goalLogId: string;
  userId: string;
  parentCommentId: string | null;
  authorName: string;
  authorImage: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

type ReflectionCommentRow = Omit<FeedCommentRow, "goalLogId"> & {
  reflectionPostId: string;
};

type SerializedFeedComment = {
  id: string;
  userId: string;
  parentCommentId: string | null;
  authorName: string;
  authorImage: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  canDelete: boolean;
  replies: SerializedFeedComment[];
};

function groupNestedComments(
  commentRows: FeedCommentRow[],
  currentUserId: string,
) {
  const commentsById = new Map<string, SerializedFeedComment>();
  const goalLogIdByCommentId = new Map<string, string>();
  const rootCommentsByGoalLogId = new Map<string, SerializedFeedComment[]>();

  for (const comment of commentRows) {
    commentsById.set(comment.id, {
      id: comment.id,
      userId: comment.userId,
      parentCommentId: comment.parentCommentId,
      authorName: comment.authorName,
      authorImage: comment.authorImage,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      canDelete: comment.userId === currentUserId,
      replies: [],
    });
    goalLogIdByCommentId.set(comment.id, comment.goalLogId);
  }

  for (const comment of commentRows) {
    const serialized = commentsById.get(comment.id);
    if (!serialized) continue;

    const parent = comment.parentCommentId
      ? commentsById.get(comment.parentCommentId)
      : null;
    const parentGoalLogId = comment.parentCommentId
      ? goalLogIdByCommentId.get(comment.parentCommentId)
      : null;

    if (parent && parentGoalLogId === comment.goalLogId) {
      parent.replies.push(serialized);
      continue;
    }

    const comments = rootCommentsByGoalLogId.get(comment.goalLogId) ?? [];
    comments.push(serialized);
    rootCommentsByGoalLogId.set(comment.goalLogId, comments);
  }

  return rootCommentsByGoalLogId;
}

function groupNestedReflectionComments(
  commentRows: ReflectionCommentRow[],
  currentUserId: string,
) {
  const commentsById = new Map<string, SerializedFeedComment>();
  const postIdByCommentId = new Map<string, string>();
  const rootCommentsByPostId = new Map<string, SerializedFeedComment[]>();

  for (const comment of commentRows) {
    commentsById.set(comment.id, {
      id: comment.id,
      userId: comment.userId,
      parentCommentId: comment.parentCommentId,
      authorName: comment.authorName,
      authorImage: comment.authorImage,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      canDelete: comment.userId === currentUserId,
      replies: [],
    });
    postIdByCommentId.set(comment.id, comment.reflectionPostId);
  }

  for (const comment of commentRows) {
    const serialized = commentsById.get(comment.id);
    if (!serialized) continue;

    const parent = comment.parentCommentId
      ? commentsById.get(comment.parentCommentId)
      : null;
    const parentPostId = comment.parentCommentId
      ? postIdByCommentId.get(comment.parentCommentId)
      : null;

    if (parent && parentPostId === comment.reflectionPostId) {
      parent.replies.push(serialized);
      continue;
    }

    const comments = rootCommentsByPostId.get(comment.reflectionPostId) ?? [];
    comments.push(serialized);
    rootCommentsByPostId.set(comment.reflectionPostId, comments);
  }

  return rootCommentsByPostId;
}

async function createSignedPhotoUrl(storagePath: string) {
  const storage = getSupabaseStorageAdmin();
  const { data, error } = await storage.storage
    .from(GOAL_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  if (error) {
    throw new Error(`Could not open photo: ${error.message}`);
  }

  return data.signedUrl;
}

type HabitCompletionHighlightRow = {
  friendId: string;
  goalId: string;
  goalPeriod: (typeof habits.period.enumValues)[number];
  dateKey: string;
};

function dateKeyToNoon(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1, 12);
}

function addDaysKey(dateKey: string, days: number) {
  const date = dateKeyToNoon(dateKey);
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function daysBetweenDateKeys(fromDateKey: string, toDateKey: string) {
  return Math.max(
    1,
    Math.round(
      (dateKeyToNoon(toDateKey).getTime() -
        dateKeyToNoon(fromDateKey).getTime()) /
        86_400_000,
    ),
  );
}

function formatDayCount(days: number) {
  return `${days} ${days === 1 ? "day" : "days"}`;
}

function mountainDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

function isSameCalendarWeek(leftDateKey: string, rightDateKey: string) {
  const left = dateKeyToNoon(leftDateKey);
  const right = dateKeyToNoon(rightDateKey);
  const leftWeekStart = new Date(left);
  const rightWeekStart = new Date(right);
  leftWeekStart.setDate(left.getDate() - left.getDay());
  rightWeekStart.setDate(right.getDate() - right.getDay());
  return leftWeekStart.toDateString() === rightWeekStart.toDateString();
}

function getHabitCompletionHighlights(
  row: HabitCompletionHighlightRow,
  rows: HabitCompletionHighlightRow[],
) {
  const habitRows = rows
    .filter(
      (candidate) =>
        candidate.friendId === row.friendId && candidate.goalId === row.goalId,
    )
    .map((candidate) => candidate.dateKey);
  const uniqueDateKeys = [...new Set(habitRows)].sort();
  const completedDateKeys = new Set(uniqueDateKeys);
  const previousDateKeys = uniqueDateKeys.filter(
    (dateKey) => dateKey < row.dateKey,
  );
  const previousDateKey = previousDateKeys.at(-1) ?? null;
  const highlights: string[] = [];

  if (row.goalPeriod === "daily") {
    let streakDays = 1;
    let cursor = addDaysKey(row.dateKey, -1);
    while (completedDateKeys.has(cursor)) {
      streakDays += 1;
      cursor = addDaysKey(cursor, -1);
    }

    if (streakDays >= 2) {
      highlights.push(`${streakDays}-day streak`);
    }
  }

  if (!highlights.length && previousDateKey) {
    highlights.push(
      `First time in ${formatDayCount(
        daysBetweenDateKeys(previousDateKey, row.dateKey),
      )}`,
    );
  }

  if (!highlights.length) {
    highlights.push("First logged completion");
  }

  const completedThisWeek = uniqueDateKeys.filter((dateKey) =>
    isSameCalendarWeek(dateKey, row.dateKey),
  ).length;
  if (completedThisWeek >= 2) {
    highlights.push(`${completedThisWeek}x this week`);
  }

  return highlights.slice(0, 2);
}

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const friendRows = await db
      .select({
        id: users.id,
        name: users.name,
        image: users.image,
        phoneNumber: users.phoneNumber,
        birthday: users.birthday,
      })
      .from(friends)
      .innerJoin(
        users,
        or(
          and(eq(friends.userId1, user.id), eq(friends.userId2, users.id)),
          and(eq(friends.userId2, user.id), eq(friends.userId1, users.id)),
        ),
      )
      .where(
        and(
          eq(friends.status, "accepted"),
          or(eq(friends.userId1, user.id), eq(friends.userId2, user.id)),
        ),
      );

    const friendsById = new Map(
      friendRows.map((friend) => [friend.id, friend]),
    );
    const friendIds = [...friendsById.keys()];

    if (friendIds.length === 0) {
      return NextResponse.json([]);
    }

    const logRows = await db
      .select({
        entryId: goalLogs.id,
        friendId: goalLogs.userId,
        goalId: habits.id,
        goalName: habits.name,
        goalIcon: habits.iconKey,
        categoryId: categories.id,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        visibility: goalLogs.visibility,
        goalPeriod: habits.period,
        goalPriority: habits.priority,
        dateKey: goalLogs.date,
        notes: goalLogs.notes,
        updatedAt: goalLogs.updatedAt,
      })
      .from(goalLogs)
      .innerJoin(habits, eq(goalLogs.goalId, habits.id))
      .innerJoin(categories, eq(habits.categoryId, categories.id))
      .where(
        and(
          inArray(goalLogs.userId, friendIds),
          eq(goalLogs.status, "complete"),
          eq(habits.userId, goalLogs.userId),
        ),
      )
      .orderBy(desc(goalLogs.updatedAt), desc(goalLogs.date));

    const goalRowsByFriendId = new Map<
      string,
      Map<
        string,
        {
          id: string;
          period: (typeof habits.period.enumValues)[number];
          priority: (typeof habits.priority.enumValues)[number];
        }
      >
    >();
    for (const row of logRows) {
      const goalsById =
        goalRowsByFriendId.get(row.friendId) ??
        new Map<
          string,
          {
            id: string;
            period: (typeof habits.period.enumValues)[number];
            priority: (typeof habits.priority.enumValues)[number];
          }
        >();
      goalsById.set(row.goalId, {
        id: row.goalId,
        period: row.goalPeriod,
        priority: row.goalPriority,
      });
      goalRowsByFriendId.set(row.friendId, goalsById);
    }

    const tiedGoalIdsByFriendId = new Map<string, Set<string>>();
    await Promise.all(
      [...goalRowsByFriendId.entries()].map(async ([friendId, goalsById]) => {
        tiedGoalIdsByFriendId.set(
          friendId,
          await getGoalIdsTiedToFriend(db, user.id, friendId, [
            ...goalsById.values(),
          ]),
        );
      }),
    );
    const visibleLogRows = logRows.filter(
      (row) =>
        row.visibility === "all_friends" ||
        (row.visibility === "goal_friends" &&
          tiedGoalIdsByFriendId.get(row.friendId)?.has(row.goalId)),
    );
    const visibleLogIds = visibleLogRows.map((row) => row.entryId);
    const photoRows =
      visibleLogIds.length > 0
        ? await db
            .select({
              entryId: goalLogPhotos.goalLogId,
              photoId: goalLogPhotos.id,
              storagePath: goalLogPhotos.storagePath,
              contentType: goalLogPhotos.contentType,
              photoCreatedAt: goalLogPhotos.createdAt,
            })
            .from(goalLogPhotos)
            .where(inArray(goalLogPhotos.goalLogId, visibleLogIds))
            .orderBy(desc(goalLogPhotos.createdAt))
        : [];

    const signedPhotoRows = await Promise.all(
      photoRows.map(async (row) => ({
        ...row,
        url: await createSignedPhotoUrl(row.storagePath),
      })),
    );
    const photosByLogId = signedPhotoRows.reduce<
      Map<
        string,
        Array<{
          id: string;
          url: string;
          contentType: string;
          createdAt: string;
        }>
      >
    >((photosByLog, row) => {
      const photos = photosByLog.get(row.entryId) ?? [];
      photos.push({
        id: row.photoId,
        url: row.url,
        contentType: row.contentType,
        createdAt: row.photoCreatedAt.toISOString(),
      });
      photosByLog.set(row.entryId, photos);
      return photosByLog;
    }, new Map());

    const entries = new Map<
      string,
      {
        id: string;
        kind: "habit" | "goal_checkpoint" | "reflection" | "birthday";
        friend: {
          id: string;
          name: string;
          image: string | null;
          phoneNumber?: string | null;
        };
        goal: { id: string; name: string; icon: string };
        category: { id: string; name: string; icon: string } | null;
        dateKey: string;
        notes: string;
        reflectionPrompt: string | null;
        updatedAt: string;
        canDeletePhotos: boolean;
        postType: "completion" | "journal";
        highlights: string[];
        props: {
          count: number;
          hasPropped: boolean;
        };
        comments: Array<{
          id: string;
          userId: string;
          parentCommentId: string | null;
          authorName: string;
          authorImage: string | null;
          body: string;
          createdAt: string;
          updatedAt: string;
          canDelete: boolean;
          replies: SerializedFeedComment[];
        }>;
        photos: Array<{
          id: string;
          url: string;
          contentType: string;
          createdAt: string;
        }>;
      }
    >();

    const todayKey = mountainDateKey();
    const todayMonthDay = todayKey.slice(5);
    for (const friend of friendRows) {
      if (!friend.birthday || friend.birthday.slice(5) !== todayMonthDay) {
        continue;
      }

      entries.set(`birthday:${friend.id}:${todayKey}`, {
        id: `birthday:${friend.id}:${todayKey}`,
        kind: "birthday",
        friend,
        goal: {
          id: `birthday:${friend.id}`,
          name: "Birthday",
          icon: "gift.fill",
        },
        category: null,
        dateKey: todayKey,
        notes: `It's ${friend.name}'s birthday today.`,
        reflectionPrompt: null,
        updatedAt: dateKeyToNoon(todayKey).toISOString(),
        canDeletePhotos: false,
        postType: "journal",
        highlights: ["Birthday"],
        props: { count: 0, hasPropped: false },
        comments: [],
        photos: friend.image
          ? [
              {
                id: `birthday-photo:${friend.id}`,
                url: friend.image,
                contentType: "image/*",
                createdAt: dateKeyToNoon(todayKey).toISOString(),
              },
            ]
          : [],
      });
    }

    for (const row of visibleLogRows) {
      const friend = friendsById.get(row.friendId);
      if (!friend) continue;
      const photos = photosByLogId.get(row.entryId) ?? [];
      const postType =
        !row.notes.trim() && photos.length === 0 ? "completion" : "journal";

      entries.set(row.entryId, {
        id: row.entryId,
        kind: "habit",
        friend,
        goal: {
          id: row.goalId,
          name: row.goalName,
          icon: row.goalIcon || "mdi:circle",
        },
        category: {
          id: row.categoryId,
          name: row.categoryName,
          icon: row.categoryIcon,
        },
        dateKey: row.dateKey,
        notes: row.notes,
        reflectionPrompt: null,
        updatedAt: row.updatedAt.toISOString(),
        canDeletePhotos: row.friendId === user.id,
        postType,
        highlights: getHabitCompletionHighlights(row, visibleLogRows),
        props: {
          count: 0,
          hasPropped: false,
        },
        comments: [],
        photos,
      });
    }

    const entryIds = [...entries.keys()];

    if (entryIds.length > 0) {
      const [propRows, commentRows] = await Promise.all([
        db
          .select({
            goalLogId: feedProps.goalLogId,
            userId: feedProps.userId,
          })
          .from(feedProps)
          .where(inArray(feedProps.goalLogId, entryIds)),
        db
          .select({
            id: feedComments.id,
            goalLogId: feedComments.goalLogId,
            userId: feedComments.userId,
            parentCommentId: feedComments.parentCommentId,
            authorName: users.name,
            authorImage: users.image,
            body: feedComments.body,
            createdAt: feedComments.createdAt,
            updatedAt: feedComments.updatedAt,
          })
          .from(feedComments)
          .innerJoin(users, eq(feedComments.userId, users.id))
          .where(inArray(feedComments.goalLogId, entryIds))
          .orderBy(asc(feedComments.createdAt)),
      ]);

      for (const prop of propRows) {
        const entry = entries.get(prop.goalLogId);
        if (!entry) continue;

        entry.props.count += 1;
        if (prop.userId === user.id) {
          entry.props.hasPropped = true;
        }
      }

      const commentsByGoalLogId = groupNestedComments(commentRows, user.id);
      for (const [goalLogId, comments] of commentsByGoalLogId) {
        const entry = entries.get(goalLogId);
        if (!entry) continue;

        entry.comments = comments;
      }
    }

    // Completed goal checkpoints shared with all friends. Planning goals have no
    // per-friend tie, so only "all_friends" checkpoints surface in the feed.
    const checkpointRows = await db
      .select({
        entryId: goalCheckpoints.id,
        friendId: goalCheckpoints.userId,
        goalId: goalCheckpoints.goalId,
        goalTitle: goals.title,
        checkpointTitle: goalCheckpoints.title,
        notes: goalCheckpoints.notes,
        completedAt: goalCheckpoints.completedAt,
        updatedAt: goalCheckpoints.updatedAt,
      })
      .from(goalCheckpoints)
      .innerJoin(goals, eq(goalCheckpoints.goalId, goals.id))
      .where(
        and(
          inArray(goalCheckpoints.userId, friendIds),
          isNotNull(goalCheckpoints.completedAt),
          eq(goalCheckpoints.visibility, "all_friends"),
          eq(goals.userId, goalCheckpoints.userId),
        ),
      )
      .orderBy(desc(goalCheckpoints.updatedAt));

    const checkpointIds = checkpointRows.map((row) => row.entryId);
    const checkpointPhotoRows =
      checkpointIds.length > 0
        ? await db
            .select({
              entryId: goalCheckpointPhotos.checkpointId,
              photoId: goalCheckpointPhotos.id,
              storagePath: goalCheckpointPhotos.storagePath,
              contentType: goalCheckpointPhotos.contentType,
              photoCreatedAt: goalCheckpointPhotos.createdAt,
            })
            .from(goalCheckpointPhotos)
            .where(inArray(goalCheckpointPhotos.checkpointId, checkpointIds))
            .orderBy(desc(goalCheckpointPhotos.createdAt))
        : [];

    const checkpointPhotosById = (
      await Promise.all(
        checkpointPhotoRows.map(async (row) => ({
          ...row,
          url: await createSignedPhotoUrl(row.storagePath),
        })),
      )
    ).reduce<
      Map<
        string,
        Array<{
          id: string;
          url: string;
          contentType: string;
          createdAt: string;
        }>
      >
    >((photosByCheckpoint, row) => {
      const photos = photosByCheckpoint.get(row.entryId) ?? [];
      photos.push({
        id: row.photoId,
        url: row.url,
        contentType: row.contentType,
        createdAt: row.photoCreatedAt.toISOString(),
      });
      photosByCheckpoint.set(row.entryId, photos);
      return photosByCheckpoint;
    }, new Map());

    for (const row of checkpointRows) {
      const friend = friendsById.get(row.friendId);
      if (!friend || !row.completedAt) continue;
      const photos = checkpointPhotosById.get(row.entryId) ?? [];
      const postType =
        !row.notes?.trim() && photos.length === 0 ? "completion" : "journal";

      entries.set(row.entryId, {
        id: row.entryId,
        kind: "goal_checkpoint",
        friend,
        goal: {
          id: row.goalId,
          name: `${row.goalTitle} · ${row.checkpointTitle}`,
          icon: "checkmark.seal.fill",
        },
        category: null,
        dateKey: row.completedAt.toISOString().slice(0, 10),
        notes: row.notes ?? "",
        reflectionPrompt: null,
        updatedAt: row.updatedAt.toISOString(),
        canDeletePhotos: row.friendId === user.id,
        postType,
        highlights: ["Checkpoint complete"],
        props: { count: 0, hasPropped: false },
        comments: [],
        photos,
      });
    }

    const reflectionRows = await db
      .select({
        entryId: dailyReflectionPosts.id,
        friendId: dailyReflectionPosts.userId,
        prompt: dailyReflectionPosts.prompt,
        body: dailyReflectionPosts.body,
        visibility: dailyReflectionPosts.visibility,
        dateKey: dailyReflectionPosts.date,
        updatedAt: dailyReflectionPosts.updatedAt,
      })
      .from(dailyReflectionPosts)
      .where(
        and(
          inArray(dailyReflectionPosts.userId, friendIds),
          or(
            eq(dailyReflectionPosts.visibility, "all_friends"),
            eq(dailyReflectionPosts.visibility, "goal_friends"),
          ),
        ),
      )
      .orderBy(desc(dailyReflectionPosts.updatedAt));

    const rawReflectionIds = reflectionRows.map((row) => row.entryId);
    const [reflectionAudienceFriendRows, reflectionAudienceGroupRows] =
      rawReflectionIds.length > 0
        ? await Promise.all([
            db
              .select({
                reflectionPostId:
                  dailyReflectionAudienceFriends.reflectionPostId,
              })
              .from(dailyReflectionAudienceFriends)
              .where(
                and(
                  inArray(
                    dailyReflectionAudienceFriends.reflectionPostId,
                    rawReflectionIds,
                  ),
                  eq(dailyReflectionAudienceFriends.friendUserId, user.id),
                ),
              ),
            db
              .select({
                reflectionPostId:
                  dailyReflectionAudienceGroups.reflectionPostId,
              })
              .from(dailyReflectionAudienceGroups)
              .innerJoin(
                friendGroupMembers,
                eq(
                  dailyReflectionAudienceGroups.groupId,
                  friendGroupMembers.groupId,
                ),
              )
              .where(
                and(
                  inArray(
                    dailyReflectionAudienceGroups.reflectionPostId,
                    rawReflectionIds,
                  ),
                  eq(friendGroupMembers.memberUserId, user.id),
                ),
              ),
          ])
        : [[], []];
    const selectedReflectionIds = new Set([
      ...reflectionAudienceFriendRows.map((row) => row.reflectionPostId),
      ...reflectionAudienceGroupRows.map((row) => row.reflectionPostId),
    ]);
    const visibleReflectionRows = reflectionRows.filter(
      (row) =>
        row.visibility === "all_friends" ||
        selectedReflectionIds.has(row.entryId),
    );
    const reflectionIds = visibleReflectionRows.map((row) => row.entryId);
    const reflectionPhotoRows =
      reflectionIds.length > 0
        ? await db
            .select({
              entryId: dailyReflectionPhotos.reflectionPostId,
              photoId: dailyReflectionPhotos.id,
              storagePath: dailyReflectionPhotos.storagePath,
              contentType: dailyReflectionPhotos.contentType,
              photoCreatedAt: dailyReflectionPhotos.createdAt,
            })
            .from(dailyReflectionPhotos)
            .where(
              inArray(dailyReflectionPhotos.reflectionPostId, reflectionIds),
            )
            .orderBy(desc(dailyReflectionPhotos.createdAt))
        : [];

    const reflectionPhotosById = (
      await Promise.all(
        reflectionPhotoRows.map(async (row) => ({
          ...row,
          url: await createSignedPhotoUrl(row.storagePath),
        })),
      )
    ).reduce<
      Map<
        string,
        Array<{
          id: string;
          url: string;
          contentType: string;
          createdAt: string;
        }>
      >
    >((photosByReflection, row) => {
      const photos = photosByReflection.get(row.entryId) ?? [];
      photos.push({
        id: row.photoId,
        url: row.url,
        contentType: row.contentType,
        createdAt: row.photoCreatedAt.toISOString(),
      });
      photosByReflection.set(row.entryId, photos);
      return photosByReflection;
    }, new Map());

    for (const row of visibleReflectionRows) {
      const friend = friendsById.get(row.friendId);
      if (!friend) continue;
      const photos = reflectionPhotosById.get(row.entryId) ?? [];

      entries.set(row.entryId, {
        id: row.entryId,
        kind: "reflection",
        friend,
        goal: {
          id: row.entryId,
          name: "Daily reflection",
          icon: "sparkles",
        },
        category: null,
        dateKey: row.dateKey,
        notes: row.body,
        reflectionPrompt: row.prompt,
        updatedAt: row.updatedAt.toISOString(),
        canDeletePhotos: false,
        postType: "journal",
        highlights: ["Daily reflection"],
        props: { count: 0, hasPropped: false },
        comments: [],
        photos,
      });
    }

    if (reflectionIds.length > 0) {
      const [reflectionPropRows, reflectionCommentRows] = await Promise.all([
        db
          .select({
            reflectionPostId: dailyReflectionProps.reflectionPostId,
            userId: dailyReflectionProps.userId,
          })
          .from(dailyReflectionProps)
          .where(inArray(dailyReflectionProps.reflectionPostId, reflectionIds)),
        db
          .select({
            id: dailyReflectionComments.id,
            reflectionPostId: dailyReflectionComments.reflectionPostId,
            userId: dailyReflectionComments.userId,
            parentCommentId: dailyReflectionComments.parentCommentId,
            authorName: users.name,
            authorImage: users.image,
            body: dailyReflectionComments.body,
            createdAt: dailyReflectionComments.createdAt,
            updatedAt: dailyReflectionComments.updatedAt,
          })
          .from(dailyReflectionComments)
          .innerJoin(users, eq(dailyReflectionComments.userId, users.id))
          .where(
            inArray(dailyReflectionComments.reflectionPostId, reflectionIds),
          )
          .orderBy(asc(dailyReflectionComments.createdAt)),
      ]);

      for (const prop of reflectionPropRows) {
        const entry = entries.get(prop.reflectionPostId);
        if (!entry) continue;

        entry.props.count += 1;
        if (prop.userId === user.id) {
          entry.props.hasPropped = true;
        }
      }

      const commentsByPostId = groupNestedReflectionComments(
        reflectionCommentRows,
        user.id,
      );
      for (const [postId, comments] of commentsByPostId) {
        const entry = entries.get(postId);
        if (!entry) continue;

        entry.comments = comments;
      }
    }

    const orderedEntries = [...entries.values()].sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
    );

    return NextResponse.json(orderedEntries);
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
    }

    if (
      error instanceof Error &&
      error.message === "Supabase Storage is not configured."
    ) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load friends feed",
      },
      { status: 500 },
    );
  }
}
