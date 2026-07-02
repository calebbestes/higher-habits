import type { SymbolViewProps } from "expo-symbols";
import { StyleSheet } from "react-native";

import { MaxContentWidth } from "@/constants/theme";
import type { GoalInCategory, PeriodicGoalInfo } from "@/lib/goal-logs-client";

export type SymbolName = SymbolViewProps["name"];
export type ActionGoal = GoalInCategory | PeriodicGoalInfo;

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

export const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 18,
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
  pageHeaderText: { flex: 1, gap: 1, paddingRight: 54 },
  addButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  headerAddButton: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
  },
  pageTitle: {
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  pageSubtitle: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 6,
    minHeight: 56,
  },
  navArrow: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  dateLabel: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  dateLabelText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
  },
  todayBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  todayBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
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
  todayButtonText: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
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
  emptyTitle: { fontSize: 18, lineHeight: 23, fontWeight: "800" },
  emptyDescription: {
    maxWidth: 280,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
  },
  categories: { gap: 22 },
  prioritySections: { gap: 6 },
  priorityBlock: { gap: 8 },
  priorityHeader: {
    gap: 7,
    paddingHorizontal: 3,
    paddingVertical: 4,
  },
  priorityHeaderLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  priorityLabel: {
    flex: 1,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  priorityProgressCount: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  sectionProgressTrack: {
    height: 5,
    borderRadius: 999,
    overflow: "hidden",
    marginLeft: 20,
  },
  sectionProgressFill: {
    height: "100%",
    borderRadius: 999,
  },
  priorityContent: { gap: 8 },
  catAccordion: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    overflow: "hidden",
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 68,
  },
  catIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  catRowText: { flex: 1, gap: 2 },
  catName: { fontSize: 16, lineHeight: 20, fontWeight: "700" },
  catCount: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
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
    borderRadius: 20,
    overflow: "hidden",
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 13,
    minHeight: 64,
  },
  planTimeBadge: {
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  planTimeBadgeTime: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  planTimeBadgePeriod: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "800",
    textAlign: "center",
  },
  goalIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  goalName: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  sharedFriendBadgeStack: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 2,
  },
  sharedFriendBadge: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2,
    borderRadius: 13,
  },
  sharedFriendBadgeImage: {
    width: "100%",
    height: "100%",
  },
  sharedFriendBadgeText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
  },
  completedText: { textDecorationLine: "line-through" },
  goalMenuButton: {
    width: 30,
    height: 30,
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
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    gap: 10,
    padding: 16,
    paddingBottom: 32,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 16,
    minHeight: 64,
  },
  actionText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600",
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
    borderRadius: 16,
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
  planTimeInput: {
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
    paddingHorizontal: 12,
    fontSize: 15,
    fontWeight: "700",
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
    gap: 6,
  },
  photoBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 18,
    borderRadius: 16,
  },
  disabled: { opacity: 0.55 },
});
