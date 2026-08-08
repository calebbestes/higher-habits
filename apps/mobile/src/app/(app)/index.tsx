import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback, useEffect } from "react";

import { FeedScreen } from "@/components/feed-screen";
import { IncentivesScreen } from "@/components/incentives-screen";
import { SharedGoalsScreen } from "@/components/shared-goals-screen";
import { SwipePageTransition } from "@/components/swipe-page-transition";
import {
  COLLAB_SECTION_HREFS,
  type CollabSection,
  setCollabSection,
  useCollabSection,
} from "@/lib/tab-view-store";

const COLLAB_ORDER: readonly CollabSection[] = [
  "feed",
  "incentives",
  "shared-goals",
];

export default function CollabScreen() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const rememberedSection = useCollabSection();
  const activeSection =
    section === "feed" ||
    section === "incentives" ||
    section === "shared-goals"
      ? section
      : rememberedSection === "friends"
        ? "feed"
        : rememberedSection;

  useEffect(() => {
    if (section === "friends") {
      router.replace("/friends");
      return;
    }

    if (
      section === "feed" ||
      section === "incentives" ||
      section === "shared-goals"
    ) {
      setCollabSection(section);
    }
  }, [section]);

  const changeSection = useCallback(
    (nextSection: CollabSection) => {
      setCollabSection(nextSection);
      router.replace(COLLAB_SECTION_HREFS[nextSection] as Href);
    },
    [router],
  );

  let content: ReactNode;

  if (activeSection === "feed") {
    content = <FeedScreen />;
  } else if (activeSection === "shared-goals") {
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
