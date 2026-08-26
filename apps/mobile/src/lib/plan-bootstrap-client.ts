import type { Category } from "@/lib/habits-client";
import { mobileApiFetch } from "@/lib/mobile-api";
import type { PlannedEvent } from "@/lib/planned-events-client";
import type { Goal } from "@/lib/planning-goals-client";
import type { Task } from "@/lib/tasks-client";

export type PlanBootstrapData = {
  plannedEvents: PlannedEvent[];
  tasks?: Task[];
  planGoals?: Goal[];
  habitCategories?: Category[];
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new Error(body?.error ?? body?.message ?? "Could not load plan.");
  }

  return response.json() as Promise<T>;
}

export const fetchDayPlanBootstrap = (
  dateKey: string,
): Promise<Required<PlanBootstrapData>> =>
  mobileApiFetch(
    `/api/plan-bootstrap?view=day&dateKey=${encodeURIComponent(dateKey)}`,
  ).then((response) => parseResponse<Required<PlanBootstrapData>>(response));

export const fetchWeekPlanBootstrap = (
  startDateKey: string,
  endDateKey: string,
): Promise<Pick<PlanBootstrapData, "plannedEvents">> =>
  mobileApiFetch(
    `/api/plan-bootstrap?view=week&startDateKey=${encodeURIComponent(startDateKey)}&endDateKey=${encodeURIComponent(endDateKey)}`,
  ).then((response) =>
    parseResponse<Pick<PlanBootstrapData, "plannedEvents">>(response),
  );
