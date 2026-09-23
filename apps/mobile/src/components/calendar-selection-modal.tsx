import { SymbolView } from "expo-symbols";
import { useMemo } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/use-theme";

export type CalendarSelectionMode = "day" | "week" | "month";

const MONTH_NAMES = [
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
const MONTH_SHORT_NAMES = MONTH_NAMES.map((month) => month.slice(0, 3));
const WEEKDAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function toDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0",
  )}-${String(date.getDate()).padStart(2, "0")}`;
}

function addMonths(date: Date, months: number) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function startOfWeek(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - start.getDay());
  return start;
}

function getMonthDays(month: Date) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function sameWeek(left: Date, right: Date) {
  return toDateKey(startOfWeek(left)) === toDateKey(startOfWeek(right));
}

export function formatWeekRange(weekStart: Date) {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const startLabel = `${MONTH_SHORT_NAMES[weekStart.getMonth()]} ${weekStart.getDate()}`;
  const endLabel = `${MONTH_SHORT_NAMES[weekEnd.getMonth()]} ${weekEnd.getDate()}`;
  return `${startLabel}–${endLabel}`;
}

export function formatDaySelection(date: Date) {
  return `${MONTH_SHORT_NAMES[date.getMonth()]} ${date.getDate()}`;
}

export function formatMonthSelection(date: Date) {
  return `${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
}

export function CalendarSelectionModal({
  mode,
  month,
  onChangeMonth,
  onClose,
  onSelect,
  selectedDate,
  visible,
}: {
  mode: CalendarSelectionMode;
  month: Date;
  onChangeMonth: (month: Date) => void;
  onClose: () => void;
  onSelect: (date: Date) => void;
  selectedDate: Date;
  visible: boolean;
}) {
  const theme = useTheme();
  const days = useMemo(() => getMonthDays(month), [month]);
  const selectedKey = toDateKey(selectedDate);
  const selectedWeekStart = startOfWeek(selectedDate);
  const todayKey = toDateKey(new Date());

  if (!visible) return null;

  return (
    <Modal animationType="fade" transparent visible onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.card,
            { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
          ]}
        >
          <View style={styles.header}>
            <Pressable
              accessibilityLabel="Previous month"
              hitSlop={8}
              onPress={() => onChangeMonth(addMonths(month, -1))}
              style={({ pressed }) => [
                styles.navButton,
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
                tintColor={theme.textSecondary}
              />
            </Pressable>
            <Text style={[styles.title, { color: theme.text }]}>
              {mode === "month"
                ? String(month.getFullYear())
                : `${MONTH_NAMES[month.getMonth()]} ${month.getFullYear()}`}
            </Text>
            <Pressable
              accessibilityLabel="Next month"
              hitSlop={8}
              onPress={() => onChangeMonth(addMonths(month, 1))}
              style={({ pressed }) => [
                styles.navButton,
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
                tintColor={theme.textSecondary}
              />
            </Pressable>
          </View>

          {mode === "month" ? (
            <View style={styles.monthGrid}>
              {MONTH_NAMES.map((name, index) => {
                const isSelected =
                  index === selectedDate.getMonth() &&
                  month.getFullYear() === selectedDate.getFullYear();
                const isCurrent =
                  index === new Date().getMonth() &&
                  month.getFullYear() === new Date().getFullYear();
                const date = new Date(month.getFullYear(), index, 1);
                return (
                  <Pressable
                    accessibilityLabel={`Choose ${name} ${month.getFullYear()}`}
                    accessibilityRole="button"
                    key={name}
                    onPress={() => onSelect(date)}
                    style={({ pressed }) => [
                      styles.monthTile,
                      {
                        backgroundColor: isSelected
                          ? theme.primary
                          : theme.backgroundElement,
                        borderColor: isCurrent
                          ? theme.primary
                          : theme.tabBorder,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.monthTileText,
                        {
                          color: isSelected
                            ? theme.primaryForeground
                            : theme.text,
                        },
                      ]}
                    >
                      {name.slice(0, 3)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : (
            <>
              <View style={styles.weekdays}>
                {WEEKDAY_NAMES.map((day) => (
                  <Text
                    key={day}
                    style={[styles.weekday, { color: theme.textSecondary }]}
                  >
                    {day.slice(0, 1)}
                  </Text>
                ))}
              </View>
              <View style={styles.dayGrid}>
                {Array.from({ length: 6 }, (_, weekIndex) => {
                  const week = days.slice(weekIndex * 7, weekIndex * 7 + 7);
                  const isSelectedWeek =
                    mode === "week" &&
                    sameWeek(week[0] ?? month, selectedWeekStart);
                  return (
                    <View
                      key={toDateKey(week[0] ?? month)}
                      style={[
                        styles.weekRow,
                        isSelectedWeek && {
                          backgroundColor: theme.primary,
                        },
                      ]}
                    >
                      {week.map((day) => {
                        const dayKey = toDateKey(day);
                        const isSelected =
                          mode === "day" && dayKey === selectedKey;
                        const isToday = dayKey === todayKey;
                        const inMonth = day.getMonth() === month.getMonth();
                        return (
                          <Pressable
                            accessibilityLabel={`Choose ${MONTH_NAMES[day.getMonth()]} ${day.getDate()}`}
                            accessibilityRole="button"
                            key={dayKey}
                            onPress={() => onSelect(day)}
                            style={({ pressed }) => [
                              styles.dayTile,
                              {
                                backgroundColor: isSelected
                                  ? theme.primary
                                  : "transparent",
                                borderColor: isToday
                                  ? mode === "week" && isSelectedWeek
                                    ? theme.primaryForeground
                                    : theme.primary
                                  : "transparent",
                              },
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text
                              style={[
                                styles.dayText,
                                {
                                  color:
                                    isSelected || isSelectedWeek
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
                  );
                })}
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.28)",
    padding: 20,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    padding: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  navButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  title: { fontSize: 17, fontWeight: "800" },
  weekdays: { flexDirection: "row", marginBottom: 6 },
  weekday: { flex: 1, textAlign: "center", fontSize: 12, fontWeight: "800" },
  dayGrid: { gap: 3 },
  weekRow: { flexDirection: "row", borderRadius: 12 },
  dayTile: {
    flex: 1,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 11,
  },
  dayText: { fontSize: 14, fontWeight: "700" },
  monthGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  monthTile: {
    width: "31%",
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: 13,
  },
  monthTileText: { fontSize: 15, fontWeight: "800" },
  pressed: { opacity: 0.72 },
});
