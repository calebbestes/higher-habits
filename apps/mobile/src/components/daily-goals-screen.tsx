import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { GoalIcon } from "@/components/goal-icon";
import { GoalLogVisibilityControl } from "@/components/goal-log-visibility-control";
import { GoalNoteEditorModal } from "@/components/goal-note-editor-modal";
import { GoalFormModal } from "@/components/goals-screen";
import { PlanReportHeaderMenu } from "@/components/plan-report-header-menu";
import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import {
  type CategoryWithGoals,
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

type SymbolName = SymbolViewProps["name"];


type CategoryConfig = { color: string; symbol: SymbolName };

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  Spiritual: {
    color: "#2C5352",
    symbol: sym("hands.sparkles", "self_improvement"),
  },
  Physical: { color: "#9D7474", symbol: sym("dumbbell", "fitness_center") },
  Work: { color: "#516162", symbol: sym("briefcase", "work") },
  Social: { color: "#A0D5D5", symbol: sym("person.2", "groups") },
  "Hobbies/Social": { color: "#A0D5D5", symbol: sym("person.2", "groups") },
  "Financial/Career": {
    color: "#F3B7B9",
    symbol: sym("dollarsign.circle", "paid"),
  },
};

const DEFAULT_CATEGORY_CONFIG: CategoryConfig = {
  color: "#516162",
  symbol: sym("target", "target"),
};

function getCategoryConfig(name: string): CategoryConfig {
  return CATEGORY_CONFIG[name] ?? DEFAULT_CATEGORY_CONFIG;
}

const PRIORITY_LABELS: Record<string, string> = {
  high: "High Priority",
  medium: "Medium Priority",
  low: "Low Priority",
};

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
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

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}


function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatDate(date: Date): string {
  return `${DAY_NAMES[date.getDay()]}, ${MONTH_NAMES[date.getMonth()]} ${date.getDate()}`;
}

