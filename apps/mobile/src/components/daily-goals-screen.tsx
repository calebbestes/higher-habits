import { SymbolView } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GoalNoteEditorModal } from "@/components/goal-note-editor-modal";
import { GoalFormModal } from "@/components/goals-screen";
import { PlanReportHeaderMenu } from "@/components/plan-report-header-menu";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import {
  addCrashBreadcrumb,
  captureHandledError,
  setCrashContext,
} from "@/lib/crash-reporting";
import {
  type GoalInCategory,
  type GoalLogStatus,
  type GoalLogsSnapshot,
  fetchGoalLogsSnapshot,
  getMonthKey,
  setGoalLog,
  setGoalLogNote,
  setGoalLogVisibility,
  toDateKey,
} from "@/lib/goal-logs-client";
import { type GoalPhotoSource, pickGoalPhoto } from "@/lib/goal-photo-picker";
import { uploadGoalPhoto } from "@/lib/goal-photos-client";
import {
  type Category,
  type Goal,
  type GoalInput,
  type GoalVisibility,
  createCategory,
  createGoal,
  fetchCategories,
  updateGoal,
} from "@/lib/goals-client";

import { CategoryAccordionRow } from "./daily-goals/category-accordion-row";
import { CompletedSection } from "./daily-goals/completed-section";
import { EmptyState } from "./daily-goals/empty-state";
import { GoalActionsModal } from "./daily-goals/goal-actions-modal";
import { GoalRow } from "./daily-goals/goal-row";
import { PriorityAccordion } from "./daily-goals/priority-accordion";
import {
  type ActionGoal,
  PRIORITY_LABELS,
  addDays,
  formatDate,
  isSameDay,
  styles,
  sym,
} from "./daily-goals/shared";

