import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState } from "react";
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
  onSelectDate,
  selectedCalendarIds,
  selectedDate,
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
  onSelectDate?: (date: Date) => void;
  onSync?: () => void;
  onToggle: (calendarId: string) => void;
  selectedCalendarIds: string[];
  selectedDate?: Date;
  visible: boolean;
}) {
  const theme = useTheme();
  const {
    calendarColors: googleCalendarColors,
    isLoading: isLoadingGoogleColors,
  } = useGoogleCalendarColors();
  const calendarColorOptions = Array.isArray(googleCalendarColors)
    ? googleCalendarColors
    : [];
  const [openColorCalendarId, setOpenColorCalendarId] = useState<string | null>(
    null,
  );
  const [calendarMonth, setCalendarMonth] = useState(() =>
    startOfCalendarMonth(selectedDate ?? new Date()),
  );

  useEffect(() => {
    if (visible && selectedDate) {
      setCalendarMonth(startOfCalendarMonth(selectedDate));
    }
  }, [selectedDate, visible]);

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
          <View style={styles.upperPane}>
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
                  <Text
                    style={[styles.syncButtonText, { color: theme.primary }]}
                  >
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
                    style={[
                      styles.retryText,
                      { color: theme.primaryForeground },
                    ]}
                  >
                    {onConnect ? "Connect Google Calendar" : "Retry"}
                  </Text>
                </Pressable>
              </View>
            ) : (
              <ScrollView
                contentContainerStyle={styles.list}
                showsVerticalScrollIndicator={false}
                style={styles.calendarListScroll}
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
                                backgroundColor: selected
                                  ? color
                                  : "transparent",
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
                            calendarColorOptions.map((option) => (
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
                <Text
                  style={[styles.footerHint, { color: theme.textSecondary }]}
                >
                  Float planned items are always shown.
                </Text>
              </ScrollView>
            )}
          </View>
          {selectedDate && onSelectDate ? (
            <CalendarMonthView
              month={calendarMonth}
              onChangeMonth={setCalendarMonth}
              onSelectDate={onSelectDate}
              selectedDate={selectedDate}
            />
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const CALENDAR_MONTH_NAMES = [
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
const CALENDAR_WEEKDAYS = [
  { key: "sun-start", label: "S" },
  { key: "mon", label: "M" },
  { key: "tue", label: "T" },
  { key: "wed", label: "W" },
  { key: "thu", label: "Th" },
  { key: "fri", label: "F" },
  { key: "sun-end", label: "S" },
] as const;

function startOfCalendarMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addCalendarMonths(date: Date, amount: number) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function calendarDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getCalendarMonthDays(month: Date) {
  const firstDay = startOfCalendarMonth(month);
  const firstWeekday = firstDay.getDay();
  return Array.from(
    { length: 42 },
    (_, index) =>
      new Date(month.getFullYear(), month.getMonth(), index - firstWeekday + 1),
  );
}

function CalendarMonthView({
  month,
  onChangeMonth,
  onSelectDate,
  selectedDate,
}: {
  month: Date;
  onChangeMonth: (month: Date) => void;
  onSelectDate: (date: Date) => void;
  selectedDate: Date;
}) {
  const theme = useTheme();
  const days = useMemo(() => getCalendarMonthDays(month), [month]);
  const selectedKey = calendarDateKey(selectedDate);
  const todayKey = calendarDateKey(new Date());
  const weeks = Array.from({ length: 6 }, (_, index) =>
    days.slice(index * 7, index * 7 + 7),
  );

  return (
    <View style={[styles.monthCalendar, { borderTopColor: theme.tabBorder }]}>
      <View style={styles.monthCalendarHeader}>
        <Pressable
          accessibilityLabel="Previous month"
          accessibilityRole="button"
          onPress={() => onChangeMonth(addCalendarMonths(month, -1))}
          style={({ pressed }) => [
            styles.monthCalendarNavButton,
            { backgroundColor: theme.backgroundElement },
            pressed && styles.pressed,
          ]}
        >
          <SymbolView
            name={{
              ios: "chevron.left",
              android: "chevron_left",
              web: "chevron_left",
            }}
            size={18}
            tintColor={theme.tabIcon}
          />
        </Pressable>
        <Text style={[styles.monthCalendarTitle, { color: theme.text }]}>
          {CALENDAR_MONTH_NAMES[month.getMonth()]} {month.getFullYear()}
        </Text>
        <Pressable
          accessibilityLabel="Next month"
          accessibilityRole="button"
          onPress={() => onChangeMonth(addCalendarMonths(month, 1))}
          style={({ pressed }) => [
            styles.monthCalendarNavButton,
            { backgroundColor: theme.backgroundElement },
            pressed && styles.pressed,
          ]}
        >
          <SymbolView
            name={{
              ios: "chevron.right",
              android: "chevron_right",
              web: "chevron_right",
            }}
            size={18}
            tintColor={theme.tabIcon}
          />
        </Pressable>
      </View>

      <View style={styles.monthCalendarWeekdays}>
        {CALENDAR_WEEKDAYS.map((weekday) => (
          <Text
            key={weekday.key}
            style={[
              styles.monthCalendarWeekday,
              { color: theme.textSecondary },
            ]}
          >
            {weekday.label}
          </Text>
        ))}
      </View>

      <View style={styles.monthCalendarGrid}>
        {weeks.map((week) => (
          <View
            key={calendarDateKey(week[0] ?? month)}
            style={styles.monthCalendarWeek}
          >
            {week.map((day) => {
              const dayKey = calendarDateKey(day);
              const inMonth = day.getMonth() === month.getMonth();
              const isSelected = dayKey === selectedKey;
              const isToday = dayKey === todayKey;

              return (
                <Pressable
                  accessibilityLabel={`Choose ${CALENDAR_MONTH_NAMES[day.getMonth()]} ${day.getDate()}`}
                  accessibilityRole="button"
                  key={dayKey}
                  onPress={() => onSelectDate(day)}
                  style={({ pressed }) => [
                    styles.monthCalendarDay,
                    {
                      backgroundColor: isSelected
                        ? theme.primary
                        : theme.backgroundElement,
                      borderColor: isToday ? theme.primary : "transparent",
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.monthCalendarDayText,
                      {
                        color: isSelected
                          ? theme.primaryForeground
                          : inMonth
                            ? theme.text
                            : theme.textSecondary,
                        opacity: inMonth || isSelected ? 1 : 0.45,
                      },
                    ]}
                  >
                    {day.getDate()}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>
    </View>
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
    flex: 1,
    maxWidth: 360,
    shadowColor: "#000",
    shadowOffset: { height: 0, width: 5 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    width: "86%",
  },
  // Keep the calendar list and month calendar visible together. The list
  // scrolls within the upper half instead of pushing the month view below
  // the drawer.
  upperPane: {
    flexGrow: 0,
    flexShrink: 1,
    height: "50%",
    minHeight: 0,
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
    marginTop: -12,
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
  calendarListScroll: { flex: 1 },
  list: { gap: 2, paddingHorizontal: 18, paddingVertical: 14 },
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
    minHeight: 46,
  },
  calendarItem: { gap: 2 },
  calendarSelectButton: {
    alignItems: "center",
    borderRadius: 14,
    flex: 1,
    flexDirection: "row",
    gap: 10,
    minHeight: 46,
    paddingHorizontal: 6,
  },
  calendarSwatch: {
    alignItems: "center",
    borderRadius: 5,
    borderWidth: 2,
    height: 24,
    justifyContent: "center",
    width: 24,
  },
  calendarName: { flex: 1, fontSize: 15, fontWeight: "600" },
  colorButton: {
    alignItems: "center",
    flexDirection: "row",
    gap: 4,
    justifyContent: "center",
    minHeight: 38,
    paddingHorizontal: 5,
  },
  calendarColorDot: {
    borderRadius: 8,
    height: 16,
    width: 16,
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
  monthCalendar: {
    borderTopWidth: StyleSheet.hairlineWidth,
    flexGrow: 0,
    flexShrink: 0,
    height: "50%",
    gap: 10,
    padding: 16,
  },
  monthCalendarHeader: {
    alignItems: "center",
    flexDirection: "row",
    justifyContent: "space-between",
  },
  monthCalendarTitle: {
    flex: 1,
    fontSize: 20,
    fontWeight: "900",
    textAlign: "center",
  },
  monthCalendarNavButton: {
    alignItems: "center",
    borderRadius: 14,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  monthCalendarWeekdays: { flexDirection: "row", gap: 5 },
  monthCalendarWeekday: {
    flex: 1,
    fontSize: 11,
    fontWeight: "900",
    textAlign: "center",
  },
  monthCalendarGrid: { flex: 1, gap: 5 },
  monthCalendarWeek: { flex: 1, flexDirection: "row", gap: 5 },
  monthCalendarDay: {
    alignItems: "center",
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    flex: 1,
    justifyContent: "center",
  },
  monthCalendarDayText: { fontSize: 14, fontWeight: "900" },
});
