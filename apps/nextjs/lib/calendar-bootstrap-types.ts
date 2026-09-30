import type { GoalLogsSnapshot } from "./goal-logs-client";

export type CalendarBootstrapData = {
  month: string;
  currentGoalLogsSnapshot: GoalLogsSnapshot;
  prevGoalLogsByDate: Record<string, "complete">;
};
