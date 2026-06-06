const ENDPOINT = "/api/goal-logs";

export type GoalInCategory = {
  id: string;
  name: string;
  iconKey: string;
  categoryId: string;
  priority: "high" | "medium" | "low";
  hidden: boolean;
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
  priority: "high" | "medium" | "low";
  period: string | null;
  frequencyGoal: number | null;
};

export type HiddenGoalInfo = {
  id: string;
  name: string;
  iconKey: string;
  categoryId: string;
  priority: "high" | "medium" | "low";
  period: string | null;
  frequencyGoal: number | null;
};

export type AcceptedGoalIncentive = {
  id: string;
  goalId: string;
  body: string;
  streakDays: number;
  streakPercent: number;
  createdAt: string;
};

export type GoalLogsSnapshot = {
  categories: CategoryWithGoals[];
  periodicGoals: PeriodicGoalInfo[];
  hiddenGoals: HiddenGoalInfo[];
  acceptedGoalIncentives: AcceptedGoalIncentive[];
  /** key: `${goalId}_${dateKey}` */
  logsByGoalDate: Record<string, "complete" | "planned">;
  /** key: `${goalId}_${dateKey}`, only non-empty notes */
  notesByGoalDate: Record<string, string>;
};

export const EMPTY_GOAL_LOGS_SNAPSHOT: GoalLogsSnapshot = {
  categories: [],
  periodicGoals: [],
  hiddenGoals: [],
  acceptedGoalIncentives: [],
  logsByGoalDate: {},
  notesByGoalDate: {},
};

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(await res.text().catch(() => "Error"));
  return res.json() as Promise<T>;
}

export const fetchGoalLogsSnapshot = (
  monthKey: string,
): Promise<GoalLogsSnapshot> =>
  fetch(`${ENDPOINT}?month=${monthKey}`, { cache: "no-store" }).then((r) =>
    parseResponse<GoalLogsSnapshot>(r),
  );

export const setGoalLog = (
  goalId: string,
  dateKey: string,
  status: "complete" | "planned" | null,
): Promise<{ ok: true }> =>
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "setLog", goalId, dateKey, status }),
  }).then((r) => parseResponse<{ ok: true }>(r));

export const setGoalHidden = (
  goalId: string,
  hidden: boolean,
): Promise<{ ok: true }> =>
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "setHidden", goalId, hidden }),
  }).then((r) => parseResponse<{ ok: true }>(r));

export const setGoalLogNote = (
  goalId: string,
  dateKey: string,
  notes: string,
): Promise<{ ok: true }> =>
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "setNote", goalId, dateKey, notes }),
  }).then((r) => parseResponse<{ ok: true }>(r));
