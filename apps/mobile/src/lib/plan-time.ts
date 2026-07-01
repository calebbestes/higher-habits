export const PLAN_PERIODS = ["AM", "PM"] as const;

export type PlanPeriod = (typeof PLAN_PERIODS)[number];

const PLAN_TIME_INPUT_REGEX = /^(0?[1-9]|1[0-2]):[0-5]\d$/;
const STORED_PLAN_TIME_REGEX = /^([01]?\d|2[0-3]):[0-5]\d$/;

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
