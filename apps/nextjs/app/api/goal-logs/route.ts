import {
  categories,
  friendMessages,
  getDb,
  goalLogPhotos,
  goalLogs,
  goals,
} from "@habit/db";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  ne,
  or,
} from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

function getMonthDateRange(month: string) {
  const [year, mon] = month.split("-").map(Number);
  const start = new Date(year, mon - 1, 1);
  const end = new Date(year, mon, 1);
  const pad = (n: number) => String(n).padStart(2, "0");
  const fmt = (d: Date) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return { startDateKey: fmt(start), endDateKeyExclusive: fmt(end) };
}

const MONTH_KEY_REGEX = /^\d{4}-\d{2}$/;
const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

const monthQuerySchema = z.object({
  month: z.string().regex(MONTH_KEY_REGEX, "Month must be YYYY-MM"),
});

const bodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("setLog"),
    goalId: z.string().uuid(),
    dateKey: z.string().regex(DATE_KEY_REGEX),
    status: z.enum(["complete", "incomplete", "planned"]).nullable(),
  }),
  z.object({
    type: z.literal("setHidden"),
    goalId: z.string().uuid(),
    hidden: z.boolean(),
  }),
  z.object({
    type: z.literal("setNote"),
    goalId: z.string().uuid(),
    dateKey: z.string().regex(DATE_KEY_REGEX),
    notes: z.string().max(20_000),
  }),
]);

