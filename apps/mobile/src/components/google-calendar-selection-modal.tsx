import { SymbolView } from "expo-symbols";
import { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useGoogleCalendarColors } from "@/hooks/use-google-calendar-event-colors";
import { useTheme } from "@/hooks/use-theme";
import type { GoogleCalendar } from "@/lib/google-calendar-client";

export function GoogleCalendarSelectionModal({
  calendars,
  error,
  isLoading,
  isSaving,
  isSyncing,
  onChangeColor,
  onConnect,
  onClose,
  onRetry,
  onSync,
  onToggle,
  selectedCalendarIds,
  visible,
}: {
  calendars: GoogleCalendar[];
  error: string | null;
  isLoading: boolean;
  isSaving: boolean;
  isSyncing?: boolean;
  onChangeColor?: (input: {
    backgroundColor: string;
    calendarId: string;
    foregroundColor: string;
  }) => void;
  onConnect?: () => void;
  onClose: () => void;
  onRetry: () => void;
  onSync?: () => void;
  onToggle: (calendarId: string) => void;
  selectedCalendarIds: string[];
  visible: boolean;
}) {
  const theme = useTheme();
  const {
    calendarColors: googleCalendarColors,
    isLoading: isLoadingGoogleColors,
  } = useGoogleCalendarColors();
  const [openColorCalendarId, setOpenColorCalendarId] = useState<string | null>(
    null,
  );

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
            <View style={styles.headerActions}>
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
          </View>

          {onSync ? (
            <View style={styles.headerControls}>
              <Pressable
                accessibilityLabel="Sync Google calendars"
                accessibilityRole="button"
                disabled={isSyncing || isLoading || isSaving}
                onPress={onSync}
                style={({ pressed }) => [
                  styles.syncButton,
                  pressed && styles.pressed,
                  (isSyncing || isLoading || isSaving) && styles.disabled,
                ]}
              >
                {isSyncing ? (
                  <ActivityIndicator color={theme.primary} size="small" />
                ) : (
                  <SymbolView
                    name={{
                      ios: "arrow.clockwise",
                      android: "refresh",
                      web: "refresh",
                    }}
                    size={17}
                    tintColor={theme.primary}
                  />
                )}
                <Text style={[styles.syncButtonText, { color: theme.primary }]}>
                  Sync
                </Text>
              </Pressable>
            </View>
          ) : null}

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
                  <View key={calendar.id} style={styles.calendarItem}>
                    <View style={styles.calendarRow}>
                      <Pressable
                        accessibilityLabel={`${selected ? "Hide" : "Show"} ${calendar.summary}`}
                        accessibilityRole="checkbox"
                        accessibilityState={{
                          checked: selected,
                          disabled: isSaving,
                        }}
                        disabled={isSaving}
                        onPress={() => onToggle(calendar.id)}
                        style={({ pressed }) => [
                          styles.calendarSelectButton,
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
                      {onChangeColor ? (
                        <Pressable
                          accessibilityLabel={`Change ${calendar.summary} color`}
                          accessibilityRole="button"
                          disabled={isSaving}
                          onPress={() =>
                            setOpenColorCalendarId((current) =>
                              current === calendar.id ? null : calendar.id,
                            )
                          }
                          style={({ pressed }) => [
                            styles.colorButton,
                            pressed && styles.pressed,
                          ]}
                        >
                          <View
                            style={[
                              styles.calendarColorDot,
                              { backgroundColor: color },
                            ]}
                          />
                          <SymbolView
                            name={{
                              ios:
                                openColorCalendarId === calendar.id
                                  ? "chevron.up"
                                  : "chevron.down",
                              android: "keyboard_arrow_down",
                              web: "keyboard_arrow_down",
                            }}
                            size={14}
                            tintColor={theme.textSecondary}
                          />
                        </Pressable>
                      ) : null}
                    </View>
                    {onChangeColor && openColorCalendarId === calendar.id ? (
                      <View style={styles.colorOptions}>
                        {isLoadingGoogleColors ? (
                          <ActivityIndicator
                            color={theme.primary}
                            size="small"
                          />
                        ) : (
                          googleCalendarColors.map((option) => (
                            <Pressable
                              accessibilityLabel={`Google color ${option.colorId} for ${calendar.summary}`}
                              accessibilityRole="button"
                              accessibilityState={{
                                selected:
                                  option.backgroundColor.toLowerCase() ===
                                  color.toLowerCase(),
                              }}
                              disabled={isSaving || isLoadingGoogleColors}
                              key={option.colorId}
                              onPress={() => {
                                setOpenColorCalendarId(null);
                                onChangeColor({
                                  backgroundColor: option.backgroundColor,
                                  calendarId: calendar.id,
                                  foregroundColor: option.foregroundColor,
                                });
                              }}
                              style={({ pressed }) => [
                                styles.colorOption,
                                pressed && styles.pressed,
                              ]}
                            >
                              <View
                                style={[
                                  styles.colorOptionSwatch,
                                  { backgroundColor: option.backgroundColor },
                                  option.backgroundColor.toLowerCase() ===
                                    color.toLowerCase() && {
                                    borderColor: theme.text,
                                    borderWidth: 3,
                                  },
                                ]}
                              />
                            </Pressable>
                          ))
                        )}
                      </View>
                    ) : null}
                  </View>
                );
              })}
              {error ? (
                <Text style={[styles.error, { color: theme.primary }]}>
                  {error}
                </Text>
              ) : null}
              <Text style={[styles.footerHint, { color: theme.textSecondary }]}>
                Float planned items are always shown.
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
    // Keep the title and close control below the Dynamic Island in native
    // modals, where SafeAreaView may not report the inset reliably.
    paddingTop: 76,
  },
  headerActions: { alignItems: "center", flexDirection: "row", gap: 4 },
  headerControls: {
    alignItems: "flex-end",
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  heading: { flex: 1, gap: 3, minWidth: 0 },
  title: { flexShrink: 1, fontSize: 24, fontWeight: "800", maxWidth: 220 },
  subtitle: { fontSize: 13, lineHeight: 18, maxWidth: 260 },
  closeButton: {
    alignItems: "center",
    borderRadius: 18,
    height: 36,
    justifyContent: "center",
    width: 36,
  },
  syncButton: {
    alignItems: "center",
    borderRadius: 18,
    flexDirection: "row",
    gap: 6,
    height: 36,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  syncButtonText: { fontSize: 14, fontWeight: "700" },
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
    flexDirection: "row",
    minHeight: 56,
  },
  calendarItem: { gap: 2 },
  calendarSelectButton: {
    alignItems: "center",
    borderRadius: 14,
    flex: 1,
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
  colorButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    minHeight: 44,
    paddingHorizontal: 8,
  },
  calendarColorDot: {
    borderRadius: 9,
    height: 18,
    width: 18,
  },
  colorOptions: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingBottom: 8,
    paddingLeft: 52,
    paddingRight: 8,
  },
  colorOption: { borderRadius: 16, padding: 2 },
  colorOptionSwatch: { borderRadius: 14, height: 28, width: 28 },
  emptyState: { alignItems: "center", gap: 12, padding: 28 },
  emptyTitle: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  error: { fontSize: 13, lineHeight: 18, textAlign: "center" },
  retryButton: { borderRadius: 12, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { fontSize: 14, fontWeight: "800" },
  footerHint: { fontSize: 12, lineHeight: 17, marginTop: 14 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.7 },
});
