import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect } from "react";
import { StyleSheet, View } from "react-native";

import { DailyGoalsScreen } from "@/components/daily-goals-screen";
import { GoalsScreen } from "@/components/goals-screen";
import { SwipePageTransition } from "@/components/swipe-page-transition";
import { TasksScreen } from "@/components/tasks-screen";
import {
  type CreateSection,
  setCreateSection,
  useCreateSection,
} from "@/lib/tab-view-store";

const CREATE_ORDER: readonly CreateSection[] = ["habits", "goals", "tasks"];
const CREATE_HREFS = {
  habits: "/add?type=habits",
  goals: "/add?type=goals",
  tasks: "/add?type=tasks",
} as const satisfies Record<CreateSection, string>;

export default function AddScreen() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const rememberedSection = useCreateSection();
  const activeSection: CreateSection =
    type === "goals" || type === "tasks" || type === "habits"
      ? type
      : rememberedSection;

  const changeSection = useCallback(
    (nextSection: CreateSection) => {
      setCreateSection(nextSection);
      router.replace(CREATE_HREFS[nextSection] as Href);
    },
    [router],
  );

  useEffect(() => {
    if (type === "goals" || type === "tasks" || type === "habits") {
      setCreateSection(type);
    }
  }, [type]);

  return (
    <SwipePageTransition
      activeKey={activeSection}
      orderedKeys={CREATE_ORDER}
      onChange={changeSection}
    >
      <View style={styles.pageStack}>
        <View
          style={[
            styles.page,
            activeSection !== "habits" && styles.inactivePage,
          ]}
        >
          <DailyGoalsScreen />
        </View>
        <View
          style={[
            styles.page,
            activeSection !== "goals" && styles.inactivePage,
          ]}
        >
          <GoalsScreen />
        </View>
        <View
          style={[
            styles.page,
            activeSection !== "tasks" && styles.inactivePage,
          ]}
        >
          <TasksScreen />
        </View>
      </View>
    </SwipePageTransition>
  );
}

const styles = StyleSheet.create({
  inactivePage: { display: "none" },
  page: { flex: 1 },
  pageStack: { flex: 1 },
});
