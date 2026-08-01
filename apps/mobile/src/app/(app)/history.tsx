import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect } from "react";

import { DashboardScreen } from "@/components/dashboard-screen";
import { JournalScreen } from "@/components/journal-screen";
import { SwipePageTransition } from "@/components/swipe-page-transition";
import {
  type HistorySection,
  setHistorySection,
  useHistorySection,
} from "@/lib/tab-view-store";

const HISTORY_ORDER: readonly HistorySection[] = ["dashboard", "journal"];
const HISTORY_HREFS = {
  dashboard: "/history?section=dashboard",
  journal: "/history?section=journal",
} as const satisfies Record<HistorySection, string>;

export default function HistoryRoute() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const rememberedSection = useHistorySection();
  const activeSection: HistorySection =
    section === "journal" || section === "dashboard"
      ? section
      : rememberedSection;

  const changeSection = useCallback(
    (nextSection: HistorySection) => {
      setHistorySection(nextSection);
      router.replace(HISTORY_HREFS[nextSection] as Href);
    },
    [router],
  );

  useEffect(() => {
    if (section === "journal" || section === "dashboard") {
      setHistorySection(section);
    }
  }, [section]);

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
