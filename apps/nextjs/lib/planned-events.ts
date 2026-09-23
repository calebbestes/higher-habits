import {
  type PlannedEventSourceType,
  type getDb,
  goalCheckpoints,
  goalLogs,
  habits,
  plannedEvents,
  tasks,
} from "@habit/db";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";

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
    calendarColor: row.calendarColor ?? null,
    date: row.date,
    startTime: row.plannedStartTime ?? null,
    endTime: row.plannedEndTime ?? null,
    completed: Boolean(row.completedAt),
    googleCalendarEventId: row.googleCalendarEventId ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function setPlannedEventCompletion(
  db: Database,
  {
    completed,
    sourceId,
    sourceType,
    userId,
  }: {
    completed: boolean;
    sourceId: string;
    sourceType: PlannedEventSourceType;
    userId: string;
  },
) {
  return db.transaction(async (tx) => {
    const [existingEvent] = await tx
      .select()
      .from(plannedEvents)
      .where(
        and(
          eq(plannedEvents.userId, userId),
          eq(plannedEvents.sourceType, sourceType),
          eq(plannedEvents.sourceId, sourceId),
        ),
      )
      .limit(1);

    if (!existingEvent) return null;

    const wasCompleted = Boolean(existingEvent.completedAt);
    const [row] = (await tx
      .update(plannedEvents)
      .set({
        completedAt: completed ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(plannedEvents.id, existingEvent.id))
      .returning()) as PlannedEventRow[];

    if (!row || wasCompleted === completed || !existingEvent.sourceParentId) {
      return row ?? null;
    }

    const [habit] = await tx
      .select({
        frequencyGoal: habits.frequencyGoal,
        id: habits.id,
        visibility: habits.visibility,
      })
      .from(habits)
      .where(
        and(
          eq(habits.id, existingEvent.sourceParentId),
          eq(habits.userId, userId),
        ),
      )
      .limit(1);

    if (!habit) return row;

    const [existingLog] = await tx
      .select()
      .from(goalLogs)
      .where(
        and(
          eq(goalLogs.goalId, habit.id),
          eq(goalLogs.date, existingEvent.date),
          eq(goalLogs.userId, userId),
        ),
      )
      .limit(1);

    const targetCount = Math.max(habit.frequencyGoal ?? 1, 1);
    const completedCount = Math.min(
      targetCount,
      Math.max(0, (existingLog?.completedCount ?? 0) + (completed ? 1 : -1)),
    );
    const status =
      completedCount >= targetCount
        ? "complete"
        : completedCount > 0
          ? "incomplete"
          : existingLog?.status === "planned"
            ? "planned"
            : "incomplete";

    await tx
      .insert(goalLogs)
      .values({
        completedCount,
        date: existingEvent.date,
        goalId: habit.id,
        status,
        userId,
        visibility: existingLog?.visibility ?? habit.visibility,
        ...(existingLog
          ? {}
          : {
              notes: "",
              plannedEndTime: null,
              plannedRepeatsDaily: false,
              plannedStartTime: null,
            }),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [goalLogs.goalId, goalLogs.date],
        set: {
          completedCount,
          status,
          updatedAt: new Date(),
          userId,
        },
      });

    return row;
  });
}

export async function getPlannedEventsForUser(
  db: Database,
  {
    dateKey,
    endDateKey,
    sourceType,
    startDateKey,
    userId,
  }: {
    dateKey?: string | null;
    endDateKey?: string | null;
    sourceType?: PlannedEventSourceType | null;
    startDateKey?: string | null;
    userId: string;
  },
) {
  const filters = [eq(plannedEvents.userId, userId)];
  if (dateKey) filters.push(eq(plannedEvents.date, dateKey));
  if (startDateKey) filters.push(gte(plannedEvents.date, startDateKey));
  if (endDateKey) filters.push(lte(plannedEvents.date, endDateKey));
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
    calendarColor,
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
    calendarColor?: string | null;
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
    color: calendarColor,
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
      calendarColor: calendarColor ?? null,
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
        calendarColor: calendarColor ?? null,
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
