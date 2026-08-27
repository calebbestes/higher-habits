import { getDb, userSettings } from "@habit/db";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

// All notification preference keys (camelCase, matching the schema columns).
const NOTIFICATION_KEYS = [
  "notifyFriendRequests",
  "notifyMonthlyGoalToday",
  "notifyTasksDueToday",
  "notifyInactivityReminder",
  "notifySharedGoalInvites",
  "notifyStreakAtRisk",
  "notifyStreakMilestone",
  "notifyEndOfDayNudge",
  "notifyPostProps",
  "notifyPostComments",
  "notifyFriendPosts",
  "notifyFriendNudges",
  "notifyFriendRequestAccepted",
  "notifyFriendMilestone",
  "notifySharedGoalResponses",
  "notifyLastToComplete",
  "notifySharedGoalEnding",
  "notifyStakesReminder",
  "notifyIncentiveEarned",
  "notifyPlanTomorrow",
  "notifyWeeklyRecap",
  "notifyScheduleEvents",
] as const;

type NotificationKey = (typeof NOTIFICATION_KEYS)[number];
const TIME_SETTING_KEYS = [
  "dailyNotificationTime",
  "weeklyNotificationTime",
  "monthlyNotificationTime",
] as const;
const DAY_SETTING_KEYS = [
  "weeklyNotificationDay",
  "monthlyNotificationDay",
] as const;

type TimeSettingKey = (typeof TIME_SETTING_KEYS)[number];
type DaySettingKey = (typeof DAY_SETTING_KEYS)[number];

// Keep the first-run experience useful without turning every activity into a
// push notification. Existing saved preferences are never overwritten.
const DEFAULTS: Record<NotificationKey, boolean> = {
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
const TIME_DEFAULTS = {
  dailyNotificationTime: "20:30",
  weeklyNotificationTime: "18:00",
  monthlyNotificationTime: "09:00",
} as const satisfies Record<TimeSettingKey, string>;
const DAY_DEFAULTS = {
  weeklyNotificationDay: "sunday",
  monthlyNotificationDay: "first",
} as const satisfies Record<DaySettingKey, string>;
const TIME_ZONE_DEFAULT = "America/Denver";

const USER_SETTING_DEFAULTS = {
  defaultAppStartPage: "collab",
  defaultCollabSection: "feed",
  defaultPlanReportView: "day-plan",
} as const;

const notificationSchemaShape = Object.fromEntries(
  NOTIFICATION_KEYS.map((key) => [key, z.boolean()]),
) as Record<NotificationKey, z.ZodBoolean>;
const timeSchemaShape = Object.fromEntries(
  TIME_SETTING_KEYS.map((key) => [
    key,
    z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  ]),
) as Record<TimeSettingKey, z.ZodString>;
const daySchemaShape = {
  weeklyNotificationDay: z.enum([
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ]),
  monthlyNotificationDay: z.enum(["first", "fifteenth", "last"]),
} satisfies Record<DaySettingKey, z.ZodTypeAny>;

const bodySchema = z
  .object({
    onboardingCompleted: z.boolean(),
    defaultAppStartPage: z.enum([
      "add",
      "plan-report",
      "journal",
      "collab",
      "friends",
      "dashboard",
      "history",
      "settings",
    ]),
    defaultCollabSection: z.enum([
      "feed",
      "incentives",
      "shared-goals",
      "friends",
    ]),
    defaultPlanReportView: z.enum(["day-plan", "monthly-plan"]),
    timeZone: z.string().min(1).max(100),
    ...notificationSchemaShape,
    ...timeSchemaShape,
    ...daySchemaShape,
  })
  .partial();

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDb();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const [row] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userId, user.id))
      .limit(1);

    const response = {
      onboardingCompleted: row?.onboardingCompleted ?? true,
      defaultAppStartPage:
        row?.defaultAppStartPage ?? USER_SETTING_DEFAULTS.defaultAppStartPage,
      defaultCollabSection:
        row?.defaultCollabSection ?? USER_SETTING_DEFAULTS.defaultCollabSection,
      defaultPlanReportView:
        row?.defaultPlanReportView ??
        USER_SETTING_DEFAULTS.defaultPlanReportView,
      ...Object.fromEntries(
        NOTIFICATION_KEYS.map((key) => [key, row?.[key] ?? DEFAULTS[key]]),
      ),
      ...Object.fromEntries(
        TIME_SETTING_KEYS.map((key) => [key, row?.[key] ?? TIME_DEFAULTS[key]]),
      ),
      ...Object.fromEntries(
        DAY_SETTING_KEYS.map((key) => [key, row?.[key] ?? DAY_DEFAULTS[key]]),
      ),
      timeZone: row?.timeZone ?? TIME_ZONE_DEFAULT,
    };

    return NextResponse.json(response);
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;
    console.error("GET /api/user-settings failed", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDb();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const data = bodySchema.parse(await request.json());

    await db
      .insert(userSettings)
      .values({
        userId: user.id,
        ...data,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: userSettings.userId,
        set: { ...data, updatedAt: new Date() },
      });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("POST /api/user-settings failed", error);
    if (isMissingColumnError(error)) {
      return NextResponse.json(
        { error: "Settings update is waiting on the latest server migration." },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

function isMissingColumnError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "42703"
  );
}
