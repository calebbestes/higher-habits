import { useLocalSearchParams } from "expo-router";

import { FeedScreen } from "@/components/feed-screen";
import { FriendsScreen } from "@/components/friends-screen";
import { IncentivesScreen } from "@/components/incentives-screen";
import { SharedGoalsScreen } from "@/components/shared-goals-screen";

export default function CollabScreen() {
  const { section } = useLocalSearchParams<{ section?: string }>();

  if (!section || section === "feed") {
    return <FeedScreen />;
  }

  if (section === "shared-goals") {
    return <SharedGoalsScreen />;
  }

  if (section === "incentives") {
    return <IncentivesScreen />;
  }

  if (section === "friends") {
    return <FriendsScreen />;
  }

  return <FeedScreen />;
}
