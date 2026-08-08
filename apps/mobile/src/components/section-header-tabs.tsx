import { type Href, useRouter } from "expo-router";
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/hooks/use-theme";
import {
  COLLAB_SECTION_HREFS,
  type CollabSection,
  type CreateSection,
  PLAN_REPORT_VIEW_HREFS,
  type PlanReportView,
  setCollabSection,
  setCreateSection,
  setPlanReportView,
} from "@/lib/tab-view-store";

const CREATE_HREFS = {
  habits: "/add?type=habits",
  goals: "/add?type=goals",
  tasks: "/add?type=tasks",
} as const satisfies Record<CreateSection, string>;

const CREATE_SECTIONS: Array<{ key: CreateSection; label: string }> = [
  { key: "habits", label: "Habits" },
  { key: "goals", label: "Goals" },
  { key: "tasks", label: "Tasks" },
];

const PLAN_VIEWS: Array<{
  key: Extract<PlanReportView, "day-plan" | "weekly-plan" | "monthly-plan">;
  label: string;
}> = [
  { key: "day-plan", label: "Daily" },
  { key: "weekly-plan", label: "Weekly" },
  { key: "monthly-plan", label: "Monthly" },
];

const COLLAB_SECTIONS: Array<{
  key: Exclude<CollabSection, "friends">;
  label: string;
}> = [
  { key: "feed", label: "Feed" },
  { key: "incentives", label: "Incentives" },
  { key: "shared-goals", label: "Shared goals" },
];

export function PageHeaderTitle({ title }: { title: string }) {
  const theme = useTheme();

  return <Text style={[styles.pageTitle, { color: theme.text }]}>{title}</Text>;
}

export function CreateSectionHeaderTabs({
  currentSection,
  style,
}: {
  currentSection: CreateSection;
  style?: ViewStyle;
}) {
  const router = useRouter();

  return (
    <SectionHeaderTabs
      activeKey={currentSection}
      options={CREATE_SECTIONS}
      onChange={(section) => {
        setCreateSection(section);
        router.replace(CREATE_HREFS[section] as Href);
      }}
      style={style}
    />
  );
}

export function PlanSectionHeaderTabs({
  currentView,
  style,
}: {
  currentView: Extract<
    PlanReportView,
    "day-plan" | "weekly-plan" | "monthly-plan"
  >;
  style?: ViewStyle;
}) {
  const router = useRouter();

  return (
    <SectionHeaderTabs
      activeKey={currentView}
      options={PLAN_VIEWS}
      onChange={(view) => {
        setPlanReportView(view);
        router.replace(PLAN_REPORT_VIEW_HREFS[view] as Href);
      }}
      style={style}
    />
  );
}

export function CollabSectionHeaderTabs({
  currentSection,
  style,
}: {
  currentSection: Exclude<CollabSection, "friends">;
  style?: ViewStyle;
}) {
  const router = useRouter();

  return (
    <SectionHeaderTabs
      activeKey={currentSection}
      options={COLLAB_SECTIONS}
      onChange={(section) => {
        setCollabSection(section);
        router.replace(COLLAB_SECTION_HREFS[section] as Href);
      }}
      style={style}
    />
  );
}

function SectionHeaderTabs<T extends string>({
  activeKey,
  onChange,
  options,
  style,
}: {
  activeKey: T;
  onChange: (key: T) => void;
  options: Array<{ key: T; label: string }>;
  style?: ViewStyle;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.sectionTabs, style]}>
      {options.map((option) => {
        const isActive = option.key === activeKey;

        return (
          <Pressable
            key={option.key}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(option.key)}
            style={({ pressed }) => [
              styles.sectionTab,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.sectionTabText,
                { color: isActive ? theme.text : theme.textSecondary },
              ]}
            >
              {option.label}
            </Text>
            <View
              style={[
                styles.sectionTabIndicator,
                { backgroundColor: isActive ? theme.primary : "transparent" },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  pageTitle: {
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "700",
  },
  sectionTabs: {
    flexDirection: "row",
    gap: 22,
    paddingTop: 2,
  },
  sectionTab: {
    gap: 6,
    borderRadius: 8,
    paddingVertical: 3,
  },
  sectionTabText: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "600",
  },
  sectionTabIndicator: {
    height: 2.5,
    borderRadius: 999,
  },
  pressed: {
    opacity: 0.72,
  },
});
