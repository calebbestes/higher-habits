export const PLAN_PERIODS = ["AM", "PM"] as const;
export const DEFAULT_PLAN_START_TIME = "9:00";
export const DEFAULT_PLAN_END_TIME = "10:00";
export const DEFAULT_PLAN_PERIOD: PlanPeriod = "AM";

export type PlanPeriod = (typeof PLAN_PERIODS)[number];

const PLAN_TIME_INPUT_REGEX = /^(0?[1-9]|1[0-2]):[0-5]\d$/;
const STORED_PLAN_TIME_REGEX = /^([01]?\d|2[0-3]):[0-5]\d$/;
const PLAN_TIME_DISPLAY_DATE = new Date(2000, 0, 1, 0, 0, 0, 0);

const planTimeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});
const planHourFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
});

export function normalizeStoredPlanTime(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !STORED_PLAN_TIME_REGEX.test(trimmed)) return null;

  const [hours = "0", minutes = "00"] = trimmed.split(":");
  return `${hours.padStart(2, "0")}:${minutes}`;
}

export function getPlanTimeInput(value: string | null | undefined): {
  period: PlanPeriod;
  time: string;
} {
  const normalized = normalizeStoredPlanTime(value);
  if (!normalized) return { period: "AM", time: "" };

  const [storedHours = "0", minutes = "00"] = normalized.split(":");
  const hour = Number(storedHours);
  const period: PlanPeriod = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;

  return { period, time: `${displayHour}:${minutes}` };
}

export function formatStoredPlanTimeDisplay(
  value: string | null | undefined,
): string | null {
  const normalized = normalizeStoredPlanTime(value);
  if (!normalized) return null;

  const [hours = "0", minutes = "00"] = normalized.split(":");
  return formatPlanMinutesDisplay(Number(hours) * 60 + Number(minutes));
}

export function formatPlanMinutesDisplay(minutes: number): string {
  const date = new Date(PLAN_TIME_DISPLAY_DATE);
  date.setMinutes(minutes);
  return minutes % 60 === 0
    ? planHourFormatter.format(date)
    : planTimeFormatter.format(date);
}

export function normalizePlanTimeInput(
  value: string | null | undefined,
  period: PlanPeriod,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed || !PLAN_TIME_INPUT_REGEX.test(trimmed)) return null;

  const [inputHours = "0", minutes = "00"] = trimmed.split(":");
  const hour = Number(inputHours);
  const storedHour =
    period === "PM" ? (hour === 12 ? 12 : hour + 12) : hour === 12 ? 0 : hour;

  return `${String(storedHour).padStart(2, "0")}:${minutes}`;
}
