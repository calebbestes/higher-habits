import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";

import { FeedScreen } from "@/components/feed-screen";
import { FriendsScreen } from "@/components/friends-screen";
import { IncentivesScreen } from "@/components/incentives-screen";
import { SharedGoalsScreen } from "@/components/shared-goals-screen";
import {
  isCollabSection,
  setCollabSection,
  useDefaultCollabSection,
} from "@/lib/tab-view-store";

export default function CollabScreen() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const defaultSection = useDefaultCollabSection();
  const activeSection = isCollabSection(section) ? section : defaultSection;

  useEffect(() => {
    setCollabSection(activeSection);
  }, [activeSection]);

  if (activeSection === "shared-goals") {
    return <SharedGoalsScreen />;
  }

  if (activeSection === "incentives") {
    return <IncentivesScreen />;
  }

  if (activeSection === "friends") {
    return <FriendsScreen />;
  }

  return <FeedScreen />;
}