export function DailyGoalsScreen({
  initialDateKey,
}: {
  initialDateKey?: string;
}) {
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (initialDateKey && /^\d{4}-\d{2}-\d{2}$/.test(initialDateKey)) {
      const [y, m, d] = initialDateKey.split("-").map(Number);
      return new Date(y, (m as number) - 1, d as number);
    }
    return new Date();
  });
  const [snapshot, setSnapshot] = useState<GoalLogsSnapshot | null>(null);
  const [logsByGoalDate, setLogsByGoalDate] = useState<
    Record<string, "complete" | "planned">
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [updatingKeys, setUpdatingKeys] = useState<Set<string>>(new Set());
  const [openPriorities, setOpenPriorities] = useState<Set<string>>(
    () => new Set(["high"]),
  );
  const [expandedCatKeys, setExpandedCatKeys] = useState<Set<string>>(
    () => new Set(),
  );
  const [showCompleted, setShowCompleted] = useState(false);
  const [activeGoal, setActiveGoal] = useState<ActionGoal | null>(null);
  const [noteGoal, setNoteGoal] = useState<ActionGoal | null>(null);
  const [uploadingPhotoSource, setUploadingPhotoSource] =
    useState<GoalPhotoSource | null>(null);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const updatingKeysRef = useRef(updatingKeys);
  updatingKeysRef.current = updatingKeys;
  const isLoadingRef = useRef(false);

  const monthKey = useMemo(() => getMonthKey(selectedDate), [selectedDate]);
  const dateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: recompute "today" when the selected date changes (e.g. across midnight)
  const today = useMemo(() => new Date(), [dateKey]);
  const isToday = isSameDay(selectedDate, today);

  const load = useCallback(
    async (refresh = false) => {
      if (isLoadingRef.current) return;
      isLoadingRef.current = true;
      refresh ? setIsRefreshing(true) : setIsLoading(true);
      setError(null);
      try {
        const [snap, cats] = await Promise.all([
          fetchGoalLogsSnapshot(monthKey),
          fetchCategories(),
        ]);
        setSnapshot(snap);
        setLogsByGoalDate(snap.logsByGoalDate);
        setCategories(cats);
      } catch (err) {
        captureHandledError(err, { handler: "load", monthKey });
        setError(err instanceof Error ? err.message : "Could not load goals.");
      } finally {
        isLoadingRef.current = false;
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [monthKey],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const saveGoal = async (input: GoalInput) => {
    addCrashBreadcrumb("saveGoal", { editing: Boolean(editingGoal) });
    try {
      if (editingGoal) {
        await updateGoal(editingGoal.id, input);
      } else {
        await createGoal(input);
      }
      await load();
      setFormOpen(false);
      setEditingGoal(null);
    } catch (err) {
      captureHandledError(err, { handler: "saveGoal" });
      throw err;
    }
  };

  const addCategory = async (name: string, icon: string): Promise<Category> => {
    const category = await createCategory({ name, icon });
    setCategories((current) => [...current, category]);
    return category;
  };

  const openEditGoal = (goal: GoalInCategory) => {
    addCrashBreadcrumb("openEditGoal", { goalId: goal.id });
    const category = categories.find((item) => item.id === goal.categoryId);
    setEditingGoal({
      ...goal,
      categoryName: category?.name ?? "",
      categoryIcon: category?.icon ?? "",
      repeatInterval: null,
      repeatDays: null,
      repeatMonthlyType: null,
      createdAt: "",
      updatedAt: "",
    });
    setFormOpen(true);
  };

  const handleSetStatus = useCallback(
    async (goalId: string, status: GoalLogStatus) => {
      const key = `${goalId}_${dateKey}`;
      addCrashBreadcrumb("handleSetStatus", {
        dateKey,
        goalId,
        status: status ?? "clear",
      });
      if (updatingKeysRef.current.has(key)) return;
      const current = logsByGoalDate[key];

      setUpdatingKeys((prev) => new Set(prev).add(key));
      setLogsByGoalDate((prev) => {
        const updated = { ...prev };
        if (status) updated[key] = status;
        else delete updated[key];
        return updated;
      });

      try {
        await setGoalLog(goalId, dateKey, status);
      } catch (err) {
        captureHandledError(err, {
          dateKey,
          goalId,
          handler: "handleSetStatus",
        });
        setLogsByGoalDate((prev) => {
          const reverted = { ...prev };
          if (current) reverted[key] = current;
          else delete reverted[key];
          return reverted;
        });
        setError(err instanceof Error ? err.message : "Could not save.");
      } finally {
        setUpdatingKeys((prev) => {
          const next = new Set(prev);
          next.delete(key);
          return next;
        });
      }
    },
    [dateKey, logsByGoalDate],
  );

  const handleSaveNote = useCallback(
    async (goalId: string, notes: string) => {
      addCrashBreadcrumb("handleSaveNote", { dateKey, goalId });
      try {
        await setGoalLogNote(goalId, dateKey, notes);
        const snap = await fetchGoalLogsSnapshot(monthKey);
        setSnapshot(snap);
        setLogsByGoalDate(snap.logsByGoalDate);
      } catch (err) {
        captureHandledError(err, {
          dateKey,
          goalId,
          handler: "handleSaveNote",
        });
        throw err;
      }
    },
    [dateKey, monthKey],
  );

  const handleAddPhoto = useCallback(
    async (goalId: string, source: GoalPhotoSource) => {
      addCrashBreadcrumb("handleAddPhoto", { dateKey, goalId, source });
      if (uploadingPhotoSource) return;
      setUploadingPhotoSource(source);

      try {
        const photo = await pickGoalPhoto(source);
        if (!photo) return;

        await uploadGoalPhoto(goalId, dateKey, photo);
        const snap = await fetchGoalLogsSnapshot(monthKey);
        setSnapshot(snap);
        setLogsByGoalDate(snap.logsByGoalDate);
      } catch (photoError) {
        captureHandledError(photoError, {
          dateKey,
          goalId,
          handler: "handleAddPhoto",
          source,
        });
        Alert.alert(
          "Could not add photo",
          photoError instanceof Error
            ? photoError.message
            : "The photo could not be uploaded.",
        );
      } finally {
        setUploadingPhotoSource(null);
      }
    },
    [dateKey, monthKey, uploadingPhotoSource],
  );

  const handleSetVisibility = useCallback(
    async (goalId: string, visibility: GoalVisibility) => {
      addCrashBreadcrumb("handleSetVisibility", {
        dateKey,
        goalId,
        visibility,
      });
      if (isUpdatingVisibility) return;
      const key = `${goalId}_${dateKey}`;
      setIsUpdatingVisibility(true);

      try {
        await setGoalLogVisibility(goalId, dateKey, visibility);
        setSnapshot((current) =>
          current
            ? {
                ...current,
                visibilityByGoalDate: {
                  ...current.visibilityByGoalDate,
                  [key]: visibility,
                },
              }
            : current,
        );
      } catch (visibilityError) {
        captureHandledError(visibilityError, {
          dateKey,
          goalId,
          handler: "handleSetVisibility",
        });
        Alert.alert(
          "Could not change visibility",
          visibilityError instanceof Error
            ? visibilityError.message
            : "The post visibility could not be changed.",
        );
      } finally {
        setIsUpdatingVisibility(false);
      }
    },
    [dateKey, isUpdatingVisibility],
  );

  const categoriesWithGoals = useMemo(
    () => snapshot?.categories.filter((cat) => cat.goals.length > 0) ?? [],
    [snapshot],
  );

  const priorityProgress = useMemo(() => {
    const progress = {
      high: { completed: 0, total: 0 },
      low: { completed: 0, total: 0 },
    };

    for (const cat of categoriesWithGoals) {
      for (const goal of cat.goals) {
        progress[goal.priority].total++;
        if (logsByGoalDate[`${goal.id}_${dateKey}`] === "complete") {
          progress[goal.priority].completed++;
        }
      }
    }

    return progress;
  }, [categoriesWithGoals, dateKey, logsByGoalDate]);

  const monthlyPlannedGoals = useMemo(
    () =>
      snapshot?.periodicGoals.filter((goal) => {
        const status = logsByGoalDate[`${goal.id}_${dateKey}`];
        return status === "planned" || status === "complete";
      }) ?? [],
    [dateKey, logsByGoalDate, snapshot],
  );
  const monthlyPlannedCompleted = useMemo(
    () =>
      monthlyPlannedGoals.filter(
        (goal) => logsByGoalDate[`${goal.id}_${dateKey}`] === "complete",
      ).length,
    [dateKey, logsByGoalDate, monthlyPlannedGoals],
  );

  const monthlyActionGoals = useMemo(
    () =>
      monthlyPlannedGoals.map<ActionGoal>((goal) => ({
        ...goal,
        hidden: false,
      })),
    [monthlyPlannedGoals],
  );

  // Goals grouped by priority, excluding completed goals
  const priorityGroups = useMemo(() => {
    const make = (p: "high" | "low") =>
      categoriesWithGoals
        .map((cat) => ({
          category: cat,
          goals: cat.goals.filter(
            (g) =>
              g.priority === p &&
              logsByGoalDate[`${g.id}_${dateKey}`] !== "complete",
          ),
        }))
        .filter((g) => g.goals.length > 0);
    return { high: make("high"), low: make("low") };
  }, [categoriesWithGoals, logsByGoalDate, dateKey]);

  // All completed goals for this date
  const completedList = useMemo(
    () =>
      categoriesWithGoals.flatMap((cat) =>
        cat.goals
          .filter((g) => logsByGoalDate[`${g.id}_${dateKey}`] === "complete")
          .map((g) => ({ goal: g, category: cat })),
      ),
    [categoriesWithGoals, logsByGoalDate, dateKey],
  );

  const togglePriority = useCallback((p: string) => {
    setOpenPriorities((prev) => {
      const next = new Set(prev);
      next.has(p) ? next.delete(p) : next.add(p);
      return next;
    });
  }, []);

  const toggleCatKey = useCallback((key: string) => {
    setExpandedCatKeys((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }, []);

  const openGoalActions = useCallback(
    (goal: ActionGoal) => {
      setCrashContext("goal_actions_modal", {
        dateKey,
        goalId: goal.id,
        period: goal.period,
        phase: "tap-received",
      });
      addCrashBreadcrumb("Opening goal actions", {
        dateKey,
        goalId: goal.id,
        period: goal.period,
      });
      setActiveGoal(goal);
    },
    [dateKey],
  );

  const handleGoalActionsShown = useCallback(
    (goal: ActionGoal) => {
      setCrashContext("goal_actions_modal", {
        dateKey,
        goalId: goal.id,
        period: goal.period,
        phase: "native-on-show",
      });
      addCrashBreadcrumb("Goal actions modal shown", {
        goalId: goal.id,
        period: goal.period,
      });
    },
    [dateKey],
  );

  const handleGoalActionsDismiss = useCallback(
    (goal: ActionGoal, reason: string) => {
      setCrashContext("goal_actions_modal", {
        dateKey,
        goalId: goal.id,
        period: goal.period,
        phase: `dismissed:${reason}`,
      });
      addCrashBreadcrumb("Goal actions modal dismissed", {
        goalId: goal.id,
        period: goal.period,
        reason,
      });
      setActiveGoal(null);
    },
    [dateKey],
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarHeight + 16 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              tintColor={theme.primary}
              onRefresh={() => void load(true)}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {/* Page header */}
          <View style={styles.pageHeader}>
            <View style={styles.pageHeaderText}>
              <PlanReportHeaderMenu currentView="daily" />
            </View>
            <Pressable
              accessibilityLabel="Add goal"
              accessibilityRole="button"
              onPress={() => setFormOpen(true)}
              style={({ pressed }) => [
                styles.addButton,
                styles.headerAddButton,
                { backgroundColor: theme.primary },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("plus", "add")}
                size={18}
                weight="semibold"
                tintColor={theme.primaryForeground}
              />
            </Pressable>
          </View>

          {/* Date navigator */}
          <View
            style={[
              styles.dateNav,
              { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
            ]}
          >
            <Pressable
              accessibilityLabel="Previous day"
              hitSlop={8}
              onPress={() => setSelectedDate((d) => addDays(d, -1))}
              style={({ pressed }) => [
                styles.navArrow,
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("chevron.left", "chevron_left")}
                size={18}
                weight="semibold"
                tintColor={theme.tabIcon}
              />
            </Pressable>

            <View style={styles.dateLabel}>
              <Text style={[styles.dateLabelText, { color: theme.text }]}>
                {formatDate(selectedDate)}
              </Text>
              {isToday ? (
                <View
                  style={[
                    styles.todayBadge,
                    { backgroundColor: theme.primary },
                  ]}
                >
                  <Text
                    style={[
                      styles.todayBadgeText,
                      { color: theme.primaryForeground },
                    ]}
                  >
                    Today
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.navRight}>
              {!isToday ? (
                <Pressable
                  accessibilityLabel="Go to today"
                  onPress={() => setSelectedDate(new Date(today))}
                  style={({ pressed }) => [
                    styles.todayButton,
                    { borderColor: theme.primary },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[styles.todayButtonText, { color: theme.primary }]}
                  >
                    Today
                  </Text>
                </Pressable>
              ) : null}
              <Pressable
                accessibilityLabel="Next day"
                hitSlop={8}
                onPress={() => setSelectedDate((d) => addDays(d, 1))}
                style={({ pressed }) => [
                  styles.navArrow,
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={sym("chevron.right", "chevron_right")}
                  size={18}
                  weight="semibold"
                  tintColor={theme.tabIcon}
                />
              </Pressable>
            </View>
          </View>

          {/* Error */}
          {error ? (
            <View style={styles.errorBanner}>
              <SymbolView
                name={sym("exclamationmark.circle.fill", "error")}
                size={18}
                tintColor="#9D474D"
              />
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => void load()}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Content */}
          {isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={theme.primary} size="large" />
            </View>
          ) : categoriesWithGoals.length === 0 &&
            monthlyPlannedGoals.length === 0 ? (
            <EmptyState />
          ) : (
            <View style={styles.prioritySections}>
              {(["high"] as const).map((p) => {
                const groups = priorityGroups[p];
                const progress = priorityProgress[p];
                if (progress.total === 0) return null;
                const isOpen = openPriorities.has(p);
                return (
                  <PriorityAccordion
                    color={theme.primary}
                    completed={progress.completed}
                    key={p}
                    label={PRIORITY_LABELS[p] ?? p}
                    isOpen={isOpen}
                    total={progress.total}
                    onToggle={() => togglePriority(p)}
                  >
                    {groups.map(({ category, goals }) => {
                      const catKey = `${p}_${category.id}`;
                      const isExpanded = expandedCatKeys.has(catKey);
                      return (
                        <CategoryAccordionRow
                          key={catKey}
                          category={category}
                          goals={goals}
                          dateKey={dateKey}
                          logsByGoalDate={logsByGoalDate}
                          updatingKeys={updatingKeys}
                          isExpanded={isExpanded}
                          onToggleExpand={() => toggleCatKey(catKey)}
                          onEditGoal={openEditGoal}
                          onPressGoal={openGoalActions}
                        />
                      );
                    })}
                  </PriorityAccordion>
                );
              })}
              {monthlyPlannedGoals.length > 0 ? (
                <PriorityAccordion
                  color="#3B82F6"
                  completed={monthlyPlannedCompleted}
                  isOpen={openPriorities.has("monthly")}
                  label="Monthly Goals"
                  total={monthlyPlannedGoals.length}
                  onToggle={() => togglePriority("monthly")}
                >
                  <View
                    style={[
                      styles.goalSurface,
                      {
                        backgroundColor: theme.tabBar,
                        borderColor: theme.tabBorder,
                      },
                    ]}
                  >
                    {monthlyActionGoals.map((goal, index) => (
                      <View key={goal.id}>
                        {index > 0 ? (
                          <View
                            style={[
                              styles.divider,
                              { backgroundColor: theme.tabBorder },
                            ]}
                          />
                        ) : null}
                        <GoalRow
                          goal={goal}
                          status={logsByGoalDate[`${goal.id}_${dateKey}`]}
                          isUpdating={updatingKeys.has(`${goal.id}_${dateKey}`)}
                          onPress={() => openGoalActions(goal)}
                        />
                      </View>
                    ))}
                  </View>
                </PriorityAccordion>
              ) : null}
              {(["low"] as const).map((p) => {
                const groups = priorityGroups[p];
                const progress = priorityProgress[p];
                if (progress.total === 0) return null;
                const isOpen = openPriorities.has(p);
                return (
                  <PriorityAccordion
                    color={theme.textSecondary}
                    completed={progress.completed}
                    key={p}
                    label={PRIORITY_LABELS[p] ?? p}
                    isOpen={isOpen}
                    total={progress.total}
                    onToggle={() => togglePriority(p)}
                  >
                    {groups.map(({ category, goals }) => {
                      const catKey = `${p}_${category.id}`;
                      const isExpanded = expandedCatKeys.has(catKey);
                      return (
                        <CategoryAccordionRow
                          key={catKey}
                          category={category}
                          goals={goals}
                          dateKey={dateKey}
                          logsByGoalDate={logsByGoalDate}
                          updatingKeys={updatingKeys}
                          isExpanded={isExpanded}
                          onToggleExpand={() => toggleCatKey(catKey)}
                          onEditGoal={openEditGoal}
                          onPressGoal={openGoalActions}
                        />
                      );
                    })}
                  </PriorityAccordion>
                );
              })}
              <CompletedSection
                completedList={completedList}
                dateKey={dateKey}
                logsByGoalDate={logsByGoalDate}
                updatingKeys={updatingKeys}
                isOpen={showCompleted}
                onToggle={() => setShowCompleted((v) => !v)}
                onEditGoal={openEditGoal}
                onPressGoal={openGoalActions}
              />
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
      <GoalFormModal
        categories={categories}
        goal={editingGoal}
        initialValues={{ period: "daily" }}
        isOpen={formOpen}
        onAddCategory={addCategory}
        onClose={() => {
          setFormOpen(false);
          setEditingGoal(null);
        }}
        onSave={saveGoal}
      />
      <GoalActionsModal
        goal={activeGoal}
        hasNote={
          activeGoal
            ? Boolean(
                snapshot?.notesByGoalDate[
                  `${activeGoal.id}_${dateKey}`
                ]?.trim(),
              )
            : false
        }
        hasPhoto={
          activeGoal
            ? (snapshot?.photoCountsByGoalDate[`${activeGoal.id}_${dateKey}`] ??
                0) > 0
            : false
        }
        visibility={
          activeGoal
            ? (snapshot?.visibilityByGoalDate[`${activeGoal.id}_${dateKey}`] ??
              activeGoal.visibility)
            : "only_me"
        }
        isUpdatingVisibility={isUpdatingVisibility}
        status={
          activeGoal ? logsByGoalDate[`${activeGoal.id}_${dateKey}`] : undefined
        }
        isUpdating={
          activeGoal ? updatingKeys.has(`${activeGoal.id}_${dateKey}`) : false
        }
        uploadingPhotoSource={uploadingPhotoSource}
        visible={Boolean(activeGoal)}
        onAddPhoto={(source) => {
          if (!activeGoal) return;
          setCrashContext("goal_actions_modal", {
            dateKey,
            goalId: activeGoal.id,
            period: activeGoal.period,
            phase: `action:photo:${source}`,
          });
          addCrashBreadcrumb("Goal actions photo selected", {
            goalId: activeGoal.id,
            source,
          });
          void handleAddPhoto(activeGoal.id, source);
        }}
        onOpenNote={() => {
          if (!activeGoal) return;
          setCrashContext("goal_actions_modal", {
            dateKey,
            goalId: activeGoal.id,
            period: activeGoal.period,
            phase: "action:open-note",
          });
          addCrashBreadcrumb("Goal actions note selected", {
            goalId: activeGoal.id,
          });
          setNoteGoal(activeGoal);
          handleGoalActionsDismiss(activeGoal, "open-note");
        }}
        onSetVisibility={(visibility) => {
          if (!activeGoal) return;
          setCrashContext("goal_actions_modal", {
            dateKey,
            goalId: activeGoal.id,
            period: activeGoal.period,
            phase: `action:visibility:${visibility}`,
          });
          addCrashBreadcrumb("Goal actions visibility selected", {
            goalId: activeGoal.id,
            visibility,
          });
          void handleSetVisibility(activeGoal.id, visibility);
        }}
        onSetStatus={(newStatus: GoalLogStatus) => {
          if (!activeGoal) return;
          setCrashContext("goal_actions_modal", {
            dateKey,
            goalId: activeGoal.id,
            period: activeGoal.period,
            phase: `action:status:${newStatus ?? "clear"}`,
          });
          addCrashBreadcrumb("Goal actions status selected", {
            goalId: activeGoal.id,
            status: newStatus,
          });
          void handleSetStatus(activeGoal.id, newStatus);
          handleGoalActionsDismiss(activeGoal, "set-status");
        }}
        onDismiss={() => {
          if (activeGoal) {
            handleGoalActionsDismiss(activeGoal, "user");
          }
        }}
        onShown={() => {
          if (activeGoal) {
            handleGoalActionsShown(activeGoal);
          }
        }}
      />
      {noteGoal ? (
        <GoalNoteEditorModal
          dateKey={dateKey}
          goalName={noteGoal.name}
          initialValue={
            snapshot?.notesByGoalDate[`${noteGoal.id}_${dateKey}`] ?? null
          }
          onClose={() => setNoteGoal(null)}
          onSave={async (notes) => {
            await handleSaveNote(noteGoal.id, notes);
            setActiveGoal(noteGoal);
          }}
        />
      ) : null}
    </View>
  );
}
