import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { type MenuAction, MenuView } from "@expo/ui/community/menu";
import * as Haptics from "expo-haptics";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  type GestureResponderEvent,
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

import { BrandedEmptyState } from "@/components/branded-empty-state";
import {
  CelebrationOverlay,
  confettiSource,
} from "@/components/celebration-overlay";
import { modalStyles } from "@/components/daily-goals/shared";
import { GoalLogVisibilityControl } from "@/components/goal-log-visibility-control";
import {
  CreateSectionHeaderTabs,
  PageHeaderTitle,
} from "@/components/section-header-tabs";
import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import {
  getCachedData,
  isCacheFresh,
  setCachedData,
} from "@/lib/app-data-cache";
import {
  fetchCheckpointPhotos,
  uploadCheckpointPhoto,
} from "@/lib/checkpoint-photos-client";
import { type GoalPhotoSource, pickGoalPhoto } from "@/lib/goal-photo-picker";
import type { GoalVisibility } from "@/lib/goals-client";
import { getLocalTimeZone } from "@/lib/google-calendar-client";
import { playSelectionHaptic, playSuccessHaptic } from "@/lib/haptics";
import {
  PLAN_PERIODS,
  type PlanPeriod,
  formatStoredPlanTimeDisplay,
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
  type GoalTiming,
  createPlanGoal,
  deletePlanGoal,
  fetchPlanGoals,
  reorderPlanGoals,
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
type DateKeyParts = { year: number; month: number; day: number };
type TargetDatePart = "year" | "month" | "day";
type GoalDragSlot = { id: string; y: number; height: number };
type GoalsScreenCache = {
  goals: Goal[];
  plannedEvents: PlannedEvent[];
};

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CLEAR_TARGET_DATE_ACTION = "clear-target-date";
const GOALS_SCREEN_CACHE_KEY = "screen:goals";
const MONTH_OPTIONS = [
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
] as const;

function symbol(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function todayDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function parseDateKeyParts(dateKey: string): DateKeyParts | null {
  if (!DATE_KEY_REGEX.test(dateKey)) return null;

  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function getTodayDateParts(): DateKeyParts {
  const date = new Date();
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function getDatePartsForPicker(dateKey: string): DateKeyParts {
  return parseDateKeyParts(dateKey) ?? getTodayDateParts();
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

function formatDateKey({ year, month, day }: DateKeyParts): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0",
  )}`;
}

function updateDatePart(
  dateKey: string,
  part: TargetDatePart,
  value: number,
): string {
  const base = getDatePartsForPicker(dateKey);
  const next = { ...base, [part]: value };
  const daysInMonth = getDaysInMonth(next.year, next.month);

  return formatDateKey({ ...next, day: Math.min(next.day, daysInMonth) });
}

function getYearOptions(selectedYear: number | undefined): number[] {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 26 }, (_, index) => currentYear + index);

  // Keep an already-selected past year visible when editing an older item.
  if (selectedYear && !years.includes(selectedYear)) years.push(selectedYear);

  return years.sort((left, right) => left - right);
}

function menuSelectedState(selected: boolean): MenuAction["state"] {
  return selected ? "on" : undefined;
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
  const cachedScreen = getCachedData<GoalsScreenCache>(GOALS_SCREEN_CACHE_KEY);
  const [goals, setGoals] = useState<Goal[]>(cachedScreen?.data.goals ?? []);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(!cachedScreen);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [activeCheckpoint, setActiveCheckpoint] =
    useState<ActiveCheckpoint | null>(null);
  const [planningCheckpoint, setPlanningCheckpoint] =
    useState<ActiveCheckpoint | null>(null);
  const [plannedEvents, setPlannedEvents] = useState<PlannedEvent[]>(
    cachedScreen?.data.plannedEvents ?? [],
  );
  const [celebrate, setCelebrate] = useState(false);
  const [showLaterGoals, setShowLaterGoals] = useState(false);
  const [draggingGoalId, setDraggingGoalId] = useState<string | null>(null);
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const goalsRef = useRef<Goal[]>([]);
  const goalLayoutsRef = useRef<Record<string, { y: number; height: number }>>(
    {},
  );
  const visibleGoalIdsRef = useRef<string[]>([]);
  const dragSlotLayoutsRef = useRef<GoalDragSlot[]>([]);
  const dragVisibleGoalIdsRef = useRef<string[]>([]);
  const dragStartGoalIdsRef = useRef<string[]>([]);
  const draggingGoalIdRef = useRef<string | null>(null);

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    goalsRef.current = goals;
  }, [goals]);

  const load = useCallback(async (refresh = false) => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    const cached = getCachedData<GoalsScreenCache>(GOALS_SCREEN_CACHE_KEY);
    if (!refresh && cached) {
      goalsRef.current = cached.data.goals;
      setGoals(cached.data.goals);
      setPlannedEvents(cached.data.plannedEvents);
      setIsLoading(false);
      if (isCacheFresh(cached)) return;
    }
    refresh ? setIsRefreshing(true) : setIsLoading(!cached);
    setError(null);

    try {
      const [nextGoals, nextPlannedEvents] = await Promise.all([
        fetchPlanGoals(),
        fetchPlannedEvents({ sourceType: "goal_checkpoint" }),
      ]);
      if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
        return;
      }
      setCachedData(GOALS_SCREEN_CACHE_KEY, {
        goals: nextGoals,
        plannedEvents: nextPlannedEvents,
      });
      goalsRef.current = nextGoals;
      setGoals(nextGoals);
      setPlannedEvents(nextPlannedEvents);
    } catch (loadError) {
      if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
        return;
      }
      if (!cached) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load goals.",
        );
      }
    } finally {
      if (isMountedRef.current && requestId === loadRequestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const searchedGoals = useMemo(() => {
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
  const queryIsActive = query.trim().length > 0;
  const currentGoals = useMemo(
    () => searchedGoals.filter((goal) => goal.timing !== "later"),
    [searchedGoals],
  );
  const laterGoals = useMemo(
    () => searchedGoals.filter((goal) => goal.timing === "later"),
    [searchedGoals],
  );
  const visibleGoals = useMemo(
    () =>
      queryIsActive || showLaterGoals
        ? searchedGoals
        : searchedGoals.filter((goal) => goal.timing !== "later"),
    [queryIsActive, searchedGoals, showLaterGoals],
  );
  const onlyLaterGoalsHidden =
    !queryIsActive &&
    !showLaterGoals &&
    currentGoals.length === 0 &&
    laterGoals.length > 0;

  useEffect(() => {
    visibleGoalIdsRef.current = visibleGoals.map((goal) => goal.id);
  }, [visibleGoals]);

  const plannedEventsByCheckpointId = useMemo(() => {
    const map = new Map<string, PlannedEvent>();
    for (const event of plannedEvents) {
      if (event.sourceType === "goal_checkpoint") {
        map.set(event.sourceId, event);
      }
    }
    return map;
  }, [plannedEvents]);

  const writeGoalsCache = useCallback(
    (nextGoals: Goal[], nextPlannedEvents = plannedEvents) => {
      setCachedData(GOALS_SCREEN_CACHE_KEY, {
        goals: nextGoals,
        plannedEvents: nextPlannedEvents,
      });
    },
    [plannedEvents],
  );

  const openCreate = () => {
    setEditingGoal(null);
    setFormOpen(true);
  };

  const openEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setFormOpen(true);
  };

  const saveGoal = async (input: GoalInput) => {
    const savedGoal = editingGoal
      ? await updatePlanGoal(editingGoal.id, input)
      : await createPlanGoal(input);

    setGoals((current) => {
      const next = editingGoal
        ? current.map((goal) => (goal.id === savedGoal.id ? savedGoal : goal))
        : [...current, savedGoal];
      goalsRef.current = next;
      writeGoalsCache(next);
      return next;
    });
    fetchPlannedEvents({ sourceType: "goal_checkpoint" })
      .then((nextPlannedEvents) => {
        setPlannedEvents(nextPlannedEvents);
        setCachedData(GOALS_SCREEN_CACHE_KEY, {
          goals: goalsRef.current,
          plannedEvents: nextPlannedEvents,
        });
      })
      .catch(() => {});
    setFormOpen(false);
    setEditingGoal(null);
  };

  const updateGoalInList = (updatedGoal: Goal | null) => {
    if (!updatedGoal) return;
    setGoals((current) => {
      const next = current.map((goal) =>
        goal.id === updatedGoal.id ? updatedGoal : goal,
      );
      goalsRef.current = next;
      writeGoalsCache(next);
      return next;
    });
  };

  const handleCheckpointSaved = (updatedGoal: Goal | null) => {
    updateGoalInList(updatedGoal);
    if (!updatedGoal) return;

    // A completed checkpoint drops its calendar plan.
    const completedIds = new Set(
      updatedGoal.checkpoints
        .filter((checkpoint) => checkpoint.completed)
        .map((checkpoint) => checkpoint.id),
    );
    setPlannedEvents((current) => {
      const nextPlannedEvents = current.filter(
        (event) =>
          event.sourceType !== "goal_checkpoint" ||
          !completedIds.has(event.sourceId),
      );
      setCachedData(GOALS_SCREEN_CACHE_KEY, {
        goals: goalsRef.current,
        plannedEvents: nextPlannedEvents,
      });
      return nextPlannedEvents;
    });
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
      const nextPlannedEvents = [...filtered, result.event];
      setCachedData(GOALS_SCREEN_CACHE_KEY, {
        goals: goalsRef.current,
        plannedEvents: nextPlannedEvents,
      });
      return nextPlannedEvents;
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
      setPlannedEvents((current) => {
        const nextPlannedEvents = current.filter(
          (event) =>
            event.sourceType !== "goal_checkpoint" ||
            event.sourceId !== active.checkpoint.id,
        );
        setCachedData(GOALS_SCREEN_CACHE_KEY, {
          goals: goalsRef.current,
          plannedEvents: nextPlannedEvents,
        });
        return nextPlannedEvents;
      });
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
              const checkpointIds = new Set(
                goal.checkpoints.map((checkpoint) => checkpoint.id),
              );
              setGoals((current) => {
                const next = current.filter((item) => item.id !== goal.id);
                goalsRef.current = next;
                setCachedData(GOALS_SCREEN_CACHE_KEY, {
                  goals: next,
                  plannedEvents: plannedEvents.filter(
                    (event) =>
                      event.sourceType !== "goal_checkpoint" ||
                      !checkpointIds.has(event.sourceId),
                  ),
                });
                return next;
              });
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

  const measureGoalCard = useCallback(
    (goalId: string, y: number, height: number) => {
      goalLayoutsRef.current[goalId] = { y, height };
    },
    [],
  );

  const playReorderHaptic = useCallback(() => {
    void (
      Platform.OS === "android"
        ? Haptics.performAndroidHapticsAsync(
            Haptics.AndroidHaptics.Segment_Tick,
          )
        : Haptics.selectionAsync()
    ).catch(() => {});
  }, []);

  const moveGoalToVisibleIndex = useCallback(
    (dragGoalId: string, destinationIndex: number) => {
      const visibleGoalIds = dragVisibleGoalIdsRef.current;
      const fromVisibleIndex = visibleGoalIds.indexOf(dragGoalId);
      const nextVisibleIndex = Math.max(
        0,
        Math.min(destinationIndex, visibleGoalIds.length - 1),
      );

      if (
        fromVisibleIndex < 0 ||
        nextVisibleIndex < 0 ||
        fromVisibleIndex === nextVisibleIndex
      ) {
        return;
      }

      const nextVisibleGoalIds = [...visibleGoalIds];
      const [movedGoalId] = nextVisibleGoalIds.splice(fromVisibleIndex, 1);
      nextVisibleGoalIds.splice(nextVisibleIndex, 0, movedGoalId);
      dragVisibleGoalIdsRef.current = nextVisibleGoalIds;

      const current = goalsRef.current;
      const currentGoalsById = new Map(current.map((goal) => [goal.id, goal]));
      const nextVisibleGoalIdSet = new Set(nextVisibleGoalIds);
      let visibleIndex = 0;

      const next = current.map((goal) => {
        if (!nextVisibleGoalIdSet.has(goal.id)) return goal;
        const visibleGoalId = nextVisibleGoalIds[visibleIndex++];
        return currentGoalsById.get(visibleGoalId) ?? goal;
      });
      goalsRef.current = next;
      writeGoalsCache(next);
      setGoals(next);
      playReorderHaptic();
    },
    [playReorderHaptic, writeGoalsCache],
  );

  const beginGoalDrag = useCallback((goalId: string) => {
    dragStartGoalIdsRef.current = goalsRef.current.map((goal) => goal.id);
    dragVisibleGoalIdsRef.current = visibleGoalIdsRef.current;
    dragSlotLayoutsRef.current = visibleGoalIdsRef.current
      .map((id) => {
        const layout = goalLayoutsRef.current[id];
        return layout ? { id, ...layout } : null;
      })
      .filter((slot): slot is GoalDragSlot => Boolean(slot))
      .sort((a, b) => a.y - b.y);
    draggingGoalIdRef.current = goalId;
    setDraggingGoalId(goalId);
  }, []);

  const handleGoalDragMove = useCallback(
    (event: GestureResponderEvent) => {
      const dragGoalId = draggingGoalIdRef.current;
      if (!dragGoalId) return;

      const y = event.nativeEvent.pageY;
      const slotLayouts = dragSlotLayoutsRef.current;
      if (slotLayouts.length === 0) return;

      let destinationIndex = slotLayouts.length - 1;
      for (let index = 0; index < slotLayouts.length; index += 1) {
        const slot = slotLayouts[index];
        if (y < slot.y + slot.height / 2) {
          destinationIndex = index;
          break;
        }
      }

      moveGoalToVisibleIndex(dragGoalId, destinationIndex);
    },
    [moveGoalToVisibleIndex],
  );

  const endGoalDrag = useCallback(() => {
    const dragGoalId = draggingGoalIdRef.current;
    draggingGoalIdRef.current = null;
    setDraggingGoalId(null);

    if (!dragGoalId) return;

    const nextGoalIds = goalsRef.current.map((goal) => goal.id);
    if (nextGoalIds.join("|") === dragStartGoalIdsRef.current.join("|")) {
      return;
    }

    reorderPlanGoals(nextGoalIds).catch((reorderError) => {
      setError(
        reorderError instanceof Error
          ? reorderError.message
          : "Could not reorder goals.",
      );
      void load();
    });
  }, [load]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView
          canCancelContentTouches
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarHeight + 16 },
          ]}
          directionalLockEnabled
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              tintColor={theme.primary}
              onRefresh={() => void load(true)}
            />
          }
          scrollEnabled={!draggingGoalId}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pageHeader}>
            <View style={styles.pageHeaderLeft}>
              <View style={styles.pageHeaderText}>
                <PageHeaderTitle title="Create" />
                <CreateSectionHeaderTabs currentSection="goals" />
              </View>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                accessibilityLabel="Add goal"
                accessibilityRole="button"
                onPress={openCreate}
                style={({ pressed }) => [
                  styles.addButton,
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={symbol("plus", "add")}
                  size={28}
                  weight="semibold"
                  tintColor={theme.primary}
                />
              </Pressable>
            </View>
          </View>

          <View
            style={[
              styles.search,
              {
                backgroundColor: "transparent",
                borderColor: `${theme.tabBorder}AA`,
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
              <FloatingLogoLoader />
            </View>
          ) : visibleGoals.length ? (
            <>
              <View style={styles.goalList}>
                {visibleGoals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    isDragging={draggingGoalId === goal.id}
                    plannedEventsByCheckpointId={plannedEventsByCheckpointId}
                    onDelete={() => confirmDelete(goal)}
                    onDragEnd={endGoalDrag}
                    onDragMove={handleGoalDragMove}
                    onDragStart={beginGoalDrag}
                    onEdit={() => openEdit(goal)}
                    onMeasure={measureGoalCard}
                    onPressCheckpoint={(checkpoint) =>
                      setActiveCheckpoint({ goal, checkpoint })
                    }
                  />
                ))}
              </View>
              {!queryIsActive && laterGoals.length > 0 ? (
                <LaterGoalsToggle
                  count={laterGoals.length}
                  expanded={showLaterGoals}
                  onPress={() => setShowLaterGoals((current) => !current)}
                />
              ) : null}
            </>
          ) : onlyLaterGoalsHidden ? (
            <>
              <View style={styles.centerState}>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>
                  No current goals
                </Text>
                <Text
                  style={[
                    styles.emptyDescription,
                    { color: theme.textSecondary },
                  ]}
                >
                  Later goals are hidden.
                </Text>
              </View>
              <LaterGoalsToggle
                count={laterGoals.length}
                expanded={showLaterGoals}
                onPress={() => setShowLaterGoals((current) => !current)}
              />
            </>
          ) : (
            <>
              <EmptyState
                hasGoals={goals.length > 0}
                onAdd={openCreate}
                query={query}
              />
            </>
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
        onSaved={handleCheckpointSaved}
        onCompleted={() => setCelebrate(true)}
        onError={setError}
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
      <CelebrationOverlay
        visible={celebrate}
        source={confettiSource}
        withLogo
        onDone={() => setCelebrate(false)}
      />
    </View>
  );
}

function GoalCard({
  goal,
  isDragging,
  plannedEventsByCheckpointId,
  onDelete,
  onDragEnd,
  onDragMove,
  onDragStart,
  onEdit,
  onMeasure,
  onPressCheckpoint,
}: {
  goal: Goal;
  isDragging: boolean;
  plannedEventsByCheckpointId: Map<string, PlannedEvent>;
  onDelete: () => void;
  onDragEnd: () => void;
  onDragMove: (event: GestureResponderEvent) => void;
  onDragStart: (goalId: string) => void;
  onEdit: () => void;
  onMeasure: (goalId: string, y: number, height: number) => void;
  onPressCheckpoint: (checkpoint: GoalCheckpoint) => void;
}) {
  const theme = useTheme();
  const cardRef = useRef<View>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const completedCount = goal.checkpoints.filter(
    (checkpoint) => checkpoint.completed,
  ).length;
  const actionItems: MenuAction[] = [
    {
      id: "edit-goal",
      title: "Edit goal",
      image: "pencil",
    },
    {
      id: "delete-goal",
      title: "Delete goal",
      image: "trash",
    },
  ];

  return (
    <View
      ref={cardRef}
      onLayout={() => {
        cardRef.current?.measureInWindow((_x, y, _width, height) => {
          onMeasure(goal.id, y, height);
        });
      }}
      style={[
        styles.goalCard,
        {
          backgroundColor: theme.tabBar,
          borderColor: theme.tabBorder,
          shadowColor:
            theme.background === "#ffffff" ? theme.secondary : "#000",
        },
        isDragging && styles.goalCardDragging,
      ]}
    >
      <View style={styles.goalCardTop}>
        <View
          accessible
          accessibilityHint="Hold and drag to reorder this goal."
          accessibilityLabel={`Reorder ${goal.title}`}
          accessibilityRole="button"
          hitSlop={8}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={() => onDragStart(goal.id)}
          onResponderMove={onDragMove}
          onResponderRelease={onDragEnd}
          onResponderTerminate={onDragEnd}
          onResponderTerminationRequest={() => false}
          onStartShouldSetResponder={() => true}
          style={styles.dragHandle}
        >
          <SymbolView
            name={symbol("line.3.horizontal", "drag_handle")}
            size={19}
            weight="semibold"
            tintColor={isDragging ? theme.primary : theme.textSecondary}
          />
        </View>
        <View style={styles.goalBody}>
          <View style={styles.goalTitleRow}>
            <Text
              numberOfLines={2}
              style={[styles.goalTitle, { color: theme.text }]}
            >
              {goal.title}
            </Text>
          </View>
          <Text
            style={[styles.goalMeta, { color: theme.textSecondary }]}
          >{`${completedCount}/${goal.checkpoints.length} checkpoints`}</Text>
          <View
            accessibilityLabel={`${completedCount} of ${goal.checkpoints.length} checkpoints complete`}
            accessibilityRole="progressbar"
            accessibilityValue={{
              max: goal.checkpoints.length,
              min: 0,
              now: completedCount,
            }}
            style={[
              styles.goalProgressTrack,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            {completedCount > 0 ? (
              <View
                style={[
                  styles.goalProgressFill,
                  {
                    backgroundColor: theme.primary,
                    width: `${Math.round(
                      (completedCount / Math.max(goal.checkpoints.length, 1)) *
                        100,
                    )}%`,
                  },
                ]}
              />
            ) : null}
          </View>
        </View>
        <MenuView
          actions={actionItems}
          onPressAction={({ nativeEvent }) => {
            if (nativeEvent.event === "edit-goal") {
              onEdit();
              return;
            }
            if (nativeEvent.event === "delete-goal") {
              onDelete();
            }
          }}
          title={goal.title}
        >
          <View
            accessible
            accessibilityLabel={`More actions for ${goal.title}`}
            accessibilityRole="button"
            style={styles.iconButton}
          >
            <SymbolView
              name={symbol("ellipsis", "more_horiz")}
              size={18}
              weight="semibold"
              tintColor={theme.textSecondary}
            />
          </View>
        </MenuView>
      </View>

      {goal.checkpoints.length ? (
        <>
          <NextCheckpointAction
            checkpoints={goal.checkpoints}
            expanded={isExpanded}
            plannedEventsByCheckpointId={plannedEventsByCheckpointId}
            onPressCheckpoint={onPressCheckpoint}
            onToggleExpanded={() => setIsExpanded((current) => !current)}
          />
          {isExpanded ? (
            <GoalTimeline
              checkpoints={goal.checkpoints}
              plannedEventsByCheckpointId={plannedEventsByCheckpointId}
              onPressCheckpoint={onPressCheckpoint}
              onViewAll={onEdit}
            />
          ) : null}
        </>
      ) : null}
    </View>
  );
}

function getCheckpointPreview(
  checkpoints: Goal["checkpoints"],
  plannedEventsByCheckpointId: Map<string, PlannedEvent>,
) {
  if (checkpoints.length <= 3) return checkpoints;

  const firstActionableIndex = checkpoints.findIndex(
    (checkpoint) =>
      !checkpoint.completed || plannedEventsByCheckpointId.has(checkpoint.id),
  );
  const anchorIndex = firstActionableIndex >= 0 ? firstActionableIndex : 0;
  const startIndex = Math.min(
    Math.max(anchorIndex - 1, 0),
    checkpoints.length - 3,
  );

  return checkpoints.slice(startIndex, startIndex + 3);
}

function getNextCheckpoint(
  checkpoints: Goal["checkpoints"],
  plannedEventsByCheckpointId: Map<string, PlannedEvent>,
) {
  return (
    checkpoints.find(
      (checkpoint) =>
        !checkpoint.completed &&
        !plannedEventsByCheckpointId.has(checkpoint.id),
    ) ??
    checkpoints.find((checkpoint) => !checkpoint.completed) ??
    checkpoints[checkpoints.length - 1] ??
    null
  );
}

function getCheckpointDateLabel(
  checkpoint: GoalCheckpoint,
  plannedEvent?: PlannedEvent,
) {
  return plannedEvent || checkpoint.targetDate
    ? formatCheckpointDate(plannedEvent?.date ?? checkpoint.targetDate)
    : null;
}

function getCheckpointActionLabel(
  checkpoint: GoalCheckpoint,
  plannedEvent?: PlannedEvent,
) {
  const planTime = formatStoredPlanTimeDisplay(plannedEvent?.startTime);

  if (checkpoint.completed) return "Complete";
  if (planTime) return `Planned ${planTime}`;
  if (plannedEvent) return "Planned";
  return null;
}

function GoalTimeline({
  checkpoints,
  plannedEventsByCheckpointId,
  onPressCheckpoint,
  onViewAll,
}: {
  checkpoints: Goal["checkpoints"];
  plannedEventsByCheckpointId: Map<string, PlannedEvent>;
  onPressCheckpoint: (checkpoint: GoalCheckpoint) => void;
  onViewAll: () => void;
}) {
  const theme = useTheme();
  const previewCheckpoints = getCheckpointPreview(
    checkpoints,
    plannedEventsByCheckpointId,
  );
  const previewIds = new Set(
    previewCheckpoints.map((checkpoint) => checkpoint.id),
  );
  const hiddenCount = checkpoints.filter(
    (checkpoint) => !previewIds.has(checkpoint.id),
  ).length;

  return (
    <View style={styles.timelineBlock}>
      <View style={styles.timelinePreview}>
        {previewCheckpoints.length > 1 ? (
          <View
            style={[
              styles.timelineTrack,
              {
                backgroundColor: theme.tabBorder,
                left: `${100 / (previewCheckpoints.length * 2)}%`,
                right: `${100 / (previewCheckpoints.length * 2)}%`,
              },
            ]}
          />
        ) : null}
        {previewCheckpoints.map((checkpoint, index) => {
          const plannedEvent = plannedEventsByCheckpointId.get(checkpoint.id);
          const hasSchedule = Boolean(plannedEvent || checkpoint.targetDate);
          const markerColor = checkpoint.completed
            ? theme.primary
            : hasSchedule
              ? `${theme.primary}1F`
              : theme.backgroundElement;
          const markerBorderColor =
            checkpoint.completed || hasSchedule
              ? theme.primary
              : theme.tabBorder;
          const dateLabel = getCheckpointDateLabel(checkpoint, plannedEvent);
          const dateColor =
            checkpoint.completed || hasSchedule
              ? theme.primary
              : theme.textSecondary;

          return (
            <View key={checkpoint.id} style={styles.timelineMilestone}>
              <View style={styles.milestoneDateSlot}>
                {dateLabel ? (
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.milestoneDate,
                      {
                        backgroundColor: `${dateColor}1F`,
                        color: dateColor,
                      },
                    ]}
                  >
                    {dateLabel}
                  </Text>
                ) : null}
              </View>
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
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  {checkpoint.completed ? (
                    <SymbolView
                      name={symbol("checkmark", "check")}
                      size={13}
                      weight="semibold"
                      tintColor={theme.primaryForeground}
                    />
                  ) : null}
                </Pressable>
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
              </Pressable>
            </View>
          );
        })}
      </View>
      {hiddenCount > 0 ? (
        <Pressable
          accessibilityRole="button"
          onPress={onViewAll}
          style={({ pressed }) => [
            styles.viewAllCheckpoints,
            { borderColor: theme.tabBorder },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.viewAllCheckpointsText, { color: theme.text }]}>
            View all {checkpoints.length}
          </Text>
          <SymbolView
            name={symbol("chevron.right", "chevron_right")}
            size={14}
            weight="semibold"
            tintColor={theme.textSecondary}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

function NextCheckpointAction({
  checkpoints,
  expanded,
  plannedEventsByCheckpointId,
  onPressCheckpoint,
  onToggleExpanded,
}: {
  checkpoints: Goal["checkpoints"];
  expanded: boolean;
  plannedEventsByCheckpointId: Map<string, PlannedEvent>;
  onPressCheckpoint: (checkpoint: GoalCheckpoint) => void;
  onToggleExpanded: () => void;
}) {
  const theme = useTheme();
  const checkpoint = getNextCheckpoint(
    checkpoints,
    plannedEventsByCheckpointId,
  );
  if (!checkpoint) return null;

  const plannedEvent = plannedEventsByCheckpointId.get(checkpoint.id);
  const actionLabel = getCheckpointActionLabel(checkpoint, plannedEvent);
  const dateLabel = getCheckpointDateLabel(checkpoint, plannedEvent);

  return (
    <View
      style={[styles.nextCheckpointAction, { borderTopColor: theme.tabBorder }]}
    >
      <Pressable
        accessibilityRole="button"
        onPress={() => onPressCheckpoint(checkpoint)}
        style={({ pressed }) => [
          styles.nextCheckpointPressable,
          pressed && styles.pressed,
        ]}
      >
        <Text
          numberOfLines={1}
          style={[styles.nextCheckpointLabel, { color: theme.primary }]}
        >
          Next
        </Text>
        <View style={styles.nextCheckpointCopy}>
          <Text
            numberOfLines={1}
            style={[styles.nextCheckpointText, { color: theme.text }]}
          >
            {checkpoint.title}
          </Text>
          {dateLabel || actionLabel ? (
            <Text
              numberOfLines={1}
              style={[
                styles.nextCheckpointMeta,
                { color: dateLabel ? theme.primary : theme.textSecondary },
              ]}
            >
              {dateLabel ?? actionLabel}
            </Text>
          ) : null}
        </View>
      </Pressable>
      <Pressable
        accessibilityLabel={expanded ? "Hide checkpoints" : "Show checkpoints"}
        accessibilityRole="button"
        onPress={onToggleExpanded}
        style={({ pressed }) => [
          styles.expandCheckpointsButton,
          pressed && styles.pressed,
        ]}
      >
        <SymbolView
          name={symbol(
            expanded ? "chevron.up" : "chevron.down",
            expanded ? "keyboard_arrow_up" : "keyboard_arrow_down",
          )}
          size={16}
          weight="semibold"
          tintColor={theme.textSecondary}
        />
      </Pressable>
    </View>
  );
}

function CheckpointActionsModal({
  active,
  plannedEvent,
  onClearPlan,
  onClose,
  onEditGoal,
  onCompleted,
  onPlan,
  onSaved,
  onError,
}: {
  active: ActiveCheckpoint | null;
  plannedEvent?: PlannedEvent | null;
  onClearPlan: (active: ActiveCheckpoint) => void;
  onClose: () => void;
  onEditGoal: (goal: Goal) => void;
  onCompleted: () => void;
  onPlan: (active: ActiveCheckpoint) => void;
  onSaved: (updatedGoal: Goal | null) => void;
  onError: (message: string | null) => void;
}) {
  const theme = useTheme();
  const [completed, setCompleted] = useState(false);
  const [note, setNote] = useState("");
  const [visibility, setVisibility] = useState<GoalVisibility>("only_me");
  const [photoCount, setPhotoCount] = useState(0);
  const [noteOpen, setNoteOpen] = useState(false);
  const [uploadingSource, setUploadingSource] =
    useState<GoalPhotoSource | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  const activeCheckpointIdRef = useRef<string | null>(null);

  const checkpointId = active?.checkpoint.id ?? null;

  useEffect(() => {
    if (!active) {
      activeCheckpointIdRef.current = null;
      setIsUpdating(false);
      setUploadingSource(null);
      return;
    }
    activeCheckpointIdRef.current = active.checkpoint.id;
    setCompleted(active.checkpoint.completed);
    setNote(active.checkpoint.notes ?? "");
    setVisibility(
      active.checkpoint.visibility === "all_friends"
        ? "all_friends"
        : "only_me",
    );
    setPhotoCount(0);
    setNoteOpen(false);
    setIsUpdating(false);
    setUploadingSource(null);

    let cancelled = false;
    fetchCheckpointPhotos(active.checkpoint.id)
      .then((rows) => {
        if (
          !cancelled &&
          activeCheckpointIdRef.current === active.checkpoint.id
        ) {
          setPhotoCount(rows.length);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [active]);

  if (!active) return null;
  const { checkpoint, goal } = active;
  const hasContent = note.trim().length > 0 || photoCount > 0;

  const save = async (next: {
    completed: boolean;
    notes: string | null;
    visibility: GoalVisibility;
  }) => {
    if (!checkpointId) return;
    onError(null);
    setIsUpdating(true);
    try {
      const updatedGoal = await updatePlanGoalCheckpoint(checkpointId, next);
      if (activeCheckpointIdRef.current !== checkpointId) return;
      setCompleted(next.completed);
      setVisibility(next.visibility);
      setNote(next.notes ?? "");
      onSaved(updatedGoal);
      if (!completed && next.completed) {
        playSuccessHaptic();
        onCompleted();
      }
    } catch (err) {
      if (activeCheckpointIdRef.current !== checkpointId) return;
      onError(
        err instanceof Error ? err.message : "Could not update checkpoint.",
      );
    } finally {
      if (activeCheckpointIdRef.current === checkpointId) {
        setIsUpdating(false);
      }
    }
  };

  const addPhoto = async (source: GoalPhotoSource) => {
    if (!checkpointId || uploadingSource) return;
    onError(null);
    setUploadingSource(source);
    try {
      const picked = await pickGoalPhoto(source);
      if (picked) {
        await uploadCheckpointPhoto(checkpointId, picked);
        if (activeCheckpointIdRef.current !== checkpointId) return;
        setPhotoCount((current) => current + 1);
      }
    } catch (err) {
      if (activeCheckpointIdRef.current !== checkpointId) return;
      onError(err instanceof Error ? err.message : "Could not add photo.");
    } finally {
      if (activeCheckpointIdRef.current === checkpointId) {
        setUploadingSource(null);
      }
    }
  };

  const notes = () => (note.trim() ? note.trim() : null);
  const isUploadingPhoto = uploadingSource !== null;

  return (
    <Modal
      animationType="slide"
      transparent
      statusBarTranslucent
      visible
      onRequestClose={onClose}
    >
      <View style={modalStyles.overlay}>
        <Pressable
          accessibilityLabel="Close"
          style={[StyleSheet.absoluteFill, modalStyles.backdrop]}
          onPress={onClose}
        />
        <SafeAreaView
          edges={["bottom"]}
          style={[modalStyles.sheet, { backgroundColor: theme.background }]}
        >
          <View
            style={[
              modalStyles.header,
              {
                backgroundColor: theme.tabBar,
                borderBottomColor: theme.tabBorder,
              },
            ]}
          >
            <Text
              style={[modalStyles.title, { color: theme.text }]}
              numberOfLines={2}
            >
              {checkpoint.title}
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={8}
              style={({ pressed }) => [
                modalStyles.closeBtn,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={symbol("xmark", "close")}
                size={14}
                weight="bold"
                tintColor={theme.tabIcon}
              />
            </Pressable>
          </View>

          <ScrollView
            canCancelContentTouches
            contentContainerStyle={modalStyles.actions}
            directionalLockEnabled
            showsVerticalScrollIndicator={false}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.checkpointGoalLabel,
                { color: theme.textSecondary },
              ]}
            >
              {goal.title}
            </Text>

            <Pressable
              onPress={() =>
                void save({
                  completed: !completed,
                  notes: notes(),
                  visibility,
                })
              }
              style={({ pressed }) => [
                modalStyles.actionRow,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}
            >
              {isUpdating ? (
                <ActivityIndicator size="small" color={theme.primary} />
              ) : (
                <SymbolView
                  name={
                    completed
                      ? symbol("arrow.uturn.backward.circle.fill", "undo")
                      : symbol("checkmark.circle.fill", "check_circle")
                  }
                  size={26}
                  tintColor={completed ? theme.textSecondary : theme.primary}
                />
              )}
              <Text style={[modalStyles.actionText, { color: theme.text }]}>
                {completed ? "Reopen" : "Mark complete"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => onPlan(active)}
              style={({ pressed }) => [
                modalStyles.actionRow,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={symbol("calendar.badge.plus", "event_available")}
                size={26}
                tintColor={theme.secondary}
              />
              <Text style={[modalStyles.actionText, { color: theme.text }]}>
                {plannedEvent ? "Edit calendar plan" : "Plan to calendar"}
              </Text>
            </Pressable>

            {plannedEvent ? (
              <Pressable
                onPress={() => onClearPlan(active)}
                style={({ pressed }) => [
                  modalStyles.actionRow,
                  { backgroundColor: theme.backgroundElement },
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={symbol("calendar.badge.minus", "event_busy")}
                  size={26}
                  tintColor={theme.textSecondary}
                />
                <Text style={[modalStyles.actionText, { color: theme.text }]}>
                  Clear calendar plan
                </Text>
              </Pressable>
            ) : null}

            <View style={modalStyles.photoRow}>
              <Pressable
                disabled={isUploadingPhoto}
                onPress={() => void addPhoto("camera")}
                style={({ pressed }) => [
                  modalStyles.photoBtn,
                  { backgroundColor: theme.backgroundElement },
                  isUploadingPhoto && modalStyles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {uploadingSource === "camera" ? (
                  <ActivityIndicator color={theme.primary} size="small" />
                ) : (
                  <SymbolView
                    name={symbol("camera.fill", "camera_alt")}
                    size={26}
                    tintColor={theme.primary}
                  />
                )}
                <Text style={[modalStyles.actionText, { color: theme.text }]}>
                  Take photo
                </Text>
              </Pressable>
              <Pressable
                disabled={isUploadingPhoto}
                onPress={() => void addPhoto("library")}
                style={({ pressed }) => [
                  modalStyles.photoBtn,
                  { backgroundColor: theme.backgroundElement },
                  isUploadingPhoto && modalStyles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {uploadingSource === "library" ? (
                  <ActivityIndicator color={theme.primary} size="small" />
                ) : (
                  <SymbolView
                    name={symbol("photo.fill", "photo_library")}
                    size={26}
                    tintColor={theme.primary}
                  />
                )}
                <Text style={[modalStyles.actionText, { color: theme.text }]}>
                  Add photo
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={() => setNoteOpen((current) => !current)}
              style={({ pressed }) => [
                modalStyles.actionRow,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={symbol("note.text", "notes")}
                size={26}
                tintColor={theme.primary}
              />
              <View style={modalStyles.noteRowContent}>
                <Text style={[modalStyles.actionText, { color: theme.text }]}>
                  {note.trim() ? "Edit note" : "Add note"}
                </Text>
                {note.trim() && !noteOpen ? (
                  <Text
                    numberOfLines={3}
                    style={[
                      modalStyles.notePreview,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {note.trim()}
                  </Text>
                ) : null}
              </View>
            </Pressable>

            {noteOpen ? (
              <View
                style={[
                  modalStyles.planTimeSection,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <TextInput
                  multiline
                  value={note}
                  onChangeText={setNote}
                  placeholder="Add a note about this milestone…"
                  placeholderTextColor={theme.textSecondary}
                  style={[
                    styles.checkpointNoteInput,
                    {
                      backgroundColor: theme.background,
                      borderColor: theme.tabBorder,
                      color: theme.text,
                    },
                  ]}
                  textAlignVertical="top"
                />
                <Pressable
                  disabled={isUpdating}
                  onPress={() =>
                    void save({
                      completed,
                      notes: notes(),
                      visibility,
                    }).then(() => setNoteOpen(false))
                  }
                  style={[
                    styles.checkpointSaveButton,
                    { backgroundColor: theme.primary, marginTop: 10 },
                  ]}
                >
                  {isUpdating ? (
                    <ActivityIndicator color={theme.primaryForeground} />
                  ) : (
                    <Text
                      style={[
                        styles.checkpointSaveText,
                        { color: theme.primaryForeground },
                      ]}
                    >
                      Save note
                    </Text>
                  )}
                </Pressable>
              </View>
            ) : null}

            {hasContent ? (
              <GoalLogVisibilityControl
                disabled={isUpdating}
                value={visibility}
                onChange={(next) =>
                  void save({ completed, notes: notes(), visibility: next })
                }
                allowed={["only_me", "all_friends"]}
                label="Checkpoint visibility"
              />
            ) : null}

            <Pressable
              onPress={() => onEditGoal(goal)}
              style={({ pressed }) => [
                modalStyles.actionRow,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={symbol("pencil", "edit")}
                size={26}
                tintColor={theme.tabIcon}
              />
              <Text style={[modalStyles.actionText, { color: theme.text }]}>
                Edit goal
              </Text>
            </Pressable>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
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
  const trimmedDateKey = dateKey.trim();
  const dateIsValid = Boolean(parseDateKeyParts(trimmedDateKey));
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
        dateKey: trimmedDateKey,
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
            {trimmedDateKey && !dateIsValid ? (
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
              onPress={() => {
                playSelectionHaptic();
                onChangePeriod(option);
              }}
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

function LaterGoalsToggle({
  count,
  expanded,
  onPress,
}: {
  count: number;
  expanded: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.laterGoalsToggle,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.tabBorder,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.laterGoalsToggleText, { color: theme.text }]}>
        {expanded ? "Hide later goals" : `Show later goals (${count})`}
      </Text>
      <SymbolView
        name={symbol(
          expanded ? "chevron.up" : "chevron.down",
          expanded ? "keyboard_arrow_up" : "keyboard_arrow_down",
        )}
        size={18}
        weight="semibold"
        tintColor={theme.textSecondary}
      />
    </Pressable>
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
      {hasGoals ? (
        <>
          <View
            style={[
              styles.emptyIcon,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <SymbolView
              name={symbol("magnifyingglass", "search")}
              size={28}
              tintColor={theme.primary}
            />
          </View>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            No goals found
          </Text>
          <Text
            style={[styles.emptyDescription, { color: theme.textSecondary }]}
          >
            {`Nothing matched "${query.trim()}".`}
          </Text>
        </>
      ) : (
        <BrandedEmptyState
          title="Create your first goal"
          description="Goals are bigger outcomes. Checkpoints are the habits and tasks that move you forward."
        />
      )}
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

export function GoalFormModal({
  goal,
  initialValues,
  isOpen,
  onClose,
  onSave,
  saveHint,
}: {
  goal: Goal | null;
  initialValues?: GoalInput;
  isOpen: boolean;
  onClose: () => void;
  onSave: (input: GoalInput) => Promise<void>;
  saveHint?: string;
}) {
  const theme = useTheme();
  const [title, setTitle] = useState("");
  const [timing, setTiming] = useState<GoalTiming>("current");
  const [checkpoints, setCheckpoints] = useState<CheckpointDraft[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(goal?.title ?? initialValues?.title ?? "");
    setTiming(goal?.timing ?? initialValues?.timing ?? "current");
    setCheckpoints(
      goal?.checkpoints.length
        ? goal.checkpoints.map((checkpoint) => ({
            localId: checkpoint.id,
            title: checkpoint.title,
            targetDate: checkpoint.targetDate ?? "",
            completed: checkpoint.completed,
          }))
        : initialValues?.checkpoints.length
          ? initialValues.checkpoints.map((checkpoint) => ({
              localId: createCheckpointLocalId(),
              title: checkpoint.title,
              targetDate: checkpoint.targetDate ?? "",
              completed: checkpoint.completed,
            }))
          : [createEmptyCheckpoint()],
    );
    setError(null);
  }, [goal, initialValues, isOpen]);

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
        !parseDateKeyParts(checkpoint.targetDate),
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
        timing,
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
          {saveHint ? (
            <View
              style={[
                styles.saveHint,
                {
                  backgroundColor: theme.backgroundElement,
                  borderBottomColor: theme.tabBorder,
                },
              ]}
            >
              <Text style={[styles.saveHintText, { color: theme.text }]}>
                {saveHint}
              </Text>
            </View>
          ) : null}

          <ScrollView
            canCancelContentTouches
            contentContainerStyle={styles.formContent}
            directionalLockEnabled
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
                <View style={styles.inputField}>
                  <Text style={[styles.fieldLabel, { color: theme.text }]}>
                    Timing
                  </Text>
                  <View style={styles.goalTimingRow}>
                    {(["current", "later"] as GoalTiming[]).map((option) => {
                      const selected = timing === option;
                      return (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityState={{ selected }}
                          key={option}
                          onPress={() => {
                            playSelectionHaptic();
                            setTiming(option);
                          }}
                          style={({ pressed }) => [
                            styles.goalTimingChip,
                            {
                              backgroundColor: selected
                                ? theme.primary
                                : theme.backgroundElement,
                              borderColor: selected
                                ? theme.primary
                                : theme.tabBorder,
                            },
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text
                            style={[
                              styles.goalTimingChipText,
                              {
                                color: selected
                                  ? theme.primaryForeground
                                  : theme.textSecondary,
                              },
                            ]}
                          >
                            {option === "current" ? "Current" : "Later"}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
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
                        onPress={() => {
                          playSelectionHaptic();
                          updateCheckpoint(checkpoint.localId, {
                            completed: !checkpoint.completed,
                          });
                        }}
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
                      <TargetDateSelect
                        value={checkpoint.targetDate}
                        onChange={(targetDate) =>
                          updateCheckpoint(checkpoint.localId, { targetDate })
                        }
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
    localId: createCheckpointLocalId(),
    title: "",
    targetDate: "",
    completed: false,
  };
}

function createCheckpointLocalId(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function TargetDateSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = parseDateKeyParts(value);
  const pickerParts = getDatePartsForPicker(value);
  const daysInMonth = getDaysInMonth(pickerParts.year, pickerParts.month);

  const yearActions: MenuAction[] = [
    {
      id: CLEAR_TARGET_DATE_ACTION,
      title: "No date",
      state: menuSelectedState(!selected),
    },
    ...getYearOptions(selected?.year).map((year) => ({
      id: String(year),
      title: String(year),
      state: menuSelectedState(selected?.year === year),
    })),
  ];
  const monthActions: MenuAction[] = [
    {
      id: CLEAR_TARGET_DATE_ACTION,
      title: "No date",
      state: menuSelectedState(!selected),
    },
    ...MONTH_OPTIONS.map((month, index) => ({
      id: String(index + 1),
      title: month,
      state: menuSelectedState(selected?.month === index + 1),
    })),
  ];
  const dayActions: MenuAction[] = [
    {
      id: CLEAR_TARGET_DATE_ACTION,
      title: "No date",
      state: menuSelectedState(!selected),
    },
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1).map(
      (day) => ({
        id: String(day),
        title: String(day),
        state: menuSelectedState(selected?.day === day),
      }),
    ),
  ];

  const selectPart = (part: TargetDatePart, actionId: string) => {
    if (actionId === CLEAR_TARGET_DATE_ACTION) {
      onChange("");
      return;
    }

    onChange(updateDatePart(value, part, Number(actionId)));
  };

  return (
    <View style={styles.targetDateRow}>
      <TargetDatePartSelect
        actions={yearActions}
        label="Year"
        onSelect={(actionId) => selectPart("year", actionId)}
        value={selected ? String(selected.year) : null}
      />
      <TargetDatePartSelect
        actions={monthActions}
        label="Month"
        onSelect={(actionId) => selectPart("month", actionId)}
        value={selected ? MONTH_OPTIONS[selected.month - 1].slice(0, 3) : null}
      />
      <TargetDatePartSelect
        actions={dayActions}
        label="Day"
        onSelect={(actionId) => selectPart("day", actionId)}
        value={selected ? String(selected.day) : null}
      />
    </View>
  );
}

function TargetDatePartSelect({
  actions,
  label,
  value,
  onSelect,
}: {
  actions: MenuAction[];
  label: string;
  value: string | null;
  onSelect: (actionId: string) => void;
}) {
  const theme = useTheme();
  const displayValue = value ?? label;

  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => onSelect(nativeEvent.event)}
      style={styles.targetDateMenu}
      title={`Select ${label.toLowerCase()}`}
    >
      <View
        accessible
        accessibilityLabel={`Select target ${label.toLowerCase()}`}
        accessibilityRole="button"
        style={[
          styles.targetDateSelect,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.tabBorder,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.targetDateSelectText,
            { color: value ? theme.text : theme.textSecondary },
          ]}
        >
          {displayValue}
        </Text>
        <SymbolView
          name={symbol("chevron.down", "keyboard_arrow_down")}
          size={13}
          weight="semibold"
          tintColor={theme.textSecondary}
        />
      </View>
    </MenuView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    gap: 14,
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
  pageHeaderText: { flex: 1, minWidth: 0, gap: 1 },
  headerActions: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
  },
  addButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  search: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, minWidth: 0, fontSize: 17, fontWeight: "400" },
  goalList: { gap: 12 },
  goalCard: {
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  goalCardDragging: {
    opacity: 0.82,
    transform: [{ scale: 0.99 }],
  },
  goalCardTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  goalBody: { flex: 1, minWidth: 0, gap: 4 },
  goalTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  goalTitle: { flex: 1, fontSize: 17, lineHeight: 22, fontWeight: "600" },
  goalMeta: { fontSize: 13, lineHeight: 17, fontWeight: "400" },
  goalProgressTrack: {
    height: 3,
    overflow: "hidden",
    borderRadius: 999,
  },
  goalProgressFill: {
    height: "100%",
    borderRadius: 999,
  },
  dragHandle: {
    width: 30,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  iconButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  timelineBlock: {
    gap: 8,
    paddingTop: 4,
  },
  timelinePreview: {
    flexDirection: "row",
    alignItems: "flex-start",
    position: "relative",
  },
  timelineTrack: {
    position: "absolute",
    top: 38,
    height: 4,
    borderRadius: 999,
  },
  timelineMilestone: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    overflow: "visible",
  },
  milestoneDateSlot: {
    minHeight: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  milestoneDate: {
    borderRadius: 999,
    backgroundColor: "#35BDEB1F",
    paddingHorizontal: 6,
    paddingVertical: 2,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  milestoneTrackRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    height: 28,
    width: "100%",
    overflow: "visible",
  },
  milestoneMarker: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: 14,
    zIndex: 2,
  },
  milestoneTitle: {
    marginTop: 7,
    maxWidth: 94,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "500",
    textAlign: "center",
  },
  completedTimelineTitle: { textDecorationLine: "line-through", opacity: 0.7 },
  viewAllCheckpoints: {
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    alignSelf: "flex-end",
    borderWidth: 0,
    borderRadius: 999,
    paddingHorizontal: 10,
  },
  viewAllCheckpointsText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
  },
  nextCheckpointAction: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
    paddingTop: 2,
  },
  nextCheckpointPressable: {
    flex: 1,
    minWidth: 0,
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    paddingRight: 7,
  },
  nextCheckpointLabel: {
    flexShrink: 0,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
  },
  nextCheckpointCopy: { flex: 1, minWidth: 0, gap: 1 },
  nextCheckpointText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  nextCheckpointMeta: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "400",
  },
  expandCheckpointsButton: {
    width: 42,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  laterGoalsToggle: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingHorizontal: 14,
  },
  laterGoalsToggleText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
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
  saveHint: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  saveHintText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
  },
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
  goalTimingRow: {
    flexDirection: "row",
    gap: 8,
  },
  goalTimingChip: {
    flex: 1,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
  },
  goalTimingChipText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
  checkpointGoalLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    paddingHorizontal: 4,
    marginBottom: 2,
  },
  checkpointNoteInput: {
    minHeight: 84,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "500",
  },
  checkpointSaveButton: {
    minHeight: 50,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  checkpointSaveText: {
    fontSize: 16,
    fontWeight: "800",
  },
  targetDateRow: {
    flexDirection: "row",
    gap: 7,
  },
  targetDateMenu: {
    flex: 1,
    minWidth: 0,
  },
  targetDateSelect: {
    minHeight: 49,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingHorizontal: 11,
  },
  targetDateSelectText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
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
