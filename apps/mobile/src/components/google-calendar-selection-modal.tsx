import { SymbolView } from "expo-symbols";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/hooks/use-theme";
import type { GoogleCalendar } from "@/lib/google-calendar-client";

export function GoogleCalendarSelectionModal({
  calendars,
  error,
  isLoading,
  isSaving,
  onConnect,
  onClose,
  onRetry,
  onToggle,
  selectedCalendarIds,
  visible,
}: {
  calendars: GoogleCalendar[];
  error: string | null;
  isLoading: boolean;
  isSaving: boolean;
  onConnect?: () => void;
  onClose: () => void;
  onRetry: () => void;
  onToggle: (calendarId: string) => void;
  selectedCalendarIds: string[];
  visible: boolean;
}) {
  const theme = useTheme();

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}
    >
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView
          edges={["top", "bottom"]}
          style={[
            styles.drawer,
            {
              backgroundColor: theme.tabBar,
              borderRightColor: theme.tabBorder,
            },
          ]}
        >
          <View style={styles.header}>
            <View style={styles.heading}>
              <Text style={[styles.title, { color: theme.text }]}>
                Calendars
              </Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                Choose which Google calendars appear in your plan.
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close calendars"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={{ ios: "xmark", android: "close", web: "close" }}
                size={19}
                tintColor={theme.textSecondary}
              />
            </Pressable>
          </View>

          <View
            style={[styles.divider, { backgroundColor: theme.tabBorder }]}
          />

          {isLoading ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                Loading calendars…
              </Text>
            </View>
          ) : calendars.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>
                No Google calendars found
              </Text>
              {error ? (
                <Text style={[styles.error, { color: theme.primary }]}>
                  {error}
                </Text>
              ) : null}
              <Pressable
                accessibilityRole="button"
                disabled={isSaving}
                onPress={onConnect ?? onRetry}
                style={({ pressed }) => [
                  styles.retryButton,
                  { backgroundColor: theme.primary },
                  pressed && styles.pressed,
                ]}
              >
                <Text
                  style={[styles.retryText, { color: theme.primaryForeground }]}
                >
                  {onConnect ? "Connect Google Calendar" : "Retry"}
                </Text>
              </Pressable>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
            >
              <Text
                style={[styles.sectionLabel, { color: theme.textSecondary }]}
              >
                My calendars
              </Text>
              {calendars.map((calendar) => {
                const selected = selectedCalendarIds.includes(calendar.id);
                const color = calendar.backgroundColor ?? theme.primary;
                const foreground = calendar.foregroundColor ?? "#FFFFFF";
                return (
                  <Pressable
                    accessibilityLabel={`${selected ? "Hide" : "Show"} ${calendar.summary}`}
                    accessibilityRole="checkbox"
                    accessibilityState={{
                      checked: selected,
                      disabled: isSaving,
                    }}
                    disabled={isSaving}
                    key={calendar.id}
                    onPress={() => onToggle(calendar.id)}
                    style={({ pressed }) => [
                      styles.calendarRow,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.calendarSwatch,
                        {
                          backgroundColor: selected ? color : "transparent",
                          borderColor: selected ? color : theme.tabBorder,
                        },
                      ]}
                    >
                      {selected ? (
                        <SymbolView
                          name={{
                            ios: "checkmark",
                            android: "check",
                            web: "check",
                          }}
                          size={17}
                          tintColor={foreground}
                        />
                      ) : null}
                    </View>
                    <Text
                      numberOfLines={1}
                      style={[styles.calendarName, { color: theme.text }]}
                    >
                      {calendar.summary}
                    </Text>
                  </Pressable>
                );
              })}
              {error ? (
                <Text style={[styles.error, { color: theme.primary }]}>
                  {error}
                </Text>
              ) : null}
              <Text style={[styles.footerHint, { color: theme.textSecondary }]}>
                Higher Habits planned items are always shown.
              </Text>
            </ScrollView>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    backgroundColor: "rgba(0, 0, 0, 0.28)",
    flex: 1,
    flexDirection: "row",
  },
  drawer: {
    borderRightWidth: StyleSheet.hairlineWidth,
    elevation: 12,
    maxWidth: 360,
    shadowColor: "#000",
    shadowOffset: { height: 0, width: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    width: "86%",
  },
  header: {
    alignItems: "flex-start",
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 22,
    paddingTop: 16,
  },
  heading: { flex: 1, gap: 3 },
  title: { fontSize: 24, fontWeight: "800" },
  subtitle: { fontSize: 13, lineHeight: 18, maxWidth: 260 },
  closeButton: {
    alignItems: "center",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  divider: { height: StyleSheet.hairlineWidth, marginTop: 16 },
  list: { gap: 4, padding: 22 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "800",
    letterSpacing: 0.4,
    marginBottom: 4,
    textTransform: "uppercase",
  },
  calendarRow: {
    alignItems: "center",
    borderRadius: 14,
    flexDirection: "row",
    gap: 14,
    minHeight: 56,
    paddingHorizontal: 10,
  },
  calendarSwatch: {
    alignItems: "center",
    borderRadius: 5,
    borderWidth: 2,
    height: 28,
    justifyContent: "center",
    width: 28,
  },
  calendarName: { flex: 1, fontSize: 17, fontWeight: "600" },
  emptyState: { alignItems: "center", gap: 12, padding: 28 },
  emptyTitle: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  error: { fontSize: 13, lineHeight: 18, textAlign: "center" },
  retryButton: { borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { fontSize: 14, fontWeight: "800" },
  footerHint: { fontSize: 12, lineHeight: 17, marginTop: 14 },
  pressed: { opacity: 0.7 },
});
