import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect } from "react";

import { DashboardScreen } from "@/components/dashboard-screen";
import { FriendProfileScreen } from "@/components/friend-profile-screen";
import { JournalScreen } from "@/components/journal-screen";
import { SwipePageTransition } from "@/components/swipe-page-transition";
import {
  type HistorySection,
  setHistorySection,
  useHistorySection,
} from "@/lib/tab-view-store";

const HISTORY_ORDER: readonly HistorySection[] = [
  "dashboard",
  "journal",
  "profile",
];
const HISTORY_HREFS = {
  dashboard: "/history?section=dashboard",
  journal: "/history?section=journal",
  profile: "/history?section=profile",
} as const satisfies Record<HistorySection, string>;

export default function HistoryRoute() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const rememberedSection = useHistorySection();
  const activeSection: HistorySection = isHistorySection(section)
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
    if (isHistorySection(section)) {
      setHistorySection(section);
    }
  }, [section]);

  let content = <DashboardScreen />;
  if (activeSection === "journal") {
    content = <JournalScreen />;
  } else if (activeSection === "profile") {
    content = <FriendProfileScreen self showHistoryHeader />;
  }

  return (
    <SwipePageTransition
      activeKey={activeSection}
      orderedKeys={HISTORY_ORDER}
      onChange={changeSection}
    >
      {content}
    </SwipePageTransition>
  );
}

function isHistorySection(
  section: string | undefined,
): section is HistorySection {
  return (
    section === "dashboard" || section === "journal" || section === "profile"
  );
}
