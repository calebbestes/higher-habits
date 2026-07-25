import { GOAL_VISIBILITIES, getDb, goalCheckpoints, goals } from "@habit/db";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import {
  deletePlannedEventsForSources,
  upsertPlannedEvent,
} from "@/lib/planned-events";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const checkpointSchema = z.object({
  title: z.string().trim().min(1).max(200),
  targetDate: z.string().regex(DATE_KEY_REGEX).nullable().default(null),
  completed: z.boolean().default(false),
});

const goalFields = {
  title: z.string().trim().min(1).max(200),
  timing: z.enum(["current", "later"]).default("current"),
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
  completed: z.boolean(),
  notes: z.string().max(20_000).nullable().optional(),
  visibility: z.enum(GOAL_VISIBILITIES).optional(),
});
const deleteSchema = z.object({
  type: z.literal("delete"),
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
  deleteSchema,
  reorderSchema,
]);

const selectGoalShape = {
  id: goals.id,
  title: goals.title,
  timing: goals.timing,
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
  completedAt: Date | null;
  notes: string | null;
  visibility: (typeof GOAL_VISIBILITIES)[number];
  createdAt: Date;
  updatedAt: Date;
};

function serializeCheckpoint(row: CheckpointRow) {
  return {
    id: row.id,
    title: row.title,
    targetDate: row.targetDate ?? null,
    sortOrder: row.sortOrder,
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
    "id" | "title" | "timing" | "sortOrder" | "createdAt" | "updatedAt"
  >,
  checkpoints: CheckpointRow[],
) {
  return {
    id: goal.id,
    title: goal.title,
    timing: goal.timing === "later" ? "later" : "current",
    sortOrder: goal.sortOrder,
    checkpoints: checkpoints.map(serializeCheckpoint),
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

  return serializeGoal(goal, checkpoints);
}

async function syncGoalCheckpoints(
  db: Database,
  userId: string,
  goalId: string,
  checkpoints: CheckpointInput[],
) {
  const existingCheckpoints = await db
    .select({ id: goalCheckpoints.id })
    .from(goalCheckpoints)
    .where(
      and(
        eq(goalCheckpoints.goalId, goalId),
        eq(goalCheckpoints.userId, userId),
      ),
    );
  await deletePlannedEventsForSources(db, {
    sourceIds: existingCheckpoints.map((checkpoint) => checkpoint.id),
    sourceType: "goal_checkpoint",
    userId,
  });

  await db
    .delete(goalCheckpoints)
    .where(
      and(
        eq(goalCheckpoints.goalId, goalId),
        eq(goalCheckpoints.userId, userId),
      ),
    );

  const values = checkpoints.map((checkpoint, index) => ({
    goalId,
    userId,
    title: checkpoint.title,
    targetDate: checkpoint.targetDate,
    sortOrder: index,
    completedAt: checkpoint.completed ? new Date() : null,
  }));

  if (values.length > 0) {
    const insertedCheckpoints = await db
      .insert(goalCheckpoints)
      .values(values)
      .returning(selectCheckpointShape);

    await Promise.all(
      insertedCheckpoints
        .filter(
          (checkpoint) => checkpoint.targetDate && !checkpoint.completedAt,
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

    const checkpointsByGoalId = checkpointRows.reduce<
      Record<string, typeof checkpointRows>
    >((groups, checkpoint) => {
      groups[checkpoint.goalId] ??= [];
      groups[checkpoint.goalId].push(checkpoint);
      return groups;
    }, {});

    return NextResponse.json(
      goalRows.map((goal) =>
        serializeGoal(goal, checkpointsByGoalId[goal.id] ?? []),
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
          timing: data.timing,
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
          timing: data.timing,
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

    if (data.type === "updateCheckpoint") {
      const [checkpoint] = await db
        .update(goalCheckpoints)
        .set({
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

      return NextResponse.json(
        await getSerializedGoal(db, user.id, checkpoint.goalId),
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
