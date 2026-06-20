import { type MenuAction, MenuView } from "@expo/ui/community/menu";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Platform, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/use-theme";
import { type PlanReportView, setPlanReportView } from "@/lib/tab-view-store";

const MENU_ITEMS: {
  id: PlanReportView;
  title: string;
  href:
    | "/plan-report?view=day-plan"
    | "/plan-report?view=habits"
    | "/plan-report?view=goals"
    | "/plan-report?view=top-tasks";
  image: "repeat" | "target" | "checklist" | "calendar";
}[] = [
  {
    id: "day-plan",
    title: "Day Plan",
    href: "/plan-report?view=day-plan",
    image: "calendar",
  },
  {
    id: "habits",
    title: "Habits",
    href: "/plan-report?view=habits",
    image: "repeat",
  },
  {
    id: "goals",
    title: "Goals",
    href: "/plan-report?view=goals",
    image: "target",
  },
  {
    id: "top-tasks",
    title: "Tasks",
    href: "/plan-report?view=top-tasks",
    image: "checklist",
  },
];

export function PlanReportHeaderMenu({
  currentView,
}: {
  currentView: PlanReportView;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { view } = useLocalSearchParams<{ view?: string }>();
  const selectedView = isPlanReportView(view) ? view : currentView;
  const selectedItem =
    MENU_ITEMS.find((item) => item.id === selectedView) ?? MENU_ITEMS[0];
  const triggerWidth =
    selectedView === "top-tasks" || selectedView === "day-plan" ? 140 : 120;
  const actions: MenuAction[] = MENU_ITEMS.map((item) => ({
    id: item.id,
    title: item.title,
    image: item.image,
    state: item.id === selectedView ? "on" : undefined,
  }));

  if (Platform.OS === "web") {
    return (
      <Text style={[styles.triggerLabel, { color: theme.text }]}>
        {selectedItem.title}
      </Text>
    );
  }

  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        const selectedItem = MENU_ITEMS.find(
          (item) => item.id === nativeEvent.event,
        );
        if (selectedItem) {
          setPlanReportView(selectedItem.id);
          router.navigate(selectedItem.href);
        }
      }}
      style={StyleSheet.flatten([styles.menu, { width: triggerWidth }])}
      title="Plan/Report views"
    >
      <View
        accessible
        accessibilityLabel="Switch Plan/Report view"
        accessibilityRole="button"
        style={StyleSheet.flatten([styles.trigger, { width: triggerWidth }])}
      >
        <Text style={[styles.triggerLabel, { color: theme.text }]}>
          {selectedItem.title}
        </Text>
        <SymbolView
          name={{ ios: "chevron.down", android: "keyboard_arrow_down" }}
          size={14}
          weight="semibold"
          tintColor={theme.textSecondary}
        />
      </View>
    </MenuView>
  );
}

function isPlanReportView(view: string | undefined): view is PlanReportView {
  return (
    view === "day-plan" ||
    view === "habits" ||
    view === "goals" ||
    view === "top-tasks"
  );
}

const styles = StyleSheet.create({
  menu: {
    height: 32,
  },
  trigger: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 7,
  },
  triggerLabel: {
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
});
