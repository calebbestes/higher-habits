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

const DEFAULTS = Object.fromEntries(
  NOTIFICATION_KEYS.map((key) => [key, true]),
) as Record<NotificationKey, boolean>;

const USER_SETTING_DEFAULTS = {
  defaultAppStartPage: "collab",
  defaultCollabSection: "shared-goals",
  defaultPlanReportView: "day-plan",
} as const;

const notificationSchemaShape = Object.fromEntries(
  NOTIFICATION_KEYS.map((key) => [key, z.boolean()]),
) as Record<NotificationKey, z.ZodBoolean>;

const bodySchema = z
  .object({
    defaultAppStartPage: z.enum([
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
    defaultPlanReportView: z.enum(["day-plan", "habits", "goals", "top-tasks"]),
    ...notificationSchemaShape,
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
    };

    return NextResponse.json(response);
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;
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
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
