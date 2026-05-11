export const dynamic = "force-dynamic";

import { TasksTableClient } from "@/components/tasks-table-client";
import { requireUser } from "@/lib/auth";

export default async function TasksPage() {
  await requireUser();
  return <TasksTableClient />;
}
