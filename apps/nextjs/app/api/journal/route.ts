import {
  categories,
  dailyReflectionPhotos,
  dailyReflectionPosts,
  feedComments,
  feedProps,
  getDb,
  goalCheckpointPhotos,
  goalCheckpoints,
  goalLogPhotos,
  goalLogs,
  goals,
  habits,
  users,
} from "@habit/db";
import {
  and,
  asc,
  desc,
  eq,
  exists,
  gte,
  inArray,
  isNotNull,
  lt,
  ne,
  or,
} from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import {
  GOAL_PHOTOS_BUCKET,
  getSupabaseStorageAdmin,
} from "@/lib/supabase-storage";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 40;
const CANDIDATE_MULTIPLIER = 4;
const MONTH_KEY_REGEX = /^\d{4}-\d{2}$/;
const cursorSchema = z.object({
  id: z.string().min(1),
  updatedAt: z.string().datetime(),
});

const getDatabase = () => getDb() ?? null;

type JournalCommentRow = {
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

type JournalComment = {
  id: string;
  userId: string;
  parentCommentId: string | null;
  authorName: string;
  authorImage: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  canDelete: boolean;
  replies: JournalComment[];
};

type JournalPhoto = {
  id: string;
  url: string;
  contentType: string;
  createdAt: string;
  dateKey: string;
  goalId: string;
};

type JournalItem =
  | {
      kind: "habit";
      id: string;
      dateKey: string;
      goal: {
        id: string;
        name: string;
        iconKey: string;
        categoryId: string;
      };
      note: string;
      photoCount: number;
      visibility: "only_me" | "goal_friends" | "all_friends";
      social: {
        goalLogId: string;
        props: { count: number; hasPropped: boolean };
        comments: JournalComment[];
      };
      photos: JournalPhoto[];
      updatedAt: string;
    }
  | {
      kind: "checkpoint";
      id: string;
      dateKey: string;
      goalTitle: string;
      checkpointTitle: string;
      note: string;
      visibility: "only_me" | "goal_friends" | "all_friends";
      photos: JournalPhoto[];
      updatedAt: string;
    }
  | {
      kind: "reflection";
      id: string;
      dateKey: string;
      prompt: string;
      answer: string;
      photos: JournalPhoto[];
      updatedAt: string;
    };

function decodeCursor(value: string | null) {
  if (!value) return null;

  try {
    const parsed = cursorSchema.safeParse(
      JSON.parse(Buffer.from(value, "base64url").toString("utf8")),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function encodeCursor(value: { id: string; updatedAt: string }) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function getMonthDateRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = `${year}-${String(monthNumber).padStart(2, "0")}-01`;
  const nextMonth = new Date(year, monthNumber, 1);
  const endExclusive = `${nextMonth.getFullYear()}-${String(
    nextMonth.getMonth() + 1,
  ).padStart(2, "0")}-01`;
  return { start, endExclusive };
}

function groupComments(rows: JournalCommentRow[], currentUserId: string) {
  const commentsById = new Map<string, JournalComment>();
  const goalLogIdByCommentId = new Map<string, string>();
  const rootsByGoalLogId = new Map<string, JournalComment[]>();

  for (const row of rows) {
    commentsById.set(row.id, {
      id: row.id,
      userId: row.userId,
      parentCommentId: row.parentCommentId,
      authorName: row.authorName,
      authorImage: row.authorImage,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      canDelete: row.userId === currentUserId,
      replies: [],
    });
    goalLogIdByCommentId.set(row.id, row.goalLogId);
  }

  for (const row of rows) {
    const comment = commentsById.get(row.id);
    if (!comment) continue;

    const parent = row.parentCommentId
      ? commentsById.get(row.parentCommentId)
      : null;
    const parentGoalLogId = row.parentCommentId
      ? goalLogIdByCommentId.get(row.parentCommentId)
      : null;
    if (parent && parentGoalLogId === row.goalLogId) {
      parent.replies.push(comment);
      continue;
    }

    const roots = rootsByGoalLogId.get(row.goalLogId) ?? [];
    roots.push(comment);
    rootsByGoalLogId.set(row.goalLogId, roots);
  }

  return rootsByGoalLogId;
}

async function createSignedPhotoUrl(storagePath: string) {
  const storage = getSupabaseStorageAdmin();
  const { data, error } = await storage.storage
    .from(GOAL_PHOTOS_BUCKET)
    .createSignedUrl(storagePath, 60 * 60);

  if (error) throw new Error(`Could not open photo: ${error.message}`);
  return data.signedUrl;
}

function serializePhoto(row: {
  id: string;
  storagePath: string;
  contentType: string;
  createdAt: Date;
  dateKey?: string;
  goalId?: string;
}) {
  return createSignedPhotoUrl(row.storagePath).then((url) => ({
    id: row.id,
    url,
    contentType: row.contentType,
    createdAt: row.createdAt.toISOString(),
    ...(row.dateKey === undefined ? {} : { dateKey: row.dateKey }),
    ...(row.goalId === undefined ? {} : { goalId: row.goalId }),
  }));
}

function getCursorCondition(
  timestampColumn: Parameters<typeof lt>[0],
  idColumn: Parameters<typeof lt>[0],
  cursor: ReturnType<typeof decodeCursor>,
) {
  if (!cursor) return undefined;
  const date = new Date(cursor.updatedAt);
  return or(
    lt(timestampColumn, date),
    and(eq(timestampColumn, date), lt(idColumn, cursor.id)),
  );
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

    const url = new URL(request.url);
    const requestedLimit = Number(url.searchParams.get("limit"));
    const limit = Number.isInteger(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;
    const cursor = decodeCursor(url.searchParams.get("cursor"));
    const month = url.searchParams.get("month");
    const monthRange =
      month && MONTH_KEY_REGEX.test(month) ? getMonthDateRange(month) : null;
    const candidateLimit = Math.min(limit * CANDIDATE_MULTIPLIER, 160);

    const [categoryRows, habitRows] = await Promise.all([
      db
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(eq(categories.userId, user.id))
        .orderBy(asc(categories.name)),
      db
        .select({
          id: habits.id,
          name: habits.name,
          iconKey: habits.iconKey,
          categoryId: habits.categoryId,
        })
        .from(habits)
        .where(and(eq(habits.userId, user.id), eq(habits.hidden, false)))
        .orderBy(asc(habits.name)),
    ]);
    const goalSections = categoryRows
      .map((category) => ({
        categoryId: category.id,
        categoryName: category.name,
        goals: habitRows
          .filter((habit) => habit.categoryId === category.id)
          .map((habit) => ({
            id: habit.id,
            name: habit.name,
            iconKey: habit.iconKey,
            categoryId: habit.categoryId,
          })),
      }))
      .filter((category) => category.goals.length > 0);

    const logRows = await db
      .select({
        id: goalLogs.id,
        goalId: goalLogs.goalId,
        dateKey: goalLogs.date,
        notes: goalLogs.notes,
        visibility: goalLogs.visibility,
        updatedAt: goalLogs.updatedAt,
        goalName: habits.name,
        goalIcon: habits.iconKey,
        categoryId: categories.id,
        categoryName: categories.name,
      })
      .from(goalLogs)
      .innerJoin(habits, eq(goalLogs.goalId, habits.id))
      .innerJoin(categories, eq(habits.categoryId, categories.id))
      .where(
        and(
          eq(goalLogs.userId, user.id),
          eq(goalLogs.status, "complete"),
          eq(habits.userId, user.id),
          or(
            ne(goalLogs.notes, ""),
            exists(
              db
                .select({ id: goalLogPhotos.id })
                .from(goalLogPhotos)
                .where(eq(goalLogPhotos.goalLogId, goalLogs.id)),
            ),
            exists(
              db
                .select({ id: feedProps.id })
                .from(feedProps)
                .where(eq(feedProps.goalLogId, goalLogs.id)),
            ),
            exists(
              db
                .select({ id: feedComments.id })
                .from(feedComments)
                .where(eq(feedComments.goalLogId, goalLogs.id)),
            ),
          ),
          monthRange ? gte(goalLogs.date, monthRange.start) : undefined,
          monthRange ? lt(goalLogs.date, monthRange.endExclusive) : undefined,
          getCursorCondition(goalLogs.updatedAt, goalLogs.id, cursor),
        ),
      )
      .orderBy(desc(goalLogs.updatedAt), desc(goalLogs.id))
      .limit(candidateLimit);
    const logIds = logRows.map((row) => row.id);

    const [photoRows, propRows, commentRows] = logIds.length
      ? await Promise.all([
          db
            .select({
              id: goalLogPhotos.id,
              goalLogId: goalLogPhotos.goalLogId,
              storagePath: goalLogPhotos.storagePath,
              contentType: goalLogPhotos.contentType,
              createdAt: goalLogPhotos.createdAt,
            })
            .from(goalLogPhotos)
            .where(
              and(
                eq(goalLogPhotos.userId, user.id),
                inArray(goalLogPhotos.goalLogId, logIds),
              ),
            )
            .orderBy(desc(goalLogPhotos.createdAt)),
          db
            .select({
              goalLogId: feedProps.goalLogId,
              userId: feedProps.userId,
            })
            .from(feedProps)
            .where(inArray(feedProps.goalLogId, logIds)),
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
            .where(inArray(feedComments.goalLogId, logIds))
            .orderBy(asc(feedComments.createdAt)),
        ])
      : [[], [], []];

    const photosByLogId = new Map<
      string,
      Awaited<ReturnType<typeof serializePhoto>>[]
    >();
    await Promise.all(
      photoRows.map(async (photo) => {
        const serialized = await serializePhoto(photo);
        const photos = photosByLogId.get(photo.goalLogId) ?? [];
        photos.push(serialized);
        photosByLogId.set(photo.goalLogId, photos);
      }),
    );
    const propsByLogId = new Map<
      string,
      { count: number; hasPropped: boolean }
    >();
    for (const prop of propRows) {
      const summary = propsByLogId.get(prop.goalLogId) ?? {
        count: 0,
        hasPropped: false,
      };
      summary.count += 1;
      summary.hasPropped ||= prop.userId === user.id;
      propsByLogId.set(prop.goalLogId, summary);
    }
    const commentsByLogId = groupComments(commentRows, user.id);

    const items: JournalItem[] = logRows.flatMap((row) => {
      const photos = photosByLogId.get(row.id) ?? [];
      const comments = commentsByLogId.get(row.id) ?? [];
      if (!row.notes.trim() && photos.length === 0 && comments.length === 0) {
        return [];
      }

      return [
        {
          kind: "habit" as const,
          id: row.id,
          dateKey: row.dateKey,
          goal: {
            id: row.goalId,
            name: row.goalName,
            iconKey: row.goalIcon,
            categoryId: row.categoryId,
          },
          note: row.notes,
          photoCount: photos.length,
          visibility: row.visibility,
          social: {
            goalLogId: row.id,
            props: propsByLogId.get(row.id) ?? { count: 0, hasPropped: false },
            comments,
          },
          photos: photos.map((photo) => ({
            ...photo,
            dateKey: row.dateKey,
            goalId: row.goalId,
          })),
          updatedAt: row.updatedAt.toISOString(),
        },
      ];
    });

    const checkpointRows = await db
      .select({
        id: goalCheckpoints.id,
        goalTitle: goals.title,
        checkpointTitle: goalCheckpoints.title,
        notes: goalCheckpoints.notes,
        visibility: goalCheckpoints.visibility,
        completedAt: goalCheckpoints.completedAt,
        updatedAt: goalCheckpoints.updatedAt,
      })
      .from(goalCheckpoints)
      .innerJoin(goals, eq(goalCheckpoints.goalId, goals.id))
      .where(
        and(
          eq(goalCheckpoints.userId, user.id),
          isNotNull(goalCheckpoints.completedAt),
          eq(goals.userId, user.id),
          or(
            ne(goalCheckpoints.notes, ""),
            exists(
              db
                .select({ id: goalCheckpointPhotos.id })
                .from(goalCheckpointPhotos)
                .where(
                  eq(goalCheckpointPhotos.checkpointId, goalCheckpoints.id),
                ),
            ),
          ),
          monthRange
            ? gte(
                goalCheckpoints.completedAt,
                new Date(`${monthRange.start}T00:00:00.000Z`),
              )
            : undefined,
          monthRange
            ? lt(
                goalCheckpoints.completedAt,
                new Date(`${monthRange.endExclusive}T00:00:00.000Z`),
              )
            : undefined,
          getCursorCondition(
            goalCheckpoints.updatedAt,
            goalCheckpoints.id,
            cursor,
          ),
        ),
      )
      .orderBy(desc(goalCheckpoints.updatedAt), desc(goalCheckpoints.id))
      .limit(candidateLimit);
    const checkpointIds = checkpointRows.map((row) => row.id);
    const checkpointPhotoRows = checkpointIds.length
      ? await db
          .select({
            id: goalCheckpointPhotos.id,
            checkpointId: goalCheckpointPhotos.checkpointId,
            storagePath: goalCheckpointPhotos.storagePath,
            contentType: goalCheckpointPhotos.contentType,
            createdAt: goalCheckpointPhotos.createdAt,
          })
          .from(goalCheckpointPhotos)
          .where(
            and(
              eq(goalCheckpointPhotos.userId, user.id),
              inArray(goalCheckpointPhotos.checkpointId, checkpointIds),
            ),
          )
          .orderBy(desc(goalCheckpointPhotos.createdAt))
      : [];
    const checkpointPhotosById = new Map<
      string,
      Awaited<ReturnType<typeof serializePhoto>>[]
    >();
    await Promise.all(
      checkpointPhotoRows.map(async (photo) => {
        const serialized = await serializePhoto(photo);
        const photos = checkpointPhotosById.get(photo.checkpointId) ?? [];
        photos.push(serialized);
        checkpointPhotosById.set(photo.checkpointId, photos);
      }),
    );
    for (const row of checkpointRows) {
      const photos = checkpointPhotosById.get(row.id) ?? [];
      if (!row.notes?.trim() && photos.length === 0) continue;
      items.push({
        kind: "checkpoint",
        id: row.id,
        dateKey: row.completedAt?.toISOString().slice(0, 10) ?? "",
        goalTitle: row.goalTitle,
        checkpointTitle: row.checkpointTitle,
        note: row.notes ?? "",
        visibility: row.visibility,
        photos: photos.map((photo) => ({
          ...photo,
          dateKey: "",
          goalId: row.id,
        })),
        updatedAt: row.updatedAt.toISOString(),
      });
    }

    const reflectionRows = await db
      .select({
        id: dailyReflectionPosts.id,
        dateKey: dailyReflectionPosts.date,
        prompt: dailyReflectionPosts.prompt,
        body: dailyReflectionPosts.body,
        updatedAt: dailyReflectionPosts.updatedAt,
      })
      .from(dailyReflectionPosts)
      .where(
        and(
          eq(dailyReflectionPosts.userId, user.id),
          ne(dailyReflectionPosts.body, ""),
          monthRange
            ? gte(dailyReflectionPosts.date, monthRange.start)
            : undefined,
          monthRange
            ? lt(dailyReflectionPosts.date, monthRange.endExclusive)
            : undefined,
          getCursorCondition(
            dailyReflectionPosts.updatedAt,
            dailyReflectionPosts.id,
            cursor,
          ),
        ),
      )
      .orderBy(
        desc(dailyReflectionPosts.updatedAt),
        desc(dailyReflectionPosts.id),
      )
      .limit(candidateLimit);
    const reflectionIds = reflectionRows.map((row) => row.id);
    const reflectionPhotoRows = reflectionIds.length
      ? await db
          .select({
            id: dailyReflectionPhotos.id,
            reflectionPostId: dailyReflectionPhotos.reflectionPostId,
            storagePath: dailyReflectionPhotos.storagePath,
            contentType: dailyReflectionPhotos.contentType,
            createdAt: dailyReflectionPhotos.createdAt,
          })
          .from(dailyReflectionPhotos)
          .where(inArray(dailyReflectionPhotos.reflectionPostId, reflectionIds))
          .orderBy(desc(dailyReflectionPhotos.createdAt))
      : [];
    const reflectionPhotosById = new Map<
      string,
      Awaited<ReturnType<typeof serializePhoto>>[]
    >();
    await Promise.all(
      reflectionPhotoRows.map(async (photo) => {
        const serialized = await serializePhoto(photo);
        const photos = reflectionPhotosById.get(photo.reflectionPostId) ?? [];
        photos.push(serialized);
        reflectionPhotosById.set(photo.reflectionPostId, photos);
      }),
    );
    for (const row of reflectionRows) {
      if (!row.body.trim()) continue;
      items.push({
        kind: "reflection",
        id: row.id,
        dateKey: row.dateKey,
        prompt: row.prompt,
        answer: row.body,
        photos: (reflectionPhotosById.get(row.id) ?? []).map((photo) => ({
          ...photo,
          dateKey: row.dateKey,
          goalId: row.id,
        })),
        updatedAt: row.updatedAt.toISOString(),
      });
    }

    items.sort((left, right) =>
      left.updatedAt === right.updatedAt
        ? right.id.localeCompare(left.id)
        : left.updatedAt < right.updatedAt
          ? 1
          : -1,
    );
    const pageItems = items.slice(0, limit);
    const hasMoreCandidates =
      logRows.length === candidateLimit ||
      checkpointRows.length === candidateLimit ||
      reflectionRows.length === candidateLimit;
    const lastItem = pageItems.at(-1);

    return NextResponse.json({
      items: pageItems,
      goalSections,
      nextCursor:
        (hasMoreCandidates || items.length > limit) && lastItem
          ? encodeCursor(lastItem)
          : null,
    });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    if (
      error instanceof Error &&
      error.message === "Supabase Storage is not configured."
    ) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load journal",
      },
      { status: 500 },
    );
  }
}
