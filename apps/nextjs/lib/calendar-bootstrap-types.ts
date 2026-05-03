import type { GoalLogsSnapshot } from "./goal-logs-client";
import type { CustomDayIconSelection } from "./habit-state";

export type CalendarBootstrapData = {
  month: string;
  prevMonth: string;
  hiddenKeys: string[];
  currentCustomDayIconsByDate: Record<string, CustomDayIconSelection | null>;
  currentGoalLogsSnapshot: GoalLogsSnapshot;
  prevGoalLogsByDate: Record<string, "complete">;
};
