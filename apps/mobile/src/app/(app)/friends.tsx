import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect } from "react";

import { FeedScreen } from "@/components/feed-screen";
import { FriendsScreen } from "@/components/friends-screen";
import { SwipePageTransition } from "@/components/swipe-page-transition";
import {
  COLLAB_SECTION_HREFS,
  type CollabSection,
  setCollabSection,
} from "@/lib/tab-view-store";

const FRIENDS_ORDER: readonly CollabSection[] = ["feed", "friends"];

export default function FriendsRoute() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const activeSection = section === "friends" ? "friends" : "feed";

  useEffect(() => {
    setCollabSection(activeSection);
  }, [activeSection]);

  const changeSection = useCallback(
    (nextSection: CollabSection) => {
      if (nextSection !== "feed" && nextSection !== "friends") return;
      setCollabSection(nextSection);
      router.replace(COLLAB_SECTION_HREFS[nextSection] as Href);
    },
    [router],
  );

  return (
    <SwipePageTransition
      activeKey={activeSection}
      orderedKeys={FRIENDS_ORDER}
      onChange={changeSection}
    >
      {activeSection === "friends" ? <FriendsScreen /> : <FeedScreen />}
    </SwipePageTransition>
  );
}
