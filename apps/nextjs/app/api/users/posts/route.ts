import {
  dailyReflectionComments,
  dailyReflectionPhotos,
  dailyReflectionPosts,
  dailyReflectionProps,
  getDb,
  goalCheckpointPhotos,
  goalCheckpoints,
  goalLogPhotos,
  goalLogs,
  goals,
  habits,
  users,
} from "@habit/db";
import { and, asc, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { type Mention, loadContentMentions } from "@/lib/mentions";
import {
  GOAL_PHOTOS_BUCKET,
  getSupabaseStorageAdmin,
} from "@/lib/supabase-storage";

type Photo = {
  id: string;
  url: string;
  contentType: string;
  createdAt: string;
};

type ReflectionCommentRow = {
  id: string;
  reflectionPostId: string;
  userId: string;
  parentCommentId: string | null;
  authorName: string;
  authorImage: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
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
  mentions: Mention[];
  replies: SerializedFeedComment[];
};

function groupNestedReflectionComments(
  commentRows: ReflectionCommentRow[],
  currentUserId: string,
  mentionsByCommentId: Map<string, Mention[]>,
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
      mentions: mentionsByCommentId.get(comment.id) ?? [],
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
  goalId: string;
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

function getHabitCompletionHighlights(
  row: HabitCompletionHighlightRow,
  rows: HabitCompletionHighlightRow[],
) {
  const uniqueDateKeys = [
    ...new Set(
      rows
        .filter((candidate) => candidate.goalId === row.goalId)
        .map((candidate) => candidate.dateKey),
    ),
  ].sort();
  const completedDateKeys = new Set(uniqueDateKeys);
  const previousDateKeys = uniqueDateKeys.filter(
    (dateKey) => dateKey < row.dateKey,
  );
  const previousDateKey = previousDateKeys.at(-1) ?? null;
  const highlights: string[] = [];
  let streakDays = 1;
  let cursor = addDaysKey(row.dateKey, -1);

  while (completedDateKeys.has(cursor)) {
    streakDays += 1;
    cursor = addDaysKey(cursor, -1);
  }

  if (streakDays >= 2) {
    highlights.push(`${streakDays}-day streak`);
  } else if (previousDateKey) {
    highlights.push(
      `First time in ${formatDayCount(
        daysBetweenDateKeys(previousDateKey, row.dateKey),
      )}`,
    );
  } else {
    highlights.push("First logged completion");
  }

  return highlights;
}

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDb();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const [me] = await db
      .select({ id: users.id, name: users.name, image: users.image })
      .from(users)
      .where(eq(users.id, user.id))
      .limit(1);

    if (!me) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const author = { id: me.id, name: me.name, image: me.image };

    // The user's own completed habit posts (no visibility filtering — it is
    // their own profile).
    const logRows = await db
      .select({
        entryId: goalLogs.id,
        goalId: habits.id,
        goalName: habits.name,
        goalIcon: habits.iconKey,
        dateKey: goalLogs.date,
        notes: goalLogs.notes,
        updatedAt: goalLogs.updatedAt,
      })
      .from(goalLogs)
      .innerJoin(habits, eq(goalLogs.goalId, habits.id))
      .where(
        and(
          eq(goalLogs.userId, user.id),
          eq(goalLogs.status, "complete"),
          eq(habits.userId, goalLogs.userId),
        ),
      )
      .orderBy(desc(goalLogs.updatedAt), desc(goalLogs.date));

    const logIds = logRows.map((row) => row.entryId);
    const goalLogMentionsById = await loadContentMentions(
      db,
      "goal_log",
      logIds,
    );
    const logPhotoRows =
      logIds.length > 0
        ? await db
            .select({
              entryId: goalLogPhotos.goalLogId,
              photoId: goalLogPhotos.id,
              storagePath: goalLogPhotos.storagePath,
              contentType: goalLogPhotos.contentType,
              photoCreatedAt: goalLogPhotos.createdAt,
            })
            .from(goalLogPhotos)
            .where(inArray(goalLogPhotos.goalLogId, logIds))
            .orderBy(desc(goalLogPhotos.createdAt))
        : [];

    // Completed goal checkpoints with notes or photos.
    const checkpointRows = await db
      .select({
        entryId: goalCheckpoints.id,
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
          eq(goalCheckpoints.userId, user.id),
          isNotNull(goalCheckpoints.completedAt),
          eq(goals.userId, goalCheckpoints.userId),
        ),
      )
      .orderBy(desc(goalCheckpoints.updatedAt));

    const checkpointIds = checkpointRows.map((row) => row.entryId);
    const checkpointMentionsById = await loadContentMentions(
      db,
      "goal_checkpoint",
      checkpointIds,
    );
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

    const signedPhotos = await Promise.all(
      [...logPhotoRows, ...checkpointPhotoRows].map(async (row) => ({
        entryId: row.entryId,
        photo: {
          id: row.photoId,
          url: await createSignedPhotoUrl(row.storagePath),
          contentType: row.contentType,
          createdAt: row.photoCreatedAt.toISOString(),
        } satisfies Photo,
      })),
    );

    const photosByEntryId = new Map<string, Photo[]>();
    for (const { entryId, photo } of signedPhotos) {
      const photos = photosByEntryId.get(entryId) ?? [];
      photos.push(photo);
      photosByEntryId.set(entryId, photos);
    }

    const entries: Array<{
      id: string;
      kind: "habit" | "goal_checkpoint" | "reflection";
      friend: { id: string; name: string; image: string | null };
      goal: { id: string; name: string; icon: string };
      dateKey: string;
      notes: string;
      reflectionPrompt: string | null;
      updatedAt: string;
      canDeletePhotos: boolean;
      postType: "completion" | "journal";
      highlights: string[];
      props: { count: number; hasPropped: boolean };
      mentions: Mention[];
      photos: Photo[];
      comments: SerializedFeedComment[];
    }> = [];

    for (const row of logRows) {
      const photos = photosByEntryId.get(row.entryId) ?? [];
      const postType =
        !row.notes.trim() && photos.length === 0 ? "completion" : "journal";

      entries.push({
        id: row.entryId,
        kind: "habit",
        friend: author,
        goal: {
          id: row.goalId,
          name: row.goalName,
          icon: row.goalIcon || "mdi:circle",
        },
        dateKey: row.dateKey,
        notes: row.notes,
        reflectionPrompt: null,
        updatedAt: row.updatedAt.toISOString(),
        canDeletePhotos: true,
        postType,
        highlights: getHabitCompletionHighlights(row, logRows),
        props: { count: 0, hasPropped: false },
        mentions: goalLogMentionsById.get(row.entryId) ?? [],
        comments: [],
        photos,
      });
    }

    for (const row of checkpointRows) {
      if (!row.completedAt) continue;
      const photos = photosByEntryId.get(row.entryId) ?? [];
      const postType =
        !row.notes?.trim() && photos.length === 0 ? "completion" : "journal";

      entries.push({
        id: row.entryId,
        kind: "goal_checkpoint",
        friend: author,
        goal: {
          id: row.goalId,
          name: `${row.goalTitle} · ${row.checkpointTitle}`,
          icon: "checkmark.seal.fill",
        },
        dateKey: row.completedAt.toISOString().slice(0, 10),
        notes: row.notes ?? "",
        reflectionPrompt: null,
        updatedAt: row.updatedAt.toISOString(),
        canDeletePhotos: true,
        postType,
        highlights: ["Checkpoint complete"],
        props: { count: 0, hasPropped: false },
        mentions: checkpointMentionsById.get(row.entryId) ?? [],
        comments: [],
        photos,
      });
    }

    const reflectionRows = await db
      .select({
        entryId: dailyReflectionPosts.id,
        prompt: dailyReflectionPosts.prompt,
        body: dailyReflectionPosts.body,
        dateKey: dailyReflectionPosts.date,
        updatedAt: dailyReflectionPosts.updatedAt,
      })
      .from(dailyReflectionPosts)
      .where(eq(dailyReflectionPosts.userId, user.id))
      .orderBy(desc(dailyReflectionPosts.updatedAt));
    const reflectionIds = reflectionRows.map((row) => row.entryId);
    const reflectionMentionsById = await loadContentMentions(
      db,
      "reflection_post",
      reflectionIds,
    );
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
          entryId: row.entryId,
          photo: {
            id: row.photoId,
            url: await createSignedPhotoUrl(row.storagePath),
            contentType: row.contentType,
            createdAt: row.photoCreatedAt.toISOString(),
          } satisfies Photo,
        })),
      )
    ).reduce<Map<string, Photo[]>>((photosByReflection, row) => {
      const photos = photosByReflection.get(row.entryId) ?? [];
      photos.push(row.photo);
      photosByReflection.set(row.entryId, photos);
      return photosByReflection;
    }, new Map());

    const [reflectionPropRows, reflectionCommentRows] =
      reflectionIds.length > 0
        ? await Promise.all([
            db
              .select({
                reflectionPostId: dailyReflectionProps.reflectionPostId,
                userId: dailyReflectionProps.userId,
              })
              .from(dailyReflectionProps)
              .where(
                inArray(dailyReflectionProps.reflectionPostId, reflectionIds),
              ),
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
                inArray(
                  dailyReflectionComments.reflectionPostId,
                  reflectionIds,
                ),
              )
              .orderBy(asc(dailyReflectionComments.createdAt)),
          ])
        : [[], []];
    const reflectionPropsById = reflectionPropRows.reduce<
      Map<string, { count: number; hasPropped: boolean }>
    >((propsByReflection, row) => {
      const props = propsByReflection.get(row.reflectionPostId) ?? {
        count: 0,
        hasPropped: false,
      };
      props.count += 1;
      props.hasPropped = props.hasPropped || row.userId === user.id;
      propsByReflection.set(row.reflectionPostId, props);
      return propsByReflection;
    }, new Map());
    const reflectionCommentsById = groupNestedReflectionComments(
      reflectionCommentRows,
      user.id,
      await loadContentMentions(
        db,
        "reflection_comment",
        reflectionCommentRows.map((row) => row.id),
      ),
    );

    for (const row of reflectionRows) {
      const photos = reflectionPhotosById.get(row.entryId) ?? [];
      entries.push({
        id: row.entryId,
        kind: "reflection",
        friend: author,
        goal: {
          id: row.entryId,
          name: "Daily reflection",
          icon: "sparkles",
        },
        dateKey: row.dateKey,
        notes: row.body,
        reflectionPrompt: row.prompt,
        updatedAt: row.updatedAt.toISOString(),
        canDeletePhotos: true,
        postType: "journal",
        highlights: ["Daily reflection"],
        props: reflectionPropsById.get(row.entryId) ?? {
          count: 0,
          hasPropped: false,
        },
        mentions: reflectionMentionsById.get(row.entryId) ?? [],
        comments: reflectionCommentsById.get(row.entryId) ?? [],
        photos,
      });
    }

    entries.sort((a, b) =>
      a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0,
    );

    return NextResponse.json(entries);
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
        error: error instanceof Error ? error.message : "Could not load posts",
      },
      { status: 500 },
    );
  }
}
