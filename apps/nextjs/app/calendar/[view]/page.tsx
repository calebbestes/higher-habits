export const dynamic = "force-dynamic";

import { MonthCalendar } from "@/components/portable-calendar";
import { TopTasksPage } from "@/components/top-tasks-page";
import { requireUser } from "@/lib/auth";
import { getCalendarBootstrap } from "@/lib/calendar-bootstrap";
import type { CalendarBootstrapData } from "@/lib/calendar-bootstrap-types";
import { getMonthKey, toDateKey } from "@/lib/habit-state";
import { notFound } from "next/navigation";

const CALENDAR_VIEWS = ["day", "week", "month", "top-tasks"] as const;
type CalendarView = (typeof CALENDAR_VIEWS)[number];

type CalendarViewPageProps = {
  params: Promise<{
    view: string;
  }>;
};

function isCalendarView(view: string): view is CalendarView {
  return CALENDAR_VIEWS.includes(view as CalendarView);
}

export default async function CalendarViewPage({
  params,
}: CalendarViewPageProps) {
  const { view } = await params;

  if (!isCalendarView(view)) {
    notFound();
  }

  const user = await requireUser();

  if (view === "top-tasks") {
    return <TopTasksPage />;
  }

  const now = new Date();
  const initialDate = toDateKey(now);

  let initialCalendarData: CalendarBootstrapData | null = null;

  try {
    initialCalendarData = await getCalendarBootstrap(getMonthKey(now), user.id);
  } catch {
    initialCalendarData = null;
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col overflow-hidden p-1 sm:px-4 sm:py-3">
      <div className="min-h-0 flex-1 overflow-hidden">
        <MonthCalendar
          initialDate={initialDate}
          initialCalendarData={initialCalendarData}
          initialView={view}
        />
      </div>
    </div>
  );
}
