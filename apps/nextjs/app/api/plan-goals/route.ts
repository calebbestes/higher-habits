import {
  GOAL_VISIBILITIES,
  getDb,
  goalCheckpointPhotos,
  goalCheckpoints,
  goalLinks,
  goals,
  habits,
  tasks,
} from "@habit/db";
import { and, asc, desc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { notifyFriendsOfVisibleCheckpointPost } from "@/lib/friend-post-notifications";
import {
  getAcceptedFriendIds,
  syncContentMentionsAndNotify,
} from "@/lib/mentions";
import { notifyPlanGoalCompletionEvents } from "@/lib/notification-events";
import {
  deletePlannedEventsForSources,
  upsertPlannedEvent,
} from "@/lib/planned-events";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const colorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/)
  .nullable()
  .default(null);

const checkpointSchema = z.object({
  title: z.string().trim().min(1).max(200),
  targetDate: z.string().regex(DATE_KEY_REGEX).nullable().default(null),
  started: z.boolean().default(false),
  completed: z.boolean().default(false),
});

const goalFields = {
  title: z.string().trim().min(1).max(200),
  color: colorSchema,
  timing: z.enum(["current", "later"]).default("current"),
  planOnCalendar: z.boolean().default(false),
  checkpoints: z.array(checkpointSchema).default([]),
};

const createSchema = z.object({ type: z.literal("create"), ...goalFields });
const updateSchema = z.object({
  type: z.literal("update"),
  id: z.string().uuid(),
  ...goalFields,
});
const updateCheckpointSchema = z.object({
  type: z.literal("updateCheckpoint"),
  id: z.string().uuid(),
  started: z.boolean(),
  completed: z.boolean(),
  notes: z.string().max(20_000).nullable().optional(),
  visibility: z.enum(GOAL_VISIBILITIES).optional(),
});
const goalLinkSchema = z.object({
  type: z.literal("linkGoal"),
  goalId: z.string().uuid(),
  sourceType: z.enum(["task", "habit"]),
  sourceId: z.string().uuid(),
});
const goalUnlinkSchema = z.object({
  type: z.literal("unlinkGoal"),
  goalId: z.string().uuid(),
  sourceType: z.enum(["task", "habit"]),
  sourceId: z.string().uuid(),
});
const deleteSchema = z.object({
  type: z.literal("delete"),
  id: z.string().uuid(),
});
const archiveSchema = z.object({
  type: z.literal("archive"),
  id: z.string().uuid(),
});
const unarchiveSchema = z.object({
  type: z.literal("unarchive"),
  id: z.string().uuid(),
});
const reorderSchema = z.object({
  type: z.literal("reorder"),
  goalIds: z.array(z.string().uuid()),
});

const bodySchema = z.discriminatedUnion("type", [
  createSchema,
  updateSchema,
  updateCheckpointSchema,
  goalLinkSchema,
  goalUnlinkSchema,
  archiveSchema,
  unarchiveSchema,
  deleteSchema,
  reorderSchema,
]);

const selectGoalShape = {
  id: goals.id,
  title: goals.title,
  color: goals.color,
  timing: goals.timing,
  planOnCalendar: goals.planOnCalendar,
  archivedAt: goals.archivedAt,
  sortOrder: goals.sortOrder,
  createdAt: goals.createdAt,
  updatedAt: goals.updatedAt,
} as const;

const selectCheckpointShape = {
  id: goalCheckpoints.id,
  goalId: goalCheckpoints.goalId,
  title: goalCheckpoints.title,
  targetDate: goalCheckpoints.targetDate,
  sortOrder: goalCheckpoints.sortOrder,
  startedAt: goalCheckpoints.startedAt,
  completedAt: goalCheckpoints.completedAt,
  notes: goalCheckpoints.notes,
  visibility: goalCheckpoints.visibility,
  createdAt: goalCheckpoints.createdAt,
  updatedAt: goalCheckpoints.updatedAt,
} as const;

const getDatabase = () => getDb() ?? null;
type Database = NonNullable<ReturnType<typeof getDatabase>>;
type GoalRow = typeof goals.$inferSelect;
type CheckpointInput = z.infer<typeof checkpointSchema>;
type CheckpointRow = {
  id: string;
  goalId: string;
  title: string;
  targetDate: string | null;
  sortOrder: number;
  startedAt: Date | null;
  completedAt: Date | null;
  notes: string | null;
  visibility: (typeof GOAL_VISIBILITIES)[number];
  createdAt: Date;
  updatedAt: Date;
};
type GoalLinkRow = {
  goalId: string;
  sourceType: string;
  sourceId: string;
};

