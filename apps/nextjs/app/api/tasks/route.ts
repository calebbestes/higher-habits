import { getDb, tasks } from "@habit/db";
import { and, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import { deletePlannedEventsForSources } from "@/lib/planned-events";

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const recurrenceSchema = z.enum(["none", "daily", "weekly", "monthly"]);
const recurrenceWeekdaySchema = z.number().int().min(0).max(6);
const recurrenceMonthDaySchema = z.number().int().min(1).max(31);

const taskFields = {
  name: z.string().trim().min(1),
  importance: z.string().default(""),
  dueDate: dateKeySchema.nullable().default(null),
  completedAt: dateKeySchema.nullable().default(null),
  timeRequired: z.string().default(""),
  recurrence: recurrenceSchema.default("none"),
  recurrenceWeekday: recurrenceWeekdaySchema.nullable().default(null),
  recurrenceMonthDay: recurrenceMonthDaySchema.nullable().default(null),
  recurrenceWeekdays: z.array(recurrenceWeekdaySchema).default([]),
  recurrenceMonthDays: z.array(recurrenceMonthDaySchema).default([]),
  projectId: z.string().uuid().nullable().default(null),
};

const createSchema = z.object({ type: z.literal("create"), ...taskFields });
const updateSchema = z.object({
  type: z.literal("update"),
  id: z.string().uuid(),
  ...taskFields,
});
const deleteManySchema = z.object({
  type: z.literal("deleteMany"),
  ids: z.array(z.string().uuid()).min(1),
});

const completeSchema = z.object({
  type: z.literal("complete"),
  id: z.string().uuid(),
  completedAt: dateKeySchema.nullable(),
});

const bodySchema = z.discriminatedUnion("type", [
  createSchema,
  updateSchema,
  deleteManySchema,
  completeSchema,
]);

const getDatabase = () => getDb() ?? null;

function mountainTodayDateKey(date = new Date()): string {
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

function dateFromDateKey(dateKey: string): Date {
  return new Date(`${dateKey}T12:00:00.000Z`);
}

function dateKeyFromDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const date = dateFromDateKey(dateKey);
  date.setUTCDate(date.getUTCDate() + days);
  return dateKeyFromDate(date);
}

function getNextWeekdayDateKey(weekday: number, fromDateKey: string): string {
  const fromDate = dateFromDateKey(fromDateKey);
  const currentWeekday = fromDate.getUTCDay();
  const dayDelta = (weekday - currentWeekday + 7) % 7 || 7;
  return addDaysToDateKey(fromDateKey, dayDelta);
}

function getNextMonthDayDateKey(monthDay: number, fromDateKey: string): string {
  const fromDate = dateFromDateKey(fromDateKey);
  const nextMonth = new Date(
    Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth() + 1, 1),
  );
  const lastDay = new Date(
    Date.UTC(nextMonth.getUTCFullYear(), nextMonth.getUTCMonth() + 1, 0),
  ).getUTCDate();
  nextMonth.setUTCDate(Math.min(monthDay, lastDay));
  return dateKeyFromDate(nextMonth);
}

