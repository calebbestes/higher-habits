import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useGoogleCalendarEventColors } from "@/hooks/use-google-calendar-event-colors";
import { useTheme } from "@/hooks/use-theme";

export function CalendarColorPicker({
  defaultColor,
  defaultForeground,
  defaultHint = "Default uses Google's default event color.",
  disabled = false,
  value,
  onChange,
}: {
  defaultColor?: string;
  defaultForeground?: string;
  defaultHint?: string;
  disabled?: boolean;
  value?: string | null;
  onChange: (color: string | null) => void;
}) {
  const theme = useTheme();
  const { colors: googleEventColors, isLoading: isLoadingGoogleColors } =
    useGoogleCalendarEventColors();
  const colorOptions = [
    { color: null, foreground: null, label: "Default" },
    ...googleEventColors.map((googleColor) => ({
      color: googleColor.backgroundColor,
      foreground: googleColor.foregroundColor,
      label: `Google color ${googleColor.colorId}`,
    })),
  ];
  const defaultColorOption = colorOptions.find(
    (option) =>
      option.color &&
      defaultColor &&
      option.color.toLowerCase() === defaultColor.toLowerCase(),
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: theme.text }]}>
          Calendar color
        </Text>
        <Text style={[styles.value, { color: theme.textSecondary }]}>
          {isLoadingGoogleColors
            ? "Loading…"
            : value === null
              ? "Default"
              : "Choose a color"}
        </Text>
      </View>
      <View style={styles.options}>
        {isLoadingGoogleColors ? (
          <ActivityIndicator color={theme.primary} size="small" />
        ) : (
          colorOptions.map((option) => {
            const isDefaultOption = option.color === null;
            const selected = isDefaultOption
              ? value === null && !defaultColorOption
              : value === option.color ||
                (value === null && defaultColorOption?.color === option.color);
            const swatchColor = option.color ?? defaultColor ?? theme.primary;
            const swatchForeground =
              option.foreground ?? defaultForeground ?? theme.primaryForeground;
            const optionLabel =
              !isDefaultOption && defaultColorOption?.color === option.color
                ? `${option.label} (default)`
                : option.label;

            return (
              <Pressable
                accessibilityLabel={`${optionLabel} calendar color`}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                disabled={disabled}
                key={option.label}
                onPress={() => onChange(option.color)}
                style={({ pressed }) => [
                  styles.option,
                  pressed && styles.pressed,
                  disabled && styles.disabled,
                ]}
              >
                <View
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: swatchColor,
                      borderColor: selected ? theme.text : "transparent",
                      borderWidth: selected ? 2 : 0,
                    },
                  ]}
                >
                  {selected ? (
                    <Text
                      style={[styles.checkmark, { color: swatchForeground }]}
                    >
                      ✓
                    </Text>
                  ) : null}
                </View>
              </Pressable>
            );
          })
        )}
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
  options: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  option: {
    alignItems: "center",
    borderRadius: 999,
    justifyContent: "center",
    minHeight: 34,
    minWidth: 34,
    padding: 3,
  },
  swatch: {
    alignItems: "center",
    borderRadius: 999,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  checkmark: { fontSize: 14, fontWeight: "900", lineHeight: 16 },
  hint: { fontSize: 11, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.72 },
});
