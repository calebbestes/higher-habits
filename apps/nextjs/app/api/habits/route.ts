import {
  categories,
  friendGroups,
  friends,
  getDb,
  habitAudienceFriends,
  habitAudienceGroups,
  habits,
  goals as planGoals,
} from "@habit/db";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const TIME_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;

const habitFields = {
  name: z.string().trim().min(1),
  frequencyGoal: z.number().int().positive().nullable().default(null),
  period: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  repeatCadence: z
    .enum(["daily", "weekly", "monthly"])
    .nullable()
    .default(null),
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
  audienceFriendIds: z.array(z.string().min(1)).max(100).default([]),
  audienceGroupIds: z.array(z.string().uuid()).max(50).default([]),
  iconKey: z.string().default(""),
  defaultComplete: z.boolean().default(false),
  planOnCalendar: z.boolean().default(true),
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
  repeatCadence: habits.repeatCadence,
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
  defaultComplete: habits.defaultComplete,
  planOnCalendar: habits.planOnCalendar,
  reminderEnabled: habits.reminderEnabled,
  reminderTime: habits.reminderTime,
  hidden: habits.hidden,
  createdAt: habits.createdAt,
  updatedAt: habits.updatedAt,
} as const;

async function getAudienceByHabitIds(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  userId: string,
  habitIds: string[],
) {
  const audience = new Map<
    string,
    { audienceFriendIds: string[]; audienceGroupIds: string[] }
  >();

  for (const habitId of habitIds) {
    audience.set(habitId, { audienceFriendIds: [], audienceGroupIds: [] });
  }

  if (habitIds.length === 0) return audience;

  const [friendRows, groupRows] = await Promise.all([
    db
      .select({
        habitId: habitAudienceFriends.habitId,
        friendUserId: habitAudienceFriends.friendUserId,
      })
      .from(habitAudienceFriends)
      .where(
        and(
          eq(habitAudienceFriends.userId, userId),
          inArray(habitAudienceFriends.habitId, habitIds),
        ),
      ),
    db
      .select({
        habitId: habitAudienceGroups.habitId,
        groupId: habitAudienceGroups.groupId,
      })
      .from(habitAudienceGroups)
      .where(
        and(
          eq(habitAudienceGroups.userId, userId),
          inArray(habitAudienceGroups.habitId, habitIds),
        ),
      ),
  ]);

  for (const row of friendRows) {
    audience.get(row.habitId)?.audienceFriendIds.push(row.friendUserId);
  }
  for (const row of groupRows) {
    audience.get(row.habitId)?.audienceGroupIds.push(row.groupId);
  }

  return audience;
}

async function validateAudience(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  userId: string,
  friendIds: string[],
  groupIds: string[],
) {
  const uniqueFriendIds = [...new Set(friendIds)].filter((id) => id !== userId);
  const uniqueGroupIds = [...new Set(groupIds)];

  if (uniqueFriendIds.length > 0) {
    const acceptedRows = await db
      .select({ id: friends.id })
      .from(friends)
      .where(
        and(
          eq(friends.status, "accepted"),
          or(
            and(
              eq(friends.userId1, userId),
              inArray(friends.userId2, uniqueFriendIds),
            ),
            and(
              eq(friends.userId2, userId),
              inArray(friends.userId1, uniqueFriendIds),
            ),
          ),
        ),
      );

    if (acceptedRows.length !== uniqueFriendIds.length) {
      return null;
    }
  }

  if (uniqueGroupIds.length > 0) {
    const groupRows = await db
      .select({ id: friendGroups.id })
      .from(friendGroups)
      .where(
        and(
          eq(friendGroups.ownerId, userId),
          inArray(friendGroups.id, uniqueGroupIds),
        ),
      );

    if (groupRows.length !== uniqueGroupIds.length) {
      return null;
    }
  }

  return {
    audienceFriendIds: uniqueFriendIds,
    audienceGroupIds: uniqueGroupIds,
  };
}