function serializeCheckpoint(row: CheckpointRow) {
  return {
    id: row.id,
    title: row.title,
    targetDate: row.targetDate ?? null,
    sortOrder: row.sortOrder,
    started: Boolean(row.startedAt || row.completedAt),
    startedAt: row.startedAt?.toISOString() ?? null,
    completed: Boolean(row.completedAt),
    completedAt: row.completedAt?.toISOString() ?? null,
    notes: row.notes ?? null,
    visibility: row.visibility,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function serializeGoal(
  goal: Pick<
    GoalRow,
    | "id"
    | "title"
    | "color"
    | "timing"
    | "planOnCalendar"
    | "sortOrder"
    | "archivedAt"
    | "createdAt"
    | "updatedAt"
  >,
  checkpoints: CheckpointRow[],
  links: GoalLinkRow[] = [],
) {
  return {
    id: goal.id,
    title: goal.title,
    color: goal.color ?? null,
    timing: checkpoints.some((checkpoint) =>
      Boolean(checkpoint.startedAt || checkpoint.completedAt),
    )
      ? "current"
      : "later",
    archivedAt: goal.archivedAt?.toISOString() ?? null,
    planOnCalendar: goal.planOnCalendar,
    sortOrder: goal.sortOrder,
    checkpoints: checkpoints.map((checkpoint) =>
      serializeCheckpoint(checkpoint),
    ),
    links: links
      .filter(
        (link) => link.sourceType === "task" || link.sourceType === "habit",
      )
      .map((link) => ({
        sourceId: link.sourceId,
        sourceType: link.sourceType as "task" | "habit",
      })),
    createdAt: goal.createdAt.toISOString(),
    updatedAt: goal.updatedAt.toISOString(),
  };
}

async function getSerializedGoal(db: Database, userId: string, goalId: string) {
  const [goal] = await db
    .select(selectGoalShape)
    .from(goals)
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)))
    .limit(1);

  if (!goal) {
    return null;
  }

  const checkpoints = await db
    .select(selectCheckpointShape)
    .from(goalCheckpoints)
    .where(
      and(
        eq(goalCheckpoints.goalId, goalId),
        eq(goalCheckpoints.userId, userId),
      ),
    )
    .orderBy(asc(goalCheckpoints.sortOrder), asc(goalCheckpoints.createdAt));

  const links = await db
    .select({
      goalId: goalLinks.goalId,
      sourceType: goalLinks.sourceType,
      sourceId: goalLinks.sourceId,
    })
    .from(goalLinks)
    .where(and(eq(goalLinks.userId, userId), eq(goalLinks.goalId, goalId)));

  return serializeGoal(goal, checkpoints, links);
}

