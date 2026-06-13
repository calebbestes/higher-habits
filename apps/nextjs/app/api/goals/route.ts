import { categories, getDb, goals } from "@habit/db";
import { and, asc, eq, inArray } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const goalFields = {
  name: z.string().trim().min(1),
  frequencyGoal: z.number().int().positive().nullable().default(null),
  period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  repeatInterval: z.number().int().min(1).max(99).nullable().default(null),
  repeatDays: z.array(z.number().int().min(0).max(6)).nullable().default(null),
  repeatMonthlyType: z
    .enum(["day_of_month", "day_of_week"])
    .nullable()
    .default(null),
  categoryId: z.string().uuid(),
  priority: z.enum(["high", "low"]),
  visibility: z
    .enum(["only_me", "goal_friends", "all_friends"])
    .default("only_me"),
  iconKey: z.string().default(""),
  hidden: z.boolean().default(false),
};

const createSchema = z.object({ type: z.literal("create"), ...goalFields });
const updateSchema = z.object({
  type: z.literal("update"),
  id: z.string().uuid(),
  ...goalFields,
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

const selectGoalShape = {
  id: goals.id,
  name: goals.name,
  frequencyGoal: goals.frequencyGoal,
  period: goals.period,
  repeatInterval: goals.repeatInterval,
  repeatDays: goals.repeatDays,
  repeatMonthlyType: goals.repeatMonthlyType,
  categoryId: goals.categoryId,
  categoryName: categories.name,
  categoryIcon: categories.icon,
  priority: goals.priority,
  visibility: goals.visibility,
  iconKey: goals.iconKey,
  hidden: goals.hidden,
  createdAt: goals.createdAt,
  updatedAt: goals.updatedAt,
} as const;

async function getGoalById(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  userId: string,
  goalId: string,
) {
  const [full] = await db
    .select(selectGoalShape)
    .from(goals)
    .leftJoin(
      categories,
      and(eq(goals.categoryId, categories.id), eq(categories.userId, userId)),
    )
    .where(and(eq(goals.id, goalId), eq(goals.userId, userId)));

  if (!full) {
    return null;
  }

  return {
    ...full,
    categoryName: full.categoryName ?? "",
    categoryIcon: full.categoryIcon ?? "",
  };
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
      .select(selectGoalShape)
      .from(goals)
      .leftJoin(
        categories,
        and(
          eq(goals.categoryId, categories.id),
          eq(categories.userId, user.id),
        ),
      )
      .where(eq(goals.userId, user.id))
      .orderBy(asc(goals.name));

    return NextResponse.json(
      rows.map((row) => ({
        ...row,
        categoryName: row.categoryName ?? "",
        categoryIcon: row.categoryIcon ?? "",
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

    const goalValues = (
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
      priority: d.priority,
      visibility: d.visibility,
      iconKey: d.iconKey,
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

      const [row] = await db
        .insert(goals)
        .values(goalValues(data))
        .returning({ id: goals.id });

      if (!row) {
        return NextResponse.json({ error: "Insert failed" }, { status: 500 });
      }

      return NextResponse.json(await getGoalById(db, user.id, row.id));
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

      const [updated] = await db
        .update(goals)
        .set({ ...goalValues(data), updatedAt: new Date() })
        .where(and(eq(goals.id, data.id), eq(goals.userId, user.id)))
        .returning({ id: goals.id });

      if (!updated) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return NextResponse.json(await getGoalById(db, user.id, data.id));
    }

    await db
      .delete(goals)
      .where(and(eq(goals.userId, user.id), inArray(goals.id, data.ids)));

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
