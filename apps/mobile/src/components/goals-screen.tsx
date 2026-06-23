import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { PlanReportHeaderMenu } from "@/components/plan-report-header-menu";
import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import { getLocalTimeZone } from "@/lib/google-calendar-client";
import {
  PLAN_PERIODS,
  type PlanPeriod,
  getPlanTimeInput,
  normalizePlanTimeInput,
} from "@/lib/plan-time";
import {
  type PlannedEvent,
  deletePlannedEvent,
  fetchPlannedEvents,
  upsertPlannedEvent,
} from "@/lib/planned-events-client";
import {
  type Goal,
  type GoalCheckpoint,
  type GoalInput,
  createPlanGoal,
  deletePlanGoal,
  fetchPlanGoals,
  updatePlanGoal,
  updatePlanGoalCheckpoint,
} from "@/lib/planning-goals-client";

type SymbolName = SymbolViewProps["name"];
type CheckpointDraft = {
  localId: string;
  title: string;
  targetDate: string;
  completed: boolean;
};
type ActiveCheckpoint = {
  goal: Goal;
  checkpoint: GoalCheckpoint;
};

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function symbol(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function todayDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatCheckpointDate(dateKey: string | null) {
  if (!dateKey) return "No date";
  const [year, month, day] = dateKey.split("-").map(Number);
  if (!year || !month || !day) return dateKey;

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: year === new Date().getFullYear() ? undefined : "numeric",
  }).format(new Date(year, month - 1, day));
}