async function replaceHabitAudience(
  db: NonNullable<ReturnType<typeof getDatabase>>,
  userId: string,
  habitId: string,
  audience: { audienceFriendIds: string[]; audienceGroupIds: string[] },
  enabled: boolean,
) {
  await Promise.all([
    db
      .delete(habitAudienceFriends)
      .where(
        and(
          eq(habitAudienceFriends.userId, userId),
          eq(habitAudienceFriends.habitId, habitId),
        ),
      ),
    db
      .delete(habitAudienceGroups)
      .where(
        and(
          eq(habitAudienceGroups.userId, userId),
          eq(habitAudienceGroups.habitId, habitId),
        ),
      ),
  ]);

  if (!enabled) return;

  await Promise.all([
    audience.audienceFriendIds.length
      ? db.insert(habitAudienceFriends).values(
          audience.audienceFriendIds.map((friendUserId) => ({
            habitId,
            userId,
            friendUserId,
          })),
        )
      : Promise.resolve(),
    audience.audienceGroupIds.length
      ? db.insert(habitAudienceGroups).values(
          audience.audienceGroupIds.map((groupId) => ({
            habitId,
            userId,
            groupId,
          })),
        )
      : Promise.resolve(),
  ]);
}

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

  const audience = await getAudienceByHabitIds(db, userId, [habitId]);

  return {
    ...full,
    categoryName: full.categoryName ?? "",
    categoryIcon: full.categoryIcon ?? "",
    goalTitle: full.goalTitle ?? null,
    ...(audience.get(habitId) ?? {
      audienceFriendIds: [],
      audienceGroupIds: [],
    }),
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
    const audience = await getAudienceByHabitIds(
      db,
      user.id,
      rows.map((row) => row.id),
    );

    return NextResponse.json(
      rows.map((row) => ({
        ...row,
        categoryName: row.categoryName ?? "",
        categoryIcon: row.categoryIcon ?? "",
        goalTitle: row.goalTitle ?? null,
        ...(audience.get(row.id) ?? {
          audienceFriendIds: [],
          audienceGroupIds: [],
        }),
      })),
    );
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
    }

    console.error("Habit list failed", error);

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
      repeatCadence: d.repeatCadence,
      repeatInterval: d.repeatInterval,
      repeatDays: d.repeatDays,
      repeatMonthlyType: d.repeatMonthlyType,
      categoryId: d.categoryId,
      goalId: d.goalId,
      priority: d.priority,
      visibility: d.visibility,
      iconKey: d.iconKey,
      defaultComplete: d.defaultComplete,
      planOnCalendar: d.planOnCalendar,
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

      const audience = await validateAudience(
        db,
        user.id,
        data.audienceFriendIds,
        data.audienceGroupIds,
      );
      if (!audience) {
        return NextResponse.json(
          { error: "Choose accepted friends and your own groups." },
          { status: 400 },
        );
      }

      const [row] = await db
        .insert(habits)
        .values(habitValues(data))
        .returning({ id: habits.id });

      if (!row) {
        return NextResponse.json({ error: "Insert failed" }, { status: 500 });
      }

      await replaceHabitAudience(
        db,
        user.id,
        row.id,
        audience,
        data.visibility === "goal_friends",
      );

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

      const audience = await validateAudience(
        db,
        user.id,
        data.audienceFriendIds,
        data.audienceGroupIds,
      );
      if (!audience) {
        return NextResponse.json(
          { error: "Choose accepted friends and your own groups." },
          { status: 400 },
        );
      }

      const [updated] = await db
        .update(habits)
        .set({ ...habitValues(data), updatedAt: new Date() })
        .where(and(eq(habits.id, data.id), eq(habits.userId, user.id)))
        .returning({ id: habits.id });

      if (!updated) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      await replaceHabitAudience(
        db,
        user.id,
        data.id,
        audience,
        data.visibility === "goal_friends",
      );

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

    console.error("Habit mutation failed", error);

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
