import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { DailyGoalsScreen } from "@/components/daily-goals-screen";
import { GoalsScreen } from "@/components/goals-screen";
import { TasksScreen } from "@/components/tasks-screen";
import {
  type CreateSection,
  setCreateSection,
  useCreateSection,
} from "@/lib/tab-view-store";

export default function AddScreen() {
  const { type } = useLocalSearchParams<{ type?: string }>();
  const rememberedSection = useCreateSection();
  const activeSection: CreateSection =
    type === "goals" || type === "tasks" || type === "habits"
      ? type
      : rememberedSection;
  const [mountedSections, setMountedSections] = useState<CreateSection[]>([
    activeSection,
  ]);

  useEffect(() => {
    setMountedSections((current) =>
      current.includes(activeSection) ? current : [...current, activeSection],
    );
  }, [activeSection]);

  useEffect(() => {
    if (type === "goals" || type === "tasks" || type === "habits") {
      setCreateSection(type);
    }
  }, [type]);

  return (
    <View style={styles.pageStack}>
      <View style={styles.page}>
        {mountedSections.includes("habits") ? (
          <View
            style={[
              styles.screen,
              activeSection !== "habits" && styles.hiddenScreen,
            ]}
          >
            <DailyGoalsScreen />
          </View>
        ) : null}
        {mountedSections.includes("goals") ? (
          <View
            style={[
              styles.screen,
              activeSection !== "goals" && styles.hiddenScreen,
            ]}
          >
            <GoalsScreen />
          </View>
        ) : null}
        {mountedSections.includes("tasks") ? (
          <View
            style={[
              styles.screen,
              activeSection !== "tasks" && styles.hiddenScreen,
            ]}
          >
            <TasksScreen />
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
