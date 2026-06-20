import { SymbolView } from "expo-symbols";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/hooks/use-theme";
import { getLocalTimeZone } from "@/lib/google-calendar-client";
import {
  PLAN_PERIODS,
  type PlanPeriod,
  getPlanTimeInput,
  normalizePlanTimeInput,
} from "@/lib/plan-time";
import type { PlannedEvent } from "@/lib/planned-events-client";
import type { Task } from "@/lib/tasks-client";

import { sym } from "./shared";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function todayDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

export function TaskPlanModal({
  existingPlan,
  onClose,
  onSave,
  task,
}: {
  existingPlan?: PlannedEvent | null;
  onClose: () => void;
  onSave: (input: {
    dateKey: string;
    endTime: string | null;
    startTime: string | null;
    timeZone: string | null;
  }) => Promise<void>;
  task: Task | null;
}) {
  const theme = useTheme();
  const [dateKey, setDateKey] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [startPeriod, setStartPeriod] = useState<PlanPeriod>("AM");
  const [endPeriod, setEndPeriod] = useState<PlanPeriod>("AM");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const normalizedStartTime = normalizePlanTimeInput(startTime, startPeriod);
  const normalizedEndTime = normalizePlanTimeInput(endTime, endPeriod);
  const hasAnyTimeInput = Boolean(startTime.trim() || endTime.trim());
  const hasValidTimeRange = Boolean(normalizedStartTime && normalizedEndTime);
  const dateIsValid = DATE_KEY_REGEX.test(dateKey.trim());
  const canSave = Boolean(
    task && dateIsValid && (!hasAnyTimeInput || hasValidTimeRange),
  );
  const title = existingPlan ? "Edit plan" : "Add plan";
  const timeZone = useMemo(() => getLocalTimeZone(), []);

  useEffect(() => {
    if (!task) return;

    const start = getPlanTimeInput(existingPlan?.startTime);
    const end = getPlanTimeInput(existingPlan?.endTime);
    setDateKey(existingPlan?.date ?? task.dueDate ?? todayDateKey());
    setStartTime(start.time);
    setEndTime(end.time);
    setStartPeriod(start.period);
    setEndPeriod(end.period);
    setError(null);
  }, [existingPlan, task]);

  const save = async () => {
    if (!canSave || isSaving) return;
    setIsSaving(true);
    setError(null);

    try {
      await onSave({
        dateKey: dateKey.trim(),
        startTime: hasValidTimeRange ? normalizedStartTime : null,
        endTime: hasValidTimeRange ? normalizedEndTime : null,
        timeZone,
      });
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save plan.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  if (!task) return null;

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView
          edges={["bottom"]}
          style={[styles.sheet, { backgroundColor: theme.background }]}
        >
          <View
            style={[
              styles.header,
              {
                backgroundColor: theme.tabBar,
                borderBottomColor: theme.tabBorder,
              },
            ]}
          >
            <View style={styles.headerText}>
              <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
              <Text
                numberOfLines={1}
                style={[styles.subtitle, { color: theme.textSecondary }]}
              >
                {task.name}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [
                styles.closeButton,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("xmark", "close")}
                size={14}
                weight="bold"
                tintColor={theme.tabIcon}
              />
            </Pressable>
          </View>

          <View style={styles.content}>
            <View style={styles.field}>
              <Text style={[styles.label, { color: theme.textSecondary }]}>
                Date
              </Text>
              <TextInput
                autoCapitalize="none"
                keyboardType="numbers-and-punctuation"
                onChangeText={setDateKey}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.textSecondary}
                selectionColor={theme.primary}
                style={[
                  styles.input,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                    color: theme.text,
                  },
                ]}
                value={dateKey}
              />
            </View>

            <View style={styles.timeGrid}>
              <PlanTimeField
                label="Start"
                period={startPeriod}
                value={startTime}
                onChangePeriod={setStartPeriod}
                onChangeText={setStartTime}
              />
              <PlanTimeField
                label="End"
                period={endPeriod}
                value={endTime}
                onChangePeriod={setEndPeriod}
                onChangeText={setEndTime}
              />
            </View>

            {hasAnyTimeInput && !hasValidTimeRange ? (
              <Text style={styles.errorText}>
                Add both start and end times like 9:00.
              </Text>
            ) : null}
            {dateKey.trim() && !dateIsValid ? (
              <Text style={styles.errorText}>Use date format YYYY-MM-DD.</Text>
            ) : null}
            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <Pressable
              accessibilityRole="button"
              disabled={!canSave || isSaving}
              onPress={() => void save()}
              style={({ pressed }) => [
                styles.saveButton,
                { backgroundColor: canSave ? theme.primary : theme.tabBorder },
                pressed && styles.pressed,
              ]}
            >
              {isSaving ? (
                <ActivityIndicator
                  color={theme.primaryForeground}
                  size="small"
                />
              ) : (
                <Text
                  style={[styles.saveLabel, { color: theme.primaryForeground }]}
                >
                  Save plan
                </Text>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function PlanTimeField({
  label,
  onChangePeriod,
  onChangeText,
  period,
  value,
}: {
  label: string;
  onChangePeriod: (period: PlanPeriod) => void;
  onChangeText: (value: string) => void;
  period: PlanPeriod;
  value: string;
}) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.textSecondary }]}>
        {label}
      </Text>
      <TextInput
        keyboardType="numbers-and-punctuation"
        onChangeText={onChangeText}
        placeholder="9:00"
        placeholderTextColor={theme.textSecondary}
        selectionColor={theme.primary}
        style={[
          styles.input,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.tabBorder,
            color: theme.text,
          },
        ]}
        value={value}
      />
      <View style={styles.periodRow}>
        {PLAN_PERIODS.map((option) => {
          const selected = period === option;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option}
              onPress={() => onChangePeriod(option)}
              style={({ pressed }) => [
                styles.periodChip,
                {
                  backgroundColor: selected
                    ? theme.primary
                    : theme.backgroundElement,
                  borderColor: selected ? theme.primary : theme.tabBorder,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.periodLabel,
                  {
                    color: selected
                      ? theme.primaryForeground
                      : theme.textSecondary,
                  },
                ]}
              >
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#00000055",
  },
  sheet: {
    overflow: "hidden",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  header: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  headerText: { flex: 1, minWidth: 0 },
  title: { fontSize: 22, lineHeight: 27, fontWeight: "900" },
  subtitle: { marginTop: 2, fontSize: 13, lineHeight: 17, fontWeight: "700" },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
  },
  content: { gap: 16, padding: 18, paddingBottom: 22 },
  field: { flex: 1, gap: 8 },
  label: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  input: {
    height: 50,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingHorizontal: 14,
    fontSize: 16,
    fontWeight: "800",
  },
  timeGrid: { flexDirection: "row", gap: 12 },
  periodRow: { flexDirection: "row", gap: 6 },
  periodChip: {
    flex: 1,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
    paddingVertical: 8,
  },
  periodLabel: { fontSize: 12, fontWeight: "900" },
  saveButton: {
    height: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  saveLabel: { fontSize: 15, fontWeight: "900" },
  errorText: {
    color: "#9D474D",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
  },
  pressed: { opacity: 0.65 },
});
