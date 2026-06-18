import { mobileApiFetch } from "@/lib/mobile-api";

export type Goal = {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type GoalInput = {
  title: string;
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
  }).then((response) => parseResponse<Goal>(response));

export const updatePlanGoal = (id: string, input: GoalInput) =>
  mobileApiFetch("/api/plan-goals", {
    method: "POST",
    body: JSON.stringify({ type: "update", id, ...input }),
  }).then((response) => parseResponse<Goal>(response));

export const deletePlanGoal = (id: string) =>
  mobileApiFetch("/api/plan-goals", {
    method: "POST",
    body: JSON.stringify({ type: "delete", id }),
  }).then((response) => parseResponse<{ ok: true }>(response));
