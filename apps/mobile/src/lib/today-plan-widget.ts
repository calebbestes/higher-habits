import { Platform } from "react-native";

import { DEFAULT_GOOGLE_CALENDAR_COLOR } from "@/constants/calendar-colors";
import { fetchDayPlanBootstrap } from "@/lib/plan-bootstrap-client";
import { formatPlanMinutesDisplay } from "@/lib/plan-time";
import type {
  TodayPlanWidgetItem,
  TodayPlanWidgetProps,
} from "@/widgets/today-plan-widget";

function localDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatEventTime(value: string | null) {
  if (!value) return "Any time";
  const [hourText, minuteText] = value.split(":");
  const hour = Number(hourText);
  const minute = Number(minuteText);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) return "Any time";
  return formatPlanMinutesDisplay(hour * 60 + minute);
}

function formatDateLabel(date = new Date()) {
  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
  }).format(date);
}

export async function syncTodayPlanWidgetAsync(): Promise<void> {
  if (Platform.OS !== "ios") return;

  try {
    // Load the native widget module only when syncing. This keeps older app
    // binaries and Expo Go from crashing before they have the widget target.
    const { default: TodayPlanWidget } = await import(
      "@/widgets/today-plan-widget"
    );
    const dateKey = localDateKey();
    const { plannedEvents } = await fetchDayPlanBootstrap(dateKey);
    const sortedEvents = plannedEvents
      .filter((event) => event.date === dateKey)
      .sort((a, b) => {
        const aTime = a.startTime ?? "99:99";
        const bTime = b.startTime ?? "99:99";
        return aTime.localeCompare(bTime) || a.title.localeCompare(b.title);
      });
    const items: TodayPlanWidgetItem[] = sortedEvents.map((event) => ({
      id: event.id,
      title: event.title,
      time: formatEventTime(event.startTime),
      accent: event.calendarColor ?? DEFAULT_GOOGLE_CALENDAR_COLOR,
    }));
    const props: TodayPlanWidgetProps = {
      dateLabel: formatDateLabel(),
      items,
      remainingCount: Math.max(0, items.length - 3),
    };

    TodayPlanWidget.updateSnapshot(props);
  } catch {
    // Widget updates are best-effort and should never block app startup.
  }
}
