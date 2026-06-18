import type { SymbolViewProps } from "expo-symbols";

import type { Task, TaskInput } from "@/lib/tasks-client";

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
  projectId: null,
};

export function toInput(task: Task): TaskInput {
  return {
    name: task.name,
    importance: task.importance,
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    timeRequired: task.timeRequired,
    projectId: task.projectId,
  };
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
