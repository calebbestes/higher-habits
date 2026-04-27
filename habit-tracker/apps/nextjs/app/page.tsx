import { MonthCalendar } from "@/components/portable-calendar";

export default function HomePage() {
  return (
    <main className="mx-auto flex h-dvh w-full max-w-[1400px] flex-col overflow-hidden px-4 py-3">
      <div className="flex-1 min-h-0 overflow-y-auto">
        <MonthCalendar />
      </div>
    </main>
  );
}
