import { ComponentErrorBoundary } from "@/components/component-error-boundary";
import { DailyGoalsScreen } from "@/components/daily-goals-screen";

/**
 * Legacy Habits wrapper. Periodic habits now live under the Plan tab's monthly
 * plan page, so this route always shows the daily habit progress screen.
 */
export function HabitsScreen({
  initialDateKey,
  onDateChange,
}: {
  initialDateKey?: string;
  onDateChange?: (dateKey: string) => void;
}) {
  return (
    <ComponentErrorBoundary name="DailyGoalsScreen">
      <DailyGoalsScreen
        initialDateKey={initialDateKey}
        onDateChange={onDateChange}
      />
    </ComponentErrorBoundary>
  );
}
