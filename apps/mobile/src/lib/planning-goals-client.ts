import type { GoalVisibility } from "@/lib/goals-client";
import { mobileApiFetch } from "@/lib/mobile-api";
import { recordReviewMilestone } from "@/lib/in-app-review";

export type Goal = {
  id: string;
  title: string;
  timing: GoalTiming;
  sortOrder: number;
  checkpoints: GoalCheckpoint[];
  createdAt: string;
  updatedAt: string;
};

export type GoalTiming = "current" | "later";

export type GoalCheckpoint = {
  id: string;
  title: string;
  targetDate: string | null;
  sortOrder: number;
  completed: boolean;
  completedAt: string | null;
  notes: string | null;
  visibility: GoalVisibility;
  createdAt: string;
  updatedAt: string;
};

export type GoalCheckpointInput = {
  title: string;
  targetDate: string | null;
  completed: boolean;
};

export type GoalInput = {
  title: string;
  timing: GoalTiming;
  checkpoints: GoalCheckpointInput[];
};

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

export const fetchPlanGoals = () =>
  mobileApiFetch("/api/plan-goals").then((response) =>
    parseResponse<Goal[]>(response),
  );

export const createPlanGoal = (input: GoalInput) =>
  mobileApiFetch("/api/plan-goals", {
    method: "POST",
    body: JSON.stringify({ type: "create", ...input }),
  })
    .then((response) => parseResponse<Goal>(response))
    .then((goal) => {
      void recordReviewMilestone("goal");
      return goal;
    });

export const updatePlanGoal = (id: string, input: GoalInput) =>
  mobileApiFetch("/api/plan-goals", {
    method: "POST",
    body: JSON.stringify({ type: "update", id, ...input }),
  }).then((response) => parseResponse<Goal>(response));

export const updatePlanGoalCheckpoint = (
  id: string,
  update: {
    completed: boolean;
    notes?: string | null;
    visibility?: GoalVisibility;
  },
) =>
  mobileApiFetch("/api/plan-goals", {
    method: "POST",
    body: JSON.stringify({ type: "updateCheckpoint", id, ...update }),
  }).then((response) => parseResponse<Goal>(response));

export const deletePlanGoal = (id: string) =>
  mobileApiFetch("/api/plan-goals", {
    method: "POST",
    body: JSON.stringify({ type: "delete", id }),
  }).then((response) => parseResponse<{ ok: true }>(response));

export const reorderPlanGoals = (goalIds: string[]) =>
  mobileApiFetch("/api/plan-goals", {
    method: "POST",
    body: JSON.stringify({ type: "reorder", goalIds }),
  }).then((response) => parseResponse<{ ok: true }>(response));
