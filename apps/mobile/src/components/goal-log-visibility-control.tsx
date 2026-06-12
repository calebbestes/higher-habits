import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/use-theme";
import type { GoalVisibility } from "@/lib/goals-client";

type SymbolName = SymbolViewProps["name"];

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

const OPTIONS: Array<{
  value: GoalVisibility;
  label: string;
  icon: SymbolName;
}> = [
  { value: "only_me", label: "Only me", icon: sym("person.fill", "person") },
  {
    value: "goal_friends",
    label: "Goal friends",
    icon: sym("person.2.fill", "group"),
  },
  {
    value: "all_friends",
    label: "All friends",
    icon: sym("person.3.fill", "groups"),
  },
];

export function GoalLogVisibilityControl({
  disabled,
  value,
  onChange,
}: {
  disabled: boolean;
  value: GoalVisibility;
  onChange: (visibility: GoalVisibility) => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.backgroundElement },
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.label, { color: theme.textSecondary }]}>
        Post visibility
      </Text>
      <View style={[styles.options, { backgroundColor: theme.background }]}>
        {OPTIONS.map((option) => {
          const selected = option.value === value;

          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, disabled }}
              disabled={disabled}
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.option,
                selected && { backgroundColor: theme.tabBar },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={option.icon}
                size={16}
                tintColor={selected ? theme.primary : theme.tabIcon}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.optionLabel,
                  { color: selected ? theme.primary : theme.textSecondary },
                ]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 8,
    borderRadius: 16,
    padding: 10,
  },
  label: {
    paddingHorizontal: 4,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  options: {
    flexDirection: "row",
    gap: 3,
    borderRadius: 12,
    padding: 3,
  },
  option: {
    flex: 1,
    minWidth: 0,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 10,
    paddingHorizontal: 3,
  },
  optionLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "700",
  },
  pressed: { opacity: 0.72 },
  disabled: { opacity: 0.55 },
});
