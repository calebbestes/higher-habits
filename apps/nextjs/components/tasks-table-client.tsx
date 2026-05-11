"use client";

import dynamic from "next/dynamic";

export const TasksTableClient = dynamic(
  () => import("@/components/tasks-table").then((m) => m.TasksTable),
  { ssr: false },
);
