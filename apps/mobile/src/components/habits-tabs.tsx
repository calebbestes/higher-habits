import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/use-theme";
import type { HabitsTab } from "@/lib/tab-view-store";

const TABS: { key: HabitsTab; label: string }[] = [
  { key: "daily", label: "Daily" },
  { key: "monthly", label: "Periodic" },
];

export function HabitsTabs({
  value,
  onChange,
}: {
  value: HabitsTab;
  onChange: (value: HabitsTab) => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.tabBar,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.tabBorder,
        },
      ]}
    >
      {TABS.map((tab) => {
        const active = value === tab.key;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(tab.key)}
            style={[styles.tab, active && { backgroundColor: theme.tabBar }]}
          >
            <Text
              style={[
                styles.tabLabel,
                { color: active ? theme.text : theme.textSecondary },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: "row",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 3,
    gap: 3,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 11,
  },
  tabLabel: { fontSize: 14, fontWeight: "700" },
});
