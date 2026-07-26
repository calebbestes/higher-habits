import { mobileApiFetch } from "@/lib/mobile-api";
import type {
  AppStartPage,
  CollabSection,
  PlanReportView,
} from "@/lib/tab-view-store";

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
  notifyFriendPosts: boolean;
  notifyFriendRequestAccepted: boolean;
  notifyFriendMilestone: boolean;
  notifySharedGoalResponses: boolean;
  notifyLastToComplete: boolean;
  notifySharedGoalEnding: boolean;
  notifyStakesReminder: boolean;
  notifyIncentiveEarned: boolean;
  notifyPlanTomorrow: boolean;
  notifyWeeklyRecap: boolean;
  notifyScheduleEvents: boolean;
  dailyNotificationTime: string;
  weeklyNotificationTime: string;
  weeklyNotificationDay: string;
  monthlyNotificationTime: string;
  monthlyNotificationDay: string;
};

export type UserSettings = NotificationSettings & {
  defaultAppStartPage: AppStartPage;
  defaultCollabSection: CollabSection;
  defaultPlanReportView: PlanReportView;
};

export const USER_SETTING_DEFAULTS: UserSettings = {
  defaultAppStartPage: "collab",
  defaultCollabSection: "shared-goals",
  defaultPlanReportView: "day-plan",
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
  notifyFriendPosts: true,
  notifyFriendRequestAccepted: true,
  notifyFriendMilestone: true,
  notifySharedGoalResponses: true,
  notifyLastToComplete: true,
  notifySharedGoalEnding: true,
  notifyStakesReminder: true,
  notifyIncentiveEarned: true,
  notifyPlanTomorrow: true,
  notifyWeeklyRecap: true,
  notifyScheduleEvents: true,
  dailyNotificationTime: "20:30",
  weeklyNotificationTime: "18:00",
  weeklyNotificationDay: "sunday",
  monthlyNotificationTime: "09:00",
  monthlyNotificationDay: "first",
};

export const NOTIFICATION_SETTING_DEFAULTS: NotificationSettings = {
  notifyFriendRequests: USER_SETTING_DEFAULTS.notifyFriendRequests,
  notifyMonthlyGoalToday: USER_SETTING_DEFAULTS.notifyMonthlyGoalToday,
  notifyTasksDueToday: USER_SETTING_DEFAULTS.notifyTasksDueToday,
  notifyInactivityReminder: USER_SETTING_DEFAULTS.notifyInactivityReminder,
  notifySharedGoalInvites: USER_SETTING_DEFAULTS.notifySharedGoalInvites,
  notifyStreakAtRisk: USER_SETTING_DEFAULTS.notifyStreakAtRisk,
  notifyStreakMilestone: USER_SETTING_DEFAULTS.notifyStreakMilestone,
  notifyEndOfDayNudge: USER_SETTING_DEFAULTS.notifyEndOfDayNudge,
  notifyPostProps: USER_SETTING_DEFAULTS.notifyPostProps,
  notifyPostComments: USER_SETTING_DEFAULTS.notifyPostComments,
  notifyFriendPosts: USER_SETTING_DEFAULTS.notifyFriendPosts,
  notifyFriendRequestAccepted:
    USER_SETTING_DEFAULTS.notifyFriendRequestAccepted,
  notifyFriendMilestone: USER_SETTING_DEFAULTS.notifyFriendMilestone,
  notifySharedGoalResponses: USER_SETTING_DEFAULTS.notifySharedGoalResponses,
  notifyLastToComplete: USER_SETTING_DEFAULTS.notifyLastToComplete,
  notifySharedGoalEnding: USER_SETTING_DEFAULTS.notifySharedGoalEnding,
  notifyStakesReminder: USER_SETTING_DEFAULTS.notifyStakesReminder,
  notifyIncentiveEarned: USER_SETTING_DEFAULTS.notifyIncentiveEarned,
  notifyPlanTomorrow: USER_SETTING_DEFAULTS.notifyPlanTomorrow,
  notifyWeeklyRecap: USER_SETTING_DEFAULTS.notifyWeeklyRecap,
  notifyScheduleEvents: USER_SETTING_DEFAULTS.notifyScheduleEvents,
  dailyNotificationTime: USER_SETTING_DEFAULTS.dailyNotificationTime,
  weeklyNotificationTime: USER_SETTING_DEFAULTS.weeklyNotificationTime,
  weeklyNotificationDay: USER_SETTING_DEFAULTS.weeklyNotificationDay,
  monthlyNotificationTime: USER_SETTING_DEFAULTS.monthlyNotificationTime,
  monthlyNotificationDay: USER_SETTING_DEFAULTS.monthlyNotificationDay,
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

export const fetchUserSettings = (): Promise<UserSettings> =>
  mobileApiFetch("/api/user-settings").then((r) =>
    parseResponse<Partial<UserSettings>>(r).then((settings) => ({
      ...USER_SETTING_DEFAULTS,
      ...settings,
    })),
  );

export const updateUserSettings = (
  settings: Partial<UserSettings>,
): Promise<{ ok: true }> =>
  mobileApiFetch("/api/user-settings", {
    method: "POST",
    body: JSON.stringify(settings),
  }).then((r) => parseResponse<{ ok: true }>(r));

export const fetchNotificationSettings = (): Promise<NotificationSettings> =>
  fetchUserSettings();

export const updateNotificationSettings = (
  settings: Partial<NotificationSettings>,
): Promise<{ ok: true }> => updateUserSettings(settings);
