import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { type Habit, fetchHabits } from "@/lib/habits-client";
import { mobileApiFetch } from "@/lib/mobile-api";
import { fetchNotificationSettings } from "@/lib/user-settings-client";

type HabitReminder = Pick<
    Habit,
    | "createdAt"
    | "hidden"
    | "id"
    | "name"
    | "period"
    | "repeatCadence"
    | "reminderEnabled"
    | "reminderTime"
    | "repeatDays"
>;

const HABIT_REMINDER_PREFIX = "habit-reminder";
const SCHEDULE_EVENT_PREFIX = "schedule-event";

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

function parseDateTime(dateKey: string, time: string | null) {
    if (!time) return null;

    const [yearText, monthText, dayText] = dateKey.split("-");
    const [hourText = "", minuteText = ""] = time.split(":");
    const year = Number(yearText);
    const month = Number(monthText);
    const day = Number(dayText);
    const hour = Number(hourText);
    const minute = Number(minuteText);

    if (
        !Number.isInteger(year) ||
        !Number.isInteger(month) ||
        !Number.isInteger(day) ||
        !Number.isInteger(hour) ||
        !Number.isInteger(minute) ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > 31 ||
        hour < 0 ||
        hour > 23 ||
        minute < 0 ||
        minute > 59
    ) {
        return null;
    }

    return new Date(year, month - 1, day, hour, minute);
}

function scheduleEventIdentifier(eventId: string) {
    return `${SCHEDULE_EVENT_PREFIX}:${eventId}`;
}

async function cancelScheduledNotificationsByPrefix(prefix: string) {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    await Promise.all(
        scheduled
            .map((notification) => notification.identifier)
            .filter((identifier) => identifier.startsWith(prefix))
            .map((identifier) =>
                Notifications.cancelScheduledNotificationAsync(identifier),
            ),
    );
}

export async function cancelScheduleEventNotificationAsync(eventId: string) {
    await Notifications.cancelScheduledNotificationAsync(
        scheduleEventIdentifier(eventId),
    );
}

export async function cancelAllScheduleEventNotificationsAsync() {
    await cancelScheduledNotificationsByPrefix(`${SCHEDULE_EVENT_PREFIX}:`);
}

export async function scheduleScheduleEventNotificationAsync({
    dateKey,
    eventId,
    startTime,
    title,
}: {
    dateKey: string;
    eventId: string;
    startTime: string | null;
    title: string;
}) {
    await cancelScheduleEventNotificationAsync(eventId);

    const settings = await fetchNotificationSettings();
    if (!settings.notifyScheduleEvents) return;

    const scheduledAt = parseDateTime(dateKey, startTime);
    if (!scheduledAt || scheduledAt.getTime() <= Date.now()) return;

    await ensureDefaultAndroidNotificationChannelAsync();
    const hasPermission = await requestNotificationPermissionAsync();
    if (!hasPermission) {
        throw new Error("Notifications are not enabled for float.");
    }

    await Notifications.scheduleNotificationAsync({
        identifier: scheduleEventIdentifier(eventId),
        content: {
            title,
            body: "Starting now on your daily plan.",
            data: { dateKey, eventId, type: "schedule-event" },
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: scheduledAt,
        },
    });
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
        throw new Error("Notifications are not enabled for float.");
    }

    const content = {
        title: habit.name,
        body: "Time for your habit.",
        data: { habitId: habit.id, type: "habit-reminder" },
    };

    const cadence = habit.repeatCadence ?? habit.period;

    if (cadence === "weekly") {
        const repeatDays = habit.repeatDays?.length ? habit.repeatDays : [];
        if (repeatDays.length === 0) return;

        await Promise.all(
            repeatDays.map((day) =>
                Notifications.scheduleNotificationAsync({
                    identifier: habitReminderIdentifier(
                        habit.id,
                        `weekly-${day}`,
                    ),
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

    if (cadence === "monthly") {
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
 * and registers it with the backend. Call this from a user-initiated action so
 * iOS only prompts when the value is clear.
 */
export async function registerForPushNotificationsAsync(): Promise<
    "denied" | "failed" | "missing-project-id" | "registered" | "unavailable"
> {
    try {
        if (!Device.isDevice) return "unavailable";

        await ensureDefaultAndroidNotificationChannelAsync();
        const hasPermission = await requestNotificationPermissionAsync();
        if (!hasPermission) return "denied";

        const projectId = getProjectId();
        if (!projectId) return "missing-project-id";

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

        return "registered";
    } catch {
        return "failed";
    }
}

export async function sendTestNotificationAsync(): Promise<void> {
    await ensureDefaultAndroidNotificationChannelAsync();
    const hasPermission = await requestNotificationPermissionAsync();
    if (!hasPermission) {
        throw new Error("Notifications are not enabled for float.");
    }

    await Notifications.scheduleNotificationAsync({
        content: {
            title: "float",
            body: "Notifications are working.",
            data: { type: "test" },
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: 2,
        },
    });
}
