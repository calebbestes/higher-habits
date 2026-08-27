import {
  type UserSettings,
  getDb,
  goalLogs,
  habits,
  notificationDeliveries,
  plannedEvents,
  sharedGoalParticipants,
  sharedGoals,
  tasks,
  userSettings,
  users,
} from "@habit/db";
import { and, eq, gte, inArray, isNull, lt, lte, ne, or } from "drizzle-orm";

import { sendNotificationOnce } from "@/lib/notification-delivery";

type Database = NonNullable<ReturnType<typeof getDb>>;

const DEFAULT_TIME_ZONE = "America/Denver";
const DEFAULTS: Record<NotificationPreference, boolean> = {
  notifyFriendRequests: true,
  notifyMonthlyGoalToday: false,
  notifyTasksDueToday: false,
  notifyInactivityReminder: true,
  notifySharedGoalInvites: true,
  notifyStreakAtRisk: false,
  notifyStreakMilestone: false,
  notifyEndOfDayNudge: false,
  notifyPostProps: false,
  notifyPostComments: true,
  notifyFriendPosts: false,
  notifyFriendNudges: true,
  notifyFriendRequestAccepted: true,
  notifyFriendMilestone: false,
  notifySharedGoalResponses: true,
  notifyLastToComplete: false,
  notifySharedGoalEnding: false,
  notifyStakesReminder: false,
  notifyIncentiveEarned: false,
  notifyPlanTomorrow: false,
  notifyWeeklyRecap: false,
  notifyScheduleEvents: true,
};

type NotificationPreference =
  | "notifyFriendRequests"
  | "notifyMonthlyGoalToday"
  | "notifyTasksDueToday"
  | "notifyInactivityReminder"
  | "notifySharedGoalInvites"
  | "notifyStreakAtRisk"
  | "notifyStreakMilestone"
  | "notifyEndOfDayNudge"
  | "notifyPostProps"
  | "notifyPostComments"
  | "notifyFriendPosts"
  | "notifyFriendNudges"
  | "notifyFriendRequestAccepted"
  | "notifyFriendMilestone"
  | "notifySharedGoalResponses"
  | "notifyLastToComplete"
  | "notifySharedGoalEnding"
  | "notifyStakesReminder"
  | "notifyIncentiveEarned"
  | "notifyPlanTomorrow"
  | "notifyWeeklyRecap"
  | "notifyScheduleEvents";

type LocalDateTime = {
  dateKey: string;
  day: number;
  hour: number;
  minute: number;
  month: number;
  weekday: string;
  year: number;
};

function localDateTime(date: Date, timeZone: string): LocalDateTime {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
      minute: "2-digit",
      month: "2-digit",
      timeZone,
      weekday: "long",
      year: "numeric",
    }).formatToParts(date);
    const value = (type: string) =>
      parts.find((part) => part.type === type)?.value ?? "";
    const year = Number(value("year"));
    const month = Number(value("month"));
    const day = Number(value("day"));
    return {
      dateKey: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
      day,
      hour: Number(value("hour")),
      minute: Number(value("minute")),
      month,
      weekday: value("weekday").toLowerCase(),
      year,
    };
  } catch {
    return localDateTime(date, DEFAULT_TIME_ZONE);
  }
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function timeIsDue(now: LocalDateTime, configured: string) {
  const [hourText, minuteText] = configured.split(":");
  const target = Number(hourText) * 60 + Number(minuteText);
  const current = now.hour * 60 + now.minute;
  return Number.isFinite(target) && current >= target && current < target + 10;
}

function preference(
  settings: UserSettings | null,
  key: NotificationPreference,
) {
  return settings?.[key] ?? DEFAULTS[key];
}

function hasMonthlyReminderDay(now: LocalDateTime, configured: string) {
  if (configured === "first") return now.day === 1;
  if (configured === "fifteenth") return now.day === 15;
  const lastDay = new Date(Date.UTC(now.year, now.month, 0)).getUTCDate();
  return now.day === lastDay;
}

