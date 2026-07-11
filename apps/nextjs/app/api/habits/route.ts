import { categories, getDb, habits, goals as planGoals } from "@habit/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const habitFields = {
  name: z.string().trim().min(1),
  frequencyGoal: z.number().int().positive().nullable().default(null),
  period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  repeatInterval: z.number().int().min(1).max(99).nullable().default(null),
  repeatDays: z.array(z.number().int().min(0).max(34)).nullable().default(null),
  repeatMonthlyType: z
    .enum(["day_of_month", "day_of_week"])
    .nullable()
    .default(null),
  categoryId: z.string().uuid(),
  goalId: z.string().uuid().nullable().default(null),
  priority: z.enum(["high", "low"]),
  visibility: z
    .enum(["only_me", "goal_friends", "all_friends"])
    .default("only_me"),
  iconKey: z.string().default(""),
  reminderEnabled: z.boolean().default(false),
  reminderTime: z.string().regex(TIME_REGEX).nullable().default(null),
  hidden: z.boolean().default(false),
};

const createSchema = z.object({ type: z.literal("create"), ...habitFields });
const updateSchema = z.object({
  type: z.literal("update"),
  id: z.string().uuid(),
  ...habitFields,
});
const deleteManySchema = z.object({
  type: z.literal("deleteMany"),
  ids: z.array(z.string().uuid()).min(1),
});

const bodySchema = z.discriminatedUnion("type", [
  createSchema,
  updateSchema,
  deleteManySchema,
]);

const getDatabase = () => getDb() ?? null;

const selectHabitShape = {
  id: habits.id,
  name: habits.name,
  frequencyGoal: habits.frequencyGoal,
  period: habits.period,
  repeatInterval: habits.repeatInterval,
  repeatDays: habits.repeatDays,
  repeatMonthlyType: habits.repeatMonthlyType,
  categoryId: habits.categoryId,
  categoryName: categories.name,
  categoryIcon: categories.icon,
  goalId: habits.goalId,
  goalTitle: planGoals.title,
  priority: habits.priority,
  visibility: habits.visibility,
  iconKey: habits.iconKey,
  reminderEnabled: habits.reminderEnabled,
  reminderTime: habits.reminderTime,
  hidden: habits.hidden,
  createdAt: habits.createdAt,
  updatedAt: habits.updatedAt,
} as const;

async function getHabitById(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  userId: string,
  habitId: string,
) {
  const [full] = await db
    .select(selectHabitShape)
    .from(habits)
    .leftJoin(
      categories,
      and(eq(habits.categoryId, categories.id), eq(categories.userId, userId)),
    )
    .leftJoin(
      planGoals,
      and(eq(habits.goalId, planGoals.id), eq(planGoals.userId, userId)),
    )
    .where(and(eq(habits.id, habitId), eq(habits.userId, userId)));

  if (!full) {
    return null;
  }

  return {
    ...full,
    categoryName: full.categoryName ?? "",
    categoryIcon: full.categoryIcon ?? "",
    goalTitle: full.goalTitle ?? null,
  };
}

async function validateGoalLink(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  userId: string,
  goalId: string | null,
) {
  if (!goalId) {
    return true;
  }

  const [goal] = await db
    .select({ id: planGoals.id })
    .from(planGoals)
    .where(and(eq(planGoals.id, goalId), eq(planGoals.userId, userId)))
    .limit(1);

  return Boolean(goal);
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

    const rows = await db
      .select(selectHabitShape)
      .from(habits)
      .leftJoin(
        categories,
        and(
          eq(habits.categoryId, categories.id),
          eq(categories.userId, user.id),
        ),
      )
      .leftJoin(
        planGoals,
        and(eq(habits.goalId, planGoals.id), eq(planGoals.userId, user.id)),
      )
      .where(eq(habits.userId, user.id))
      .orderBy(asc(habits.name));

    return NextResponse.json(
      rows.map((row) => ({
        ...row,
        categoryName: row.categoryName ?? "",
        categoryIcon: row.categoryIcon ?? "",
        goalTitle: row.goalTitle ?? null,
      })),
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

    const habitValues = (
      d: typeof createSchema._type | typeof updateSchema._type,
    ) => ({
      userId: user.id,
      name: d.name,
      frequencyGoal: d.frequencyGoal,
      period: d.period,
      repeatInterval: d.repeatInterval,
      repeatDays: d.repeatDays,
      repeatMonthlyType: d.repeatMonthlyType,
      categoryId: d.categoryId,
      goalId: d.goalId,
      priority: d.priority,
      visibility: d.visibility,
      iconKey: d.iconKey,
      reminderEnabled: d.reminderEnabled,
      reminderTime: d.reminderEnabled ? (d.reminderTime ?? "09:00") : null,
      hidden: d.hidden,
    });

    if (data.type === "create") {
      const [category] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.id, data.categoryId),
            eq(categories.userId, user.id),
          ),
        )
        .limit(1);

      if (!category) {
        return NextResponse.json(
          { error: "Category not found" },
          { status: 404 },
        );
      }

      if (!(await validateGoalLink(db, user.id, data.goalId))) {
        return NextResponse.json({ error: "Goal not found" }, { status: 404 });
      }

      const [row] = await db
        .insert(habits)
        .values(habitValues(data))
        .returning({ id: habits.id });

      if (!row) {
        return NextResponse.json({ error: "Insert failed" }, { status: 500 });
      }

      return NextResponse.json(await getHabitById(db, user.id, row.id));
    }

    if (data.type === "update") {
      const [category] = await db
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.id, data.categoryId),
            eq(categories.userId, user.id),
          ),
        )
        .limit(1);

      if (!category) {
        return NextResponse.json(
          { error: "Category not found" },
          { status: 404 },
        );
      }

      if (!(await validateGoalLink(db, user.id, data.goalId))) {
        return NextResponse.json({ error: "Goal not found" }, { status: 404 });
      }

      const [updated] = await db
        .update(habits)
        .set({ ...habitValues(data), updatedAt: new Date() })
        .where(and(eq(habits.id, data.id), eq(habits.userId, user.id)))
        .returning({ id: habits.id });

      if (!updated) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return NextResponse.json(await getHabitById(db, user.id, data.id));
    }

    await db
      .delete(habits)
      .where(and(eq(habits.userId, user.id), inArray(habits.id, data.ids)));

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
