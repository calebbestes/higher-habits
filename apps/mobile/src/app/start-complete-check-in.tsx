import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/hooks/use-theme";
import {
  fetchHabitLogsSnapshot,
  getMonthKey,
  setHabitLog,
  toDateKey,
} from "@/lib/habit-logs-client";
import { type Habit, fetchHabits } from "@/lib/habits-client";

function isDateKey(value: string | undefined): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function monthKeyForDate(dateKey: string) {
  return dateKey.slice(0, 7);
}

export default function StartCompleteCheckInScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { dateKey: routeDateKey } = useLocalSearchParams<{
    dateKey?: string;
  }>();
  const dateKey = isDateKey(routeDateKey)
    ? routeDateKey
    : toDateKey(new Date());
  const [habits, setHabits] = useState<Habit[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      fetchHabits(),
      fetchHabitLogsSnapshot(monthKeyForDate(dateKey) || getMonthKey()),
    ])
      .then(([allHabits, snapshot]) => {
        if (!active) return;
        const startCompleteHabits = allHabits.filter(
          (habit) => habit.defaultComplete && !habit.hidden,
        );
        setHabits(startCompleteHabits);
        setSelected(
          new Set(
            startCompleteHabits
              .filter(
                (habit) =>
                  snapshot.logsByHabitDate[`${habit.id}_${dateKey}`] ===
                  "complete",
              )
              .map((habit) => habit.id),
          ),
        );
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load your start-complete habits.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [dateKey]);

  const selectedCount = useMemo(() => selected.size, [selected]);

  const toggle = (habitId: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(habitId)) next.delete(habitId);
      else next.add(habitId);
      return next;
    });
  };

  const save = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await Promise.all(
        habits.map((habit) =>
          setHabitLog(
            habit.id,
            dateKey,
            selected.has(habit.id) ? "complete" : "incomplete",
          ),
        ),
      );
      router.back();
    } catch (saveError: unknown) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save this check-in.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView
      style={[styles.safeArea, { backgroundColor: theme.background }]}
    >
      <View style={[styles.header, { borderBottomColor: theme.tabBorder }]}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={[styles.cancel, { color: theme.primary }]}>Cancel</Text>
        </Pressable>
        <Text style={[styles.title, { color: theme.text }]}>Check-in</Text>
        <Pressable disabled={isSaving} onPress={() => void save()} hitSlop={12}>
          <Text
            style={[
              styles.save,
              { color: isSaving ? theme.textSecondary : theme.primary },
            ]}
          >
            Save
          </Text>
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.heading, { color: theme.text }]}>
          Which ones did you complete?
        </Text>
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          Select the habits you completed today. Unselected habits will be
          marked incomplete.
        </Text>

        {isLoading ? (
          <ActivityIndicator color={theme.primary} style={styles.loader} />
        ) : habits.length === 0 ? (
          <Text style={[styles.empty, { color: theme.textSecondary }]}>
            No start-complete habits found.
          </Text>
        ) : (
          habits.map((habit) => {
            const isSelected = selected.has(habit.id);
            return (
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isSelected }}
                key={habit.id}
                onPress={() => toggle(habit.id)}
                style={({ pressed }) => [
                  styles.habitRow,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                  },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View
                  style={[
                    styles.checkbox,
                    {
                      backgroundColor: isSelected
                        ? theme.primary
                        : theme.background,
                      borderColor: isSelected ? theme.primary : theme.tabIcon,
                    },
                  ]}
                >
                  {isSelected ? <Text style={styles.checkmark}>✓</Text> : null}
                </View>
                <Text style={[styles.habitName, { color: theme.text }]}>
                  {habit.name}
                </Text>
              </Pressable>
            );
          })
        )}

        <Text style={[styles.count, { color: theme.textSecondary }]}>
          {selectedCount} of {habits.length} selected
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  header: {
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  cancel: { fontSize: 16, fontWeight: "600" },
  title: { fontSize: 18, fontWeight: "800" },
  save: { fontSize: 16, fontWeight: "800" },
  content: { gap: 12, padding: 20 },
  heading: { fontSize: 26, fontWeight: "800", letterSpacing: -0.5 },
  description: { fontSize: 16, lineHeight: 23, marginBottom: 8 },
  loader: { marginTop: 30 },
  empty: { fontSize: 16, marginTop: 24 },
  habitRow: {
    alignItems: "center",
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 14,
    minHeight: 66,
    paddingHorizontal: 16,
  },
  checkbox: {
    alignItems: "center",
    borderRadius: 15,
    borderWidth: 2,
    height: 30,
    justifyContent: "center",
    width: 30,
  },
  checkmark: { color: "white", fontSize: 20, fontWeight: "800" },
  habitName: { flex: 1, fontSize: 17, fontWeight: "700" },
  count: { fontSize: 14, marginTop: 6 },
  error: { color: "#B4232C", fontSize: 14, fontWeight: "600" },
});