async function notifyPeriodicHabits(
  db: Database,
  userId: string,
  dateKey: string,
  monthlyDay: string,
) {
  const rows = await db
    .select({ name: habits.name, period: habits.period })
    .from(goalLogs)
    .innerJoin(habits, eq(goalLogs.goalId, habits.id))
    .where(
      and(
        eq(goalLogs.userId, userId),
        eq(goalLogs.date, dateKey),
        eq(goalLogs.status, "planned"),
        ne(habits.period, "daily"),
        eq(habits.hidden, false),
      ),
    )
    .limit(5);
  const visibleRows = rows.filter(
    (row) => row.period !== "monthly" || monthlyDay === "always",
  );
  if (visibleRows.length === 0) return;

  await sendNotificationOnce({
    db,
    dedupeKey: `periodic-habits:${dateKey}`,
    message: {
      title: "Periodic habits today",
      body:
        visibleRows.length === 1
          ? (visibleRows[0]?.name ?? "You have a periodic habit planned today.")
          : `${visibleRows.length} periodic habits are planned today.`,
      data: { type: "periodic_habits_today", dateKey },
    },
    preferenceKey: "notifyMonthlyGoalToday",
    userId,
  });
}

async function notifyTasksDueToday(
  db: Database,
  userId: string,
  dateKey: string,
) {
  const rows = await db
    .select({ id: tasks.id, name: tasks.name })
    .from(tasks)
    .where(
      and(
        eq(tasks.userId, userId),
        eq(tasks.dueDate, dateKey),
        isNull(tasks.completedAt),
      ),
    )
    .limit(20);
  if (rows.length === 0) return;

  await sendNotificationOnce({
    db,
    dedupeKey: `tasks-due:${dateKey}`,
    message: {
      title: `${rows.length} task${rows.length === 1 ? "" : "s"} due today`,
      body:
        rows.length === 1
          ? (rows[0]?.name ?? "Review your task.")
          : "Review your tasks.",
      data: { type: "tasks_due_today", dateKey },
    },
    preferenceKey: "notifyTasksDueToday",
    userId,
  });
}

async function notifyPlanTomorrow(
  db: Database,
  userId: string,
  dateKey: string,
) {
  const tomorrow = shiftDateKey(dateKey, 1);
  const [planned] = await db
    .select({ id: plannedEvents.id })
    .from(plannedEvents)
    .where(
      and(eq(plannedEvents.userId, userId), eq(plannedEvents.date, tomorrow)),
    )
    .limit(1);
  if (planned) return;

  const [activeHabit] = await db
    .select({ id: habits.id })
    .from(habits)
    .where(and(eq(habits.userId, userId), eq(habits.hidden, false)))
    .limit(1);
  if (!activeHabit) return;

  await sendNotificationOnce({
    db,
    dedupeKey: `plan-tomorrow:${dateKey}`,
    message: {
      title: "Plan tomorrow",
      body: "Set up tomorrow’s goals while you have a moment.",
      data: { type: "plan_tomorrow", dateKey: tomorrow },
    },
    preferenceKey: "notifyPlanTomorrow",
    userId,
  });
}

async function notifyInactivity(
  db: Database,
  userId: string,
  lastOpenedAt: Date | null,
  now: Date,
) {
  if (!lastOpenedAt) return;
  const ageDays = Math.floor(
    (now.getTime() - lastOpenedAt.getTime()) / 86_400_000,
  );
  if (ageDays < 7) return;

  const bucket =
    ageDays >= 30
      ? `month-${Math.floor(ageDays / 30)}`
      : `week-${Math.floor(ageDays / 7)}`;
  await sendNotificationOnce({
    db,
    dedupeKey: `inactivity:${bucket}`,
    message: {
      title: "Welcome back",
      body:
        ageDays >= 30
          ? "It’s been a month. Start with one small win today."
          : "It’s been a week. Start with one small win today.",
      data: { type: "inactivity_reminder", ageDays },
    },
    preferenceKey: "notifyInactivityReminder",
    userId,
  });
}

async function notifyStreakRisk(db: Database, userId: string, dateKey: string) {
  const habitsToday = await db
    .select({ id: habits.id, name: habits.name })
    .from(habits)
    .where(
      and(
        eq(habits.userId, userId),
        eq(habits.period, "daily"),
        eq(habits.hidden, false),
      ),
    );
  if (habitsToday.length === 0) return;

  const startDate = shiftDateKey(dateKey, -366);
  const logs = await db
    .select({ goalId: goalLogs.goalId, date: goalLogs.date })
    .from(goalLogs)
    .where(
      and(
        eq(goalLogs.userId, userId),
        eq(goalLogs.status, "complete"),
        gte(goalLogs.date, startDate),
        lte(goalLogs.date, dateKey),
      ),
    );
  const completed = new Set(logs.map((log) => `${log.goalId}:${log.date}`));
  const yesterday = shiftDateKey(dateKey, -1);
  const atRisk = habitsToday.filter((habit) => {
    if (completed.has(`${habit.id}:${dateKey}`)) return false;
    let streak = 0;
    let day = yesterday;
    while (completed.has(`${habit.id}:${day}`)) {
      streak += 1;
      day = shiftDateKey(day, -1);
    }
    return streak > 0;
  });
  if (atRisk.length === 0) return;

  await sendNotificationOnce({
    db,
    dedupeKey: `streak-risk:${dateKey}`,
    message: {
      title: "Your streak is at risk",
      body:
        atRisk.length === 1
          ? `Complete ${atRisk[0]?.name ?? "your habit"} before the day ends.`
          : `${atRisk.length} streaks are waiting for today’s check-in.`,
      data: { type: "streak_at_risk", dateKey },
    },
    preferenceKey: "notifyStreakAtRisk",
    userId,
  });
}

