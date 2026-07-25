import { randomUUID } from "node:crypto";
import { type PlannedEventSourceType, getDb, plannedEvents } from "@habit/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import {
  getMonthKeyFromDateKey,
  jsonWithCreditHeaders,
  recordPlanCreditProgress,
} from "@/lib/float-credits";
import {
  PLANNED_EVENT_SOURCE_TYPES,
  deletePlannedEventForSource,
  getPlannedEventsForUser,
  resolvePlannedEventSourceTitle,
  serializePlannedEvent,
  upsertPlannedEvent,
} from "@/lib/planned-events";

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sourceTypeSchema = z.enum(PLANNED_EVENT_SOURCE_TYPES);
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
  .nullable()
  .default(null);

const querySchema = z.object({
  dateKey: dateKeySchema.optional(),
  sourceType: sourceTypeSchema.optional(),
});

const upsertSchema = z.object({
  type: z.literal("upsert"),
  sourceType: sourceTypeSchema,
  sourceId: z.string().uuid().optional(),
  sourceParentId: z.string().uuid().nullable().optional(),
  title: z.string().trim().min(1).max(200).optional(),
  dateKey: dateKeySchema,
  plannedStartTime: timeSchema,
  plannedEndTime: timeSchema,
  plannedTimeZone: z.string().min(1).nullable().optional(),
});

const deleteSchema = z.object({
  type: z.literal("delete"),
  sourceType: sourceTypeSchema,
  sourceId: z.string().uuid(),
});

const bodySchema = z.discriminatedUnion("type", [upsertSchema, deleteSchema]);

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
    const query = querySchema.parse({
      dateKey: url.searchParams.get("dateKey") ?? undefined,
      sourceType: url.searchParams.get("sourceType") ?? undefined,
    });
    const rows = await getPlannedEventsForUser(db, {
      dateKey: query.dateKey ?? null,
      sourceType: query.sourceType ?? null,
      userId: user.id,
    });

    return NextResponse.json(rows.map(serializePlannedEvent));
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

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

    if (data.type === "delete") {
      const [existingPlan] = await db
        .select({ date: plannedEvents.date })
        .from(plannedEvents)
        .where(
          and(
            eq(plannedEvents.userId, user.id),
            eq(plannedEvents.sourceType, data.sourceType),
            eq(plannedEvents.sourceId, data.sourceId),
          ),
        )
        .limit(1);
      const title =
        data.sourceType === "habit_instance"
          ? "Habit block"
          : await resolvePlannedEventSourceTitle(db, {
              sourceId: data.sourceId,
              sourceParentId: null,
              sourceType: data.sourceType as PlannedEventSourceType,
              userId: user.id,
            });

      if (!title) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }

      const result = await deletePlannedEventForSource(db, {
        sourceId: data.sourceId,
        sourceType: data.sourceType as PlannedEventSourceType,
        userId: user.id,
      });

      const creditEvents = existingPlan
        ? [
            await recordPlanCreditProgress(db, {
              actionDate: existingPlan.date,
              amount: -1,
              periodKey: existingPlan.date,
              threshold: 5,
              type: "daily_plan",
              userId: user.id,
            }),
            await recordPlanCreditProgress(db, {
              actionDate: existingPlan.date,
              amount: -1,
              periodKey: getMonthKeyFromDateKey(existingPlan.date),
              threshold: 10,
              type: "monthly_plan",
              userId: user.id,
            }),
          ]
        : [];

      return jsonWithCreditHeaders(
        { ok: true, calendarSync: result.calendarSync },
        creditEvents,
      );
    }

    const sourceId =
      data.sourceId ??
      (data.sourceType === "habit_instance" || data.sourceType === "other_event"
        ? randomUUID()
        : null);
    if (!sourceId) {
      return NextResponse.json({ error: "Missing source id" }, { status: 400 });
    }
    if (data.sourceType === "habit_instance" && !data.sourceParentId) {
      return NextResponse.json({ error: "Missing habit id" }, { status: 400 });
    }
    if (data.sourceType === "other_event" && !data.title?.trim()) {
      return NextResponse.json(
        { error: "Missing event title" },
        { status: 400 },
      );
    }

    const sourceTitle =
      data.sourceType === "other_event"
        ? data.title?.trim()
        : await resolvePlannedEventSourceTitle(db, {
            sourceId,
            sourceParentId: data.sourceParentId ?? null,
            sourceType: data.sourceType as PlannedEventSourceType,
            userId: user.id,
          });

    if (!sourceTitle) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const [existingPlan] = await db
      .select({ date: plannedEvents.date })
      .from(plannedEvents)
      .where(
        and(
          eq(plannedEvents.userId, user.id),
          eq(plannedEvents.sourceType, data.sourceType),
          eq(plannedEvents.sourceId, sourceId),
        ),
      )
      .limit(1);

    const result = await upsertPlannedEvent(db, {
      dateKey: data.dateKey,
      plannedEndTime: data.plannedEndTime,
      plannedStartTime: data.plannedStartTime,
      sourceId,
      sourceParentId: data.sourceParentId ?? null,
      sourceType: data.sourceType as PlannedEventSourceType,
      timeZone: data.plannedTimeZone ?? null,
      title: data.title?.trim() || sourceTitle,
      userId: user.id,
    });

    const creditEvents = [];
    if (!existingPlan || existingPlan.date !== data.dateKey) {
      if (existingPlan) {
        creditEvents.push(
          await recordPlanCreditProgress(db, {
            actionDate: existingPlan.date,
            amount: -1,
            periodKey: existingPlan.date,
            threshold: 5,
            type: "daily_plan",
            userId: user.id,
          }),
          await recordPlanCreditProgress(db, {
            actionDate: existingPlan.date,
            amount: -1,
            periodKey: getMonthKeyFromDateKey(existingPlan.date),
            threshold: 10,
            type: "monthly_plan",
            userId: user.id,
          }),
        );
      }

      creditEvents.push(
        await recordPlanCreditProgress(db, {
          actionDate: data.dateKey,
          amount: 1,
          periodKey: data.dateKey,
          threshold: 5,
          type: "daily_plan",
          userId: user.id,
        }),
        await recordPlanCreditProgress(db, {
          actionDate: data.dateKey,
          amount: 1,
          periodKey: getMonthKeyFromDateKey(data.dateKey),
          threshold: 10,
          type: "monthly_plan",
          userId: user.id,
        }),
      );
    }

    return jsonWithCreditHeaders(
      {
        event: serializePlannedEvent(result.row),
        calendarSync: result.calendarSync,
      },
      creditEvents,
    );
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
