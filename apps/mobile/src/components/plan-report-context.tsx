import {
  type PropsWithChildren,
  type ReactNode,
  createContext,
  useContext,
} from "react";
import { StyleSheet, View } from "react-native";

import type { PlanReportView } from "@/lib/tab-view-store";

export type ActivePlanReportView = Extract<
  PlanReportView,
  "day-plan" | "weekly-plan" | "monthly-plan"
>;

type PlanReportContextValue = {
  activeDateKey?: string;
  activeView: ActivePlanReportView;
  onDateChange: (dateKey: string) => void;
};

const PlanReportContext = createContext<PlanReportContextValue | null>(null);

export function PlanReportProvider({
  activeDateKey,
  activeView,
  children,
  onDateChange,
}: PropsWithChildren<PlanReportContextValue>) {
  return (
    <PlanReportContext.Provider
      value={{ activeDateKey, activeView, onDateChange }}
    >
      {children}
    </PlanReportContext.Provider>
  );
}

export function PlanReportViewSlot({
  children,
  view,
}: {
  children: ReactNode;
  view: ActivePlanReportView;
}) {
  const context = usePlanReportContext();

  return (
    <View
      style={[styles.slot, context.activeView !== view && styles.hiddenSlot]}
    >
      {children}
    </View>
  );
}

export function usePlanReportContext(): PlanReportContextValue {
  const context = useContext(PlanReportContext);
  if (!context) {
    throw new Error(
      "usePlanReportContext must be used within PlanReportProvider",
    );
  }
  return context;
}

const styles = StyleSheet.create({
  hiddenSlot: { display: "none" },
  slot: { flex: 1 },
});
