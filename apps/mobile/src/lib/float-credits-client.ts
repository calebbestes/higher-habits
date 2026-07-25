import { mobileApiFetch } from "@/lib/mobile-api";

export type FloatCreditActionType =
  | "post"
  | "task_complete"
  | "habit_complete"
  | "goal_checkpoint_complete"
  | "comment"
  | "incentive_create"
  | "shared_goal_create"
  | "daily_plan"
  | "monthly_plan";

export type FloatCreditTransaction = {
  id: string;
  actionType: FloatCreditActionType;
  actionDate: string;
  amount: number;
  description: string;
  createdAt: string;
};

export type FloatCreditReward = {
  id: string;
  title: string;
  description: string;
  creditCost: number;
  status: "available" | "coming_soon" | "redeemed";
};

export type FloatCreditSummary = {
  balance: number;
  lifetimeEarned: number;
  recent: FloatCreditTransaction[];
  rewards: FloatCreditReward[];
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

export const fetchFloatCredits = () =>
  mobileApiFetch("/api/float-credits").then((response) =>
    parseResponse<FloatCreditSummary>(response),
  );
