export const dynamic = "force-dynamic";

import { Dashboard } from "@/components/portable-calendar";
import { requireUser } from "@/lib/auth";
import { getCalendarBootstrap } from "@/lib/calendar-bootstrap";
import type { CalendarBootstrapData } from "@/lib/calendar-bootstrap-types";
import { getMonthKey, toDateKey } from "@/lib/habit-state";

export default async function DashboardPage() {
  const user = await requireUser();
  const now = new Date();
  const initialDate = toDateKey(now);

  let initialCalendarData: CalendarBootstrapData | null = null;

  try {
    initialCalendarData = await getCalendarBootstrap(getMonthKey(now), user.id);
  } catch {
    initialCalendarData = null;
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[1000px] flex-col overflow-hidden px-4 py-3">
      <Dashboard
        initialDate={initialDate}
        initialCalendarData={initialCalendarData}
      />
    </div>
  );
}
