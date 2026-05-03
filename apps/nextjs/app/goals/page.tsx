import { GoalsTable } from "@/components/goals-table";
import { requireUser } from "@/lib/auth";

export default async function GoalsPage() {
  await requireUser();
  return <GoalsTable />;
}
