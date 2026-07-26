import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import type { ReactNode } from "react";
import { useCallback } from "react";

import type { CreateSection } from "@/components/create-header-menu";
import { GoalsScreen } from "@/components/goals-screen";
import { HabitsManagerScreen } from "@/components/habits-manager-screen";
import { SwipePageTransition } from "@/components/swipe-page-transition";
import { TasksScreen } from "@/components/tasks-screen";

const CREATE_ORDER: readonly CreateSection[] = ["habits", "goals", "tasks"];
const CREATE_HREFS = {
  habits: "/add?type=habits",
  goals: "/add?type=goals",
  tasks: "/add?type=tasks",
} as const satisfies Record<CreateSection, string>;

export default function AddScreen() {
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const activeSection: CreateSection =
    type === "goals" || type === "tasks" ? type : "habits";

  const changeSection = useCallback(
    (nextSection: CreateSection) => {
      router.replace(CREATE_HREFS[nextSection] as Href);
    },
    [router],
  );

  let content: ReactNode;
  if (activeSection === "goals") {
    content = <GoalsScreen />;
  } else if (activeSection === "tasks") {
    content = <TasksScreen />;
  } else {
    content = <HabitsManagerScreen />;
  }

  return (
    <SwipePageTransition
      activeKey={activeSection}
      orderedKeys={CREATE_ORDER}
      onChange={changeSection}
    >
      {content}
    </SwipePageTransition>
  );
}
