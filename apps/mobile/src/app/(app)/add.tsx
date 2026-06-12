import { useLocalSearchParams } from "expo-router";

import { GoalsScreen } from "@/components/goals-screen";
import { TabPlaceholderScreen } from "@/components/tab-placeholder-screen";
import { TasksScreen } from "@/components/tasks-screen";

export default function AddScreen() {
  const { type } = useLocalSearchParams<{ type?: string }>();

  if (type === "goals") {
    return <GoalsScreen />;
  }

  if (type === "tasks") {
    return <TasksScreen />;
  }

  return (
    <TabPlaceholderScreen
      title="Add"
      description="Create a goal, task, journal entry, or collaboration."
      icon={{ ios: "plus", android: "add", web: "add" }}
    />
  );
}
