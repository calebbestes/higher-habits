import { Pressable, StyleSheet, Text, View } from "react-native";

import { CALENDAR_EVENT_COLORS } from "@/constants/calendar-colors";
import { useTheme } from "@/hooks/use-theme";

export function CalendarColorPicker({
  defaultHint = "Default follows your app primary color.",
  disabled = false,
  value,
  onChange,
}: {
  defaultHint?: string;
  disabled?: boolean;
  value?: string | null;
  onChange: (color: string | null) => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: theme.text }]}>
          Calendar color
        </Text>
        <Text style={[styles.value, { color: theme.textSecondary }]}>
          {CALENDAR_EVENT_COLORS.find((option) => option.color === value)
            ?.label ?? "Default"}
        </Text>
      </View>
      <View style={styles.options}>
        {CALENDAR_EVENT_COLORS.map((option) => {
          const selected = value === option.color;
          const swatchColor = option.color ?? theme.primary;
          const swatchForeground = option.foreground ?? theme.primaryForeground;

          return (
            <Pressable
              accessibilityLabel={`${option.label} calendar color`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              disabled={disabled}
              key={option.label}
              onPress={() => onChange(option.color)}
              style={({ pressed }) => [
                styles.option,
                {
                  backgroundColor: selected
                    ? theme.backgroundSelected
                    : theme.backgroundElement,
                  borderColor: selected ? theme.text : theme.tabBorder,
                },
                pressed && styles.pressed,
                disabled && styles.disabled,
              ]}
            >
              <View
                style={[
                  styles.swatch,
                  {
                    backgroundColor: swatchColor,
                    borderColor: option.color ? swatchColor : theme.tabBorder,
                  },
                ]}
              >
                {selected ? (
                  <Text style={[styles.checkmark, { color: swatchForeground }]}>
                    ✓
                  </Text>
                ) : null}
              </View>
              <Text
                numberOfLines={1}
                style={[styles.optionLabel, { color: theme.text }]}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={[styles.hint, { color: theme.textSecondary }]}>
        {defaultHint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: 9 },
  header: {
    alignItems: "baseline",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  label: { fontSize: 13, fontWeight: "700" },
  value: { fontSize: 12, fontWeight: "600" },
  options: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  option: {
    alignItems: "center",
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 7,
    minHeight: 40,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  swatch: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    height: 22,
    justifyContent: "center",
    width: 22,
  },
  checkmark: { fontSize: 14, fontWeight: "900", lineHeight: 16 },
  optionLabel: { fontSize: 11, fontWeight: "700" },
  hint: { fontSize: 11, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72 },
});
