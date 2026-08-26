import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { FeedScreen } from "@/components/feed-screen";
import { IncentivesScreen } from "@/components/incentives-screen";
import { SharedGoalsScreen } from "@/components/shared-goals-screen";
import {
  type CollabSection,
  setCollabSection,
  useCollabSection,
} from "@/lib/tab-view-store";

export default function CollabScreen() {
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const rememberedSection = useCollabSection();
  const activeSection =
    section === "feed" || section === "incentives" || section === "shared-goals"
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
  }, [router, section]);

  return (
    <View style={styles.pageStack}>
      <View style={styles.page}>
        {activeSection === "feed" ? <FeedScreen /> : null}
        {activeSection === "incentives" ? <IncentivesScreen /> : null}
        {activeSection === "shared-goals" ? <SharedGoalsScreen /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageStack: { flex: 1 },
});