const getDatabase = () => getDb() ?? null;

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
    const { month } = monthQuerySchema.parse({
      month: url.searchParams.get("month"),
    });
    const { startDateKey, endDateKeyExclusive } = getMonthDateRange(month);

    const periodicFields = {
      id: goals.id,
      name: goals.name,
      iconKey: goals.iconKey,
      categoryId: goals.categoryId,
      priority: goals.priority,
      period: goals.period,
      frequencyGoal: goals.frequencyGoal,
    };

    const [
      cats,
      dailyGoals,
      periodicGoals,
      hiddenGoals,
      logs,
      photos,
      acceptedGoalIncentives,
    ] = await Promise.all([
      db
        .select()
        .from(categories)
        .where(eq(categories.userId, user.id))
        .orderBy(asc(categories.name)),
      db
        .select()
        .from(goals)
        .where(
          and(
            eq(goals.userId, user.id),
            eq(goals.period, "daily"),
            eq(goals.hidden, false),
          ),
        )
        .orderBy(asc(goals.priority), asc(goals.name)),
      db
        .select(periodicFields)
        .from(goals)
        .where(
          and(
            eq(goals.userId, user.id),
            or(ne(goals.period, "daily"), isNull(goals.period)),
            eq(goals.hidden, false),
          ),
        )
        .orderBy(asc(goals.priority), asc(goals.name)),
      db
        .select(periodicFields)
        .from(goals)
        .where(and(eq(goals.userId, user.id), eq(goals.hidden, true)))
        .orderBy(asc(goals.priority), asc(goals.name)),
      db
        .select({
          goalId: goalLogs.goalId,
          date: goalLogs.date,
          status: goalLogs.status,
          notes: goalLogs.notes,
        })
        .from(goalLogs)
        .where(
          and(
            eq(goalLogs.userId, user.id),
            gte(goalLogs.date, startDateKey),
            lt(goalLogs.date, endDateKeyExclusive),
          ),
        ),
      db
        .select({
          goalId: goalLogs.goalId,
          date: goalLogs.date,
          photoId: goalLogPhotos.id,
        })
        .from(goalLogPhotos)
        .innerJoin(goalLogs, eq(goalLogPhotos.goalLogId, goalLogs.id))
        .where(
          and(
            eq(goalLogPhotos.userId, user.id),
            gte(goalLogs.date, startDateKey),
            lt(goalLogs.date, endDateKeyExclusive),
          ),
        ),
      db
        .select({
          id: friendMessages.id,
          goalId: friendMessages.goalId,
          body: friendMessages.body,
          streakDays: friendMessages.streakDays,
          streakPercent: friendMessages.streakPercent,
          createdAt: friendMessages.createdAt,
        })
        .from(friendMessages)
        .where(
          and(
            eq(friendMessages.recipientId, user.id),
            eq(friendMessages.type, "incentive"),
            eq(friendMessages.accepted, true),
            eq(friendMessages.goalScope, "single"),
            isNotNull(friendMessages.goalId),
            isNotNull(friendMessages.streakDays),
            isNotNull(friendMessages.streakPercent),
          ),
        )
        .orderBy(desc(friendMessages.createdAt)),
    ]);

    const goalsByCategoryId = dailyGoals.reduce<
      Record<string, typeof dailyGoals>
    >((acc, goal) => {
      if (!acc[goal.categoryId]) acc[goal.categoryId] = [];
      acc[goal.categoryId].push(goal);
      return acc;
    }, {});

    const categoriesWithGoals = cats.map((cat) => ({
      id: cat.id,
      name: cat.name,
      icon: cat.icon,
      goals: (goalsByCategoryId[cat.id] ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        iconKey: g.iconKey,
        categoryId: g.categoryId,
        priority: g.priority as "high" | "medium" | "low",
        hidden: g.hidden,
      })),
    }));

    const mapPeriodic = (g: (typeof periodicGoals)[number]) => ({
      id: g.id,
      name: g.name,
      iconKey: g.iconKey,
      categoryId: g.categoryId,
      priority: g.priority as "high" | "medium" | "low",
      period: g.period,
      frequencyGoal: g.frequencyGoal,
    });

    return NextResponse.json({
      categories: categoriesWithGoals,
      periodicGoals: periodicGoals.map(mapPeriodic),
      hiddenGoals: hiddenGoals.map(mapPeriodic),
      acceptedGoalIncentives: acceptedGoalIncentives.map((incentive) => ({
        id: incentive.id,
        goalId: incentive.goalId as string,
        body: incentive.body,
        streakDays: incentive.streakDays as number,
        streakPercent: incentive.streakPercent as number,
        createdAt: incentive.createdAt.toISOString(),
      })),
      logsByGoalDate: Object.fromEntries(
        logs
          .filter(
            (log) => log.status === "complete" || log.status === "planned",
          )
          .map((log) => [`${log.goalId}_${log.date}`, log.status]),
      ),
      notesByGoalDate: Object.fromEntries(
        logs
          .filter((log) => log.notes?.trim())
          .map((log) => [`${log.goalId}_${log.date}`, log.notes]),
      ),
      photoCountsByGoalDate: photos.reduce<Record<string, number>>(
        (counts, photo) => {
          const key = `${photo.goalId}_${photo.date}`;
          counts[key] = (counts[key] ?? 0) + 1;
          return counts;
        },
        {},
      ),
    });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
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

    const data = bodySchema.parse(await request.json());

    const [goal] = await db
      .select({ id: goals.id })
      .from(goals)
      .where(and(eq(goals.id, data.goalId), eq(goals.userId, user.id)))
      .limit(1);

    if (!goal) {
      return NextResponse.json({ error: "Goal not found" }, { status: 404 });
    }

    if (data.type === "setLog") {
      if (!data.status) {
        await db
          .update(goalLogs)
          .set({
            status: "incomplete",
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(goalLogs.goalId, data.goalId),
              eq(goalLogs.date, data.dateKey),
              eq(goalLogs.userId, user.id),
            ),
          );
      } else {
        await db
          .insert(goalLogs)
          .values({
            userId: user.id,
            goalId: data.goalId,
            date: data.dateKey,
            status: data.status,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [goalLogs.goalId, goalLogs.date],
            set: {
              status: data.status,
              updatedAt: new Date(),
              userId: user.id,
            },
          });
      }

      return NextResponse.json({ ok: true });
    }

    if (data.type === "setNote") {
      if (data.notes.trim()) {
        await db
          .insert(goalLogs)
          .values({
            userId: user.id,
            goalId: data.goalId,
            date: data.dateKey,
            status: "planned",
            notes: data.notes,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [goalLogs.goalId, goalLogs.date],
            set: {
              notes: data.notes,
              updatedAt: new Date(),
              userId: user.id,
            },
          });
      } else {
        await db
          .update(goalLogs)
          .set({ notes: "", updatedAt: new Date() })
          .where(
            and(
              eq(goalLogs.goalId, data.goalId),
              eq(goalLogs.date, data.dateKey),
              eq(goalLogs.userId, user.id),
            ),
          );
      }

      return NextResponse.json({ ok: true });
    }

    await db
      .update(goals)
      .set({ hidden: data.hidden, updatedAt: new Date() })
      .where(and(eq(goals.id, data.goalId), eq(goals.userId, user.id)));

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