export function DailyGoalsScreen({
  initialDateKey,
}: {
  initialDateKey?: string;
}) {
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();
  const today = useRef(new Date()).current;

  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    if (initialDateKey && /^\d{4}-\d{2}-\d{2}$/.test(initialDateKey)) {
      const [y, m, d] = initialDateKey.split("-").map(Number);
      return new Date(y, (m as number) - 1, d as number);
    }
    return today;
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
  const [activeGoal, setActiveGoal] = useState<GoalInCategory | null>(null);
  const [noteGoal, setNoteGoal] = useState<GoalInCategory | null>(null);
  const [uploadingPhotoSource, setUploadingPhotoSource] =
    useState<GoalPhotoSource | null>(null);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);

  const monthKey = useMemo(() => getMonthKey(selectedDate), [selectedDate]);
  const dateKey = useMemo(() => toDateKey(selectedDate), [selectedDate]);
  const isToday = isSameDay(selectedDate, today);

  const load = useCallback(
    async (refresh = false) => {
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
        setError(err instanceof Error ? err.message : "Could not load goals.");
      } finally {
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
    if (editingGoal) {
      await updateGoal(editingGoal.id, input);
    } else {
      await createGoal(input);
    }
    await load();
    setFormOpen(false);
    setEditingGoal(null);
  };

  const addCategory = async (name: string, icon: string): Promise<Category> => {
    const category = await createCategory({ name, icon });
    setCategories((current) => [...current, category]);
    return category;
  };

  const openEditGoal = (goal: GoalInCategory) => {
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
      if (updatingKeys.has(key)) return;
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
    [dateKey, logsByGoalDate, updatingKeys],
  );

  const handleSaveNote = useCallback(
    async (goalId: string, notes: string) => {
      await setGoalLogNote(goalId, dateKey, notes);
      const snap = await fetchGoalLogsSnapshot(monthKey);
      setSnapshot(snap);
      setLogsByGoalDate(snap.logsByGoalDate);
    },
    [dateKey, monthKey],
  );

  const handleAddPhoto = useCallback(
    async (goalId: string, source: GoalPhotoSource) => {
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

  const { totalGoals, completedGoals } = useMemo(() => {
    let total = 0;
    let completed = 0;
    for (const cat of categoriesWithGoals) {
      for (const goal of cat.goals) {
        total++;
        if (logsByGoalDate[`${goal.id}_${dateKey}`] === "complete") completed++;
      }
    }
    return { totalGoals: total, completedGoals: completed };
  }, [categoriesWithGoals, logsByGoalDate, dateKey]);

  const progress = totalGoals > 0 ? completedGoals / totalGoals : 0;

  // Goals grouped by priority, excluding completed goals
  const priorityGroups = useMemo(() => {
    const make = (p: "high" | "medium" | "low") =>
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
    return { high: make("high"), medium: make("medium"), low: make("low") };
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

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 16 }]}
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

          {/* Progress bar */}
          {totalGoals > 0 ? (
            <View style={styles.progressSection}>
              <View style={styles.progressLabelRow}>
                <Text
                  style={[styles.progressLabel, { color: theme.textSecondary }]}
                >
                  {completedGoals} / {totalGoals} goals complete
                </Text>
                <Text style={[styles.progressPct, { color: theme.primary }]}>
                  {Math.round(progress * 100)}%
                </Text>
              </View>
              <View
                style={[
                  styles.progressTrack,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <View
                  style={[
                    styles.progressFill,
                    {
                      backgroundColor: theme.primary,
                      width: `${Math.round(progress * 100)}%`,
                    },
                  ]}
                />
              </View>
            </View>
          ) : null}

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
          ) : categoriesWithGoals.length === 0 ? (
            <EmptyState />
          ) : (
            <View style={styles.prioritySections}>
              {(["high", "medium", "low"] as const).map((p) => {
                const groups = priorityGroups[p];
                if (groups.length === 0) return null;
                const isOpen = openPriorities.has(p);
                return (
                  <PriorityAccordion
                    key={p}
                    label={PRIORITY_LABELS[p] ?? p}
                    isOpen={isOpen}
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
                          onPressGoal={setActiveGoal}
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
                onPressGoal={setActiveGoal}
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
      {activeGoal ? (
        <GoalActionsModal
          goal={activeGoal}
          hasNote={Boolean(
            snapshot?.notesByGoalDate[`${activeGoal.id}_${dateKey}`]?.trim(),
          )}
          hasPhoto={
            (snapshot?.photoCountsByGoalDate[`${activeGoal.id}_${dateKey}`] ??
              0) > 0
          }
          visibility={
            snapshot?.visibilityByGoalDate[`${activeGoal.id}_${dateKey}`] ??
            activeGoal.visibility
          }
          isUpdatingVisibility={isUpdatingVisibility}
          status={logsByGoalDate[`${activeGoal.id}_${dateKey}`]}
          isUpdating={updatingKeys.has(`${activeGoal.id}_${dateKey}`)}
          uploadingPhotoSource={uploadingPhotoSource}
          onAddPhoto={(source) => void handleAddPhoto(activeGoal.id, source)}
          onOpenNote={() => {
            setNoteGoal(activeGoal);
            setActiveGoal(null);
          }}
          onSetVisibility={(visibility) =>
            void handleSetVisibility(activeGoal.id, visibility)
          }
          onSetStatus={(newStatus: GoalLogStatus) => {
            void handleSetStatus(activeGoal.id, newStatus);
            setActiveGoal(null);
          }}
          onDismiss={() => setActiveGoal(null)}
        />
      ) : null}
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

function PriorityAccordion({
  label,
  isOpen,
  onToggle,
  children,
}: {
  label: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={styles.priorityBlock}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.priorityHeader,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
      >
        <SymbolView
          name={sym(
            isOpen ? "chevron.down" : "chevron.right",
            isOpen ? "expand_more" : "chevron_right",
          )}
          size={13}
          weight="bold"
          tintColor={theme.textSecondary}
        />
        <Text style={[styles.priorityLabel, { color: theme.textSecondary }]}>
          {label.toUpperCase()}
        </Text>
      </Pressable>
      {isOpen ? <View style={styles.priorityContent}>{children}</View> : null}
    </View>
  );
}

function CategoryAccordionRow({
  category,
  goals,
  dateKey,
  logsByGoalDate,
  updatingKeys,
  isExpanded,
  onToggleExpand,
  onEditGoal,
  onPressGoal,
}: {
  category: CategoryWithGoals;
  goals: GoalInCategory[];
  dateKey: string;
  logsByGoalDate: Record<string, "complete" | "planned">;
  updatingKeys: Set<string>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEditGoal: (goal: GoalInCategory) => void;
  onPressGoal: (goal: GoalInCategory) => void;
}) {
  const theme = useTheme();
  const cfg = getCategoryConfig(category.name);

  return (
    <View
      style={[
        styles.catAccordion,
        { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
      ]}
    >
      <Pressable
        onPress={onToggleExpand}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        style={({ pressed }) => [styles.catRow, pressed && styles.pressed]}
      >
        <View
          style={[styles.catIconWrap, { backgroundColor: `${cfg.color}22` }]}
        >
          <SymbolView
            name={cfg.symbol}
            size={20}
            weight="semibold"
            tintColor={cfg.color}
          />
        </View>
        <View style={styles.catRowText}>
          <Text style={[styles.catName, { color: theme.text }]}>
            {category.name}
          </Text>
          <Text style={[styles.catCount, { color: theme.textSecondary }]}>
            {goals.length} {goals.length === 1 ? "goal" : "goals"}
          </Text>
        </View>
        <SymbolView
          name={sym(
            isExpanded ? "chevron.up" : "chevron.down",
            isExpanded ? "expand_less" : "expand_more",
          )}
          size={14}
          weight="semibold"
          tintColor={theme.tabIcon}
        />
      </Pressable>

      {isExpanded ? (
        <View style={[styles.catGoals, { borderTopColor: theme.tabBorder }]}>
          {goals.map((goal, index) => (
            <View key={goal.id}>
              {index > 0 ? (
                <View
                  style={[styles.divider, { backgroundColor: theme.tabBorder }]}
                />
              ) : null}
              <GoalRow
                goal={goal}
                status={logsByGoalDate[`${goal.id}_${dateKey}`]}
                isUpdating={updatingKeys.has(`${goal.id}_${dateKey}`)}
                onEdit={() => onEditGoal(goal)}
                onPress={() => onPressGoal(goal)}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function CompletedSection({
  completedList,
  dateKey,
  logsByGoalDate,
  updatingKeys,
  isOpen,
  onToggle,
  onEditGoal,
  onPressGoal,
}: {
  completedList: { goal: GoalInCategory; category: CategoryWithGoals }[];
  dateKey: string;
  logsByGoalDate: Record<string, "complete" | "planned">;
  updatingKeys: Set<string>;
  isOpen: boolean;
  onToggle: () => void;
  onEditGoal: (goal: GoalInCategory) => void;
  onPressGoal: (goal: GoalInCategory) => void;
}) {
  const theme = useTheme();
  if (completedList.length === 0) return null;

  return (
    <View style={styles.priorityBlock}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.priorityHeader,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
      >
        <SymbolView
          name={sym(
            isOpen ? "chevron.down" : "chevron.right",
            isOpen ? "expand_more" : "chevron_right",
          )}
          size={13}
          weight="bold"
          tintColor={theme.textSecondary}
        />
        <Text style={[styles.priorityLabel, { color: theme.textSecondary }]}>
          {`SHOW COMPLETED (${completedList.length})`}
        </Text>
      </Pressable>
      {isOpen ? (
        <View
          style={[
            styles.goalSurface,
            { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
          ]}
        >
          {completedList.map(({ goal }, index) => (
            <View key={goal.id}>
              {index > 0 ? (
                <View
                  style={[styles.divider, { backgroundColor: theme.tabBorder }]}
                />
              ) : null}
              <GoalRow
                goal={goal}
                status={logsByGoalDate[`${goal.id}_${dateKey}`]}
                isUpdating={updatingKeys.has(`${goal.id}_${dateKey}`)}
                onEdit={() => onEditGoal(goal)}
                onPress={() => onPressGoal(goal)}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function GoalRow({
  goal,
  status,
  isUpdating,
  onEdit,
  onPress,
}: {
  goal: GoalInCategory;
  status: "complete" | "planned" | undefined;
  isUpdating: boolean;
  onEdit: () => void;
  onPress: () => void;
}) {
  const theme = useTheme();
  const isComplete = status === "complete";
  const isPlanned = status === "planned";

  const statusBg = isComplete
    ? theme.primary
    : isPlanned
      ? "#B87D4D"
      : "transparent";
  const statusBorder = isComplete
    ? theme.primary
    : isPlanned
      ? "#B87D4D"
      : theme.tabBorder;
  const rowBg = isComplete
    ? `${theme.primary}12`
    : isPlanned
      ? "#B87D4D0E"
      : "transparent";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${goal.name}, ${status ?? "not reported"}. Tap to open actions.`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.goalRow,
        { backgroundColor: rowBg },
        pressed && styles.pressed,
      ]}
    >
      {/* Status toggle */}
      <View
        style={[
          styles.statusButton,
          { backgroundColor: statusBg, borderColor: statusBorder },
        ]}
      >
        {isUpdating ? (
          <ActivityIndicator
            size="small"
            color={isComplete || isPlanned ? "#FFFFFF" : theme.primary}
          />
        ) : isComplete ? (
          <SymbolView
            name={sym("checkmark", "check")}
            size={13}
            weight="bold"
            tintColor="#FFFFFF"
          />
        ) : isPlanned ? (
          <SymbolView
            name={sym("clock", "schedule")}
            size={13}
            weight="semibold"
            tintColor="#FFFFFF"
          />
        ) : null}
      </View>

      {/* Goal icon */}
      <View
        style={[styles.goalIcon, { backgroundColor: theme.backgroundElement }]}
      >
        <GoalIcon
          iconKey={goal.iconKey}
          size={17}
          color={isComplete ? theme.primary : theme.tabIcon}
        />
      </View>

      {/* Goal name */}
      <Text
        numberOfLines={2}
        style={[
          styles.goalName,
          { color: isComplete ? theme.textSecondary : theme.text },
          isComplete && styles.completedText,
        ]}
      >
        {goal.name}
      </Text>

      <Pressable
        accessibilityLabel={`Edit ${goal.name}`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={(event) => {
          event.stopPropagation();
          onEdit();
        }}
        style={({ pressed }) => [
          styles.goalMenuButton,
          { backgroundColor: theme.backgroundElement },
          pressed && styles.pressed,
        ]}
      >
        <SymbolView
          name={sym("ellipsis", "more_horiz")}
          size={17}
          weight="semibold"
          tintColor={theme.textSecondary}
        />
      </Pressable>
    </Pressable>
  );
}

function GoalActionsModal({
  goal,
  hasNote,
  hasPhoto,
  visibility,
  status,
  isUpdating,
  isUpdatingVisibility,
  uploadingPhotoSource,
  onAddPhoto,
  onOpenNote,
  onSetVisibility,
  onSetStatus,
  onDismiss,
}: {
  goal: GoalInCategory;
  hasNote: boolean;
  hasPhoto: boolean;
  visibility: GoalVisibility;
  status: "complete" | "planned" | undefined;
  isUpdating: boolean;
  isUpdatingVisibility: boolean;
  uploadingPhotoSource: GoalPhotoSource | null;
  onAddPhoto: (source: GoalPhotoSource) => void;
  onOpenNote: () => void;
  onSetVisibility: (visibility: GoalVisibility) => void;
  onSetStatus: (status: GoalLogStatus) => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();
  const isComplete = status === "complete";
  const isUploadingPhoto = uploadingPhotoSource !== null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <View style={modalStyles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onDismiss} />
        <View style={[modalStyles.card, { backgroundColor: theme.tabBar }]}>
          {/* Header */}
          <View style={modalStyles.header}>
            <Text
              style={[modalStyles.title, { color: theme.text }]}
              numberOfLines={2}
            >
              {goal.name}
            </Text>
            <Pressable
              onPress={onDismiss}
              hitSlop={8}
              style={({ pressed }) => [
                modalStyles.closeBtn,
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

          {/* Actions */}
          <View style={modalStyles.actions}>
            {/* Mark complete / Reopen */}
            <Pressable
              onPress={() => onSetStatus(isComplete ? null : "complete")}
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
                    isComplete
                      ? sym("arrow.uturn.backward.circle.fill", "undo")
                      : sym("checkmark.circle.fill", "check_circle")
                  }
                  size={26}
                  tintColor={isComplete ? theme.textSecondary : theme.primary}
                />
              )}
              <Text style={[modalStyles.actionText, { color: theme.text }]}>
                {isComplete ? "Reopen" : "Mark complete"}
              </Text>
            </Pressable>

            {/* Add note */}
            <Pressable
              onPress={onOpenNote}
              style={({ pressed }) => [
                modalStyles.actionRow,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("note.text", "notes")}
                size={26}
                tintColor={theme.primary}
              />
              <Text style={[modalStyles.actionText, { color: theme.text }]}>
                {hasNote ? "Edit note" : "Add note"}
              </Text>
            </Pressable>

            {hasNote || hasPhoto ? (
              <GoalLogVisibilityControl
                disabled={isUpdatingVisibility}
                value={visibility}
                onChange={onSetVisibility}
              />
            ) : null}

            {/* Photo row */}
            <View style={modalStyles.photoRow}>
              <Pressable
                disabled={isUploadingPhoto}
                onPress={() => onAddPhoto("camera")}
                style={({ pressed }) => [
                  modalStyles.photoBtn,
                  { backgroundColor: theme.backgroundElement },
                  isUploadingPhoto && modalStyles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {uploadingPhotoSource === "camera" ? (
                  <ActivityIndicator color={theme.primary} size="small" />
                ) : (
                  <SymbolView
                    name={sym("camera.fill", "camera_alt")}
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
                onPress={() => onAddPhoto("library")}
                style={({ pressed }) => [
                  modalStyles.photoBtn,
                  { backgroundColor: theme.backgroundElement },
                  isUploadingPhoto && modalStyles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {uploadingPhotoSource === "library" ? (
                  <ActivityIndicator color={theme.primary} size="small" />
                ) : (
                  <SymbolView
                    name={sym("photo.fill", "photo_library")}
                    size={26}
                    tintColor={theme.primary}
                  />
                )}
                <Text style={[modalStyles.actionText, { color: theme.text }]}>
                  Add photo
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function EmptyState() {
  const theme = useTheme();
  return (
    <View style={styles.centerState}>
      <View
        style={[styles.emptyIcon, { backgroundColor: theme.backgroundElement }]}
      >
        <SymbolView
          name={sym("calendar", "calendar_today")}
          size={28}
          tintColor={theme.primary}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        No daily goals yet
      </Text>
      <Text style={[styles.emptyDescription, { color: theme.textSecondary }]}>
        Add daily goals from the Goals section to track them here.
      </Text>
    </View>
  );
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
    paddingBottom: 32,
    gap: 18,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    minHeight: 42,
    position: "relative",
  },
  pageHeaderIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  pageHeaderText: { flex: 1, gap: 1, paddingRight: 54 },
  addButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  headerAddButton: {
    position: "absolute",
    top: 0,
    right: 0,
    zIndex: 10,
    elevation: 10,
  },
  pageTitle: {
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  pageSubtitle: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  dateNav: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 6,
    minHeight: 56,
  },
  navArrow: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  dateLabel: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 4,
  },
  dateLabelText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "700",
  },
  todayBadge: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  todayBadgeText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
  navRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  todayButton: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  todayButtonText: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  progressSection: { gap: 8 },
  progressLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressLabel: { fontSize: 13, lineHeight: 17, fontWeight: "600" },
  progressPct: { fontSize: 13, lineHeight: 17, fontWeight: "800" },
  progressTrack: {
    height: 7,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    minWidth: 7,
  },
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
  categories: { gap: 22 },
  prioritySections: { gap: 6 },
  priorityBlock: { gap: 8 },
  priorityHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 3,
    paddingVertical: 4,
  },
  priorityLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  priorityContent: { gap: 8 },
  catAccordion: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    overflow: "hidden",
  },
  catRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 14,
    paddingVertical: 13,
    minHeight: 68,
  },
  catIconWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  catRowText: { flex: 1, gap: 2 },
  catName: { fontSize: 16, lineHeight: 20, fontWeight: "700" },
  catCount: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
  catGoals: { borderTopWidth: StyleSheet.hairlineWidth },
  categorySection: { gap: 9 },
  categoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 3,
  },
  categoryName: { fontSize: 15, lineHeight: 20, fontWeight: "800" },
  categoryCount: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  goalSurface: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    overflow: "hidden",
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 64 },
  goalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 12,
    paddingVertical: 13,
    minHeight: 64,
  },
  statusButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: 10,
  },
  goalIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  goalName: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "600",
  },
  completedText: { textDecorationLine: "line-through" },
  goalMenuButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  pressed: { opacity: 0.72 },
});

const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
    padding: 16,
    paddingBottom: 36,
  },
  card: {
    borderRadius: 24,
    overflow: "hidden",
    paddingBottom: 8,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    gap: 12,
  },
  title: {
    flex: 1,
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    gap: 6,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  actionRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 16,
    minHeight: 64,
  },
  actionText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "600",
  },
  photoRow: {
    flexDirection: "row",
    gap: 6,
  },
  photoBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 18,
    borderRadius: 16,
  },
  disabled: { opacity: 0.55 },
});
