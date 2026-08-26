import type { GoalLogsSnapshot } from "@/lib/goal-logs-client";
import type { GoalPhoto } from "@/lib/goal-photos-client";
import type { GoalVisibility } from "@/lib/goals-client";
import { mobileApiFetch } from "@/lib/mobile-api";

export type JournalGoalOption = {
  id: string;
  name: string;
  iconKey: string;
  categoryId: string;
};

export type JournalGoalSection = {
  categoryId: string;
  categoryName: string;
  goals: JournalGoalOption[];
};

export type JournalSocialSummary = GoalLogsSnapshot["socialByGoalDate"][string];

export type JournalHistoryItem =
  | {
      kind: "habit";
      id: string;
      dateKey: string;
      goal: JournalGoalOption;
      note: string;
      photoCount: number;
      visibility: GoalVisibility;
      social: JournalSocialSummary;
      photos: GoalPhoto[];
      updatedAt: string;
    }
  | {
      kind: "checkpoint";
      id: string;
      dateKey: string;
      goalTitle: string;
      checkpointTitle: string;
      note: string;
      visibility: GoalVisibility;
      photos: GoalPhoto[];
      updatedAt: string;
    }
  | {
      kind: "reflection";
      id: string;
      dateKey: string;
      prompt: string;
      answer: string;
      photos: GoalPhoto[];
      updatedAt: string;
    };

export type JournalHistoryPage = {
  items: JournalHistoryItem[];
  goalSections: JournalGoalSection[];
  nextCursor: string | null;
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new Error(body?.error ?? body?.message ?? "Could not load journal.");
  }

  return response.json() as Promise<T>;
}

export const fetchJournalHistory = (
  options: {
    cursor?: string | null;
    limit?: number;
    month?: string | null;
  } = {},
): Promise<JournalHistoryPage> => {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? 20));
  if (options.cursor) params.set("cursor", options.cursor);
  if (options.month) params.set("month", options.month);

  return mobileApiFetch(`/api/journal?${params.toString()}`).then((response) =>
    parseResponse<JournalHistoryPage>(response),
  );
};