export function GoalsScreen() {
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [activeCheckpoint, setActiveCheckpoint] =
    useState<ActiveCheckpoint | null>(null);
  const [planningCheckpoint, setPlanningCheckpoint] =
    useState<ActiveCheckpoint | null>(null);
  const [plannedEvents, setPlannedEvents] = useState<PlannedEvent[]>([]);

  const load = useCallback(async (refresh = false) => {
    refresh ? setIsRefreshing(true) : setIsLoading(true);
    setError(null);

    try {
      const [nextGoals, nextPlannedEvents] = await Promise.all([
        fetchPlanGoals(),
        fetchPlannedEvents({ sourceType: "goal_checkpoint" }),
      ]);
      setGoals(nextGoals);
      setPlannedEvents(nextPlannedEvents);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load goals.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleGoals = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return goals;

    return goals.filter((goal) =>
      `${goal.title} ${goal.checkpoints
        .map((checkpoint) => checkpoint.title)
        .join(" ")}`
        .toLowerCase()
        .includes(normalizedQuery),
    );
  }, [goals, query]);

  const plannedEventsByCheckpointId = useMemo(() => {
    const map = new Map<string, PlannedEvent>();
    for (const event of plannedEvents) {
      if (event.sourceType === "goal_checkpoint") {
        map.set(event.sourceId, event);
      }
    }
    return map;
  }, [plannedEvents]);

  const openCreate = () => {
    setEditingGoal(null);
    setFormOpen(true);
  };

  const openEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setFormOpen(true);
  };

  const saveGoal = async (input: GoalInput) => {
    if (editingGoal) {
      await updatePlanGoal(editingGoal.id, input);
    } else {
      await createPlanGoal(input);
    }

    await load();
    setFormOpen(false);
    setEditingGoal(null);
  };

  const updateGoalInList = (updatedGoal: Goal | null) => {
    if (!updatedGoal) return;
    setGoals((current) =>
      current.map((goal) => (goal.id === updatedGoal.id ? updatedGoal : goal)),
    );
  };

  const toggleCheckpointComplete = async (
    active: ActiveCheckpoint,
    completed: boolean,
  ) => {
    setActiveCheckpoint(null);
    setError(null);

    try {
      const updatedGoal = await updatePlanGoalCheckpoint(
        active.checkpoint.id,
        completed,
      );
      updateGoalInList(updatedGoal);
      if (completed) {
        setPlannedEvents((current) =>
          current.filter(
            (event) =>
              event.sourceType !== "goal_checkpoint" ||
              event.sourceId !== active.checkpoint.id,
          ),
        );
      } else {
        await load(true);
      }
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update checkpoint.",
      );
    }
  };

  const openCheckpointPlan = (active: ActiveCheckpoint) => {
    setActiveCheckpoint(null);
    setPlanningCheckpoint(active);
  };

  const saveCheckpointPlan = async ({
    dateKey,
    endTime,
    startTime,
    timeZone,
  }: {
    dateKey: string;
    endTime: string | null;
    startTime: string | null;
    timeZone: string | null;
  }) => {
    if (!planningCheckpoint) return;

    const result = await upsertPlannedEvent({
      dateKey,
      endTime,
      sourceId: planningCheckpoint.checkpoint.id,
      sourceType: "goal_checkpoint",
      startTime,
      timeZone,
      title: planningCheckpoint.checkpoint.title,
    });

    setPlannedEvents((current) => {
      const filtered = current.filter(
        (event) =>
          event.sourceType !== "goal_checkpoint" ||
          event.sourceId !== planningCheckpoint.checkpoint.id,
      );
      return [...filtered, result.event];
    });
  };

  const clearCheckpointPlan = async (active: ActiveCheckpoint) => {
    setActiveCheckpoint(null);
    setError(null);

    try {
      await deletePlannedEvent({
        sourceId: active.checkpoint.id,
        sourceType: "goal_checkpoint",
      });
      setPlannedEvents((current) =>
        current.filter(
          (event) =>
            event.sourceType !== "goal_checkpoint" ||
            event.sourceId !== active.checkpoint.id,
        ),
      );
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : "Could not clear checkpoint plan.",
      );
    }
  };

  const confirmDelete = (goal: Goal) => {
    Alert.alert(
      "Delete goal?",
      `"${goal.title}" will be permanently deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deletePlanGoal(goal.id);
              setGoals((current) =>
                current.filter((item) => item.id !== goal.id),
              );
              const checkpointIds = new Set(
                goal.checkpoints.map((checkpoint) => checkpoint.id),
              );
              setPlannedEvents((current) =>
                current.filter(
                  (event) =>
                    event.sourceType !== "goal_checkpoint" ||
                    !checkpointIds.has(event.sourceId),
                ),
              );
            } catch (deleteError) {
              setError(
                deleteError instanceof Error
                  ? deleteError.message
                  : "Could not delete goal.",
              );
            }
          },
        },
      ],
    );
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarHeight + 16 },
          ]}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              tintColor={theme.primary}
              onRefresh={() => void load(true)}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pageHeader}>
            <View style={styles.pageHeaderLeft}>
              <View style={styles.pageHeaderText}>
                <PlanReportHeaderMenu currentView="goals" />
              </View>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                accessibilityLabel="Add goal"
                accessibilityRole="button"
                onPress={openCreate}
                style={({ pressed }) => [
                  styles.addButton,
                  { backgroundColor: theme.primary },
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={symbol("plus", "add")}
                  size={18}
                  weight="semibold"
                  tintColor={theme.primaryForeground}
                />
              </Pressable>
            </View>
          </View>

          <View
            style={[
              styles.search,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.tabBorder,
              },
            ]}
          >
            <SymbolView
              name={symbol("magnifyingglass", "search")}
              size={18}
              tintColor={theme.textSecondary}
            />
            <TextInput
              accessibilityLabel="Search goals"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder="Search goals"
              placeholderTextColor={theme.textSecondary}
              selectionColor={theme.primary}
              style={[styles.searchInput, { color: theme.text }]}
              value={query}
            />
            {query ? (
              <Pressable
                accessibilityLabel="Clear search"
                hitSlop={10}
                onPress={() => setQuery("")}
              >
                <SymbolView
                  name={symbol("xmark.circle.fill", "cancel")}
                  size={18}
                  tintColor={theme.textSecondary}
                />
              </Pressable>
            ) : null}
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <SymbolView
                name={symbol("exclamationmark.circle.fill", "error")}
                size={18}
                tintColor="#9D474D"
              />
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => void load()}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={theme.primary} size="large" />
            </View>
          ) : visibleGoals.length ? (
            <View style={styles.goalList}>
              {visibleGoals.map((goal) => (
                <GoalCard
                  key={goal.id}
                  goal={goal}
                  plannedEventsByCheckpointId={plannedEventsByCheckpointId}
                  onDelete={() => confirmDelete(goal)}
                  onEdit={() => openEdit(goal)}
                  onPressCheckpoint={(checkpoint) =>
                    setActiveCheckpoint({ goal, checkpoint })
                  }
                />
              ))}
            </View>
          ) : (
            <EmptyState
              hasGoals={goals.length > 0}
              onAdd={openCreate}
              query={query}
            />
          )}
        </ScrollView>
      </SafeAreaView>

      <GoalFormModal
        goal={editingGoal}
        isOpen={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingGoal(null);
        }}
        onSave={saveGoal}
      />
      <CheckpointActionsModal
        active={activeCheckpoint}
        plannedEvent={
          activeCheckpoint
            ? plannedEventsByCheckpointId.get(activeCheckpoint.checkpoint.id)
            : null
        }
        onClose={() => setActiveCheckpoint(null)}
        onClearPlan={clearCheckpointPlan}
        onEditGoal={(goal) => {
          setActiveCheckpoint(null);
          openEdit(goal);
        }}
        onPlan={openCheckpointPlan}
        onToggleComplete={toggleCheckpointComplete}
      />
      <CheckpointPlanModal
        active={planningCheckpoint}
        existingPlan={
          planningCheckpoint
            ? plannedEventsByCheckpointId.get(planningCheckpoint.checkpoint.id)
            : null
        }
        onClose={() => setPlanningCheckpoint(null)}
        onSave={saveCheckpointPlan}
      />
    </View>
  );
}

function GoalCard({
  goal,
  plannedEventsByCheckpointId,
  onDelete,
  onEdit,
  onPressCheckpoint,
}: {
  goal: Goal;
  plannedEventsByCheckpointId: Map<string, PlannedEvent>;
  onDelete: () => void;
  onEdit: () => void;
  onPressCheckpoint: (checkpoint: GoalCheckpoint) => void;
}) {
  const theme = useTheme();
  const completedCount = goal.checkpoints.filter(
    (checkpoint) => checkpoint.completed,
  ).length;

  return (
    <View
      style={[
        styles.goalCard,
        { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
      ]}
    >
      <View style={styles.goalCardTop}>
        <View
          style={[
            styles.goalIcon,
            { backgroundColor: theme.backgroundElement },
          ]}
        >
          <SymbolView
            name={symbol("target", "target")}
            size={22}
            weight="semibold"
            tintColor={theme.primary}
          />
        </View>
        <View style={styles.goalBody}>
          <Text
            numberOfLines={2}
            style={[styles.goalTitle, { color: theme.text }]}
          >
            {goal.title}
          </Text>
          <Text style={[styles.goalMeta, { color: theme.textSecondary }]}>
            {completedCount}/{goal.checkpoints.length} checkpoints complete
          </Text>
        </View>
        <Pressable
          accessibilityLabel={`Edit ${goal.title}`}
          hitSlop={8}
          onPress={onEdit}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && { backgroundColor: theme.backgroundElement },
          ]}
        >
          <SymbolView
            name={symbol("pencil", "edit")}
            size={18}
            tintColor={theme.textSecondary}
          />
        </Pressable>
        <Pressable
          accessibilityLabel={`Delete ${goal.title}`}
          hitSlop={8}
          onPress={(event) => {
            event.stopPropagation();
            onDelete();
          }}
          style={({ pressed }) => [
            styles.iconButton,
            pressed && { backgroundColor: theme.backgroundElement },
          ]}
        >
          <SymbolView
            name={symbol("trash", "delete")}
            size={19}
            tintColor="#B84D54"
          />
        </Pressable>
      </View>

      {goal.checkpoints.length ? (
        <GoalTimeline
          checkpoints={goal.checkpoints}
          plannedEventsByCheckpointId={plannedEventsByCheckpointId}
          onPressCheckpoint={onPressCheckpoint}
        />
      ) : null}
    </View>
  );
}

function GoalTimeline({
  checkpoints,
  plannedEventsByCheckpointId,
  onPressCheckpoint,
}: {
  checkpoints: Goal["checkpoints"];
  plannedEventsByCheckpointId: Map<string, PlannedEvent>;
  onPressCheckpoint: (checkpoint: GoalCheckpoint) => void;
}) {
  const theme = useTheme();
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.timelineScroll}
      contentContainerStyle={styles.timelineContent}
    >
      {checkpoints.map((checkpoint, index) => {
        const plannedEvent = plannedEventsByCheckpointId.get(checkpoint.id);
        const nextCheckpoint = checkpoints[index + 1];
        const connectorIsComplete = Boolean(
          checkpoint.completed && nextCheckpoint?.completed,
        );
        const markerColor = checkpoint.completed
          ? theme.primary
          : plannedEvent
            ? theme.secondary
            : theme.backgroundElement;
        const markerBorderColor =
          checkpoint.completed || plannedEvent ? markerColor : theme.tabBorder;
        const planTime = plannedEvent?.startTime
          ? getPlanTimeInput(plannedEvent.startTime)
          : null;

        return (
          <View key={checkpoint.id} style={styles.timelineMilestone}>
            <Text
              numberOfLines={1}
              style={[
                styles.milestoneDate,
                {
                  color: checkpoint.completed
                    ? theme.primary
                    : plannedEvent
                      ? theme.secondary
                      : theme.text,
                },
              ]}
            >
              {formatCheckpointDate(
                plannedEvent?.date ?? checkpoint.targetDate,
              )}
            </Text>
            <View style={styles.milestoneTrackRow}>
              <Pressable
                accessibilityLabel={`${checkpoint.title}. Tap for checkpoint actions.`}
                accessibilityRole="button"
                onPress={() => onPressCheckpoint(checkpoint)}
                style={({ pressed }) => [
                  styles.milestoneMarker,
                  {
                    backgroundColor: markerColor,
                    borderColor: markerBorderColor,
                    shadowColor: theme.text,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={
                    checkpoint.completed
                      ? symbol("checkmark", "check")
                      : plannedEvent
                        ? symbol("calendar", "calendar_today")
                        : symbol("circle", "radio_button_unchecked")
                  }
                  size={checkpoint.completed ? 17 : 18}
                  weight="semibold"
                  tintColor={
                    checkpoint.completed
                      ? theme.primaryForeground
                      : plannedEvent
                        ? theme.secondaryForeground
                        : theme.textSecondary
                  }
                />
              </Pressable>
              {index < checkpoints.length - 1 ? (
                <View
                  style={[
                    styles.milestoneConnector,
                    {
                      backgroundColor: connectorIsComplete
                        ? theme.primary
                        : theme.tabBorder,
                    },
                  ]}
                />
              ) : null}
            </View>
            <Pressable onPress={() => onPressCheckpoint(checkpoint)}>
              <Text
                numberOfLines={2}
                style={[
                  styles.milestoneTitle,
                  { color: theme.text },
                  checkpoint.completed && styles.completedTimelineTitle,
                ]}
              >
                {checkpoint.title}
              </Text>
              <Text
                numberOfLines={2}
                style={[
                  styles.milestoneSubtitle,
                  { color: theme.textSecondary },
                ]}
              >
                {checkpoint.completed
                  ? "Complete"
                  : planTime?.time
                    ? `Planned ${planTime.time} ${planTime.period}`
                    : plannedEvent
                      ? "Planned"
                      : "Tap to plan"}
              </Text>
            </Pressable>
          </View>
        );
      })}
    </ScrollView>
  );
}

function CheckpointActionsModal({
  active,
  plannedEvent,
  onClearPlan,
  onClose,
  onEditGoal,
  onPlan,
  onToggleComplete,
}: {
  active: ActiveCheckpoint | null;
  plannedEvent?: PlannedEvent | null;
  onClearPlan: (active: ActiveCheckpoint) => void;
  onClose: () => void;
  onEditGoal: (goal: Goal) => void;
  onPlan: (active: ActiveCheckpoint) => void;
  onToggleComplete: (active: ActiveCheckpoint, completed: boolean) => void;
}) {
  const theme = useTheme();
  if (!active) return null;

  const { checkpoint, goal } = active;

  return (
    <Modal animationType="fade" transparent visible onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.actionSheet,
            { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
          ]}
        >
          <Text style={[styles.actionTitle, { color: theme.text }]}>
            {checkpoint.title}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.actionSubtitle, { color: theme.textSecondary }]}
          >
            {goal.title}
          </Text>
          <SheetAction
            icon={symbol("calendar.badge.plus", "event_available")}
            label={plannedEvent ? "Edit calendar plan" : "Plan to calendar"}
            onPress={() => onPlan(active)}
          />
          {plannedEvent ? (
            <SheetAction
              icon={symbol("calendar.badge.minus", "event_busy")}
              label="Clear calendar plan"
              onPress={() => onClearPlan(active)}
            />
          ) : null}
          <SheetAction
            icon={symbol(
              checkpoint.completed
                ? "arrow.uturn.backward.circle"
                : "checkmark.circle",
              checkpoint.completed ? "undo" : "check_circle",
            )}
            label={checkpoint.completed ? "Reopen checkpoint" : "Mark complete"}
            onPress={() => onToggleComplete(active, !checkpoint.completed)}
          />
          <SheetAction
            icon={symbol("pencil", "edit")}
            label="Edit goal"
            onPress={() => onEditGoal(goal)}
          />
        </View>
      </View>
    </Modal>
  );
}

function SheetAction({
  danger,
  icon,
  label,
  onPress,
}: {
  danger?: boolean;
  icon: SymbolName;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  const color = danger ? "#B84D54" : theme.tabIcon;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.sheetActionRow,
        pressed && { backgroundColor: theme.backgroundElement },
      ]}
    >
      <SymbolView name={icon} size={20} tintColor={color} />
      <Text
        style={[
          styles.sheetActionLabel,
          { color: danger ? "#B84D54" : theme.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function CheckpointPlanModal({
  active,
  existingPlan,
  onClose,
  onSave,
}: {
  active: ActiveCheckpoint | null;
  existingPlan?: PlannedEvent | null;
  onClose: () => void;
  onSave: (input: {
    dateKey: string;
    endTime: string | null;
    startTime: string | null;
    timeZone: string | null;
  }) => Promise<void>;
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
    active && dateIsValid && (!hasAnyTimeInput || hasValidTimeRange),
  );
  const timeZone = useMemo(() => getLocalTimeZone(), []);

  useEffect(() => {
    if (!active) return;

    const start = getPlanTimeInput(existingPlan?.startTime);
    const end = getPlanTimeInput(existingPlan?.endTime);
    setDateKey(
      existingPlan?.date ?? active.checkpoint.targetDate ?? todayDateKey(),
    );
    setStartTime(start.time);
    setEndTime(end.time);
    setStartPeriod(start.period);
    setEndPeriod(end.period);
    setError(null);
  }, [active, existingPlan]);

  const save = async () => {
    if (!canSave || isSaving) return;
    setIsSaving(true);
    setError(null);

    try {
      await onSave({
        dateKey: dateKey.trim(),
        endTime: hasValidTimeRange ? normalizedEndTime : null,
        startTime: hasValidTimeRange ? normalizedStartTime : null,
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

  if (!active) return null;

  return (
    <Modal animationType="slide" transparent visible onRequestClose={onClose}>
      <View style={styles.sheetOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <SafeAreaView
          edges={["bottom"]}
          style={[styles.planSheet, { backgroundColor: theme.background }]}
        >
          <View
            style={[
              styles.planSheetHeader,
              {
                backgroundColor: theme.tabBar,
                borderBottomColor: theme.tabBorder,
              },
            ]}
          >
            <View style={styles.planSheetTitleBlock}>
              <Text style={[styles.planSheetTitle, { color: theme.text }]}>
                {existingPlan ? "Edit calendar plan" : "Plan to calendar"}
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  styles.planSheetSubtitle,
                  { color: theme.textSecondary },
                ]}
              >
                {active.checkpoint.title}
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
                name={symbol("xmark", "close")}
                size={14}
                weight="bold"
                tintColor={theme.textSecondary}
              />
            </Pressable>
          </View>
          <View style={styles.planSheetContent}>
            <View style={styles.inputField}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>
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
            <View style={styles.planTimeGrid}>
              <CheckpointPlanTimeField
                label="Start"
                period={startPeriod}
                value={startTime}
                onChangePeriod={setStartPeriod}
                onChangeText={setStartTime}
              />
              <CheckpointPlanTimeField
                label="End"
                period={endPeriod}
                value={endTime}
                onChangePeriod={setEndPeriod}
                onChangeText={setEndTime}
              />
            </View>
            {hasAnyTimeInput && !hasValidTimeRange ? (
              <Text style={styles.formError}>
                Add both start and end times like 9:00.
              </Text>
            ) : null}
            {dateKey.trim() && !dateIsValid ? (
              <Text style={styles.formError}>Use date format YYYY-MM-DD.</Text>
            ) : null}
            {error ? <Text style={styles.formError}>{error}</Text> : null}
            <Pressable
              accessibilityRole="button"
              disabled={!canSave || isSaving}
              onPress={() => void save()}
              style={({ pressed }) => [
                styles.planSaveButton,
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
                  style={[
                    styles.planSaveButtonText,
                    { color: theme.primaryForeground },
                  ]}
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

function CheckpointPlanTimeField({
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
    <View style={[styles.inputField, styles.planTimeField]}>
      <Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
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
      <View style={styles.planPeriodRow}>
        {PLAN_PERIODS.map((option) => {
          const selected = period === option;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option}
              onPress={() => onChangePeriod(option)}
              style={({ pressed }) => [
                styles.planPeriodChip,
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
                  styles.planPeriodLabel,
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

function EmptyState({
  hasGoals,
  onAdd,
  query,
}: {
  hasGoals: boolean;
  onAdd: () => void;
  query: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.centerState}>
      <View
        style={[styles.emptyIcon, { backgroundColor: theme.backgroundElement }]}
      >
        <SymbolView
          name={symbol(
            hasGoals ? "magnifyingglass" : "target",
            hasGoals ? "search" : "target",
          )}
          size={28}
          tintColor={theme.primary}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        {hasGoals ? "No goals found" : "Create your first goal"}
      </Text>
      <Text style={[styles.emptyDescription, { color: theme.textSecondary }]}>
        {hasGoals
          ? `Nothing matched "${query.trim()}".`
          : "Add a bigger outcome and break it into checkpoints."}
      </Text>
      {!hasGoals ? (
        <Pressable
          onPress={onAdd}
          style={({ pressed }) => [
            styles.emptyButton,
            { backgroundColor: theme.primary },
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[
              styles.emptyButtonLabel,
              { color: theme.primaryForeground },
            ]}
          >
            Add goal
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function GoalFormModal({
  goal,
  isOpen,
  onClose,
  onSave,
}: {
  goal: Goal | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (input: GoalInput) => Promise<void>;
}) {
  const theme = useTheme();
  const [title, setTitle] = useState("");
  const [checkpoints, setCheckpoints] = useState<CheckpointDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(goal?.title ?? "");
    setCheckpoints(
      goal?.checkpoints.length
        ? goal.checkpoints.map((checkpoint) => ({
            localId: checkpoint.id,
            title: checkpoint.title,
            targetDate: checkpoint.targetDate ?? "",
            completed: checkpoint.completed,
          }))
        : [createEmptyCheckpoint()],
    );
    setError(null);
  }, [goal, isOpen]);

  const updateCheckpoint = (
    localId: string,
    updates: Partial<Omit<CheckpointDraft, "localId">>,
  ) => {
    setCheckpoints((current) =>
      current.map((checkpoint) =>
        checkpoint.localId === localId
          ? { ...checkpoint, ...updates }
          : checkpoint,
      ),
    );
  };

  const removeCheckpoint = (localId: string) => {
    setCheckpoints((current) =>
      current.filter((checkpoint) => checkpoint.localId !== localId),
    );
  };

  const save = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isSaving) return;

    const checkpointInput = checkpoints
      .map((checkpoint) => ({
        title: checkpoint.title.trim(),
        targetDate: checkpoint.targetDate.trim(),
        completed: checkpoint.completed,
      }))
      .filter((checkpoint) => checkpoint.title.length > 0);
    const invalidDate = checkpointInput.find(
      (checkpoint) =>
        checkpoint.targetDate.length > 0 &&
        !DATE_KEY_REGEX.test(checkpoint.targetDate),
    );

    if (invalidDate) {
      setError("Checkpoint dates need to use YYYY-MM-DD.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await onSave({
        title: trimmedTitle,
        checkpoints: checkpointInput.map((checkpoint) => ({
          title: checkpoint.title,
          targetDate: checkpoint.targetDate || null,
          completed: checkpoint.completed,
        })),
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save goal.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      presentationStyle="pageSheet"
      visible={isOpen}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.formScreen, { backgroundColor: theme.background }]}
      >
        <SafeAreaView style={styles.formSafeArea}>
          <View
            style={[
              styles.formHeader,
              {
                backgroundColor: theme.tabBar,
                borderBottomColor: theme.tabBorder,
              },
            ]}
          >
            <Pressable onPress={onClose} style={styles.formHeaderButton}>
              <Text
                style={[styles.formHeaderButtonText, { color: theme.primary }]}
              >
                Cancel
              </Text>
            </Pressable>
            <Text style={[styles.formTitle, { color: theme.text }]}>
              {goal ? "Edit Goal" : "New Goal"}
            </Text>
            <Pressable
              disabled={!title.trim() || isSaving}
              onPress={() => void save()}
              style={styles.formHeaderButton}
            >
              {isSaving ? (
                <ActivityIndicator color={theme.primary} size="small" />
              ) : (
                <Text
                  style={[
                    styles.formHeaderButtonText,
                    {
                      color: title.trim() ? theme.primary : theme.textSecondary,
                    },
                  ]}
                >
                  Save
                </Text>
              )}
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.formSection}>
              <Text
                style={[styles.sectionTitle, { color: theme.textSecondary }]}
              >
                Goal
              </Text>
              <View
                style={[
                  styles.sectionSurface,
                  {
                    backgroundColor: theme.tabBar,
                    borderColor: theme.tabBorder,
                  },
                ]}
              >
                <View style={styles.inputField}>
                  <Text style={[styles.fieldLabel, { color: theme.text }]}>
                    Title
                  </Text>
                  <TextInput
                    autoFocus
                    onChangeText={setTitle}
                    placeholder="What are you working toward?"
                    placeholderTextColor={theme.textSecondary}
                    returnKeyType="done"
                    selectionColor={theme.primary}
                    style={[
                      styles.input,
                      {
                        backgroundColor: theme.backgroundElement,
                        borderColor: theme.tabBorder,
                        color: theme.text,
                      },
                    ]}
                    value={title}
                  />
                </View>
              </View>
            </View>

            <View style={styles.formSection}>
              <Text
                style={[styles.sectionTitle, { color: theme.textSecondary }]}
              >
                Checkpoints
              </Text>
              <View
                style={[
                  styles.sectionSurface,
                  {
                    backgroundColor: theme.tabBar,
                    borderColor: theme.tabBorder,
                  },
                ]}
              >
                {checkpoints.map((checkpoint, index) => (
                  <View key={checkpoint.localId} style={styles.checkpointRow}>
                    <View style={styles.checkpointHeader}>
                      <Text
                        style={[
                          styles.checkpointNumber,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {index + 1}
                      </Text>
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: checkpoint.completed }}
                        onPress={() =>
                          updateCheckpoint(checkpoint.localId, {
                            completed: !checkpoint.completed,
                          })
                        }
                        style={({ pressed }) => [
                          styles.checkpointToggle,
                          {
                            backgroundColor: checkpoint.completed
                              ? theme.primary
                              : theme.backgroundElement,
                            borderColor: checkpoint.completed
                              ? theme.primary
                              : theme.tabBorder,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        {checkpoint.completed ? (
                          <SymbolView
                            name={symbol("checkmark", "check")}
                            size={14}
                            weight="semibold"
                            tintColor={theme.primaryForeground}
                          />
                        ) : null}
                      </Pressable>
                      <Pressable
                        accessibilityLabel="Remove checkpoint"
                        hitSlop={8}
                        onPress={() => removeCheckpoint(checkpoint.localId)}
                        style={({ pressed }) => [
                          styles.removeCheckpoint,
                          pressed && {
                            backgroundColor: theme.backgroundElement,
                          },
                        ]}
                      >
                        <SymbolView
                          name={symbol("minus.circle", "remove_circle")}
                          size={18}
                          tintColor={theme.textSecondary}
                        />
                      </Pressable>
                    </View>
                    <View style={styles.checkpointInputs}>
                      <TextInput
                        onChangeText={(checkpointTitle) =>
                          updateCheckpoint(checkpoint.localId, {
                            title: checkpointTitle,
                          })
                        }
                        placeholder="Checkpoint"
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
                        value={checkpoint.title}
                      />
                      <TextInput
                        autoCapitalize="none"
                        keyboardType="numbers-and-punctuation"
                        onChangeText={(targetDate) =>
                          updateCheckpoint(checkpoint.localId, { targetDate })
                        }
                        placeholder="Target date (YYYY-MM-DD)"
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
                        value={checkpoint.targetDate}
                      />
                    </View>
                  </View>
                ))}
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    setCheckpoints((current) => [
                      ...current,
                      createEmptyCheckpoint(),
                    ])
                  }
                  style={({ pressed }) => [
                    styles.inlineAdd,
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={symbol("plus.circle", "add_circle")}
                    size={18}
                    tintColor={theme.primary}
                  />
                  <Text
                    style={[styles.inlineAddLabel, { color: theme.primary }]}
                  >
                    Add checkpoint
                  </Text>
                </Pressable>
              </View>
            </View>

            {error ? <Text style={styles.formError}>{error}</Text> : null}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function createEmptyCheckpoint(): CheckpointDraft {
  return {
    localId: `${Date.now()}_${Math.random().toString(36).slice(2)}`,
    title: "",
    targetDate: "",
    completed: false,
  };
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 20,
    gap: 16,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 42,
    position: "relative",
  },
  pageHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    flex: 1,
    paddingRight: 54,
  },
  pageHeaderText: { gap: 1 },
  headerActions: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
  },
  addButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  search: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 15, fontWeight: "500" },
  goalList: { gap: 10 },
  goalCard: {
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 12,
  },
  goalCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  goalIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  goalBody: { flex: 1, minWidth: 0, gap: 4 },
  goalTitle: { fontSize: 16, lineHeight: 21, fontWeight: "800" },
  goalMeta: { fontSize: 12, lineHeight: 16, fontWeight: "600" },
  iconButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  timelineScroll: { marginHorizontal: -12 },
  timelineContent: {
    paddingHorizontal: 12,
    paddingBottom: 2,
  },
  timelineMilestone: {
    width: 132,
    minHeight: 122,
  },
  milestoneDate: {
    marginBottom: 10,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "900",
    textAlign: "center",
  },
  milestoneTrackRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 42,
  },
  milestoneMarker: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderRadius: 21,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  milestoneConnector: {
    flex: 1,
    height: 9,
    marginLeft: 0,
    borderRadius: 999,
  },
  milestoneTitle: {
    marginTop: 11,
    paddingRight: 12,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "900",
    textAlign: "center",
  },
  milestoneSubtitle: {
    marginTop: 3,
    paddingRight: 12,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
    textAlign: "center",
  },
  completedTimelineTitle: { textDecorationLine: "line-through", opacity: 0.7 },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#00000055",
    padding: 12,
  },
  actionSheet: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 25,
    padding: 8,
    paddingBottom: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  actionTitle: {
    paddingHorizontal: 14,
    paddingTop: 12,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  actionSubtitle: {
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 8,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  sheetActionRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  sheetActionLabel: { fontSize: 15, lineHeight: 20, fontWeight: "800" },
  planSheet: {
    overflow: "hidden",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  planSheetHeader: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  planSheetTitleBlock: { flex: 1, minWidth: 0 },
  planSheetTitle: { fontSize: 22, lineHeight: 27, fontWeight: "900" },
  planSheetSubtitle: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
  },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
  },
  planSheetContent: { gap: 14, padding: 18, paddingBottom: 28 },
  planTimeGrid: { flexDirection: "row", gap: 10 },
  planTimeField: { flex: 1, minWidth: 0 },
  planSaveButton: {
    minHeight: 50,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    marginTop: 2,
  },
  planSaveButtonText: { fontSize: 15, lineHeight: 20, fontWeight: "900" },
  planPeriodRow: {
    flexDirection: "row",
    gap: 6,
  },
  planPeriodChip: {
    flex: 1,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
  },
  planPeriodLabel: { fontSize: 12, lineHeight: 16, fontWeight: "800" },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 64,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    marginBottom: 3,
  },
  emptyTitle: { fontSize: 18, lineHeight: 23, fontWeight: "800" },
  emptyDescription: {
    maxWidth: 280,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
  },
  emptyButton: {
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 11,
    marginTop: 4,
  },
  emptyButtonLabel: { fontSize: 14, fontWeight: "800" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: "#F3B7B933",
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  errorText: {
    flex: 1,
    color: "#9D474D",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  retryText: { color: "#9D474D", fontSize: 12, fontWeight: "800" },
  formScreen: { flex: 1 },
  formSafeArea: { flex: 1 },
  formHeader: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  formHeaderButton: {
    minWidth: 64,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  formHeaderButtonText: { fontSize: 15, fontWeight: "700" },
  formTitle: { fontSize: 16, lineHeight: 21, fontWeight: "800" },
  formContent: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    gap: 14,
    padding: 18,
    paddingBottom: 48,
  },
  formSection: { gap: 7 },
  sectionTitle: {
    paddingHorizontal: 4,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  sectionSurface: {
    gap: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    padding: 16,
  },
  inputField: { gap: 7 },
  fieldLabel: { fontSize: 13, lineHeight: 17, fontWeight: "700" },
  input: {
    minHeight: 49,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "500",
  },
  checkpointRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  checkpointHeader: {
    alignItems: "center",
    gap: 6,
    paddingTop: 7,
  },
  checkpointNumber: { fontSize: 11, lineHeight: 15, fontWeight: "800" },
  checkpointToggle: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 13,
  },
  removeCheckpoint: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  checkpointInputs: { flex: 1, minWidth: 0, gap: 8 },
  inlineAdd: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 7,
    paddingVertical: 4,
  },
  inlineAddLabel: { fontSize: 13, lineHeight: 18, fontWeight: "800" },
  formError: {
    color: "#9D474D",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    paddingHorizontal: 4,
  },
  pressed: { opacity: 0.72 },
});
