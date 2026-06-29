import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { type Habit, fetchHabits } from "@/lib/habits-client";
import { mobileApiFetch } from "@/lib/mobile-api";

type HabitReminder = Pick<
  Habit,
  | "createdAt"
  | "hidden"
  | "id"
  | "name"
  | "period"
  | "reminderEnabled"
  | "reminderTime"
  | "repeatDays"
>;

const HABIT_REMINDER_PREFIX = "habit-reminder";

// Show notifications while the app is foregrounded.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function getProjectId(): string | undefined {
  return (
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId
  );
}

async function ensureDefaultAndroidNotificationChannelAsync() {
  if (Platform.OS !== "android") return;

  await Notifications.setNotificationChannelAsync("default", {
    name: "Default",
    importance: Notifications.AndroidImportance.DEFAULT,
  });
}

async function requestNotificationPermissionAsync(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === "granted") return true;

  const requested = await Notifications.requestPermissionsAsync();
  return requested.status === "granted";
}

function habitReminderIdentifier(habitId: string, suffix: string) {
  return `${HABIT_REMINDER_PREFIX}:${habitId}:${suffix}`;
}

function possibleHabitReminderIdentifiers(habitId: string) {
  return [
    habitReminderIdentifier(habitId, "daily"),
    habitReminderIdentifier(habitId, "monthly"),
    ...Array.from({ length: 7 }, (_, day) =>
      habitReminderIdentifier(habitId, `weekly-${day}`),
    ),
  ];
}

function parseReminderTime(reminderTime: string | null) {
  if (!reminderTime) return null;

  const [hourText = "", minuteText = ""] = reminderTime.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (
    !Number.isInteger(hour) ||
    !Number.isInteger(minute) ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }

  return { hour, minute };
}

export async function cancelHabitReminderAsync(habitId: string): Promise<void> {
  await Promise.all(
    possibleHabitReminderIdentifiers(habitId).map((identifier) =>
      Notifications.cancelScheduledNotificationAsync(identifier),
    ),
  );
}

export async function scheduleHabitReminderAsync(
  habit: HabitReminder,
): Promise<void> {
  await cancelHabitReminderAsync(habit.id);

  if (!habit.reminderEnabled || habit.hidden) return;

  const reminderTime = parseReminderTime(habit.reminderTime);
  if (!reminderTime) return;

  await ensureDefaultAndroidNotificationChannelAsync();
  const hasPermission = await requestNotificationPermissionAsync();
  if (!hasPermission) {
    throw new Error("Notifications are not enabled for Higher Habits.");
  }

  const content = {
    title: habit.name,
    body: "Time for your habit.",
    data: { habitId: habit.id, type: "habit-reminder" },
  };

  if (habit.period === "weekly") {
    const repeatDays = habit.repeatDays?.length
      ? habit.repeatDays
      : [new Date().getDay()];

    await Promise.all(
      repeatDays.map((day) =>
        Notifications.scheduleNotificationAsync({
          identifier: habitReminderIdentifier(habit.id, `weekly-${day}`),
          content,
          trigger: {
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: day + 1,
            hour: reminderTime.hour,
            minute: reminderTime.minute,
          },
        }),
      ),
    );
    return;
  }

  if (habit.period === "monthly") {
    const createdAt = new Date(habit.createdAt);
    const day = Number.isNaN(createdAt.getTime())
      ? new Date().getDate()
      : createdAt.getDate();

    await Notifications.scheduleNotificationAsync({
      identifier: habitReminderIdentifier(habit.id, "monthly"),
      content,
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.MONTHLY,
        day,
        hour: reminderTime.hour,
        minute: reminderTime.minute,
      },
    });
    return;
  }

  await Notifications.scheduleNotificationAsync({
    identifier: habitReminderIdentifier(habit.id, "daily"),
    content,
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour: reminderTime.hour,
      minute: reminderTime.minute,
    },
  });
}

export async function syncHabitRemindersAsync(
  habits: HabitReminder[],
): Promise<void> {
  for (const habit of habits) {
    try {
      await scheduleHabitReminderAsync(habit);
    } catch {
      // Reminder sync is best-effort during app startup.
    }
  }
}

export async function syncHabitRemindersFromServerAsync(): Promise<void> {
  try {
    const habits = await fetchHabits();
    await syncHabitRemindersAsync(habits);
  } catch {
    // Reminder sync is best-effort; never block app startup.
  }
}

/**
 * Requests notification permission (if needed), retrieves the Expo push token,
 * and registers it with the backend. Safe to call on every launch; no-ops on
 * simulators and when permission is denied.
 */
export async function registerForPushNotificationsAsync(): Promise<void> {
  try {
    if (!Device.isDevice) return;

    await ensureDefaultAndroidNotificationChannelAsync();
    const hasPermission = await requestNotificationPermissionAsync();
    if (!hasPermission) return;

    const projectId = getProjectId();
    if (!projectId) return;

    const tokenResponse = await Notifications.getExpoPushTokenAsync({
      projectId,
    });

    await mobileApiFetch("/api/push-tokens", {
      method: "POST",
      body: JSON.stringify({
        token: tokenResponse.data,
        platform: Platform.OS,
      }),
    });
  } catch {
    // Push registration is best-effort; never block app startup.
  }
}

export async function sendTestNotificationAsync(): Promise<void> {
  await ensureDefaultAndroidNotificationChannelAsync();
  const hasPermission = await requestNotificationPermissionAsync();
  if (!hasPermission) {
    throw new Error("Notifications are not enabled for Higher Habits.");
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Higher Habits",
      body: "Notifications are working.",
      data: { type: "test" },
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: 2,
    },
  });
}
