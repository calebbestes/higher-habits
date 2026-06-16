import { useLocalSearchParams } from "expo-router";

import { CollabHeaderMenu } from "@/components/collab-header-menu";
import { FeedScreen } from "@/components/feed-screen";
import { FriendsScreen } from "@/components/friends-screen";
import { IncentivesScreen } from "@/components/incentives-screen";
import { SharedGoalsScreen } from "@/components/shared-goals-screen";
import { TabPlaceholderScreen } from "@/components/tab-placeholder-screen";

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

  if (section === "messages") {
    return (
      <TabPlaceholderScreen
        title="Messages"
        description="Message friends about goals and progress."
        icon={{ ios: "message.fill", android: "message", web: "message" }}
        headerAction={<CollabHeaderMenu currentSection="messages" />}
      />
    );
  }

  if (section === "friends") {
    return <FriendsScreen />;
  }

  return <FeedScreen />;
}
