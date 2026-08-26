import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { DashboardScreen } from "@/components/dashboard-screen";
import { FriendProfileScreen } from "@/components/friend-profile-screen";
import { JournalScreen } from "@/components/journal-screen";
import {
  type HistorySection,
  setHistorySection,
  useHistorySection,
} from "@/lib/tab-view-store";

export default function HistoryRoute() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const rememberedSection = useHistorySection();
  const activeSection: HistorySection = isHistorySection(section)
    ? section
    : rememberedSection;

  useEffect(() => {
    if (isHistorySection(section)) {
      setHistorySection(section);
    }
  }, [section]);

  return (
    <View style={styles.pageStack}>
      <View style={styles.page}>
        {activeSection === "dashboard" ? <DashboardScreen /> : null}
        {activeSection === "journal" ? <JournalScreen /> : null}
        {activeSection === "profile" ? (
          <FriendProfileScreen self showHistoryHeader />
        ) : null}
      </View>
    </View>
  );
}

function isHistorySection(
  section: string | undefined,
): section is HistorySection {
  return (
    section === "dashboard" || section === "journal" || section === "profile"
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageStack: { flex: 1 },
});
