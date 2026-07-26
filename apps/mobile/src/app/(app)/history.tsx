import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback } from "react";

import { DashboardScreen } from "@/components/dashboard-screen";
import { JournalScreen } from "@/components/journal-screen";
import { SwipePageTransition } from "@/components/swipe-page-transition";

type HistorySection = "dashboard" | "journal";

const HISTORY_ORDER: readonly HistorySection[] = ["dashboard", "journal"];
const HISTORY_HREFS = {
  dashboard: "/history?section=dashboard",
  journal: "/history?section=journal",
} as const satisfies Record<HistorySection, string>;

export default function HistoryRoute() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const activeSection: HistorySection =
    section === "journal" ? "journal" : "dashboard";

  const changeSection = useCallback(
    (nextSection: HistorySection) => {
      router.replace(HISTORY_HREFS[nextSection] as Href);
    },
    [router],
  );

  return (
    <SwipePageTransition
      activeKey={activeSection}
      orderedKeys={HISTORY_ORDER}
      onChange={changeSection}
    >
      {activeSection === "journal" ? <JournalScreen /> : <DashboardScreen />}
    </SwipePageTransition>
  );
}
