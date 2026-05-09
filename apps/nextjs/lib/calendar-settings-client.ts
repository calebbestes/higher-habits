const ENDPOINT = "/api/calendar-settings";

export type CalendarSettingsData = {
  visibleCategoryIds: string[];
  monthlyGoalSlots: number;
};

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettingsData = {
  visibleCategoryIds: [],
  monthlyGoalSlots: 3,
};

export const fetchCalendarSettings = (): Promise<CalendarSettingsData> =>
  fetch(ENDPOINT, { cache: "no-store" }).then((r) => r.json());

export const saveCalendarSettings = (
  data: CalendarSettingsData,
): Promise<{ ok: true }> =>
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then((r) => r.json());
