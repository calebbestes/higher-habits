import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";

import { FeedScreen } from "@/components/feed-screen";
import { FriendsScreen } from "@/components/friends-screen";
import { setCollabSection } from "@/lib/tab-view-store";

export default function FriendsRoute() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const activeSection = section === "friends" ? "friends" : "feed";

  useEffect(() => {
    setCollabSection(activeSection);
  }, [activeSection]);

  if (activeSection === "friends") {
    return <FriendsScreen />;
  }

  return <FeedScreen />;
}
