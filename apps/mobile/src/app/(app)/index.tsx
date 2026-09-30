import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { FeedScreen } from "@/components/feed-screen";
import { IncentivesScreen } from "@/components/incentives-screen";
import { SharedGoalsScreen } from "@/components/shared-goals-screen";
import { setCollabSection, useCollabSection } from "@/lib/tab-view-store";

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
  const [mountedSections, setMountedSections] = useState<string[]>([
    activeSection,
  ]);

  useEffect(() => {
    setMountedSections((current) =>
      current.includes(activeSection) ? current : [...current, activeSection],
    );
  }, [activeSection]);

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
        {mountedSections.includes("feed") ? (
          <View
            style={[
              styles.screen,
              activeSection !== "feed" && styles.hiddenScreen,
            ]}
          >
            <FeedScreen />
          </View>
        ) : null}
        {mountedSections.includes("incentives") ? (
          <View
            style={[
              styles.screen,
              activeSection !== "incentives" && styles.hiddenScreen,
            ]}
          >
            <IncentivesScreen />
          </View>
        ) : null}
        {mountedSections.includes("shared-goals") ? (
          <View
            style={[
              styles.screen,
              activeSection !== "shared-goals" && styles.hiddenScreen,
            ]}
          >
            <SharedGoalsScreen />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageStack: { flex: 1 },
  screen: { flex: 1 },
  hiddenScreen: { display: "none" },
});
