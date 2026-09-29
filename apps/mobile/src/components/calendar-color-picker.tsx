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
  const colorOptions = googleEventColors.map((googleColor) => ({
    color: googleColor.backgroundColor,
    foreground: googleColor.foregroundColor,
    label: googleColor.label ?? `Google color ${googleColor.colorId}`,
  }));
  const selectedColorOption = colorOptions.find(
    (option) =>
      option.color &&
      value &&
      option.color.toLowerCase() === value.toLowerCase(),
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.label, { color: theme.text }]}>
          Calendar color
        </Text>
        <Pressable
          accessibilityLabel="Use default calendar color"
          accessibilityRole="button"
          disabled={disabled || value === null || value === undefined}
          onPress={() => onChange(null)}
          style={({ pressed }) => [pressed && styles.pressed]}
        >
          <Text style={[styles.value, { color: theme.textSecondary }]}>
            {isLoadingGoogleColors
              ? "Loading…"
              : value === null
                ? "Default"
                : (selectedColorOption?.label ?? "Choose a color")}
          </Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityLabel="Use calendar default color"
        accessibilityRole="radio"
        accessibilityState={{
          checked: value === null || value === undefined,
          disabled,
        }}
        disabled={disabled}
        onPress={() => onChange(null)}
        style={({ pressed }) => [
          styles.defaultOption,
          {
            borderColor:
              value === null || value === undefined
                ? theme.primary
                : theme.tabBorder,
          },
          pressed && styles.pressed,
          disabled && styles.disabled,
        ]}
      >
        <View
          style={[
            styles.defaultSwatch,
            {
              backgroundColor: defaultColor ?? theme.backgroundElement,
              borderColor: theme.tabBorder,
            },
          ]}
        >
          {value === null || value === undefined ? (
            <Text style={[styles.checkmark, { color: theme.text }]}>✓</Text>
          ) : null}
        </View>
        <View style={styles.defaultOptionText}>
          <Text style={[styles.defaultOptionTitle, { color: theme.text }]}>
            Use calendar default
          </Text>
          <Text
            style={[styles.defaultOptionHint, { color: theme.textSecondary }]}
          >
            This event will use the calendar&apos;s color.
          </Text>
        </View>
      </Pressable>
      <View style={styles.options}>
        {isLoadingGoogleColors ? (
          <ActivityIndicator color={theme.primary} size="small" />
        ) : (
          colorOptions.map((option) => {
            const selected = value != null && value === option.color;

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
                  pressed && styles.pressed,
                  disabled && styles.disabled,
                ]}
              >
                <View
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: option.color,
                      borderColor: selected ? theme.text : "transparent",
                      borderWidth: selected ? 2 : 0,
                    },
                  ]}
                >
                  {selected ? (
                    <Text
                      style={[styles.checkmark, { color: option.foreground }]}
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
  defaultOption: {
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  defaultSwatch: {
    alignItems: "center",
    borderRadius: 999,
    borderWidth: 1,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  defaultOptionText: { flex: 1, gap: 1 },
  defaultOptionTitle: { fontSize: 12, fontWeight: "800" },
  defaultOptionHint: { fontSize: 11, fontWeight: "600" },
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
