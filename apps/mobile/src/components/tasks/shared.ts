import type { SymbolViewProps } from "expo-symbols";

import { type TaskInput, taskToInput } from "@/lib/tasks-client";

export type SymbolName = SymbolViewProps["name"];

export function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

export const EMPTY_TASK: TaskInput = {
  name: "",
  importance: "Medium",
  dueDate: null,
  completedAt: null,
  timeRequired: "~1 hr",
  recurrence: "none",
  recurrenceWeekday: null,
  recurrenceMonthDay: null,
  projectId: null,
};

export const toInput = taskToInput;

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