async function syncGoalCheckpoints(
  db: Database,
  userId: string,
  goalId: string,
  checkpoints: CheckpointInput[],
) {
  const existingCheckpoints = await db
    .select({
      completedAt: goalCheckpoints.completedAt,
      id: goalCheckpoints.id,
      startedAt: goalCheckpoints.startedAt,
    })
    .from(goalCheckpoints)
    .where(
      and(
        eq(goalCheckpoints.goalId, goalId),
        eq(goalCheckpoints.userId, userId),
      ),
    )
    .orderBy(asc(goalCheckpoints.sortOrder), asc(goalCheckpoints.createdAt));
  await deletePlannedEventsForSources(db, {
    sourceIds: existingCheckpoints.map((checkpoint) => checkpoint.id),
    sourceType: "goal_checkpoint",
    userId,
  });

  const retainedCount = Math.min(
    existingCheckpoints.length,
    checkpoints.length,
  );
  const activeCheckpointIndex = checkpoints.findIndex(
    (checkpoint) => checkpoint.started && !checkpoint.completed,
  );
  await Promise.all(
    checkpoints.slice(0, retainedCount).map((checkpoint, index) =>
      db
        .update(goalCheckpoints)
        .set({
          startedAt:
            checkpoint.completed || index === activeCheckpointIndex
              ? (existingCheckpoints[index]?.startedAt ?? new Date())
              : null,
          completedAt: checkpoint.completed
            ? (existingCheckpoints[index]?.completedAt ?? new Date())
            : null,
          sortOrder: index,
          targetDate: checkpoint.targetDate,
          title: checkpoint.title,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(goalCheckpoints.id, existingCheckpoints[index].id),
            eq(goalCheckpoints.userId, userId),
          ),
        ),
    ),
  );

  const removedCheckpointIds = existingCheckpoints
    .slice(checkpoints.length)
    .map((checkpoint) => checkpoint.id);
  if (removedCheckpointIds.length > 0) {
    await db
      .delete(goalCheckpoints)
      .where(
        and(
          eq(goalCheckpoints.goalId, goalId),
          eq(goalCheckpoints.userId, userId),
          inArray(goalCheckpoints.id, removedCheckpointIds),
        ),
      );
  }

  const newCheckpointValues = checkpoints
    .slice(existingCheckpoints.length)
    .map((checkpoint, index) => ({
      startedAt:
        checkpoint.completed ||
        existingCheckpoints.length + index === activeCheckpointIndex
          ? new Date()
          : null,
      completedAt: checkpoint.completed ? new Date() : null,
      goalId,
      sortOrder: existingCheckpoints.length + index,
      targetDate: checkpoint.targetDate,
      title: checkpoint.title,
      userId,
    }));
  const insertedCheckpoints = newCheckpointValues.length
    ? await db.insert(goalCheckpoints).values(newCheckpointValues).returning({
        completedAt: goalCheckpoints.completedAt,
        id: goalCheckpoints.id,
        startedAt: goalCheckpoints.startedAt,
        targetDate: goalCheckpoints.targetDate,
        title: goalCheckpoints.title,
      })
    : [];

  const insertedByIndex = new Map(
    insertedCheckpoints.map((checkpoint, index) => [
      existingCheckpoints.length + index,
      checkpoint,
    ]),
  );
  const finalCheckpoints = checkpoints.map((checkpoint, index) => {
    const existing = existingCheckpoints[index];
    const inserted = insertedByIndex.get(index);
    return {
      startedAt: checkpoint.started
        ? (existing?.startedAt ?? inserted?.startedAt ?? new Date())
        : null,
      completedAt: checkpoint.completed
        ? (existing?.completedAt ?? inserted?.completedAt ?? new Date())
        : null,
      id: existing?.id ?? inserted?.id,
      targetDate: checkpoint.targetDate,
      title: checkpoint.title,
    };
  });

  await Promise.all(
    finalCheckpoints
      .filter((checkpoint): checkpoint is typeof checkpoint & { id: string } =>
        Boolean(
          checkpoint.id && checkpoint.targetDate && !checkpoint.completedAt,
        ),
      )
      .map((checkpoint) =>
        upsertPlannedEvent(db, {
          dateKey: checkpoint.targetDate as string,
          plannedEndTime: null,
          plannedStartTime: null,
          sourceId: checkpoint.id,
          sourceType: "goal_checkpoint",
          title: checkpoint.title,
          timeZone: null,
          userId,
        }),
      ),
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

    const [goalRows, checkpointRows] = await Promise.all([
      db
        .select(selectGoalShape)
        .from(goals)
        .where(eq(goals.userId, user.id))
        .orderBy(asc(goals.sortOrder), desc(goals.createdAt)),
      db
        .select(selectCheckpointShape)
        .from(goalCheckpoints)
        .where(eq(goalCheckpoints.userId, user.id))
        .orderBy(
          asc(goalCheckpoints.sortOrder),
          asc(goalCheckpoints.createdAt),
        ),
    ]);

    const goalLinksRows = goalRows.length
      ? await db
          .select({
            goalId: goalLinks.goalId,
            sourceType: goalLinks.sourceType,
            sourceId: goalLinks.sourceId,
          })
          .from(goalLinks)
          .where(
            and(
              eq(goalLinks.userId, user.id),
              inArray(
                goalLinks.goalId,
                goalRows.map((goal) => goal.id),
              ),
            ),
          )
      : [];

    const checkpointsByGoalId = checkpointRows.reduce<
      Record<string, typeof checkpointRows>
    >((groups, checkpoint) => {
      groups[checkpoint.goalId] ??= [];
      groups[checkpoint.goalId].push(checkpoint);
      return groups;
    }, {});

    return NextResponse.json(
      goalRows.map((goal) =>
        serializeGoal(
          goal,
          checkpointsByGoalId[goal.id] ?? [],
          goalLinksRows.filter((link) => link.goalId === goal.id),
        ),
      ),
    );
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const body = await request.json();
    const parsed = bodySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.message },
        { status: 400 },
      );
    }

    const data = parsed.data;

    if (data.type === "create") {
      const [orderRow] = await db
        .select({
          nextSortOrder: sql<number>`coalesce(max(${goals.sortOrder}), -1) + 1`,
        })
        .from(goals)
        .where(eq(goals.userId, user.id));

      const [row] = await db
        .insert(goals)
        .values({
          userId: user.id,
          title: data.title,
          color: data.color,
          timing: data.timing,
          planOnCalendar: data.planOnCalendar,
          sortOrder: Number(orderRow?.nextSortOrder ?? 0),
        })
        .returning(selectGoalShape);

      if (!row) {
        return NextResponse.json({ error: "Insert failed" }, { status: 500 });
      }

      await syncGoalCheckpoints(db, user.id, row.id, data.checkpoints);

      return NextResponse.json(await getSerializedGoal(db, user.id, row.id));
    }

    if (data.type === "update") {
      const [row] = await db
        .update(goals)
        .set({
          title: data.title,
          color: data.color,
          timing: data.timing,
          planOnCalendar: data.planOnCalendar,
          updatedAt: new Date(),
        })
        .where(and(eq(goals.id, data.id), eq(goals.userId, user.id)))
        .returning(selectGoalShape);

      if (!row) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      await syncGoalCheckpoints(db, user.id, data.id, data.checkpoints);

      return NextResponse.json(await getSerializedGoal(db, user.id, data.id));
    }

    if (data.type === "archive" || data.type === "unarchive") {
      const [goal] = await db
        .select({ archivedAt: goals.archivedAt, id: goals.id })
        .from(goals)
        .where(and(eq(goals.id, data.id), eq(goals.userId, user.id)))
        .limit(1);

      if (!goal) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      if (data.type === "archive") {
        const checkpointRows = await db
          .select({ id: goalCheckpoints.id })
          .from(goalCheckpoints)
          .where(
            and(
              eq(goalCheckpoints.goalId, data.id),
              eq(goalCheckpoints.userId, user.id),
            ),
          );
        await deletePlannedEventsForSources(db, {
          sourceIds: checkpointRows.map((checkpoint) => checkpoint.id),
          sourceType: "goal_checkpoint",
          userId: user.id,
        });
      }

      await db
        .update(goals)
        .set({
          archivedAt: data.type === "archive" ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(and(eq(goals.id, data.id), eq(goals.userId, user.id)));

      return NextResponse.json(await getSerializedGoal(db, user.id, data.id));
    }

    if (data.type === "updateCheckpoint") {
      if (data.completed && !data.started) {
        return NextResponse.json(
          { error: "A checkpoint must be started before it can be completed." },
          { status: 400 },
        );
      }
      const [previousCheckpoint] = await db
        .select(selectCheckpointShape)
        .from(goalCheckpoints)
        .where(
          and(
            eq(goalCheckpoints.id, data.id),
            eq(goalCheckpoints.userId, user.id),
          ),
        )
        .limit(1);
      const [previousPhoto] = previousCheckpoint
        ? await db
            .select({ id: goalCheckpointPhotos.id })
            .from(goalCheckpointPhotos)
            .where(
              and(
                eq(goalCheckpointPhotos.checkpointId, previousCheckpoint.id),
                eq(goalCheckpointPhotos.userId, user.id),
              ),
            )
            .limit(1)
        : [];
      if (data.started && previousCheckpoint) {
        await db
          .update(goalCheckpoints)
          .set({ startedAt: null, updatedAt: new Date() })
          .where(
            and(
              eq(goalCheckpoints.goalId, previousCheckpoint.goalId),
              eq(goalCheckpoints.userId, user.id),
              ne(goalCheckpoints.id, data.id),
              isNull(goalCheckpoints.completedAt),
            ),
          );
      }
      const wasVisiblePost =
        Boolean(previousCheckpoint?.completedAt) &&
        previousCheckpoint.visibility === "all_friends" &&
        (Boolean(previousCheckpoint.notes?.trim()) || Boolean(previousPhoto));
      const [checkpoint] = await db
        .update(goalCheckpoints)
        .set({
          startedAt: data.started
            ? (previousCheckpoint?.startedAt ?? new Date())
            : null,
          completedAt: data.completed ? new Date() : null,
          ...(data.notes !== undefined ? { notes: data.notes } : {}),
          ...(data.visibility !== undefined
            ? { visibility: data.visibility }
            : {}),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(goalCheckpoints.id, data.id),
            eq(goalCheckpoints.userId, user.id),
          ),
        )
        .returning(selectCheckpointShape);

      if (!checkpoint) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      await syncContentMentionsAndNotify({
        allowedUserIds:
          checkpoint.completedAt && checkpoint.visibility === "all_friends"
            ? new Set(await getAcceptedFriendIds(db, user.id))
            : new Set(),
        authorId: user.id,
        authorName: user.name,
        body: checkpoint.notes ?? "",
        db,
        sourceId: checkpoint.id,
        sourceType: "goal_checkpoint",
      });

      const isVisiblePost =
        Boolean(checkpoint.completedAt) &&
        checkpoint.visibility === "all_friends" &&
        (Boolean(checkpoint.notes?.trim()) || Boolean(previousPhoto));
      if (!wasVisiblePost && isVisiblePost) {
        await notifyFriendsOfVisibleCheckpointPost(db, checkpoint.id);
      }

      if (data.completed && !previousCheckpoint?.completedAt) {
        await notifyPlanGoalCompletionEvents({
          db,
          goalId: checkpoint.goalId,
          previouslyComplete: false,
          userId: user.id,
          userName: user.name,
        }).catch((error) => {
          console.error("Plan goal completion notifications failed", error);
        });
      }

      return NextResponse.json(
        await getSerializedGoal(db, user.id, checkpoint.goalId),
      );
    }

    if (data.type === "linkGoal" || data.type === "unlinkGoal") {
      const [goal] = await db
        .select({ id: goals.id })
        .from(goals)
        .where(and(eq(goals.id, data.goalId), eq(goals.userId, user.id)))
        .limit(1);

      if (!goal) {
        return NextResponse.json({ error: "Goal not found" }, { status: 404 });
      }

      const sourceTable = data.sourceType === "task" ? tasks : habits;
      const [source] = await db
        .select({ id: sourceTable.id })
        .from(sourceTable)
        .where(
          and(
            eq(sourceTable.id, data.sourceId),
            eq(sourceTable.userId, user.id),
          ),
        )
        .limit(1);

      if (!source) {
        return NextResponse.json(
          { error: "Link target not found" },
          { status: 404 },
        );
      }

      if (data.type === "linkGoal") {
        await db
          .insert(goalLinks)
          .values({
            goalId: data.goalId,
            sourceId: data.sourceId,
            sourceType: data.sourceType,
            userId: user.id,
          })
          .onConflictDoNothing();
      } else {
        await db
          .delete(goalLinks)
          .where(
            and(
              eq(goalLinks.goalId, data.goalId),
              eq(goalLinks.sourceType, data.sourceType),
              eq(goalLinks.sourceId, data.sourceId),
              eq(goalLinks.userId, user.id),
            ),
          );
      }

      return NextResponse.json(
        await getSerializedGoal(db, user.id, data.goalId),
      );
    }

    if (data.type === "reorder") {
      const goalIds = [...new Set(data.goalIds)];

      if (goalIds.length > 0) {
        const ownedGoals = await db
          .select({ id: goals.id })
          .from(goals)
          .where(and(eq(goals.userId, user.id), inArray(goals.id, goalIds)));
        const ownedGoalIds = new Set(ownedGoals.map((goal) => goal.id));

        await Promise.all(
          goalIds
            .filter((goalId) => ownedGoalIds.has(goalId))
            .map((goalId, index) =>
              db
                .update(goals)
                .set({ sortOrder: index, updatedAt: new Date() })
                .where(and(eq(goals.id, goalId), eq(goals.userId, user.id))),
            ),
        );
      }

      return NextResponse.json({ ok: true });
    }

    const [goal] = await db
      .select({ archivedAt: goals.archivedAt })
      .from(goals)
      .where(and(eq(goals.id, data.id), eq(goals.userId, user.id)))
      .limit(1);

    if (!goal) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (!goal.archivedAt) {
      return NextResponse.json(
        { error: "Archive the goal before deleting it permanently." },
        { status: 400 },
      );
    }

    const checkpointRows = await db
      .select({
        id: goalCheckpoints.id,
      })
      .from(goalCheckpoints)
      .where(
        and(
          eq(goalCheckpoints.goalId, data.id),
          eq(goalCheckpoints.userId, user.id),
        ),
      );
    await deletePlannedEventsForSources(db, {
      sourceIds: checkpointRows.map((checkpoint) => checkpoint.id),
      sourceType: "goal_checkpoint",
      userId: user.id,
    });

    await db
      .delete(goals)
      .where(and(eq(goals.id, data.id), eq(goals.userId, user.id)));

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
