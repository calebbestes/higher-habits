import {
  categories,
  feedComments,
  feedProps,
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
  awardCreditAction,
  getMonthKeyFromDateKey,
  jsonWithCreditHeaders,
  recordPlanCreditProgress,
  reverseFloatCredits,
} from "@/lib/float-credits";
import {
  deleteGoogleCalendarHabitPlan,
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

function normalizeTimeKey(time: string | null | undefined) {
  if (!time) return null;

  const [hours = "0", minutes = "00"] = time.split(":");
  return `${hours.padStart(2, "0")}:${minutes}`;
}

const monthQuerySchema = z.object({
  month: z.string().regex(MONTH_KEY_REGEX, "Month must be YYYY-MM"),
});

const bodySchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("setLog"),
    goalId: z.string().uuid(),
    dateKey: z.string().regex(DATE_KEY_REGEX),
    status: z.enum(["complete", "incomplete", "planned"]).nullable(),
    completedCount: z.number().int().min(0).max(99).optional(),
    plannedStartTime: z.string().regex(TIME_KEY_REGEX).nullable().optional(),
    plannedEndTime: z.string().regex(TIME_KEY_REGEX).nullable().optional(),
    plannedTimeZone: z.string().min(1).max(100).nullable().optional(),
    repeatPlan: z.boolean().optional().default(false),
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
type Database = NonNullable<ReturnType<typeof getDatabase>>;

async function goalLogHasProof(
  db: Database,
  {
    goalLogId,
    notes,
    userId,
  }: { goalLogId: string; notes?: string | null; userId: string },
) {
  if (notes?.trim()) return true;

  const [photo] = await db
    .select({ id: goalLogPhotos.id })
    .from(goalLogPhotos)
    .where(
      and(
        eq(goalLogPhotos.goalLogId, goalLogId),
        eq(goalLogPhotos.userId, userId),
      ),
    )
    .limit(1);

  return Boolean(photo);
}

type GoalLogSocialSummary = {
  goalLogId: string;
  props: {
    count: number;
    hasPropped: boolean;
  };
  comments: Array<{
    id: string;
    userId: string;
    parentCommentId: string | null;
    authorName: string;
    authorImage: string | null;
    body: string;
    createdAt: string;
    updatedAt: string;
    canDelete: boolean;
    replies: GoalLogSocialSummary["comments"];
  }>;
};

type GoalLogCommentRow = {
  id: string;
  goalLogId: string;
  userId: string;
  parentCommentId: string | null;
  authorName: string;
  authorImage: string | null;
  body: string;
  createdAt: Date;
  updatedAt: Date;
};

function groupNestedGoalLogComments(
  commentRows: GoalLogCommentRow[],
  currentUserId: string,
) {
  const commentsById = new Map<
    string,
    GoalLogSocialSummary["comments"][number]
  >();
  const goalLogIdByCommentId = new Map<string, string>();
  const rootCommentsByGoalLogId = new Map<
    string,
    GoalLogSocialSummary["comments"]
  >();

  for (const comment of commentRows) {
    commentsById.set(comment.id, {
      id: comment.id,
      userId: comment.userId,
      parentCommentId: comment.parentCommentId,
      authorName: comment.authorName,
      authorImage: comment.authorImage,
      body: comment.body,
      createdAt: comment.createdAt.toISOString(),
      updatedAt: comment.updatedAt.toISOString(),
      canDelete: comment.userId === currentUserId,
      replies: [],
    });
    goalLogIdByCommentId.set(comment.id, comment.goalLogId);
  }

  for (const comment of commentRows) {
    const serialized = commentsById.get(comment.id);
    if (!serialized) continue;

    const parent = comment.parentCommentId
      ? commentsById.get(comment.parentCommentId)
      : null;
    const parentGoalLogId = comment.parentCommentId
      ? goalLogIdByCommentId.get(comment.parentCommentId)
      : null;

    if (parent && parentGoalLogId === comment.goalLogId) {
      parent.replies.push(serialized);
      continue;
    }

    const comments = rootCommentsByGoalLogId.get(comment.goalLogId) ?? [];
    comments.push(serialized);
    rootCommentsByGoalLogId.set(comment.goalLogId, comments);
  }

  return rootCommentsByGoalLogId;
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
      defaultComplete: habits.defaultComplete,
      planOnCalendar: habits.planOnCalendar,
      reminderEnabled: habits.reminderEnabled,
      reminderTime: habits.reminderTime,
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
          id: goalLogs.id,
          goalId: goalLogs.goalId,
          date: goalLogs.date,
          status: goalLogs.status,
          completedCount: goalLogs.completedCount,
          notes: goalLogs.notes,
          plannedStartTime: goalLogs.plannedStartTime,
          plannedEndTime: goalLogs.plannedEndTime,
          plannedRepeatsDaily: goalLogs.plannedRepeatsDaily,
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
        defaultComplete: g.defaultComplete,
        planOnCalendar: g.planOnCalendar,
        reminderEnabled: g.reminderEnabled,
        reminderTime: g.reminderTime,
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
      defaultComplete: g.defaultComplete,
      planOnCalendar: g.planOnCalendar,
      reminderEnabled: g.reminderEnabled,
      reminderTime: g.reminderTime,
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
        .filter(
          (log) =>
            log.status === "complete" ||
            log.status === "planned" ||
            log.status === "incomplete",
        )
        .map((log) => [`${log.goalId}_${log.date}`, log.status]),
    );
    const notesByHabitDate = Object.fromEntries(
      logs
        .filter((log) => log.notes?.trim())
        .map((log) => [`${log.goalId}_${log.date}`, log.notes]),
    );
    const completedCountsByHabitDate = Object.fromEntries(
      logs
        .filter((log) => log.completedCount > 0)
        .map((log) => [`${log.goalId}_${log.date}`, log.completedCount]),
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
            repeatsDaily: log.plannedRepeatsDaily,
          },
        ]),
    );
    // Every date (any status) that already has its own log — the day plan uses
    // this so an explicit plan for a date overrides a projected daily repeat.
    const explicitPlanDatesByHabit = logs.reduce<Record<string, string[]>>(
      (dates, log) => {
        const existing = dates[log.goalId] ?? [];
        existing.push(log.date);
        dates[log.goalId] = existing;
        return dates;
      },
      {},
    );
    // The active "repeat daily" plan per habit, resolved across all months (not
    // just the requested range) so it keeps projecting forward indefinitely.
    // The most recently set repeat wins and is effective from its own date on.
    const repeatingPlanRows = await db
      .select({
        goalId: goalLogs.goalId,
        date: goalLogs.date,
        plannedStartTime: goalLogs.plannedStartTime,
        plannedEndTime: goalLogs.plannedEndTime,
      })
      .from(goalLogs)
      .where(
        and(
          eq(goalLogs.userId, user.id),
          eq(goalLogs.status, "planned"),
          eq(goalLogs.plannedRepeatsDaily, true),
        ),
      )
      .orderBy(asc(goalLogs.date));
    const repeatingPlansByHabit = repeatingPlanRows.reduce<
      Record<
        string,
        { startTime: string | null; endTime: string | null; originDate: string }
      >
    >((plans, row) => {
      const existing = plans[row.goalId];
      if (!existing || row.date > existing.originDate) {
        plans[row.goalId] = {
          startTime: row.plannedStartTime ?? null,
          endTime: row.plannedEndTime ?? null,
          originDate: row.date,
        };
      }
      return plans;
    }, {});
    const photoCountsByHabitDate = photos.reduce<Record<string, number>>(
      (counts, photo) => {
        const key = `${photo.goalId}_${photo.date}`;
        counts[key] = (counts[key] ?? 0) + 1;
        return counts;
      },
      {},
    );
    const socialLogKeysById = new Map(
      logs
        .filter((log) => log.status === "complete")
        .map((log) => [log.id, `${log.goalId}_${log.date}`]),
    );
    const socialByHabitDate: Record<string, GoalLogSocialSummary> = {};
    const ensureSocial = (key: string, goalLogId: string) => {
      const existing = socialByHabitDate[key];
      if (existing) return existing;

      const next: GoalLogSocialSummary = {
        goalLogId,
        props: {
          count: 0,
          hasPropped: false,
        },
        comments: [],
      };
      socialByHabitDate[key] = next;
      return next;
    };
    const socialLogIds = [...socialLogKeysById.keys()];

    if (socialLogIds.length > 0) {
      const [propRows, commentRows] = await Promise.all([
        db
          .select({
            goalLogId: feedProps.goalLogId,
            userId: feedProps.userId,
          })
          .from(feedProps)
          .where(inArray(feedProps.goalLogId, socialLogIds)),
        db
          .select({
            id: feedComments.id,
            goalLogId: feedComments.goalLogId,
            userId: feedComments.userId,
            parentCommentId: feedComments.parentCommentId,
            authorName: users.name,
            authorImage: users.image,
            body: feedComments.body,
            createdAt: feedComments.createdAt,
            updatedAt: feedComments.updatedAt,
          })
          .from(feedComments)
          .innerJoin(users, eq(feedComments.userId, users.id))
          .where(inArray(feedComments.goalLogId, socialLogIds))
          .orderBy(asc(feedComments.createdAt)),
      ]);

      for (const prop of propRows) {
        const key = socialLogKeysById.get(prop.goalLogId);
        if (!key) continue;

        const social = ensureSocial(key, prop.goalLogId);
        social.props.count += 1;
        if (prop.userId === user.id) {
          social.props.hasPropped = true;
        }
      }

      const commentsByGoalLogId = groupNestedGoalLogComments(
        commentRows,
        user.id,
      );
      for (const [goalLogId, comments] of commentsByGoalLogId) {
        const key = socialLogKeysById.get(goalLogId);
        if (!key) continue;

        ensureSocial(key, goalLogId).comments = comments;
      }
    }

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
      completedCountsByGoalDate: completedCountsByHabitDate,
      completedCountsByHabitDate,
      notesByGoalDate: notesByHabitDate,
      notesByHabitDate,
      visibilityByGoalDate: visibilityByHabitDate,
      visibilityByHabitDate,
      plannedTimesByGoalDate: plannedTimesByHabitDate,
      plannedTimesByHabitDate,
      repeatingPlansByGoal: repeatingPlansByHabit,
      repeatingPlansByHabit,
      explicitPlanDatesByGoal: explicitPlanDatesByHabit,
      explicitPlanDatesByHabit,
      photoCountsByGoalDate: photoCountsByHabitDate,
      photoCountsByHabitDate,
      socialByGoalDate: socialByHabitDate,
      socialByHabitDate,
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
        period: habits.period,
        frequencyGoal: habits.frequencyGoal,
        visibility: habits.visibility,
      })
      .from(habits)
      .where(and(eq(habits.id, data.goalId), eq(habits.userId, user.id)))
      .limit(1);

    if (!goal) {
      return NextResponse.json({ error: "Habit not found" }, { status: 404 });
    }

    if (data.type === "setLog") {
      const plannedStartTime =
        data.status === "planned"
          ? normalizeTimeKey(data.plannedStartTime)
          : data.status === "complete" && data.plannedStartTime !== undefined
            ? normalizeTimeKey(data.plannedStartTime)
            : null;
      const plannedEndTime =
        data.status === "planned"
          ? normalizeTimeKey(data.plannedEndTime)
          : data.status === "complete" && data.plannedEndTime !== undefined
            ? normalizeTimeKey(data.plannedEndTime)
            : null;
      const plannedRepeatsDaily =
        data.status === "planned" && goal.period === "daily"
          ? data.repeatPlan
          : false;
      const [existingLog] = await db
        .select({
          id: goalLogs.id,
          googleCalendarEventId: goalLogs.googleCalendarEventId,
          notes: goalLogs.notes,
          plannedEndTime: goalLogs.plannedEndTime,
          plannedRepeatsDaily: goalLogs.plannedRepeatsDaily,
          plannedStartTime: goalLogs.plannedStartTime,
          status: goalLogs.status,
          completedCount: goalLogs.completedCount,
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
          completedCount: 0;
          googleCalendarEventId?: null;
          plannedEndTime: null;
          plannedRepeatsDaily: false;
          plannedStartTime: null;
          status: "incomplete";
          updatedAt: Date;
        } = {
          status: "incomplete",
          completedCount: 0,
          plannedStartTime: null,
          plannedEndTime: null,
          plannedRepeatsDaily: false,
          updatedAt: new Date(),
        };

        if (shouldDeletePlanEvent) {
          updateValues.googleCalendarEventId = null;
        }

        // Upsert (not update-only) so clearing a day that only exists as a
        // projected daily repeat writes an explicit "incomplete" override,
        // which suppresses the repeat for that day going forward.
        await db
          .insert(goalLogs)
          .values({
            userId: user.id,
            goalId: data.goalId,
            date: data.dateKey,
            status: "incomplete",
            completedCount: 0,
            plannedStartTime: null,
            plannedEndTime: null,
            plannedRepeatsDaily: false,
            visibility: goal.visibility,
            googleCalendarEventId: null,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [goalLogs.goalId, goalLogs.date],
            set: updateValues,
          });

        const creditEvents = existingLog?.id
          ? [
              existingLog.status === "complete"
                ? await reverseFloatCredits(db, {
                    actionDate: data.dateKey,
                    actionType: "habit_complete",
                    sourceId: existingLog.id,
                    sourceType: "goal_log",
                    userId: user.id,
                  })
                : null,
              existingLog.status === "complete"
                ? await reverseFloatCredits(db, {
                    actionDate: data.dateKey,
                    actionType: "post",
                    sourceId: existingLog.id,
                    sourceType: "goal_log",
                    userId: user.id,
                  })
                : null,
              shouldDeletePlanEvent
                ? await recordPlanCreditProgress(db, {
                    actionDate: data.dateKey,
                    amount: -1,
                    periodKey: data.dateKey,
                    threshold: 5,
                    type: "daily_plan",
                    userId: user.id,
                  })
                : null,
              shouldDeletePlanEvent
                ? await recordPlanCreditProgress(db, {
                    actionDate: `${getMonthKeyFromDateKey(data.dateKey)}-01`,
                    amount: -1,
                    periodKey: getMonthKeyFromDateKey(data.dateKey),
                    threshold: 10,
                    type: "monthly_plan",
                    userId: user.id,
                  })
                : null,
            ]
          : [];

        return jsonWithCreditHeaders({ ok: true, calendarSync }, creditEvents);
      }

      const nextPlannedStartTime =
        data.status === "complete" && data.plannedStartTime === undefined
          ? (existingLog?.plannedStartTime ?? null)
          : plannedStartTime;
      const nextPlannedEndTime =
        data.status === "complete" && data.plannedEndTime === undefined
          ? (existingLog?.plannedEndTime ?? null)
          : plannedEndTime;
      const nextPlannedRepeatsDaily =
        data.status === "complete" && data.repeatPlan === false
          ? (existingLog?.plannedRepeatsDaily ?? false)
          : plannedRepeatsDaily;
      const targetCount = Math.max(goal.frequencyGoal ?? 1, 1);
      const completedCount =
        data.completedCount ??
        (data.status === "complete"
          ? targetCount
          : data.status === "incomplete"
            ? 0
            : (existingLog?.completedCount ?? 0));
      const nextStatus =
        data.status === "complete" || completedCount > 0
          ? completedCount >= targetCount
            ? "complete"
            : "incomplete"
          : data.status;

      const [savedLog] = await db
        .insert(goalLogs)
        .values({
          userId: user.id,
          goalId: data.goalId,
          date: data.dateKey,
          status: nextStatus,
          completedCount,
          plannedStartTime: nextPlannedStartTime,
          plannedEndTime: nextPlannedEndTime,
          plannedRepeatsDaily: nextPlannedRepeatsDaily,
          visibility: goal.visibility,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [goalLogs.goalId, goalLogs.date],
          set: {
            status: nextStatus,
            completedCount,
            plannedStartTime: nextPlannedStartTime,
            plannedEndTime: nextPlannedEndTime,
            plannedRepeatsDaily: nextPlannedRepeatsDaily,
            updatedAt: new Date(),
            userId: user.id,
          },
        })
        .returning({
          id: goalLogs.id,
          googleCalendarEventId: goalLogs.googleCalendarEventId,
          notes: goalLogs.notes,
          status: goalLogs.status,
        });

      if (!savedLog) {
        return NextResponse.json({ error: "Insert failed" }, { status: 500 });
      }

      const creditEvents = [];
      if (nextStatus === "complete" && existingLog?.status !== "complete") {
        creditEvents.push(
          await awardCreditAction(db, {
            actionDate: data.dateKey,
            actionType: "habit_complete",
            sourceId: savedLog.id,
            sourceType: "goal_log",
            userId: user.id,
          }),
        );
      }

      if (
        nextStatus === "complete" &&
        (await goalLogHasProof(db, {
          goalLogId: savedLog.id,
          notes: savedLog.notes,
          userId: user.id,
        }))
      ) {
        creditEvents.push(
          await awardCreditAction(db, {
            actionDate: data.dateKey,
            actionType: "post",
            sourceId: savedLog.id,
            sourceType: "goal_log",
            userId: user.id,
          }),
        );
      }

      if (existingLog?.status === "complete" && nextStatus !== "complete") {
        creditEvents.push(
          await reverseFloatCredits(db, {
            actionDate: data.dateKey,
            actionType: "habit_complete",
            sourceId: existingLog.id,
            sourceType: "goal_log",
            userId: user.id,
          }),
          await reverseFloatCredits(db, {
            actionDate: data.dateKey,
            actionType: "post",
            sourceId: existingLog.id,
            sourceType: "goal_log",
            userId: user.id,
          }),
        );
      }

      if (nextStatus === "planned" && existingLog?.status !== "planned") {
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
            actionDate: `${getMonthKeyFromDateKey(data.dateKey)}-01`,
            amount: 1,
            periodKey: getMonthKeyFromDateKey(data.dateKey),
            threshold: 10,
            type: "monthly_plan",
            userId: user.id,
          }),
        );
      } else if (
        existingLog?.status === "planned" &&
        nextStatus !== "planned"
      ) {
        creditEvents.push(
          await recordPlanCreditProgress(db, {
            actionDate: data.dateKey,
            amount: -1,
            periodKey: data.dateKey,
            threshold: 5,
            type: "daily_plan",
            userId: user.id,
          }),
          await recordPlanCreditProgress(db, {
            actionDate: `${getMonthKeyFromDateKey(data.dateKey)}-01`,
            amount: -1,
            periodKey: getMonthKeyFromDateKey(data.dateKey),
            threshold: 10,
            type: "monthly_plan",
            userId: user.id,
          }),
        );
      }

      if (data.status !== "planned") {
        return jsonWithCreditHeaders({ ok: true }, creditEvents);
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
        plannedEndTime,
        plannedStartTime,
        repeatDaily: goal.period === "daily" ? plannedRepeatsDaily : undefined,
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

      return jsonWithCreditHeaders({ ok: true, calendarSync }, creditEvents);
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
        .select({
          id: goalLogs.id,
          googleCalendarEventId: goalLogs.googleCalendarEventId,
          notes: goalLogs.notes,
          plannedEndTime: goalLogs.plannedEndTime,
          plannedStartTime: goalLogs.plannedStartTime,
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
      const calendarSync =
        syncedLog?.status === "planned"
          ? await upsertGoogleCalendarHabitPlan({
              dateKey: data.dateKey,
              description: data.notes,
              existingEventId: syncedLog.googleCalendarEventId,
              goalId: data.goalId,
              habitName: goal.name,
              plannedEndTime: syncedLog.plannedEndTime,
              plannedStartTime: syncedLog.plannedStartTime,
              timeZone: null,
              userId: user.id,
            })
          : { status: "skipped" as const };

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

      const creditEvent =
        syncedLog?.status === "complete" && data.notes.trim()
          ? await awardCreditAction(db, {
              actionDate: data.dateKey,
              actionType: "post",
              sourceId: syncedLog.id,
              sourceType: "goal_log",
              userId: user.id,
            })
          : syncedLog?.status === "complete" &&
              !(await goalLogHasProof(db, {
                goalLogId: syncedLog.id,
                notes: syncedLog.notes,
                userId: user.id,
              }))
            ? await reverseFloatCredits(db, {
                actionDate: data.dateKey,
                actionType: "post",
                sourceId: syncedLog.id,
                sourceType: "goal_log",
                userId: user.id,
              })
            : null;

      return jsonWithCreditHeaders({ ok: true, calendarSync }, [creditEvent]);
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
        .select({ id: goalLogs.id, status: goalLogs.status })
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

      const creditEvents = [
        ownedLog.status === "complete"
          ? await reverseFloatCredits(db, {
              actionDate: data.dateKey,
              actionType: "habit_complete",
              sourceId: ownedLog.id,
              sourceType: "goal_log",
              userId: user.id,
            })
          : null,
        ownedLog.status === "complete"
          ? await reverseFloatCredits(db, {
              actionDate: data.dateKey,
              actionType: "post",
              sourceId: ownedLog.id,
              sourceType: "goal_log",
              userId: user.id,
            })
          : null,
        ownedLog.status === "planned"
          ? await recordPlanCreditProgress(db, {
              actionDate: data.dateKey,
              amount: -1,
              periodKey: data.dateKey,
              threshold: 5,
              type: "daily_plan",
              userId: user.id,
            })
          : null,
        ownedLog.status === "planned"
          ? await recordPlanCreditProgress(db, {
              actionDate: `${getMonthKeyFromDateKey(data.dateKey)}-01`,
              amount: -1,
              periodKey: getMonthKeyFromDateKey(data.dateKey),
              threshold: 10,
              type: "monthly_plan",
              userId: user.id,
            })
          : null,
      ];

      return jsonWithCreditHeaders({ ok: true }, creditEvents);
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
