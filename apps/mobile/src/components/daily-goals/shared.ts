import type { SymbolViewProps } from "expo-symbols";
import { StyleSheet } from "react-native";

import { MaxContentWidth } from "@/constants/theme";
import type { GoalInCategory, PeriodicGoalInfo } from "@/lib/goal-logs-client";

export type SymbolName = SymbolViewProps["name"];
export type ActionGoal = GoalInCategory | PeriodicGoalInfo;
export type GoalDateStatus = "complete" | "incomplete" | "planned" | undefined;

export type CategoryConfig = { color: string; symbol: SymbolName };

export function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  Spiritual: {
    color: "#2C5352",
    symbol: sym("hands.sparkles", "self_improvement"),
  },
  Physical: { color: "#9D7474", symbol: sym("dumbbell", "fitness_center") },
  Work: { color: "#516162", symbol: sym("briefcase", "work") },
  Social: { color: "#A0D5D5", symbol: sym("person.2", "groups") },
  "Hobbies/Social": { color: "#A0D5D5", symbol: sym("person.2", "groups") },
  "Financial/Career": {
    color: "#F3B7B9",
    symbol: sym("dollarsign.circle", "paid"),
  },
};

export const DEFAULT_CATEGORY_CONFIG: CategoryConfig = {
  color: "#516162",
  symbol: sym("target", "target"),
};

export function getCategoryConfig(name: string): CategoryConfig {
  return CATEGORY_CONFIG[name] ?? DEFAULT_CATEGORY_CONFIG;
}

export const PRIORITY_LABELS: Record<string, string> = {
  high: "High Priority",
  low: "Low Priority",
};

export const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function formatDate(date: Date): string {
  return `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

export function getGoalDateStatus(
  goal: ActionGoal,
  dateKey: string,
  logsByGoalDate: Record<string, "complete" | "incomplete" | "planned">,
): GoalDateStatus {
  const explicitStatus = logsByGoalDate[`${goal.id}_${dateKey}`];
  if (explicitStatus) return explicitStatus;
  return goal.defaultComplete ? "complete" : undefined;
}

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
    gap: 16,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    minHeight: 42,
    position: "relative",
  },
  pageHeaderIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  pageHeaderText: { flex: 1, minWidth: 0, gap: 1, paddingRight: 54 },
  addButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  headerAddButton: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
  },
  pageTitle: { fontSize: 34, lineHeight: 39, fontWeight: "700" },
  pageSubtitle: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 0,
    paddingVertical: 1,
    minHeight: 42,
  },
  navArrow: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    zIndex: 2,
    elevation: 2,
  },
  dateLabel: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    paddingHorizontal: 4,
  },
  dateLabelText: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
  },
  todayBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  todayBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
  },
  navRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  todayButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  todayButtonText: { fontSize: 15, lineHeight: 19, fontWeight: "600" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: "#F3B7B933",
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  errorText: {
    flex: 1,
    color: "#9D474D",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  retryText: { color: "#9D474D", fontSize: 12, fontWeight: "800" },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 64,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    marginBottom: 3,
  },
  emptyTitle: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  emptyDescription: {
    maxWidth: 280,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
  },
  categories: { gap: 22 },
  prioritySections: { gap: 10 },
  priorityBlock: { gap: 7 },
  priorityHeader: {
    gap: 5,
    paddingHorizontal: 2,
    paddingVertical: 2,
  },
  priorityHeaderLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  priorityLabel: {
    flex: 1,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
    letterSpacing: 0.4,
  },
  priorityProgressCount: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  sectionProgressTrack: {
    height: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  sectionProgressFill: {
    height: "100%",
    borderRadius: 999,
  },
  priorityContent: { gap: 10 },
  catAccordion: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: "hidden",
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    minHeight: 56,
  },
  catIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  catRowText: { flex: 1, gap: 2 },
  catName: { fontSize: 20, lineHeight: 25, fontWeight: "600" },
  catCount: { fontSize: 15, lineHeight: 20, fontWeight: "400" },
  catGoals: { borderTopWidth: StyleSheet.hairlineWidth },
  categorySection: { gap: 9 },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 3,
  },
  categoryName: { fontSize: 15, lineHeight: 20, fontWeight: "800" },
  categoryCount: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  goalSurface: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    overflow: "hidden",
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 68 },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 56,
  },
  goalRowMain: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingLeft: 10,
    paddingVertical: 8,
  },
  planTimeBadge: {
    minWidth: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  planTimeBadgeTime: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "600",
    textAlign: "center",
  },
  planTimeBadgePeriod: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "500",
    textAlign: "center",
  },
  goalIcon: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  goalStatusControl: {
    width: 21,
    height: 21,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
  },
  goalName: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
  },
  goalTextStack: { flex: 1, minWidth: 0, gap: 1 },
  goalVisibilityText: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "400",
    opacity: 0.72,
  },
  sharedFriendBadgeStack: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 2,
  },
  sharedFriendBadge: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2,
    borderRadius: 12,
  },
  sharedFriendBadgeImage: {
    width: "100%",
    height: "100%",
  },
  sharedFriendBadgeText: {
    fontSize: 9,
    lineHeight: 12,
    fontWeight: "600",
  },
  completedText: { textDecorationLine: "line-through" },
  goalMenuButton: {
    width: 38,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  pressed: { opacity: 0.72 },
});

export const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#00000055",
  },
  backdrop: {
    zIndex: 0,
  },
  sheet: {
    position: "relative",
    maxHeight: "90%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
    zIndex: 1,
    elevation: 24,
  },
  header: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    gap: 10,
    padding: 14,
    paddingBottom: 32,
  },
  actionGroup: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
  },
  actionDivider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 49,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 15,
    paddingVertical: 12,
    minHeight: 54,
  },
  standaloneActionRow: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
  },
  actionText: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  countStepper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  countButton: {
    width: 42,
    height: 38,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  countButtonText: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "800",
  },
  noteRowContent: {
    flex: 1,
    gap: 4,
  },
  notePreview: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "500",
  },
  planHint: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "500",
    paddingHorizontal: 4,
    marginTop: -4,
  },
  planTimeSection: {
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  planTimeSectionTitle: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
  },
  planTimeFields: {
    flexDirection: "row",
    gap: 10,
  },
  planTimeField: {
    flex: 1,
    minWidth: 0,
    gap: 6,
  },
  planTimeLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  planTimePickerRow: {
    flexDirection: "row",
    gap: 6,
  },
  planTimePickerMenu: {
    flex: 1,
    minWidth: 0,
  },
  planTimePicker: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
    paddingHorizontal: 9,
  },
  planTimePickerText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
  planPeriodToggle: {
    flexDirection: "row",
    gap: 6,
  },
  planPeriodOption: {
    flex: 1,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
  },
  planPeriodText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  planRepeatRow: {
    minHeight: 42,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 10,
  },
  planRepeatText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  photoRow: {
    flexDirection: "row",
    gap: 10,
  },
  photoBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 16,
    minHeight: 52,
  },
  photoBtnText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
  disabled: { opacity: 0.55 },
});
