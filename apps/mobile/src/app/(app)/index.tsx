import { useLocalSearchParams } from "expo-router";

import { FeedScreen } from "@/components/feed-screen";
import { FriendsScreen } from "@/components/friends-screen";
import { IncentivesScreen } from "@/components/incentives-screen";
import { SharedGoalsScreen } from "@/components/shared-goals-screen";
import { isCollabSection, useCollabSection } from "@/lib/tab-view-store";

export default function CollabScreen() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  // Fall back to the remembered section so returning to this tab restores it.
  const rememberedSection = useCollabSection();
  const activeSection = isCollabSection(section) ? section : rememberedSection;

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
