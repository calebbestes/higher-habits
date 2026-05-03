import { getCalendarBootstrap } from "@/lib/calendar-bootstrap";
import type { CalendarBootstrapData } from "@/lib/calendar-bootstrap-types";
import { getMonthKey, toDateKey } from "@/lib/habit-state";
import { MonthCalendar } from "@/components/portable-calendar";

export default async function CalendarPage() {
  const now = new Date();
  const initialDate = toDateKey(now);

  let initialCalendarData: CalendarBootstrapData | null = null;

  try {
    initialCalendarData = await getCalendarBootstrap(getMonthKey(now));
  } catch {
    initialCalendarData = null;
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col overflow-hidden px-4 py-3">
      <div className="min-h-0 flex-1 overflow-hidden">
        <MonthCalendar
          initialDate={initialDate}
          initialCalendarData={initialCalendarData}
        />
      </div>
    </div>
  );
}
