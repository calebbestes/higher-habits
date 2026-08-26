import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
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

  useEffect(() => {
    if (type === "goals" || type === "tasks" || type === "habits") {
      setCreateSection(type);
    }
  }, [type]);

  return (
    <View style={styles.pageStack}>
      <View style={styles.page}>
        {activeSection === "habits" ? <DailyGoalsScreen /> : null}
        {activeSection === "goals" ? <GoalsScreen /> : null}
        {activeSection === "tasks" ? <TasksScreen /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  pageStack: { flex: 1 },
});
