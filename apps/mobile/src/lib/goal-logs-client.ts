import type { GoalVisibility } from "@/lib/goals-client";
import { mobileApiFetch } from "@/lib/mobile-api";

export type GoalInCategory = {
  id: string;
  name: string;
  iconKey: string;
  categoryId: string;
  priority: "high" | "low";
  hidden: boolean;
  visibility: GoalVisibility;
  period: "daily" | "weekly" | "monthly";
  frequencyGoal: number | null;
};

export type CategoryWithGoals = {
  id: string;
  name: string;
  icon: string;
  goals: GoalInCategory[];
};

export type PeriodicGoalInfo = {
  id: string;
  name: string;
  iconKey: string;
  categoryId: string;
  priority: "high" | "low";
  visibility: GoalVisibility;
  period: "daily" | "weekly" | "monthly";
  frequencyGoal: number | null;
  repeatInterval: number | null;
  repeatDays: number[] | null;
  repeatMonthlyType: string | null;
  createdAt: string;
};

export type GoalLogsSnapshot = {
  categories: CategoryWithGoals[];
  periodicGoals: PeriodicGoalInfo[];
  logsByGoalDate: Record<string, "complete" | "planned">;
  notesByGoalDate: Record<string, string>;
  photoCountsByGoalDate: Record<string, number>;
  visibilityByGoalDate: Record<string, GoalVisibility>;
};

export type GoalLogStatus = "complete" | "planned" | null;

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new Error(body?.error ?? body?.message ?? "Unable to continue.");
  }

  return response.json() as Promise<T>;
}

export function getMonthKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export const fetchGoalLogsSnapshot = (
  monthKey: string,
): Promise<GoalLogsSnapshot> =>
  mobileApiFetch(`/api/goal-logs?month=${monthKey}`).then((r) =>
    parseResponse<GoalLogsSnapshot>(r),
  );

export const fetchAllGoalLogsSnapshot = (): Promise<GoalLogsSnapshot> =>
  mobileApiFetch(`/api/goal-logs?all=true&month=${getMonthKey()}`).then((r) =>
    parseResponse<GoalLogsSnapshot>(r),
  );

export const setGoalLog = (
  goalId: string,
  dateKey: string,
  status: GoalLogStatus,
): Promise<{ ok: true }> =>
  mobileApiFetch("/api/goal-logs", {
    method: "POST",
    body: JSON.stringify({ type: "setLog", goalId, dateKey, status }),
  }).then((r) => parseResponse<{ ok: true }>(r));

export const setGoalLogNote = (
  goalId: string,
  dateKey: string,
  notes: string,
): Promise<{ ok: true }> =>
  mobileApiFetch("/api/goal-logs", {
    method: "POST",
    body: JSON.stringify({ type: "setNote", goalId, dateKey, notes }),
  }).then((r) => parseResponse<{ ok: true }>(r));

export const setGoalLogVisibility = (
  goalId: string,
  dateKey: string,
  visibility: GoalVisibility,
): Promise<{ ok: true }> =>
  mobileApiFetch("/api/goal-logs", {
    method: "POST",
    body: JSON.stringify({
      type: "setVisibility",
      goalId,
      dateKey,
      visibility,
    }),
  }).then((r) => parseResponse<{ ok: true }>(r));

export const deleteGoalLog = (
  goalId: string,
  dateKey: string,
): Promise<{ ok: true }> =>
  mobileApiFetch("/api/goal-logs", {
    method: "POST",
    body: JSON.stringify({ type: "deleteLog", goalId, dateKey }),
  }).then((r) => parseResponse<{ ok: true }>(r));