function getNextRecurringTaskDueDate(
  task: Pick<
    typeof tasks.$inferSelect,
    | "recurrence"
    | "recurrenceMonthDay"
    | "recurrenceMonthDays"
    | "recurrenceWeekday"
    | "recurrenceWeekdays"
  >,
  completedAt: string,
): string | null {
  if (task.recurrence === "none") return null;
  if (task.recurrence === "daily") return addDaysToDateKey(completedAt, 1);

  if (task.recurrence === "weekly") {
    const weekdays = Array.from(
      new Set(
        (task.recurrenceWeekdays ?? []).filter(
          (day): day is number => Number.isInteger(day) && day >= 0 && day <= 6,
        ),
      ),
    ).sort((left, right) => left - right);
    const fallback =
      task.recurrenceWeekday ?? dateFromDateKey(completedAt).getUTCDay();
    return (
      weekdays
        .map((weekday) => getNextWeekdayDateKey(weekday, completedAt))
        .sort()[0] ?? getNextWeekdayDateKey(fallback, completedAt)
    );
  }

  const monthDays = Array.from(
    new Set(
      (task.recurrenceMonthDays ?? []).filter(
        (day): day is number => Number.isInteger(day) && day >= 1 && day <= 31,
      ),
    ),
  ).sort((left, right) => left - right);
  const fallback =
    task.recurrenceMonthDay ?? dateFromDateKey(completedAt).getUTCDate();
  return (
    monthDays
      .map((monthDay) => getNextMonthDayDateKey(monthDay, completedAt))
      .sort()[0] ?? getNextMonthDayDateKey(fallback, completedAt)
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

    const todayParam = new URL(request.url).searchParams.get("today");
    const todayResult = dateKeySchema.safeParse(todayParam);
    const today = todayResult.success
      ? todayResult.data
      : mountainTodayDateKey();

    const rows = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, user.id),
          or(isNull(tasks.completedAt), eq(tasks.completedAt, today)),
        ),
      )
      .orderBy(desc(tasks.createdAt));

    return NextResponse.json(rows);
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
    const taskValues = (
      d: typeof createSchema._type | typeof updateSchema._type,
    ) => {
      const recurrenceWeekdays =
        d.recurrence === "weekly"
          ? d.recurrenceWeekdays.length
            ? d.recurrenceWeekdays
            : d.recurrenceWeekday == null
              ? []
              : [d.recurrenceWeekday]
          : [];
      const recurrenceMonthDays =
        d.recurrence === "monthly"
          ? d.recurrenceMonthDays.length
            ? d.recurrenceMonthDays
            : d.recurrenceMonthDay == null
              ? []
              : [d.recurrenceMonthDay]
          : [];

      return {
        userId: user.id,
        name: d.name,
        importance: d.importance,
        dueDate: d.dueDate,
        completedAt: d.completedAt,
        timeRequired: d.timeRequired,
        recurrence: d.recurrence,
        recurrenceWeekday: recurrenceWeekdays[0] ?? null,
        recurrenceMonthDay: recurrenceMonthDays[0] ?? null,
        recurrenceWeekdays,
        recurrenceMonthDays,
        projectId: d.projectId,
      };
    };

    if (data.type === "complete") {
      const nextTask = await db.transaction(async (tx) => {
        const [updated] = await tx
          .update(tasks)
          .set({ completedAt: data.completedAt })
          .where(
            and(
              eq(tasks.id, data.id),
              eq(tasks.userId, user.id),
              data.completedAt === null ? undefined : isNull(tasks.completedAt),
            ),
          )
          .returning();

        if (!updated) {
          return null;
        }

        if (data.completedAt === null) return null;
        const dueDate = getNextRecurringTaskDueDate(updated, data.completedAt);
        if (!dueDate) return null;

        const [created] = await tx
          .insert(tasks)
          .values({
            userId: user.id,
            projectId: updated.projectId,
            name: updated.name,
            importance: updated.importance,
            dueDate,
            completedAt: null,
            timeRequired: updated.timeRequired,
            recurrence: updated.recurrence,
            recurrenceWeekday: updated.recurrenceWeekday,
            recurrenceMonthDay: updated.recurrenceMonthDay,
            recurrenceWeekdays: updated.recurrenceWeekdays,
            recurrenceMonthDays: updated.recurrenceMonthDays,
          })
          .returning();

        return created ?? null;
      });

      const [task] = await db
        .select()
        .from(tasks)
        .where(and(eq(tasks.id, data.id), eq(tasks.userId, user.id)))
        .limit(1);
      if (!task) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return NextResponse.json({ task, nextTask });
    }

    if (data.type === "create") {
      const [row] = await db.insert(tasks).values(taskValues(data)).returning();
      if (!row) {
        return NextResponse.json({ error: "Insert failed" }, { status: 500 });
      }

      return NextResponse.json(row);
    }

    if (data.type === "update") {
      const [existingTask] = await db
        .select({ completedAt: tasks.completedAt, id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.id, data.id), eq(tasks.userId, user.id)))
        .limit(1);

      if (!existingTask) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const [row] = await db
        .update(tasks)
        .set(taskValues(data))
        .where(and(eq(tasks.id, data.id), eq(tasks.userId, user.id)))
        .returning();

      if (!row) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      return NextResponse.json(row);
    }

    await deletePlannedEventsForSources(db, {
      sourceIds: data.ids,
      sourceType: "task",
      userId: user.id,
    });

    await db
      .delete(tasks)
      .where(and(eq(tasks.userId, user.id), inArray(tasks.id, data.ids)));

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
