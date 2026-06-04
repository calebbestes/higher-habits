export const dynamic = "force-dynamic";

import { MonthCalendar } from "@/components/portable-calendar";
import { requireUser } from "@/lib/auth";
import { getCalendarBootstrap } from "@/lib/calendar-bootstrap";
import type { CalendarBootstrapData } from "@/lib/calendar-bootstrap-types";
import { getMonthKey, toDateKey } from "@/lib/habit-state";

type CalendarPageProps = {
  searchParams?: Promise<{
    dashboard?: string | string[];
  }>;
};

export default async function CalendarPage({
  searchParams,
}: CalendarPageProps) {
  const user = await requireUser();
  const resolvedSearchParams = await searchParams;
  const dashboardParam = resolvedSearchParams?.dashboard;
  const initialDashboardOpen = Array.isArray(dashboardParam)
    ? dashboardParam.includes("1") || dashboardParam.includes("true")
    : dashboardParam === "1" || dashboardParam === "true";
  const now = new Date();
  const initialDate = toDateKey(now);

  let initialCalendarData: CalendarBootstrapData | null = null;

  try {
    initialCalendarData = await getCalendarBootstrap(getMonthKey(now), user.id);
  } catch {
    initialCalendarData = null;
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col overflow-hidden px-4 py-3">
      <div className="min-h-0 flex-1 overflow-hidden">
        <MonthCalendar
          initialDate={initialDate}
          initialCalendarData={initialCalendarData}
          initialDashboardOpen={initialDashboardOpen}
        />
      </div>
    </div>
  );
}
