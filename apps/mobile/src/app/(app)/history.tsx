import { useLocalSearchParams } from "expo-router";

import { DashboardScreen } from "@/components/dashboard-screen";
import { JournalScreen } from "@/components/journal-screen";

export default function HistoryRoute() {
  const { section } = useLocalSearchParams<{ section?: string }>();

  if (section === "journal") {
    return <JournalScreen />;
  }

  return <DashboardScreen />;
}
