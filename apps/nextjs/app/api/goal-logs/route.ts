import {
  categories,
  friendMessages,
  getDb,
  goalLogPhotos,
  goalLogs,
  habits,
  sharedGoalParticipants,
  sharedGoals,
  users,
} from "@habit/db";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  lt,
  ne,
} from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import {
  deleteGoogleCalendarHabitPlan,
  updateGoogleCalendarHabitPlanDescription,
  upsertGoogleCalendarHabitPlan,
} from "@/lib/google-calendar";
import {
  GOAL_PHOTOS_BUCKET,
  getSupabaseStorageAdmin,
} from "@/lib/supabase-storage";

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
const TIME_KEY_REGEX = /^([01]?\d|2[0-3]):[0-5]\d$/;

const monthQuerySchema = z.object({
  month: z.string().regex(MONTH_KEY_REGEX, "Month must be YYYY-MM"),
});

const bodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("setLog"),
    goalId: z.string().uuid(),
    dateKey: z.string().regex(DATE_KEY_REGEX),
    status: z.enum(["complete", "incomplete", "planned"]).nullable(),
    plannedStartTime: z.string().regex(TIME_KEY_REGEX).nullable().optional(),
    plannedEndTime: z.string().regex(TIME_KEY_REGEX).nullable().optional(),
    plannedTimeZone: z.string().min(1).max(100).nullable().optional(),
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
  z.object({
    type: z.literal("setVisibility"),
    goalId: z.string().uuid(),
    dateKey: z.string().regex(DATE_KEY_REGEX),
    visibility: z.enum(["only_me", "goal_friends", "all_friends"]),
  }),
  z.object({
    type: z.literal("deleteLog"),
    goalId: z.string().uuid(),
    dateKey: z.string().regex(DATE_KEY_REGEX),
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
    const allDates = url.searchParams.get("all") === "true";
    const range = allDates
      ? null
      : getMonthDateRange(
          monthQuerySchema.parse({
            month: url.searchParams.get("month"),
          }).month,
        );

    const periodicFields = {
      id: habits.id,
      name: habits.name,
      iconKey: habits.iconKey,
      categoryId: habits.categoryId,
      goalId: habits.goalId,
      priority: habits.priority,
      visibility: habits.visibility,
      period: habits.period,
      frequencyGoal: habits.frequencyGoal,
      repeatInterval: habits.repeatInterval,
      repeatDays: habits.repeatDays,
      repeatMonthlyType: habits.repeatMonthlyType,
      createdAt: habits.createdAt,
    };

    const [
      cats,
      dailyGoals,
      periodicGoals,
      hiddenGoals,
      logs,
      photos,
      acceptedGoalIncentives,
      sharedGoalLinks,
    ] = await Promise.all([
      db
        .select()
        .from(categories)
        .where(eq(categories.userId, user.id))
        .orderBy(asc(categories.name)),
      db
        .select()
        .from(habits)
        .where(
          and(
            eq(habits.userId, user.id),
            eq(habits.period, "daily"),
            eq(habits.hidden, false),
          ),
        )
        .orderBy(asc(habits.priority), asc(habits.name)),
      db
        .select(periodicFields)
        .from(habits)
        .where(
          and(
            eq(habits.userId, user.id),
            ne(habits.period, "daily"),
            eq(habits.hidden, false),
          ),
        )
        .orderBy(asc(habits.priority), asc(habits.name)),
      db
        .select(periodicFields)
        .from(habits)
        .where(and(eq(habits.userId, user.id), eq(habits.hidden, true)))
        .orderBy(asc(habits.priority), asc(habits.name)),
      db
        .select({
          goalId: goalLogs.goalId,
          date: goalLogs.date,
          status: goalLogs.status,
          notes: goalLogs.notes,
          plannedStartTime: goalLogs.plannedStartTime,
          plannedEndTime: goalLogs.plannedEndTime,
          visibility: goalLogs.visibility,
        })
        .from(goalLogs)
        .where(
          and(
            eq(goalLogs.userId, user.id),
            range ? gte(goalLogs.date, range.startDateKey) : undefined,
            range ? lt(goalLogs.date, range.endDateKeyExclusive) : undefined,
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
            range ? gte(goalLogs.date, range.startDateKey) : undefined,
            range ? lt(goalLogs.date, range.endDateKeyExclusive) : undefined,
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
      db
        .select({
          personalGoalId: sharedGoalParticipants.personalGoalId,
          sharedGoalId: sharedGoals.id,
          sharedGoalName: sharedGoals.name,
          mode: sharedGoals.mode,
        })
        .from(sharedGoalParticipants)
        .innerJoin(
          sharedGoals,
          eq(sharedGoalParticipants.sharedGoalId, sharedGoals.id),
        )
        .where(
          and(
            eq(sharedGoalParticipants.userId, user.id),
            eq(sharedGoalParticipants.status, "accepted"),
            isNotNull(sharedGoalParticipants.personalGoalId),
            ne(sharedGoals.status, "archived"),
          ),
        ),
    ]);

    const sharedGoalIds = [
      ...new Set(sharedGoalLinks.map((link) => link.sharedGoalId)),
    ];
    const sharedGoalFriendRows = sharedGoalIds.length
      ? await db
          .select({
            sharedGoalId: sharedGoalParticipants.sharedGoalId,
            userId: users.id,
            name: users.name,
            image: users.image,
          })
          .from(sharedGoalParticipants)
          .innerJoin(users, eq(sharedGoalParticipants.userId, users.id))
          .where(
            and(
              inArray(sharedGoalParticipants.sharedGoalId, sharedGoalIds),
              eq(sharedGoalParticipants.status, "accepted"),
              ne(sharedGoalParticipants.userId, user.id),
            ),
          )
      : [];
    const sharedGoalFriendsById = sharedGoalFriendRows.reduce<
      Record<
        string,
        Array<{ userId: string; name: string; image: string | null }>
      >
    >((friends, row) => {
      friends[row.sharedGoalId] ??= [];
      friends[row.sharedGoalId].push({
        userId: row.userId,
        name: row.name,
        image: row.image,
      });
      return friends;
    }, {});

    const sharedGoalsByPersonalGoalId = sharedGoalLinks.reduce<
      Record<
        string,
        Array<{
          id: string;
          name: string;
          mode: "collaborative" | "competitive";
          friends: Array<{
            userId: string;
            name: string;
            image: string | null;
          }>;
        }>
      >
    >((links, link) => {
      if (!link.personalGoalId) return links;
      links[link.personalGoalId] ??= [];
      links[link.personalGoalId].push({
        id: link.sharedGoalId,
        name: link.sharedGoalName,
        mode: link.mode,
        friends: sharedGoalFriendsById[link.sharedGoalId] ?? [],
      });
      return links;
    }, {});

    const goalsByCategoryId = dailyGoals.reduce<
      Record<string, typeof dailyGoals>
    >((acc, goal) => {
      if (!acc[goal.categoryId]) acc[goal.categoryId] = [];
      acc[goal.categoryId].push(goal);
      return acc;
    }, {});

    const categoriesWithGoals = cats.map((cat) => {
      const categoryHabits = (goalsByCategoryId[cat.id] ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        iconKey: g.iconKey,
        categoryId: g.categoryId,
        goalId: g.goalId ?? null,
        goalTitle: null,
        priority: g.priority as "high" | "low",
        hidden: g.hidden,
        visibility: g.visibility,
        period: g.period,
        frequencyGoal: g.frequencyGoal,
        sharedGoals: sharedGoalsByPersonalGoalId[g.id] ?? [],
      }));

      return {
        id: cat.id,
        name: cat.name,
        icon: cat.icon,
        habits: categoryHabits,
        goals: categoryHabits,
      };
    });

    const mapPeriodic = (g: (typeof periodicGoals)[number]) => ({
      id: g.id,
      name: g.name,
      iconKey: g.iconKey,
      categoryId: g.categoryId,
      goalId: g.goalId ?? null,
      goalTitle: null,
      priority: g.priority as "high" | "low",
      visibility: g.visibility,
      period: g.period,
      frequencyGoal: g.frequencyGoal,
      repeatInterval: g.repeatInterval ?? null,
      repeatDays: (g.repeatDays as number[] | null) ?? null,
      repeatMonthlyType: g.repeatMonthlyType ?? null,
      createdAt: g.createdAt.toISOString(),
      sharedGoals: sharedGoalsByPersonalGoalId[g.id] ?? [],
    });

    const periodicHabitRows = periodicGoals.map(mapPeriodic);
    const hiddenHabitRows = hiddenGoals.map(mapPeriodic);
    const acceptedHabitIncentiveRows = acceptedGoalIncentives.map(
      (incentive) => ({
        id: incentive.id,
        goalId: incentive.goalId as string,
        habitId: incentive.goalId as string,
        body: incentive.body,
        streakDays: incentive.streakDays as number,
        streakPercent: incentive.streakPercent as number,
        createdAt: incentive.createdAt.toISOString(),
      }),
    );
    const logsByHabitDate = Object.fromEntries(
      logs
        .filter((log) => log.status === "complete" || log.status === "planned")
        .map((log) => [`${log.goalId}_${log.date}`, log.status]),
    );
    const notesByHabitDate = Object.fromEntries(
      logs
        .filter((log) => log.notes?.trim())
        .map((log) => [`${log.goalId}_${log.date}`, log.notes]),
    );
    const visibilityByHabitDate = Object.fromEntries(
      logs.map((log) => [`${log.goalId}_${log.date}`, log.visibility]),
    );
    const plannedTimesByHabitDate = Object.fromEntries(
      logs
        .filter((log) => log.plannedStartTime || log.plannedEndTime)
        .map((log) => [
          `${log.goalId}_${log.date}`,
          {
            startTime: log.plannedStartTime ?? null,
            endTime: log.plannedEndTime ?? null,
          },
        ]),
    );
    const photoCountsByHabitDate = photos.reduce<Record<string, number>>(
      (counts, photo) => {
        const key = `${photo.goalId}_${photo.date}`;
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      },
      {},
    );

    return NextResponse.json({
      categories: categoriesWithGoals,
      periodicGoals: periodicHabitRows,
      periodicHabits: periodicHabitRows,
      hiddenGoals: hiddenHabitRows,
      hiddenHabits: hiddenHabitRows,
      acceptedGoalIncentives: acceptedHabitIncentiveRows,
      acceptedHabitIncentives: acceptedHabitIncentiveRows,
      logsByGoalDate: logsByHabitDate,
      logsByHabitDate,
      notesByGoalDate: notesByHabitDate,
      notesByHabitDate,
      visibilityByGoalDate: visibilityByHabitDate,
      visibilityByHabitDate,
      plannedTimesByGoalDate: plannedTimesByHabitDate,
      plannedTimesByHabitDate,
      photoCountsByGoalDate: photoCountsByHabitDate,
      photoCountsByHabitDate,
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
      .select({
        id: habits.id,
        name: habits.name,
        visibility: habits.visibility,
      })
      .from(habits)
      .where(and(eq(habits.id, data.goalId), eq(habits.userId, user.id)))
      .limit(1);

    if (!goal) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    }

    if (data.type === "setLog") {
      const [existingLog] = await db
        .select({
          googleCalendarEventId: goalLogs.googleCalendarEventId,
          notes: goalLogs.notes,
          status: goalLogs.status,
        })
        .from(goalLogs)
        .where(
          and(
            eq(goalLogs.goalId, data.goalId),
            eq(goalLogs.date, data.dateKey),
            eq(goalLogs.userId, user.id),
          ),
        )
        .limit(1);

      if (!data.status) {
        const shouldDeletePlanEvent = existingLog?.status === "planned";
        const calendarSync = shouldDeletePlanEvent
          ? await deleteGoogleCalendarHabitPlan({
              eventId: existingLog?.googleCalendarEventId,
              userId: user.id,
            })
          : { status: "skipped" as const };
        const updateValues: {
          googleCalendarEventId?: null;
          plannedEndTime: null;
          plannedStartTime: null;
          status: "incomplete";
          updatedAt: Date;
        } = {
          status: "incomplete",
          plannedStartTime: null,
          plannedEndTime: null,
          updatedAt: new Date(),
        };

        if (shouldDeletePlanEvent) {
          updateValues.googleCalendarEventId = null;
        }

        await db
          .update(goalLogs)
          .set(updateValues)
          .where(
            and(
              eq(goalLogs.goalId, data.goalId),
              eq(goalLogs.date, data.dateKey),
              eq(goalLogs.userId, user.id),
            ),
          );

        return NextResponse.json({ ok: true, calendarSync });
      }

      const [savedLog] = await db
        .insert(goalLogs)
        .values({
          userId: user.id,
          goalId: data.goalId,
          date: data.dateKey,
          status: data.status,
          plannedStartTime:
            data.status === "planned" ? (data.plannedStartTime ?? null) : null,
          plannedEndTime:
            data.status === "planned" ? (data.plannedEndTime ?? null) : null,
          visibility: goal.visibility,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [goalLogs.goalId, goalLogs.date],
          set: {
            status: data.status,
            plannedStartTime:
              data.status === "planned"
                ? (data.plannedStartTime ?? null)
                : null,
            plannedEndTime:
              data.status === "planned" ? (data.plannedEndTime ?? null) : null,
            updatedAt: new Date(),
            userId: user.id,
          },
        })
        .returning({
          googleCalendarEventId: goalLogs.googleCalendarEventId,
          notes: goalLogs.notes,
        });

      if (data.status !== "planned") {
        return NextResponse.json({ ok: true });
      }

      const calendarSync = await upsertGoogleCalendarHabitPlan({
        dateKey: data.dateKey,
        description: savedLog?.notes ?? existingLog?.notes ?? null,
        existingEventId:
          savedLog?.googleCalendarEventId ??
          existingLog?.googleCalendarEventId ??
          null,
        goalId: data.goalId,
        habitName: goal.name,
        plannedEndTime: data.plannedEndTime ?? null,
        plannedStartTime: data.plannedStartTime ?? null,
        timeZone: data.plannedTimeZone ?? null,
        userId: user.id,
      });

      if (calendarSync.status === "synced" && calendarSync.eventId) {
        await db
          .update(goalLogs)
          .set({
            googleCalendarEventId: calendarSync.eventId,
            updatedAt: new Date(),
          })
          .where(
            and(
              eq(goalLogs.goalId, data.goalId),
              eq(goalLogs.date, data.dateKey),
              eq(goalLogs.userId, user.id),
            ),
          );
      }

      return NextResponse.json({ ok: true, calendarSync });
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
            visibility: goal.visibility,
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

      const [syncedLog] = await db
        .select({ googleCalendarEventId: goalLogs.googleCalendarEventId })
        .from(goalLogs)
        .where(
          and(
            eq(goalLogs.goalId, data.goalId),
            eq(goalLogs.date, data.dateKey),
            eq(goalLogs.userId, user.id),
          ),
        )
        .limit(1);
      const calendarSync = syncedLog?.googleCalendarEventId
        ? await updateGoogleCalendarHabitPlanDescription({
            description: data.notes,
            eventId: syncedLog.googleCalendarEventId,
            userId: user.id,
          })
        : { status: "skipped" as const };

      return NextResponse.json({ ok: true, calendarSync });
    }

    if (data.type === "setVisibility") {
      const [updatedLog] = await db
        .update(goalLogs)
        .set({ visibility: data.visibility, updatedAt: new Date() })
        .where(
          and(
            eq(goalLogs.goalId, data.goalId),
            eq(goalLogs.date, data.dateKey),
            eq(goalLogs.userId, user.id),
          ),
        )
        .returning({ id: goalLogs.id });

      if (!updatedLog) {
        return NextResponse.json(
          { error: "Habit report not found" },
          { status: 404 },
        );
      }

      return NextResponse.json({ ok: true });
    }

    if (data.type === "deleteLog") {
      const [ownedLog] = await db
        .select({ id: goalLogs.id })
        .from(goalLogs)
        .where(
          and(
            eq(goalLogs.goalId, data.goalId),
            eq(goalLogs.date, data.dateKey),
            eq(goalLogs.userId, user.id),
          ),
        )
        .limit(1);

      if (!ownedLog) {
        return NextResponse.json(
          { error: "Journal post not found" },
          { status: 404 },
        );
      }

      const photos = await db
        .select({ storagePath: goalLogPhotos.storagePath })
        .from(goalLogPhotos)
        .where(
          and(
            eq(goalLogPhotos.goalLogId, ownedLog.id),
            eq(goalLogPhotos.userId, user.id),
          ),
        );

      if (photos.length > 0) {
        const storage = getSupabaseStorageAdmin();
        const { error: removeError } = await storage.storage
          .from(GOAL_PHOTOS_BUCKET)
          .remove(photos.map((photo) => photo.storagePath));

        if (removeError) {
          return NextResponse.json(
            { error: `Could not delete post photos: ${removeError.message}` },
            { status: 502 },
          );
        }
      }

      await db
        .delete(goalLogs)
        .where(and(eq(goalLogs.id, ownedLog.id), eq(goalLogs.userId, user.id)));

      return NextResponse.json({ ok: true });
    }

    await db
      .update(habits)
      .set({ hidden: data.hidden, updatedAt: new Date() })
      .where(and(eq(habits.id, data.goalId), eq(habits.userId, user.id)));

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (
      error instanceof Error &&
      error.message === "Supabase Storage is not configured."
    ) {
      return NextResponse.json({ error: error.message }, { status: 503 });
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