async function notifyEndOfDayNudge(
  db: Database,
  userId: string,
  dateKey: string,
) {
  const highPriority = await db
    .select({ id: habits.id, name: habits.name })
    .from(habits)
    .where(
      and(
        eq(habits.userId, userId),
        eq(habits.priority, "high"),
        eq(habits.hidden, false),
      ),
    );
  if (highPriority.length === 0) return;

  const completed = await db
    .select({ goalId: goalLogs.goalId })
    .from(goalLogs)
    .where(
      and(
        eq(goalLogs.userId, userId),
        eq(goalLogs.date, dateKey),
        eq(goalLogs.status, "complete"),
      ),
    );
  const completedIds = new Set(completed.map((log) => log.goalId));
  const openCount = highPriority.filter(
    (habit) => !completedIds.has(habit.id),
  ).length;
  if (openCount === 0) return;

  await sendNotificationOnce({
    db,
    dedupeKey: `end-of-day:${dateKey}`,
    message: {
      title: "End-of-day check-in",
      body: `${openCount} high-priority goal${openCount === 1 ? " is" : "s are"} still open today.`,
      data: { type: "end_of_day_nudge", dateKey, openCount },
    },
    preferenceKey: "notifyEndOfDayNudge",
    userId,
  });
}

async function notifyWeeklyRecap(
  db: Database,
  userId: string,
  dateKey: string,
  timeZone: string,
) {
  const startDate = shiftDateKey(dateKey, -6);
  const queryStart = new Date(`${shiftDateKey(startDate, -1)}T00:00:00.000Z`);
  const queryEnd = new Date(`${shiftDateKey(dateKey, 1)}T00:00:00.000Z`);
  const [logs, completedTasks] = await Promise.all([
    db
      .select({ id: goalLogs.id })
      .from(goalLogs)
      .where(
        and(
          eq(goalLogs.userId, userId),
          eq(goalLogs.status, "complete"),
          gte(goalLogs.date, startDate),
          lte(goalLogs.date, dateKey),
        ),
      ),
    db
      .select({ completedAt: tasks.completedAt, id: tasks.id })
      .from(tasks)
      .where(
        and(
          eq(tasks.userId, userId),
          gte(tasks.completedAt, queryStart),
          lt(tasks.completedAt, queryEnd),
        ),
      ),
  ]);
  const tasksThisWeek = completedTasks.filter((task) => {
    if (!task.completedAt) return false;
    const taskDateKey = localDateTime(task.completedAt, timeZone).dateKey;
    return taskDateKey >= startDate && taskDateKey <= dateKey;
  });
  if (logs.length === 0 && tasksThisWeek.length === 0) return;

  await sendNotificationOnce({
    db,
    dedupeKey: `weekly-recap:${dateKey}`,
    message: {
      title: "Your weekly recap",
      body: `${logs.length} habit completion${logs.length === 1 ? "" : "s"} and ${tasksThisWeek.length} task${tasksThisWeek.length === 1 ? "" : "s"} completed this week.`,
      data: { type: "weekly_recap", dateKey, startDate },
    },
    preferenceKey: "notifyWeeklyRecap",
    userId,
  });
}

