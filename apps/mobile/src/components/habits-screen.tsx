import { ComponentErrorBoundary } from "@/components/component-error-boundary";
import { DailyGoalsScreen } from "@/components/daily-goals-screen";
import { MonthlyGoalsScreen } from "@/components/monthly-goals-screen";
import {
  type HabitsTab,
  setHabitsTab,
  useHabitsTab,
} from "@/lib/tab-view-store";

/**
 * Combines daily and monthly goals into one "Habits" page with a Daily/Monthly
 * tab switcher. The selected tab persists (via the tab-view store) while the
 * app is open. Each sub-screen renders the shared HabitsTabs control in its
 * own header so the date/month navigation stays intact.
 */
export function HabitsScreen({
  initialDateKey,
  initialTab,
}: {
  initialDateKey?: string;
  initialTab?: HabitsTab;
}) {
  const rememberedTab = useHabitsTab();
  const tab = initialTab ?? rememberedTab;

  if (tab === "monthly") {
    return (
      <ComponentErrorBoundary name="MonthlyGoalsScreen">
        <MonthlyGoalsScreen habitsTab={tab} onHabitsTabChange={setHabitsTab} />
      </ComponentErrorBoundary>
    );
  }

  return (
    <ComponentErrorBoundary name="DailyGoalsScreen">
      <DailyGoalsScreen
        initialDateKey={initialDateKey}
        habitsTab={tab}
        onHabitsTabChange={setHabitsTab}
      />
    </ComponentErrorBoundary>
  );
}
