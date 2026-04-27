import type {
  CalendarHabitKey,
  CustomDayIconSelection,
  DrawerNoteKey,
  HabitStateMonthSnapshot,
  PrayerChecklistState,
  SalesActivityInput,
  SalesActivityLog,
  WeightChecklistState,
} from "./habit-state";

const HABIT_STATE_ENDPOINT = "/api/habit-state";

const parseResponse = async <T>(response: Response) => {
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload;
};

export const fetchHabitMonthSnapshot = async (month: string) => {
  const response = await fetch(
    `${HABIT_STATE_ENDPOINT}?month=${encodeURIComponent(month)}`,
    {
      cache: "no-store",
    },
  );

  return parseResponse<HabitStateMonthSnapshot>(response);
};

export const persistDayHabit = async (input: {
  dateKey: string;
  habitKey: CalendarHabitKey;
  isActive: boolean;
}) => {
  const response = await fetch(HABIT_STATE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "setDayHabit",
      ...input,
    }),
  });

  return parseResponse<{ ok: true }>(response);
};

export const persistPrayerChecklist = async (input: {
  dateKey: string;
  checklist: PrayerChecklistState;
}) => {
  const response = await fetch(HABIT_STATE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "setPrayerChecklist",
      ...input,
    }),
  });

  return parseResponse<{ ok: true }>(response);
};

export const persistCustomDayIcon = async (input: {
  dateKey: string;
  slotIndex: number;
  selection: CustomDayIconSelection | null;
}) => {
  const response = await fetch(HABIT_STATE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "setCustomDayIcon",
      ...input,
    }),
  });

  return parseResponse<{ ok: true }>(response);
};

export const persistWeightChecklist = async (input: {
  dateKey: string;
  checklist: WeightChecklistState;
}) => {
  const response = await fetch(HABIT_STATE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "setWeightChecklist",
      ...input,
    }),
  });

  return parseResponse<{ ok: true }>(response);
};

export const persistDrawerNote = async (input: {
  dateKey: string;
  drawerKey: DrawerNoteKey;
  notes: string | null;
}) => {
  const response = await fetch(HABIT_STATE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "setDrawerNote",
      dateKey: input.dateKey,
      note: {
        drawerKey: input.drawerKey,
        notes: input.notes,
      },
    }),
  });

  return parseResponse<{ ok: true }>(response);
};

export const createSalesActivity = async (input: {
  dateKey: string;
  activity: SalesActivityInput;
}) => {
  const response = await fetch(HABIT_STATE_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      type: "addSalesActivity",
      ...input,
    }),
  });

  return parseResponse<{ activity: SalesActivityLog }>(response);
};