async function notifySharedGoalReminders(
  db: Database,
  userId: string,
  dateKey: string,
) {
  const endingSoon = shiftDateKey(dateKey, 3);
  const tomorrow = shiftDateKey(dateKey, 1);
  const rows = await db
    .select({
      id: sharedGoals.id,
      name: sharedGoals.name,
      endsOn: sharedGoals.endsOn,
      stakeType: sharedGoals.stakeType,
    })
    .from(sharedGoalParticipants)
    .innerJoin(
      sharedGoals,
      eq(sharedGoalParticipants.sharedGoalId, sharedGoals.id),
    )
    .where(
      and(
        eq(sharedGoalParticipants.userId, userId),
        eq(sharedGoalParticipants.status, "accepted"),
        eq(sharedGoals.status, "active"),
        or(
          eq(sharedGoals.endsOn, endingSoon),
          eq(sharedGoals.endsOn, tomorrow),
        ),
      ),
    );

  await Promise.all(
    rows.flatMap((row) => {
      const notifications = [];
      if (row.endsOn) {
        notifications.push(
          sendNotificationOnce({
            db,
            dedupeKey: `shared-goal-ending:${row.id}:${row.endsOn}`,
            message: {
              title: "Shared goal ending soon",
              body: `${row.name} ends on ${row.endsOn}.`,
              data: { type: "shared_goal_ending", sharedGoalId: row.id },
            },
            preferenceKey: "notifySharedGoalEnding" as const,
            userId,
          }),
        );
      }
      if (row.endsOn === tomorrow && row.stakeType !== "none") {
        notifications.push(
          sendNotificationOnce({
            db,
            dedupeKey: `stakes-reminder:${row.id}:${row.endsOn}`,
            message: {
              title: "Shared goal stakes reminder",
              body: `${row.name} ends tomorrow. Keep your commitment in view.`,
              data: { type: "stakes_reminder", sharedGoalId: row.id },
            },
            preferenceKey: "notifyStakesReminder" as const,
            userId,
          }),
        );
      }
      return notifications;
    }),
  );
}

async function runUserNotifications(
  db: Database,
  row: {
    lastOpenedAt: Date | null;
    name: string;
    settings: UserSettings | null;
    userId: string;
  },
  now: Date,
) {
  const settings = row.settings;
  const timeZone = settings?.timeZone || DEFAULT_TIME_ZONE;
  const local = localDateTime(now, timeZone);
  const dailyDue = timeIsDue(local, settings?.dailyNotificationTime ?? "20:30");
  const monthlyDue = timeIsDue(
    local,
    settings?.monthlyNotificationTime ?? "09:00",
  );
  const weeklyDue =
    local.weekday === (settings?.weeklyNotificationDay ?? "sunday") &&
    timeIsDue(local, settings?.weeklyNotificationTime ?? "18:00");

  if (dailyDue) {
    if (preference(settings, "notifyTasksDueToday")) {
      await notifyTasksDueToday(db, row.userId, local.dateKey);
    }
    if (preference(settings, "notifyPlanTomorrow")) {
      await notifyPlanTomorrow(db, row.userId, local.dateKey);
    }
    if (preference(settings, "notifyInactivityReminder")) {
      await notifyInactivity(db, row.userId, row.lastOpenedAt, now);
    }
    if (preference(settings, "notifyStreakAtRisk")) {
      await notifyStreakRisk(db, row.userId, local.dateKey);
    }
    if (preference(settings, "notifyEndOfDayNudge")) {
      await notifyEndOfDayNudge(db, row.userId, local.dateKey);
    }
    if (
      preference(settings, "notifySharedGoalEnding") ||
      preference(settings, "notifyStakesReminder")
    ) {
      await notifySharedGoalReminders(db, row.userId, local.dateKey);
    }
  }

  if (monthlyDue && preference(settings, "notifyMonthlyGoalToday")) {
    await notifyPeriodicHabits(
      db,
      row.userId,
      local.dateKey,
      hasMonthlyReminderDay(local, settings?.monthlyNotificationDay ?? "first")
        ? "always"
        : "configured-day-only",
    );
  }

  if (weeklyDue && preference(settings, "notifyWeeklyRecap")) {
    await notifyWeeklyRecap(db, row.userId, local.dateKey, timeZone);
  }
}

export async function runNotificationJobs(now = new Date()) {
  const db = getDb();
  if (!db) throw new Error("Database unavailable");

  const rows = await db
    .select({
      lastOpenedAt: users.lastOpenedAt,
      name: users.name,
      settings: userSettings,
      userId: users.id,
    })
    .from(users)
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(isNull(users.deletedAt));

  let processed = 0;
  for (const row of rows) {
    await runUserNotifications(db, row, now);
    processed += 1;
  }

  // Keep idempotency data bounded. Notification delivery is not user-facing
  // history; old claims only exist to protect against cron retries.
  const retention = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 400);
  await db
    .delete(notificationDeliveries)
    .where(lte(notificationDeliveries.createdAt, retention));

  return { processed, at: now.toISOString() };
}
