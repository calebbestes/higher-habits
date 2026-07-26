import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useEffect } from "react";

import { IncentivesScreen } from "@/components/incentives-screen";
import { SharedGoalsScreen } from "@/components/shared-goals-screen";
import { SwipePageTransition } from "@/components/swipe-page-transition";
import {
  COLLAB_SECTION_HREFS,
  type CollabSection,
  setCollabSection,
  useDefaultCollabSection,
} from "@/lib/tab-view-store";

const COLLAB_ORDER: readonly CollabSection[] = ["shared-goals", "incentives"];

export default function CollabScreen() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const defaultSection = useDefaultCollabSection();
  const activeSection =
    section === "incentives" || section === "shared-goals"
      ? section
      : defaultSection === "incentives"
        ? defaultSection
        : "shared-goals";

  useEffect(() => {
    setCollabSection(activeSection);
  }, [activeSection]);

  const changeSection = useCallback(
    (nextSection: CollabSection) => {
      if (nextSection !== "shared-goals" && nextSection !== "incentives") {
        return;
      }
      setCollabSection(nextSection);
      router.replace(COLLAB_SECTION_HREFS[nextSection] as Href);
    },
    [router],
  );

  let content: ReactNode;

  if (activeSection === "shared-goals") {
    content = <SharedGoalsScreen />;
  } else {
    content = <IncentivesScreen />;
  }

  return (
    <SwipePageTransition
      activeKey={activeSection}
      orderedKeys={COLLAB_ORDER}
      onChange={changeSection}
    >
      {content}
    </SwipePageTransition>
  );
}
