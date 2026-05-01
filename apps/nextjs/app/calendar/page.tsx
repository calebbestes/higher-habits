import { MonthCalendar } from "@/components/portable-calendar";

export default function CalendarPage() {
  return (
    <div className="mx-auto flex h-full w-full max-w-[1400px] flex-col overflow-hidden px-4 py-3">
      <div className="min-h-0 flex-1 overflow-hidden">
        <MonthCalendar />
      </div>
    </div>
  );
}
