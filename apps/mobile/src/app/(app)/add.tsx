import { useLocalSearchParams } from "expo-router";

import { HabitsManagerScreen } from "@/components/habits-manager-screen";
import { TabPlaceholderScreen } from "@/components/tab-placeholder-screen";
import { TasksScreen } from "@/components/tasks-screen";

export default function AddScreen() {
  const { type } = useLocalSearchParams<{ type?: string }>();

  if (type === "habits" || type === "goals") {
    return <HabitsManagerScreen />;
  }

  if (type === "tasks") {
    return <TasksScreen />;
  }

  return (
    <TabPlaceholderScreen
      title="Add"
      description="Create a habit, task, journal entry, or collaboration."
      icon={{ ios: "plus", android: "add", web: "add" }}
    />
  );
}
