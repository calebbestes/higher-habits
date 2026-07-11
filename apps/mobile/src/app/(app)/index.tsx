import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";

import { IncentivesScreen } from "@/components/incentives-screen";
import { SharedGoalsScreen } from "@/components/shared-goals-screen";
import {
  setCollabSection,
  useDefaultCollabSection,
} from "@/lib/tab-view-store";

export default function CollabScreen() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const defaultSection = useDefaultCollabSection();
  const activeSection =
    section === "incentives" || section === "shared-goals"
      ? section
      : defaultSection === "incentives"
        ? defaultSection
        : "shared-goals";

  useEffect(() => {
    setCollabSection(activeSection);
  }, [activeSection]);

  if (activeSection === "shared-goals") {
    return <SharedGoalsScreen />;
  }

  if (activeSection === "incentives") {
    return <IncentivesScreen />;
  }

  return <SharedGoalsScreen />;
}
