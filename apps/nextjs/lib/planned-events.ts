import {
  type PlannedEventSourceType,
  type getDb,
  goalCheckpoints,
  habits,
  plannedEvents,
  tasks,
} from "@habit/db";
import { and, asc, eq, inArray } from "drizzle-orm";

import {
  deleteGoogleCalendarPlannedEvent,
  upsertGoogleCalendarPlannedEvent,
} from "@/lib/google-calendar";

type Database = NonNullable<ReturnType<typeof getDb>>;

export const PLANNED_EVENT_SOURCE_TYPES = [
  "task",
  "goal_checkpoint",
  "habit_instance",
  "other_event",
] as const satisfies readonly PlannedEventSourceType[];

export type PlannedEventRow = typeof plannedEvents.$inferSelect;

export function serializePlannedEvent(row: PlannedEventRow) {
  return {
    id: row.id,
    sourceType: row.sourceType as PlannedEventSourceType,
    sourceId: row.sourceId,
    sourceParentId: row.sourceParentId ?? null,
    title: row.title,
    date: row.date,
    startTime: row.plannedStartTime ?? null,
    endTime: row.plannedEndTime ?? null,
    googleCalendarEventId: row.googleCalendarEventId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getPlannedEventsForUser(
  db: Database,
  {
    dateKey,
    sourceType,
    userId,
  }: {
    dateKey?: string | null;
    sourceType?: PlannedEventSourceType | null;
    userId: string;
  },
) {
  if (dateKey) {
    await ensureGoalCheckpointPlansForDate(db, { dateKey, userId });
  }

  const filters = [eq(plannedEvents.userId, userId)];
  if (dateKey) filters.push(eq(plannedEvents.date, dateKey));
  if (sourceType) filters.push(eq(plannedEvents.sourceType, sourceType));

  return (await db
    .select()
    .from(plannedEvents)
    .where(and(...filters))
    .orderBy(
      asc(plannedEvents.date),
      asc(plannedEvents.plannedStartTime),
      asc(plannedEvents.createdAt),
    )) as PlannedEventRow[];
}

async function ensureGoalCheckpointPlansForDate(
  db: Database,
  { dateKey, userId }: { dateKey: string; userId: string },
) {
  const checkpointRows = (await db
    .select({
      id: goalCheckpoints.id,
      title: goalCheckpoints.title,
      targetDate: goalCheckpoints.targetDate,
    })
    .from(goalCheckpoints)
    .where(
      and(
        eq(goalCheckpoints.userId, userId),
        eq(goalCheckpoints.targetDate, dateKey),
      ),
    )) as Array<{ id: string; title: string; targetDate: string | null }>;

  if (checkpointRows.length === 0) return;

  const existingRows = (await db
    .select({ sourceId: plannedEvents.sourceId })
    .from(plannedEvents)
    .where(
      and(
        eq(plannedEvents.userId, userId),
        eq(plannedEvents.sourceType, "goal_checkpoint"),
        inArray(
          plannedEvents.sourceId,
          checkpointRows.map((checkpoint) => checkpoint.id),
        ),
      ),
    )) as Array<{ sourceId: string }>;
  const existingSourceIds = new Set(existingRows.map((row) => row.sourceId));
  const missingCheckpoints = checkpointRows.filter(
    (checkpoint) => !existingSourceIds.has(checkpoint.id),
  );

  await Promise.all(
    missingCheckpoints.map((checkpoint) =>
      upsertPlannedEvent(db, {
        dateKey,
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

export async function resolvePlannedEventSourceTitle(
  db: Database,
  {
    sourceId,
    sourceParentId,
    sourceType,
    userId,
  }: {
    sourceId: string;
    sourceParentId?: string | null;
    sourceType: PlannedEventSourceType;
    userId: string;
  },
) {
  if (sourceType === "task") {
    const [task] = (await db
      .select({ title: tasks.name })
      .from(tasks)
      .where(and(eq(tasks.id, sourceId), eq(tasks.userId, userId)))
      .limit(1)) as Array<{ title: string }>;

    return task?.title ?? null;
  }

  if (sourceType === "habit_instance") {
    const habitId = sourceParentId ?? sourceId;
    const [habit] = (await db
      .select({ title: habits.name })
      .from(habits)
      .where(and(eq(habits.id, habitId), eq(habits.userId, userId)))
      .limit(1)) as Array<{ title: string }>;

    return habit?.title ?? null;
  }

  if (sourceType === "other_event") {
    return "Other event";
  }

  const [checkpoint] = (await db
    .select({ title: goalCheckpoints.title })
    .from(goalCheckpoints)
    .where(
      and(eq(goalCheckpoints.id, sourceId), eq(goalCheckpoints.userId, userId)),
    )
    .limit(1)) as Array<{ title: string }>;

  return checkpoint?.title ?? null;
}

export async function upsertPlannedEvent(
  db: Database,
  {
    dateKey,
    plannedEndTime,
    plannedStartTime,
    sourceId,
    sourceParentId,
    sourceType,
    timeZone,
    title,
    userId,
  }: {
    dateKey: string;
    plannedEndTime?: string | null;
    plannedStartTime?: string | null;
    sourceId: string;
    sourceParentId?: string | null;
    sourceType: PlannedEventSourceType;
    timeZone?: string | null;
    title: string;
    userId: string;
  },
) {
  const [existing] = (await db
    .select({ googleCalendarEventId: plannedEvents.googleCalendarEventId })
    .from(plannedEvents)
    .where(
      and(
        eq(plannedEvents.userId, userId),
        eq(plannedEvents.sourceType, sourceType),
        eq(plannedEvents.sourceId, sourceId),
      ),
    )
    .limit(1)) as Array<{ googleCalendarEventId: string | null }>;

  const calendarSync = await upsertGoogleCalendarPlannedEvent({
    dateKey,
    existingEventId: existing?.googleCalendarEventId ?? null,
    plannedEndTime,
    plannedStartTime,
    sourceId,
    sourceType,
    title,
    timeZone,
    userId,
  });

  const [row] = (await db
    .insert(plannedEvents)
    .values({
      userId,
      sourceType,
      sourceId,
      sourceParentId: sourceParentId ?? null,
      title,
      date: dateKey,
      plannedStartTime,
      plannedEndTime,
      googleCalendarEventId:
        calendarSync.status === "synced"
          ? (calendarSync.eventId ?? existing?.googleCalendarEventId ?? null)
          : (existing?.googleCalendarEventId ?? null),
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [
        plannedEvents.userId,
        plannedEvents.sourceType,
        plannedEvents.sourceId,
      ],
      set: {
        title,
        date: dateKey,
        sourceParentId: sourceParentId ?? null,
        plannedStartTime,
        plannedEndTime,
        googleCalendarEventId:
          calendarSync.status === "synced"
            ? (calendarSync.eventId ?? existing?.googleCalendarEventId ?? null)
            : (existing?.googleCalendarEventId ?? null),
        updatedAt: new Date(),
      },
    })
    .returning()) as PlannedEventRow[];

  return { row, calendarSync };
}

export async function deletePlannedEventForSource(
  db: Database,
  {
    sourceId,
    sourceType,
    userId,
  }: {
    sourceId: string;
    sourceType: PlannedEventSourceType;
    userId: string;
  },
) {
  const [existing] = (await db
    .select({ googleCalendarEventId: plannedEvents.googleCalendarEventId })
    .from(plannedEvents)
    .where(
      and(
        eq(plannedEvents.userId, userId),
        eq(plannedEvents.sourceType, sourceType),
        eq(plannedEvents.sourceId, sourceId),
      ),
    )
    .limit(1)) as Array<{ googleCalendarEventId: string | null }>;
  const calendarSync = await deleteGoogleCalendarPlannedEvent({
    eventId: existing?.googleCalendarEventId,
    userId,
  });

  await db
    .delete(plannedEvents)
    .where(
      and(
        eq(plannedEvents.userId, userId),
        eq(plannedEvents.sourceType, sourceType),
        eq(plannedEvents.sourceId, sourceId),
      ),
    );

  return { calendarSync };
}

export async function deletePlannedEventsForSources(
  db: Database,
  {
    sourceIds,
    sourceType,
    userId,
  }: {
    sourceIds: string[];
    sourceType: PlannedEventSourceType;
    userId: string;
  },
) {
  if (sourceIds.length === 0) return;

  const existing = (await db
    .select({
      googleCalendarEventId: plannedEvents.googleCalendarEventId,
      sourceId: plannedEvents.sourceId,
    })
    .from(plannedEvents)
    .where(
      and(
        eq(plannedEvents.userId, userId),
        eq(plannedEvents.sourceType, sourceType),
        inArray(plannedEvents.sourceId, sourceIds),
      ),
    )) as Array<{ googleCalendarEventId: string | null; sourceId: string }>;

  await Promise.all(
    existing.map((event) =>
      deleteGoogleCalendarPlannedEvent({
        eventId: event.googleCalendarEventId,
        userId,
      }),
    ),
  );

  await db
    .delete(plannedEvents)
    .where(
      and(
        eq(plannedEvents.userId, userId),
        eq(plannedEvents.sourceType, sourceType),
        inArray(plannedEvents.sourceId, sourceIds),
      ),
    );
}
