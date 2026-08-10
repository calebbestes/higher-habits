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

  return (
    <View style={styles.pageStack}>
      <View
        style={[styles.page, activeSection !== "feed" && styles.inactivePage]}
      >
        <FeedScreen />
      </View>
      <View
        style={[
          styles.page,
          activeSection !== "incentives" && styles.inactivePage,
        ]}
      >
        <IncentivesScreen />
      </View>
      <View
        style={[
          styles.page,
          activeSection !== "shared-goals" && styles.inactivePage,
        ]}
      >
        <SharedGoalsScreen />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inactivePage: { display: "none" },
  page: { flex: 1 },
  pageStack: { flex: 1 },
});
