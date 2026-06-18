import { mobileApiFetch } from "@/lib/mobile-api";

export type NotificationSettings = {
  notifyFriendRequests: boolean;
  notifyMonthlyGoalToday: boolean;
  notifyTasksDueToday: boolean;
  notifyInactivityReminder: boolean;
  notifySharedGoalInvites: boolean;
  notifyStreakAtRisk: boolean;
  notifyStreakMilestone: boolean;
  notifyEndOfDayNudge: boolean;
  notifyPostProps: boolean;
  notifyPostComments: boolean;
  notifyFriendRequestAccepted: boolean;
  notifyFriendMilestone: boolean;
  notifySharedGoalResponses: boolean;
  notifyLastToComplete: boolean;
  notifySharedGoalEnding: boolean;
  notifyStakesReminder: boolean;
  notifyIncentiveEarned: boolean;
  notifyPlanTomorrow: boolean;
  notifyWeeklyRecap: boolean;
};

export const NOTIFICATION_SETTING_DEFAULTS: NotificationSettings = {
  notifyFriendRequests: true,
  notifyMonthlyGoalToday: true,
  notifyTasksDueToday: true,
  notifyInactivityReminder: true,
  notifySharedGoalInvites: true,
  notifyStreakAtRisk: true,
  notifyStreakMilestone: true,
  notifyEndOfDayNudge: true,
  notifyPostProps: true,
  notifyPostComments: true,
  notifyFriendRequestAccepted: true,
  notifyFriendMilestone: true,
  notifySharedGoalResponses: true,
  notifyLastToComplete: true,
  notifySharedGoalEnding: true,
  notifyStakesReminder: true,
  notifyIncentiveEarned: true,
  notifyPlanTomorrow: true,
  notifyWeeklyRecap: true,
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new Error(body?.error ?? body?.message ?? "Request failed.");
  }
  return response.json() as Promise<T>;
}

export const fetchNotificationSettings = (): Promise<NotificationSettings> =>
  mobileApiFetch("/api/user-settings").then((r) =>
    parseResponse<NotificationSettings>(r),
  );

export const updateNotificationSettings = (
  settings: Partial<NotificationSettings>,
): Promise<{ ok: true }> =>
  mobileApiFetch("/api/user-settings", {
    method: "POST",
    body: JSON.stringify(settings),
  }).then((r) => parseResponse<{ ok: true }>(r));
