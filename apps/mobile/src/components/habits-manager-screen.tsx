import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BrandedEmptyState } from "@/components/branded-empty-state";
import { CreateHeaderMenu } from "@/components/create-header-menu";
import { EXPO_SYMBOL_ICON_OPTIONS, GoalIcon } from "@/components/goal-icon";
import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import {
  getCachedData,
  isCacheFresh,
  setCachedData,
} from "@/lib/app-data-cache";
import {
  type FriendGroupRow,
  type FriendRow,
  fetchFriendGroups,
  fetchFriends,
} from "@/lib/friends-client";
import {
  type Category,
  type Habit,
  type HabitInput,
  type HabitPeriod,
  type HabitPriority,
  type HabitRepeatMonthlyType,
  type HabitVisibility,
  createCategory,
  createHabit,
  deleteCategory,
  deleteHabit,
  fetchCategories,
  fetchHabits,
  updateCategory,
  updateHabit,
} from "@/lib/habits-client";
import { playSelectionHaptic } from "@/lib/haptics";
import {
  cancelHabitReminderAsync,
  scheduleHabitReminderAsync,
} from "@/lib/push-notifications";
import { VISIBILITY_LABELS } from "@/lib/visibility-labels";

type SymbolName = SymbolViewProps["name"];
type HabitFilter = "all" | "high" | "hidden";
type HabitsScreenCache = {
  categories: Category[];
  habits: Habit[];
};

const HABITS_SCREEN_CACHE_KEY = "screen:habits";
const PRIORITIES: HabitPriority[] = ["high", "low"];
const PERIODS: HabitPeriod[] = ["daily", "weekly", "monthly"];
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTH_DAY_LETTERS = ["S", "M", "T", "W", "Th", "F", "S"];
const MONTH_DATES = Array.from({ length: 31 }, (_, index) => index + 1);
const MONTH_WEEK_ROWS = Array.from({ length: 5 }, (_, index) => index);
const DEFAULT_REMINDER_TIME = "09:00";
const REMINDER_TIME_REGEX = /^([01]?\d|2[0-3]):[0-5]\d$/;
const WEEKDAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const ORDINALS = ["1st", "2nd", "3rd", "4th", "last"];

function getWeekOfMonth(d: Date) {
  const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  if (d.getDate() + 7 > daysInMonth) return 4;
  return Math.ceil(d.getDate() / 7) - 1;
}

function monthlyWeekdayCell(week: number, day: number) {
  return week * 7 + day;
}

function normalizeMonthlyWeekdayCells(
  days: number[] | null | undefined,
  fallbackDate: Date,
) {
  const valid = (days ?? []).filter((day) => day >= 0 && day <= 34);
  if (valid.length === 0) {
    return [
      monthlyWeekdayCell(getWeekOfMonth(fallbackDate), fallbackDate.getDay()),
    ];
  }
  if (valid.every((day) => day <= 6)) {
    const week = getWeekOfMonth(fallbackDate);
    return valid.map((day) => monthlyWeekdayCell(week, day));
  }
  return valid;
}
const VISIBILITY_OPTIONS: Array<{
  value: HabitVisibility;
  label: string;
}> = [
  { value: "only_me", label: VISIBILITY_LABELS.only_me },
  { value: "goal_friends", label: VISIBILITY_LABELS.goal_friends },
  { value: "all_friends", label: VISIBILITY_LABELS.all_friends },
];
const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 1,
};

const EMPTY_HABIT: HabitInput = {
  name: "",
  frequencyGoal: null,
  period: "daily",
  repeatCadence: "daily",
  repeatInterval: 1,
  repeatDays: [new Date().getDay()],
  repeatMonthlyType: "day_of_month",
  categoryId: "",
  goalId: null,
  priority: "high",
  visibility: "all_friends",
  audienceFriendIds: [],
  audienceGroupIds: [],
  iconKey: "mdi:heart-outline",
  defaultComplete: false,
  planOnCalendar: true,
  reminderEnabled: false,
  reminderTime: null,
  reminderTimes: null,
  hidden: false,
};

function symbol(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function frequencyLabel(habit: Habit) {
  const target = Math.max(habit.frequencyGoal ?? 1, 1);
  const cadence = habit.repeatCadence ?? habit.period;
  const interval = habit.repeatInterval ?? 1;
  const unit =
    cadence === "daily" ? "day" : cadence === "weekly" ? "week" : "month";
  const base =
    interval === 1 ? capitalize(cadence) : `Every ${interval} ${unit}s`;
  if (habit.period === "daily" && (habit.frequencyGoal ?? 1) > 1) {
    return `${base} · ${habit.frequencyGoal}/day`;
  }
  if (habit.period !== "daily" && target > 1) {
    return `${target}/${habit.period} · ${base}`;
  }
  if (cadence === "weekly" && habit.repeatDays?.length) {
    return `${base} · ${habit.repeatDays.map((d) => DAY_LETTERS[d]).join("")}`;
  }
  return base;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function normalizeReminderTime(value: string | null | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return DEFAULT_REMINDER_TIME;
  if (!REMINDER_TIME_REGEX.test(trimmed)) return null;

  const [hours = "0", minutes = "00"] = trimmed.split(":");
  return `${hours.padStart(2, "0")}:${minutes}`;
}

function reminderCountForForm(form: HabitInput) {
  return Math.max(form.frequencyGoal ?? 1, 1);
}

function normalizeReminderTimes(
  values: string[] | null | undefined,
  count: number,
) {
  const source = values?.length ? values : [DEFAULT_REMINDER_TIME];
  return Array.from({ length: count }, (_, index) => {
    return source[index] ?? source[source.length - 1] ?? DEFAULT_REMINDER_TIME;
  });
}

function toInput(habit: Habit): HabitInput {
  const today = new Date();
  const cadence = habit.repeatCadence ?? habit.period;
  return {
    name: habit.name,
    frequencyGoal: habit.frequencyGoal,
    period: habit.period,
    repeatCadence: cadence,
    repeatInterval: habit.repeatInterval ?? 1,
    repeatDays:
      habit.repeatDays ?? (cadence === "monthly" ? [today.getDate()] : null),
    repeatMonthlyType:
      (habit.repeatMonthlyType as HabitRepeatMonthlyType | null) ??
      "day_of_month",
    categoryId: habit.categoryId,
    goalId: habit.goalId,
    priority: habit.priority,
    visibility: habit.visibility,
    audienceFriendIds: habit.audienceFriendIds ?? [],
    audienceGroupIds: habit.audienceGroupIds ?? [],
    iconKey: habit.iconKey,
    defaultComplete: habit.defaultComplete,
    planOnCalendar: habit.planOnCalendar !== false,
    reminderEnabled: habit.reminderEnabled ?? false,
    reminderTime: habit.reminderTime ?? null,
    reminderTimes:
      habit.reminderTimes ?? (habit.reminderTime ? [habit.reminderTime] : null),
    hidden: habit.hidden,
  };
}

export function HabitsManagerScreen() {
  const router = useRouter();
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();
  const cachedScreen = getCachedData<HabitsScreenCache>(
    HABITS_SCREEN_CACHE_KEY,
  );
  const [habits, setHabits] = useState<Habit[]>(
    cachedScreen?.data.habits ?? [],
  );
  const [categories, setCategories] = useState<Category[]>(
    cachedScreen?.data.categories ?? [],
  );
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HabitFilter>("all");
  const [isLoading, setIsLoading] = useState(!cachedScreen);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingHabit, setEditingHabit] = useState<Habit | null>(null);
  const [actionHabit, setActionHabit] = useState<Habit | null>(null);

  const load = useCallback(async (refresh = false) => {
    const cached = getCachedData<HabitsScreenCache>(HABITS_SCREEN_CACHE_KEY);
    if (!refresh && cached) {
      setHabits(cached.data.habits);
      setCategories(cached.data.categories);
      setIsLoading(false);
      if (isCacheFresh(cached)) return;
    }
    refresh ? setIsRefreshing(true) : setIsLoading(!cached);
    setError(null);

    try {
      const [nextHabits, nextCategories] = await Promise.all([
        fetchHabits(),
        fetchCategories(),
      ]);
      setCachedData(HABITS_SCREEN_CACHE_KEY, {
        categories: nextCategories,
        habits: nextHabits,
      });
      setHabits(nextHabits);
      setCategories(nextCategories);
    } catch (loadError) {
      if (!cached) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load habits.",
        );
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleHabits = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return habits
      .filter((habit) => {
        if (filter === "high" && habit.priority !== "high") return false;
        if (filter === "hidden" && !habit.hidden) return false;
        if (!normalizedQuery) return true;
        return `${habit.name} ${habit.categoryName} ${habit.goalTitle ?? ""} ${
          habit.period ?? ""
        } ${habit.priority}`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort(
        (left, right) =>
          PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] ||
          left.name.localeCompare(right.name),
      );
  }, [filter, habits, query]);

  const groupedHabits = useMemo(() => {
    const groups = new Map<string, Habit[]>();
    for (const habit of visibleHabits) {
      const key = habit.categoryName || "Uncategorized";
      groups.set(key, [...(groups.get(key) ?? []), habit]);
    }
    return [...groups.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }, [visibleHabits]);

  const openCreate = () => {
    setEditingHabit(null);
    setFormOpen(true);
  };

  const openEdit = (habit: Habit) => {
    setActionHabit(null);
    setEditingHabit(habit);
    setFormOpen(true);
  };

  const saveHabit = async (input: HabitInput) => {
    const saved = editingHabit
      ? await updateHabit(editingHabit.id, input)
      : await createHabit(input);
    try {
      await scheduleHabitReminderAsync(saved);
    } catch (reminderError) {
      Alert.alert(
        "Reminder not scheduled",
        reminderError instanceof Error
          ? reminderError.message
          : "Could not schedule this habit reminder.",
      );
    }

    setHabits((current) => {
      const nextHabits = editingHabit
        ? current.map((habit) => (habit.id === saved.id ? saved : habit))
        : [...current, saved];
      setCachedData(HABITS_SCREEN_CACHE_KEY, {
        categories,
        habits: nextHabits,
      });
      return nextHabits;
    });
    setFormOpen(false);
    setEditingHabit(null);
  };

  const addCategory = async (name: string, icon: string) => {
    const category = await createCategory({ name, icon });
    setCategories((current) => {
      const nextCategories = [...current, category].sort((left, right) =>
        left.name.localeCompare(right.name),
      );
      setCachedData(HABITS_SCREEN_CACHE_KEY, {
        categories: nextCategories,
        habits,
      });
      return nextCategories;
    });
    return category;
  };

  const editCategory = async (id: string, name: string, icon: string) => {
    const category = await updateCategory(id, { name, icon });
    setCategories((current) => {
      const nextCategories = current
        .map((item) => (item.id === category.id ? category : item))
        .sort((left, right) => left.name.localeCompare(right.name));
      setCachedData(HABITS_SCREEN_CACHE_KEY, {
        categories: nextCategories,
        habits,
      });
      return nextCategories;
    });
    setHabits((current) => {
      const nextHabits = current.map((habit) =>
        habit.categoryId === category.id
          ? {
              ...habit,
              categoryIcon: category.icon,
              categoryName: category.name,
            }
          : habit,
      );
      setCachedData(HABITS_SCREEN_CACHE_KEY, {
        categories,
        habits: nextHabits,
      });
      return nextHabits;
    });
    return category;
  };

  const removeCategory = async (id: string) => {
    await deleteCategory(id);
    setCategories((current) => {
      const nextCategories = current.filter((item) => item.id !== id);
      setCachedData(HABITS_SCREEN_CACHE_KEY, {
        categories: nextCategories,
        habits,
      });
      return nextCategories;
    });
  };

  const toggleHidden = async (habit: Habit) => {
    setActionHabit(null);
    try {
      const updated = await updateHabit(habit.id, {
        ...toInput(habit),
        hidden: !habit.hidden,
      });
      if (updated.hidden) {
        await cancelHabitReminderAsync(updated.id);
      } else {
        await scheduleHabitReminderAsync(updated);
      }
      setHabits((current) => {
        const nextHabits = current.map((item) =>
          item.id === updated.id ? updated : item,
        );
        setCachedData(HABITS_SCREEN_CACHE_KEY, {
          categories,
          habits: nextHabits,
        });
        return nextHabits;
      });
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update habit.",
      );
    }
  };

  const confirmDelete = (habit: Habit, onDeleted?: () => void) => {
    setActionHabit(null);
    Alert.alert(
      "Delete habit?",
      `"${habit.name}" and its history will be permanently deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteHabit(habit.id);
              await cancelHabitReminderAsync(habit.id);
              setHabits((current) => {
                const nextHabits = current.filter(
                  (item) => item.id !== habit.id,
                );
                setCachedData(HABITS_SCREEN_CACHE_KEY, {
                  categories,
                  habits: nextHabits,
                });
                return nextHabits;
              });
              onDeleted?.();
            } catch (deleteError) {
              setError(
                deleteError instanceof Error
                  ? deleteError.message
                  : "Could not delete habit.",
              );
            }
          },
        },
      ],
    );
  };

  const highCount = habits.filter((habit) => habit.priority === "high").length;
  const hiddenCount = habits.filter((habit) => habit.hidden).length;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView
          canCancelContentTouches
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
          <View style={styles.header}>
            <View style={styles.headerIdentity}>
              <View
                style={[styles.headerIcon, { backgroundColor: theme.primary }]}
              >
                <SymbolView
                  name={symbol("target", "target")}
                  size={21}
                  weight="semibold"
                  tintColor={theme.primaryForeground}
                />
              </View>
              <View>
                <CreateHeaderMenu currentSection="habits" />
                <Text
                  style={[styles.description, { color: theme.textSecondary }]}
                >
                  Track your priorities
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityLabel="Add habit"
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

          <View style={styles.stats}>
            <Stat label="Habits" value={habits.length} />
            <Stat
              label="High priority"
              value={highCount}
              accent={theme.primary}
            />
            <Stat label="Archived" value={hiddenCount} />
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
              accessibilityLabel="Search habits"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder="Search habits"
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

          <ScrollView
            horizontal
            contentContainerStyle={styles.filters}
            showsHorizontalScrollIndicator={false}
          >
            {(
              [
                ["all", "All"],
                ["high", "High priority"],
                ["hidden", "Archived"],
              ] as const
            ).map(([value, label]) => (
              <FilterChip
                key={value}
                label={label}
                selected={filter === value}
                onPress={() => setFilter(value)}
              />
            ))}
          </ScrollView>

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
          ) : groupedHabits.length ? (
            <View style={styles.groups}>
              {groupedHabits.map(([categoryName, categoryHabits]) => (
                <View key={categoryName} style={styles.group}>
                  <View style={styles.groupHeader}>
                    <Text style={[styles.groupTitle, { color: theme.text }]}>
                      {categoryName}
                    </Text>
                    <Text
                      style={[
                        styles.groupCount,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {categoryHabits.length}
                    </Text>
                  </View>
                  <View style={styles.habitList}>
                    {categoryHabits.map((habit) => (
                      <HabitCard
                        key={habit.id}
                        habit={habit}
                        onEdit={() => openEdit(habit)}
                        onMore={() => setActionHabit(habit)}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState hasHabits={habits.length > 0} onAdd={openCreate} />
          )}
        </ScrollView>
      </SafeAreaView>

      <HabitFormModal
        categories={categories}
        habit={editingHabit}
        isOpen={formOpen}
        onAddCategory={addCategory}
        onDeleteCategory={removeCategory}
        onUpdateCategory={editCategory}
        onClose={() => {
          setFormOpen(false);
          setEditingHabit(null);
        }}
        onDelete={(habit) =>
          confirmDelete(habit, () => {
            setFormOpen(false);
            setEditingHabit(null);
          })
        }
        onSave={saveHabit}
      />
      <HabitActionsModal
        habit={actionHabit}
        onClose={() => setActionHabit(null)}
        onDelete={confirmDelete}
        onEdit={openEdit}
        onShare={(habit) => {
          setActionHabit(null);
          router.push({
            pathname: "/collab",
            params: { section: "shared-goals", goalId: habit.id },
          });
        }}
        onToggleHidden={toggleHidden}
      />
    </View>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.stat,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.tabBorder,
        },
      ]}
    >
      <Text style={[styles.statValue, { color: accent ?? theme.text }]}>
        {value}
      </Text>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
}

function FilterChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        playSelectionHaptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.filterChip,
        {
          backgroundColor: selected ? theme.primary : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.tabBorder,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.filterLabel,
          { color: selected ? theme.primaryForeground : theme.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function HabitCard({
  habit,
  onEdit,
  onMore,
}: {
  habit: Habit;
  onEdit: () => void;
  onMore: () => void;
}) {
  const theme = useTheme();
  const priorityColor =
    habit.priority === "high" ? theme.primary : theme.textSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onEdit}
      style={({ pressed }) => [
        styles.habitCard,
        {
          backgroundColor: theme.tabBar,
          borderColor: theme.tabBorder,
          opacity: habit.hidden ? 0.58 : 1,
        },
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[styles.habitIcon, { backgroundColor: theme.backgroundElement }]}
      >
        <GoalIcon
          iconKey={habit.iconKey}
          size={22}
          color={habit.hidden ? theme.textSecondary : theme.primary}
        />
      </View>
      <View style={styles.habitBody}>
        <View style={styles.habitTitleRow}>
          <Text
            numberOfLines={1}
            style={[
              styles.habitName,
              { color: theme.text },
              habit.hidden && styles.hiddenName,
            ]}
          >
            {habit.name}
          </Text>
          {habit.hidden ? (
            <SymbolView
              name={symbol("archivebox", "inventory_2")}
              size={15}
              tintColor={theme.textSecondary}
            />
          ) : null}
        </View>
        <View style={styles.habitMetadata}>
          <View
            style={[styles.priorityDot, { backgroundColor: priorityColor }]}
          />
          <Text style={[styles.metadataText, { color: theme.textSecondary }]}>
            {capitalize(habit.priority)}
          </Text>
          <Text
            style={[styles.metadataDivider, { color: theme.textSecondary }]}
          >
            ·
          </Text>
          <Text style={[styles.metadataText, { color: theme.textSecondary }]}>
            {frequencyLabel(habit)}
          </Text>
          {habit.goalTitle ? (
            <>
              <Text
                style={[styles.metadataDivider, { color: theme.textSecondary }]}
              >
                ·
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.metadataText, { color: theme.textSecondary }]}
              >
                {habit.goalTitle}
              </Text>
            </>
          ) : null}
        </View>
      </View>
      <Pressable
        accessibilityLabel={`More actions for ${habit.name}`}
        hitSlop={8}
        onPress={(event) => {
          event.stopPropagation();
          onMore();
        }}
        style={({ pressed }) => [
          styles.moreButton,
          pressed && { backgroundColor: theme.backgroundElement },
        ]}
      >
        <SymbolView
          name={symbol("ellipsis", "more_horiz")}
          size={21}
          tintColor={theme.textSecondary}
        />
      </Pressable>
    </Pressable>
  );
}

function EmptyState({
  hasHabits,
  onAdd,
}: {
  hasHabits: boolean;
  onAdd: () => void;
}) {
  const theme = useTheme();
  return (
    <View style={styles.centerState}>
      {hasHabits ? (
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
            No habits found
          </Text>
          <Text
            style={[styles.emptyDescription, { color: theme.textSecondary }]}
          >
            Try a different search or filter.
          </Text>
        </>
      ) : (
        <BrandedEmptyState
          title="Create your first habit"
          description="Set a priority and schedule, then start building momentum."
        />
      )}
      {!hasHabits ? (
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
            Add habit
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function HabitActionsModal({
  habit,
  onClose,
  onDelete,
  onEdit,
  onShare,
  onToggleHidden,
}: {
  habit: Habit | null;
  onClose: () => void;
  onDelete: (habit: Habit) => void;
  onEdit: (habit: Habit) => void;
  onShare: (habit: Habit) => void;
  onToggleHidden: (habit: Habit) => void;
}) {
  const theme = useTheme();
  if (!habit) return null;

  const actions = [
    {
      label: "Edit habit",
      icon: symbol("pencil", "edit"),
      onPress: () => onEdit(habit),
    },
    {
      label: "Make shared",
      icon: symbol("person.2", "groups"),
      onPress: () => onShare(habit),
    },
    {
      label: habit.hidden ? "Restore habit" : "Archive habit",
      icon: symbol(
        habit.hidden ? "arrow.uturn.backward" : "archivebox",
        habit.hidden ? "restore" : "inventory_2",
      ),
      onPress: () => void onToggleHidden(habit),
    },
    {
      label: "Delete habit",
      icon: symbol("trash", "delete"),
      danger: true,
      onPress: () => onDelete(habit),
    },
  ];

  return (
    <Modal animationType="fade" transparent visible onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.actionSheet,
            { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
          ]}
        >
          <Text style={[styles.actionTitle, { color: theme.text }]}>
            {habit.name}
          </Text>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              onPress={action.onPress}
              style={({ pressed }) => [
                styles.actionRow,
                pressed && { backgroundColor: theme.backgroundElement },
              ]}
            >
              <SymbolView
                name={action.icon}
                size={20}
                tintColor={action.danger ? "#B84D54" : theme.tabIcon}
              />
              <Text
                style={[
                  styles.actionLabel,
                  { color: action.danger ? "#B84D54" : theme.text },
                ]}
              >
                {action.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}

function getSelectedAudienceFriends(
  form: Pick<HabitInput, "audienceFriendIds" | "audienceGroupIds">,
  friends: FriendRow[],
  groups: FriendGroupRow[],
) {
  const selectedFriendIds = new Set(form.audienceFriendIds);
  const selectedGroupIds = new Set(form.audienceGroupIds);
  const selected = new Map<
    string,
    { id: string; name: string; image: string | null }
  >();

  for (const friend of friends) {
    if (!selectedFriendIds.has(friend.friendId)) continue;
    selected.set(friend.friendId, {
      id: friend.friendId,
      name: friend.friendName,
      image: friend.friendImage,
    });
  }

  for (const group of groups) {
    if (!selectedGroupIds.has(group.id)) continue;
    for (const member of group.members) {
      selected.set(member.id, {
        id: member.id,
        name: member.name,
        image: member.image,
      });
    }
  }

  return [...selected.values()];
}

function AudienceAvatarStack({
  friends,
}: {
  friends: Array<{ id: string; name: string; image: string | null }>;
}) {
  const theme = useTheme();
  const visibleFriends = friends.slice(0, 3);
  const overflowCount = friends.length - visibleFriends.length;

  return (
    <View style={styles.audienceAvatarStack}>
      {visibleFriends.map((friend, index) => (
        <View
          key={friend.id}
          style={[
            styles.audienceAvatar,
            {
              backgroundColor: theme.tabBar,
              borderColor: theme.backgroundElement,
              marginLeft: index === 0 ? 0 : -9,
              zIndex: visibleFriends.length - index,
            },
          ]}
        >
          {friend.image ? (
            <Image
              contentFit="cover"
              source={{ uri: friend.image }}
              style={styles.audienceAvatarImage}
            />
          ) : (
            <Text style={[styles.audienceAvatarText, { color: theme.primary }]}>
              {getAudienceInitials(friend.name)}
            </Text>
          )}
        </View>
      ))}
      {overflowCount > 0 ? (
        <View
          style={[
            styles.audienceAvatar,
            styles.audienceAvatarOverflow,
            {
              backgroundColor: theme.tabBar,
              borderColor: theme.backgroundElement,
              marginLeft: -9,
            },
          ]}
        >
          <Text style={[styles.audienceAvatarText, { color: theme.text }]}>
            +{overflowCount}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function getAudienceInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function HabitFormModal({
  categories,
  habit,
  initialValues,
  isOpen,
  friends = [],
  friendGroups = [],
  onAddCategory,
  onDeleteCategory,
  onUpdateCategory,
  onClose,
  onDelete,
  onSave,
}: {
  categories: Category[];
  habit: Habit | null;
  initialValues?: Partial<HabitInput>;
  isOpen: boolean;
  friends?: FriendRow[];
  friendGroups?: FriendGroupRow[];
  onAddCategory: (name: string, icon: string) => Promise<Category>;
  onDeleteCategory?: (id: string) => Promise<void>;
  onUpdateCategory?: (
    id: string,
    name: string,
    icon: string,
  ) => Promise<Category>;
  onClose: () => void;
  onDelete?: (habit: Habit) => void;
  onSave: (input: HabitInput) => Promise<void>;
}) {
  const theme = useTheme();
  const [form, setForm] = useState<HabitInput>(EMPTY_HABIT);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [audienceOpen, setAudienceOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryIcon, setCategoryIcon] = useState<string>("mdi:heart-outline");
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const initialValuesRef = useRef(initialValues);
  initialValuesRef.current = initialValues;

  useEffect(() => {
    if (!isOpen) return;
    setForm(
      habit
        ? toInput(habit)
        : {
            ...EMPTY_HABIT,
            ...initialValuesRef.current,
            categoryId: categoriesRef.current[0]?.id ?? "",
          },
    );
    setError(null);
    setAddingCategory(false);
    setEditingCategory(null);
    setAudienceOpen(false);
    setCategoryName("");
  }, [habit, isOpen]);

  const audienceCount =
    form.audienceFriendIds.length + form.audienceGroupIds.length;
  const selectedAudienceFriends = useMemo(
    () => getSelectedAudienceFriends(form, friends, friendGroups),
    [form, friends, friendGroups],
  );
  const displayAudienceCount = selectedAudienceFriends.length || audienceCount;

  const save = async () => {
    if (isSaving) return;
    if (!form.name.trim()) {
      setError("Add a habit name before saving.");
      return;
    }
    if (!form.categoryId) {
      setError("Choose a category before saving.");
      return;
    }
    const today = new Date();
    const weeklyRepeatDays =
      form.repeatDays?.filter((day) => day >= 0 && day <= 6) ?? [];
    const monthlyRepeatDates =
      form.repeatDays?.filter((day) => day >= 1 && day <= 31) ?? [];
    const monthlyRepeatWeekdays =
      form.repeatDays?.filter((day) => day >= 0 && day <= 34) ?? [];
    const repeatCadence = form.period;
    const reminderTimes = form.reminderEnabled
      ? normalizeReminderTimes(
          form.reminderTimes ??
            (form.reminderTime ? [form.reminderTime] : null),
          reminderCountForForm(form),
        ).map(normalizeReminderTime)
      : null;
    if (form.reminderEnabled && reminderTimes?.some((time) => !time)) {
      setError("Enter a reminder time like 09:00.");
      return;
    }
    const validReminderTimes = reminderTimes?.filter((time): time is string =>
      Boolean(time),
    );

    setIsSaving(true);
    setError(null);
    try {
      await onSave({
        ...form,
        name: form.name.trim(),
        frequencyGoal:
          form.period === "daily"
            ? (form.frequencyGoal ?? 1) > 1
              ? form.frequencyGoal
              : null
            : Math.max(form.frequencyGoal ?? 1, 1),
        repeatCadence,
        repeatInterval: 1,
        repeatDays:
          repeatCadence === "weekly"
            ? weeklyRepeatDays.length
              ? weeklyRepeatDays
              : null
            : repeatCadence === "monthly"
              ? form.repeatMonthlyType === "day_of_week"
                ? monthlyRepeatWeekdays.length
                  ? monthlyRepeatWeekdays
                  : [monthlyWeekdayCell(getWeekOfMonth(today), today.getDay())]
                : monthlyRepeatDates.length
                  ? monthlyRepeatDates
                  : [today.getDate()]
              : null,
        repeatMonthlyType:
          repeatCadence === "monthly" ? form.repeatMonthlyType : null,
        reminderTime: validReminderTimes?.[0] ?? null,
        reminderTimes: validReminderTimes ?? null,
      });
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save habit.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const saveCategory = async () => {
    if (!categoryName.trim() || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      const category = await onAddCategory(categoryName.trim(), categoryIcon);
      setForm((current) => ({ ...current, categoryId: category.id }));
      setAddingCategory(false);
      setCategoryName("");
    } catch (categoryError) {
      setError(
        categoryError instanceof Error
          ? categoryError.message
          : "Could not add category.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const saveCategoryEdit = async () => {
    if (
      !editingCategory ||
      !onUpdateCategory ||
      !categoryName.trim() ||
      isSaving
    ) {
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const category = await onUpdateCategory(
        editingCategory.id,
        categoryName.trim(),
        categoryIcon,
      );
      setForm((current) => ({ ...current, categoryId: category.id }));
      setEditingCategory(null);
      setCategoryName("");
    } catch (categoryError) {
      setError(
        categoryError instanceof Error
          ? categoryError.message
          : "Could not update category.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const confirmDeleteCategory = (category: Category) => {
    if (!onDeleteCategory || isSaving) return;
    Alert.alert(
      "Delete category?",
      `Delete "${category.name}"? This only works when no habits use it.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setIsSaving(true);
            setError(null);
            try {
              await onDeleteCategory(category.id);
              if (form.categoryId === category.id) {
                setForm((current) => ({
                  ...current,
                  categoryId:
                    categoriesRef.current.find(
                      (item) => item.id !== category.id,
                    )?.id ?? "",
                }));
              }
              setEditingCategory(null);
            } catch (categoryError) {
              setError(
                categoryError instanceof Error
                  ? categoryError.message
                  : "Could not delete category.",
              );
            } finally {
              setIsSaving(false);
            }
          },
        },
      ],
    );
  };

  const selectedCategory = categories.find(
    (category) => category.id === form.categoryId,
  );

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
              {habit ? "Edit Habit" : "New Habit"}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={!form.name.trim() || !form.categoryId || isSaving}
              hitSlop={8}
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
                      color:
                        form.name.trim() && form.categoryId
                          ? theme.primary
                          : theme.textSecondary,
                    },
                  ]}
                >
                  Save
                </Text>
              )}
            </Pressable>
          </View>

          {error ? (
            <View style={styles.formErrorBanner}>
              <SymbolView
                name={symbol("exclamationmark.circle.fill", "error")}
                size={17}
                tintColor="#B84D54"
              />
              <Text style={styles.formError}>{error}</Text>
            </View>
          ) : null}

          <ScrollView
            canCancelContentTouches
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="always"
            showsVerticalScrollIndicator={false}
          >
            <FormSection title="Habit">
              <LabeledInput
                autoFocus
                label="Name"
                onChangeText={(name) =>
                  setForm((current) => ({ ...current, name }))
                }
                placeholder="What habit do you want to build?"
                returnKeyType="done"
                value={form.name}
              />
              <Text style={[styles.fieldLabel, { color: theme.text }]}>
                Choose an icon
              </Text>
              <IconSearchPicker
                value={form.iconKey}
                onChange={(iconKey) =>
                  setForm((current) => ({ ...current, iconKey }))
                }
              />

              <Text style={[styles.fieldLabel, { color: theme.text }]}>
                Group with
              </Text>
              {categories.length ? (
                <View style={styles.choiceWrap}>
                  {categories.map((category) => (
                    <Choice
                      key={category.id}
                      label={category.name}
                      selected={form.categoryId === category.id}
                      onPress={() =>
                        setForm((current) => ({
                          ...current,
                          categoryId: category.id,
                        }))
                      }
                    />
                  ))}
                </View>
              ) : null}
              {selectedCategory && (onUpdateCategory || onDeleteCategory) ? (
                <View style={styles.categoryActions}>
                  {onUpdateCategory ? (
                    <SmallButton
                      label="Rename group"
                      onPress={() => {
                        setAddingCategory(false);
                        setEditingCategory(selectedCategory);
                        setCategoryName(selectedCategory.name);
                        setCategoryIcon(selectedCategory.icon);
                      }}
                    />
                  ) : null}
                  {onDeleteCategory ? (
                    <SmallButton
                      label="Delete category"
                      onPress={() => confirmDeleteCategory(selectedCategory)}
                    />
                  ) : null}
                </View>
              ) : null}
              {editingCategory ? (
                <View
                  style={[
                    styles.newCategory,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.tabBorder,
                    },
                  ]}
                >
                  <LabeledInput
                    label="Group name"
                    onChangeText={setCategoryName}
                    placeholder="e.g. Fitness, Spiritual, Work"
                    value={categoryName}
                  />
                  <IconSearchPicker
                    value={categoryIcon}
                    onChange={setCategoryIcon}
                  />
                  <View style={styles.inlineActions}>
                    <SmallButton
                      label="Cancel"
                      onPress={() => {
                        setEditingCategory(null);
                        setCategoryName("");
                      }}
                    />
                    <SmallButton
                      primary
                      disabled={!categoryName.trim() || isSaving}
                      label="Save group"
                      onPress={() => void saveCategoryEdit()}
                    />
                  </View>
                </View>
              ) : addingCategory ? (
                <View
                  style={[
                    styles.newCategory,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.tabBorder,
                    },
                  ]}
                >
                  <LabeledInput
                    label="New habit group"
                    onChangeText={setCategoryName}
                    placeholder="e.g. Fitness, Spiritual, Work"
                    value={categoryName}
                  />
                  <IconSearchPicker
                    value={categoryIcon}
                    onChange={setCategoryIcon}
                  />
                  <View style={styles.inlineActions}>
                    <SmallButton
                      label="Cancel"
                      onPress={() => setAddingCategory(false)}
                    />
                    <SmallButton
                      primary
                      disabled={!categoryName.trim() || isSaving}
                      label="Save group"
                      onPress={() => void saveCategory()}
                    />
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => {
                    setEditingCategory(null);
                    setAddingCategory(true);
                  }}
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
                    Add a new habit group
                  </Text>
                </Pressable>
              )}

              <Text style={[styles.fieldLabel, { color: theme.text }]}>
                Priority
              </Text>
              <View style={styles.choiceWrap}>
                {PRIORITIES.map((priority) => (
                  <Choice
                    key={priority}
                    label={capitalize(priority)}
                    selected={form.priority === priority}
                    onPress={() =>
                      setForm((current) => ({ ...current, priority }))
                    }
                  />
                ))}
              </View>
            </FormSection>

            <FormSection title="Schedule">
              <View style={styles.scheduleSentence}>
                <Text
                  style={[styles.scheduleSentenceLabel, { color: theme.text }]}
                >
                  Do this
                </Text>
                <VerticalNumberStepper
                  accessibilityLabel={`Times per ${form.period}`}
                  value={form.frequencyGoal ?? 1}
                  onChange={(frequencyGoal) =>
                    setForm((current) => ({ ...current, frequencyGoal }))
                  }
                />
                <Text
                  style={[styles.scheduleSentenceText, { color: theme.text }]}
                >
                  {`time${(form.frequencyGoal ?? 1) !== 1 ? "s" : ""} per`}
                </Text>
                <View style={styles.periodChoiceWrap}>
                  {PERIODS.map((period) => (
                    <Choice
                      key={period}
                      label={
                        period === "daily"
                          ? "day"
                          : period === "weekly"
                            ? "week"
                            : "month"
                      }
                      selected={form.period === period}
                      onPress={() =>
                        setForm((current) => {
                          const today = new Date();
                          return {
                            ...current,
                            period,
                            frequencyGoal:
                              period === "daily" ? current.frequencyGoal : 1,
                            repeatInterval: 1,
                            repeatCadence:
                              period === "daily"
                                ? "daily"
                                : period === "weekly"
                                  ? "weekly"
                                  : "monthly",
                            repeatDays:
                              period === "weekly"
                                ? [today.getDay()]
                                : period === "monthly"
                                  ? [today.getDate()]
                                  : null,
                            repeatMonthlyType:
                              period === "monthly"
                                ? "day_of_month"
                                : current.repeatMonthlyType,
                          };
                        })
                      }
                    />
                  ))}
                </View>
              </View>

              {/* Weekly: day-of-week chips */}
              {form.period === "weekly" ? (
                <View style={styles.inputField}>
                  <Text style={[styles.fieldLabel, { color: theme.text }]}>
                    On
                  </Text>
                  <View style={styles.dayChipRow}>
                    {DAY_LETTERS.map((letter, idx) => {
                      const sel = (form.repeatDays ?? []).includes(idx);
                      return (
                        <Pressable
                          key={WEEKDAY_NAMES[idx]}
                          onPress={() =>
                            setForm((f) => {
                              const days = f.repeatDays ?? [];
                              return {
                                ...f,
                                repeatDays: sel
                                  ? days.filter((d) => d !== idx)
                                  : [...days, idx].sort((a, b) => a - b),
                              };
                            })
                          }
                          style={[
                            styles.dayChip,
                            {
                              backgroundColor: sel
                                ? theme.primary
                                : theme.backgroundElement,
                              borderColor: sel
                                ? theme.primary
                                : theme.tabBorder,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayChipLabel,
                              { color: sel ? "#fff" : theme.textSecondary },
                            ]}
                          >
                            {letter}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>
              ) : null}

              {/* Monthly: day-of-month vs day-of-week */}
              {form.period === "monthly"
                ? (() => {
                    const today = new Date();
                    const monthlyFallbackDate = habit?.createdAt
                      ? new Date(habit.createdAt)
                      : today;
                    const monthDates = (form.repeatDays ?? []).filter(
                      (day) => day >= 1 && day <= 31,
                    );
                    const monthlyWeekdayCells = normalizeMonthlyWeekdayCells(
                      form.repeatDays,
                      monthlyFallbackDate,
                    );
                    const monthlyMode =
                      form.repeatMonthlyType ?? "day_of_month";
                    return (
                      <View style={styles.inputField}>
                        <Text
                          style={[styles.fieldLabel, { color: theme.text }]}
                        >
                          On
                        </Text>
                        <View style={styles.choiceWrap}>
                          <Choice
                            label="Dates"
                            selected={monthlyMode === "day_of_month"}
                            onPress={() =>
                              setForm((f) => ({
                                ...f,
                                repeatMonthlyType: "day_of_month",
                                repeatDays:
                                  f.repeatMonthlyType === "day_of_month"
                                    ? f.repeatDays
                                    : [today.getDate()],
                              }))
                            }
                          />
                          <Choice
                            label="Days"
                            selected={monthlyMode === "day_of_week"}
                            onPress={() =>
                              setForm((f) => ({
                                ...f,
                                repeatMonthlyType: "day_of_week",
                                repeatDays:
                                  f.repeatMonthlyType === "day_of_week"
                                    ? f.repeatDays
                                    : [
                                        monthlyWeekdayCell(
                                          getWeekOfMonth(today),
                                          today.getDay(),
                                        ),
                                      ],
                              }))
                            }
                          />
                        </View>
                        {monthlyMode === "day_of_month" ? (
                          <View style={styles.monthDateGrid}>
                            {MONTH_DATES.map((date) => {
                              const selected = monthDates.length
                                ? monthDates.includes(date)
                                : date === today.getDate();
                              return (
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityState={{ selected }}
                                  key={date}
                                  onPress={() => {
                                    playSelectionHaptic();
                                    setForm((current) => {
                                      const dates = (
                                        current.repeatDays?.filter(
                                          (day) => day >= 1 && day <= 31,
                                        ).length
                                          ? current.repeatDays
                                          : [today.getDate()]
                                      ) as number[];
                                      const nextDates = selected
                                        ? dates.filter((day) => day !== date)
                                        : [...dates, date];
                                      return {
                                        ...current,
                                        repeatDays: (nextDates.length
                                          ? nextDates
                                          : [today.getDate()]
                                        ).sort((a, b) => a - b),
                                      };
                                    });
                                  }}
                                  style={[
                                    styles.monthDateChip,
                                    {
                                      backgroundColor: selected
                                        ? theme.primary
                                        : theme.backgroundElement,
                                      borderColor: selected
                                        ? theme.primary
                                        : theme.tabBorder,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      styles.monthDateLabel,
                                      {
                                        color: selected
                                          ? theme.primaryForeground
                                          : theme.textSecondary,
                                      },
                                    ]}
                                  >
                                    {date}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : (
                          <View style={styles.inputField}>
                            <View style={styles.monthWeekdayGrid}>
                              {MONTH_WEEK_ROWS.map((week) => (
                                <View
                                  key={ORDINALS[week]}
                                  style={styles.monthWeekdayRow}
                                >
                                  {MONTH_DAY_LETTERS.map((letter, day) => {
                                    const cell = monthlyWeekdayCell(week, day);
                                    const selected =
                                      monthlyWeekdayCells.includes(cell);
                                    return (
                                      <Pressable
                                        accessibilityLabel={`${ORDINALS[week]} ${WEEKDAY_NAMES[day]}`}
                                        accessibilityRole="button"
                                        accessibilityState={{ selected }}
                                        key={`${ORDINALS[week]}-${letter}`}
                                        onPress={() => {
                                          playSelectionHaptic();
                                          setForm((current) => {
                                            const cells =
                                              normalizeMonthlyWeekdayCells(
                                                current.repeatDays,
                                                monthlyFallbackDate,
                                              );
                                            const nextCells = selected
                                              ? cells.filter(
                                                  (item) => item !== cell,
                                                )
                                              : [...cells, cell];
                                            return {
                                              ...current,
                                              repeatDays: (nextCells.length
                                                ? nextCells
                                                : [
                                                    monthlyWeekdayCell(
                                                      getWeekOfMonth(today),
                                                      today.getDay(),
                                                    ),
                                                  ]
                                              ).sort((a, b) => a - b),
                                            };
                                          });
                                        }}
                                        style={[
                                          styles.monthWeekdayChip,
                                          {
                                            backgroundColor: selected
                                              ? theme.primary
                                              : theme.backgroundElement,
                                            borderColor: selected
                                              ? theme.primary
                                              : theme.tabBorder,
                                          },
                                        ]}
                                      >
                                        <Text
                                          style={[
                                            styles.monthWeekdayChipLabel,
                                            {
                                              color: selected
                                                ? theme.primaryForeground
                                                : theme.textSecondary,
                                            },
                                          ]}
                                        >
                                          {letter}
                                        </Text>
                                      </Pressable>
                                    );
                                  })}
                                </View>
                              ))}
                            </View>
                          </View>
                        )}
                      </View>
                    );
                  })()
                : null}

              <View style={styles.reminderRow}>
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: form.reminderEnabled }}
                  onPress={() =>
                    setForm((current) => ({
                      ...current,
                      reminderEnabled: !current.reminderEnabled,
                      reminderTime: current.reminderEnabled
                        ? null
                        : (current.reminderTime ?? DEFAULT_REMINDER_TIME),
                      reminderTimes: current.reminderEnabled
                        ? null
                        : normalizeReminderTimes(
                            current.reminderTimes ??
                              (current.reminderTime
                                ? [current.reminderTime]
                                : null),
                            reminderCountForForm(current),
                          ),
                    }))
                  }
                  style={({ pressed }) => [
                    styles.reminderToggle,
                    pressed && styles.pressed,
                  ]}
                >
                  <View
                    style={[
                      styles.checkboxBox,
                      {
                        backgroundColor: form.reminderEnabled
                          ? theme.primary
                          : theme.backgroundElement,
                        borderColor: form.reminderEnabled
                          ? theme.primary
                          : theme.tabBorder,
                      },
                    ]}
                  >
                    {form.reminderEnabled ? (
                      <SymbolView
                        name={symbol("checkmark", "check")}
                        size={15}
                        tintColor={theme.primaryForeground}
                      />
                    ) : null}
                  </View>
                  <Text style={[styles.reminderLabel, { color: theme.text }]}>
                    Reminder
                  </Text>
                </Pressable>
                <View style={styles.reminderTimeList}>
                  {normalizeReminderTimes(
                    form.reminderTimes ??
                      (form.reminderTime ? [form.reminderTime] : null),
                    form.reminderEnabled ? reminderCountForForm(form) : 1,
                  ).map((time, index) => (
                    <TextInput
                      accessibilityLabel={`Reminder time ${index + 1}`}
                      editable={form.reminderEnabled}
                      key={index}
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                      onChangeText={(reminderTime) =>
                        setForm((current) => {
                          const reminderTimes = normalizeReminderTimes(
                            current.reminderTimes ??
                              (current.reminderTime
                                ? [current.reminderTime]
                                : null),
                            reminderCountForForm(current),
                          );
                          reminderTimes[index] = reminderTime;
                          return {
                            ...current,
                            reminderTime: reminderTimes[0] ?? null,
                            reminderTimes,
                          };
                        })
                      }
                      placeholder={DEFAULT_REMINDER_TIME}
                      placeholderTextColor={theme.textSecondary}
                      selectionColor={theme.primary}
                      style={[
                        styles.reminderTimeInput,
                        {
                          backgroundColor: theme.backgroundElement,
                          borderColor: theme.tabBorder,
                          color: form.reminderEnabled
                            ? theme.text
                            : theme.textSecondary,
                        },
                        !form.reminderEnabled && styles.disabled,
                      ]}
                      value={time}
                    />
                  ))}
                </View>
              </View>

              <View
                style={[
                  styles.switchRow,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                  },
                ]}
              >
                <View style={styles.switchCopy}>
                  <Text style={[styles.switchTitle, { color: theme.text }]}>
                    Add to calendar planner
                  </Text>
                  <Text
                    style={[
                      styles.switchDescription,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Let this habit appear as a draggable item when you plan your
                    schedule.
                  </Text>
                </View>
                <Switch
                  onValueChange={(planOnCalendar) => {
                    playSelectionHaptic();
                    setForm((current) => ({ ...current, planOnCalendar }));
                  }}
                  trackColor={{
                    false: theme.backgroundSelected,
                    true: theme.primary,
                  }}
                  value={form.planOnCalendar}
                />
              </View>
            </FormSection>

            <FormSection title="Options">
              <Text style={[styles.fieldLabel, { color: theme.text }]}>
                Visibility
              </Text>
              <View style={styles.choiceWrap}>
                {VISIBILITY_OPTIONS.map((option) => (
                  <Choice
                    key={option.value}
                    label={option.label}
                    selected={form.visibility === option.value}
                    onPress={() => {
                      setForm((current) => ({
                        ...current,
                        visibility: option.value,
                      }));
                      if (option.value === "goal_friends") {
                        setAudienceOpen(true);
                      }
                    }}
                  />
                ))}
              </View>
              {form.visibility === "goal_friends" ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => setAudienceOpen(true)}
                  style={({ pressed }) => [
                    styles.audienceSummary,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.tabBorder,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={symbol("person.2", "groups")}
                    size={18}
                    tintColor={theme.primary}
                  />
                  <View style={styles.switchCopy}>
                    <Text style={[styles.switchTitle, { color: theme.text }]}>
                      {displayAudienceCount > 0
                        ? `${displayAudienceCount} friends selected`
                        : "Choose friends or groups"}
                    </Text>
                    <Text
                      style={[
                        styles.switchDescription,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Only selected people can see this habit.
                    </Text>
                  </View>
                  {selectedAudienceFriends.length > 0 ? (
                    <AudienceAvatarStack friends={selectedAudienceFriends} />
                  ) : null}
                  <SymbolView
                    name={symbol("chevron.right", "chevron_right")}
                    size={17}
                    tintColor={theme.textSecondary}
                  />
                </Pressable>
              ) : null}

              <View
                style={[
                  styles.switchRow,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                  },
                ]}
              >
                <View style={styles.switchCopy}>
                  <Text style={[styles.switchTitle, { color: theme.text }]}>
                    Starts complete
                  </Text>
                  <Text
                    style={[
                      styles.switchDescription,
                      { color: theme.textSecondary },
                    ]}
                  >
                    For habits where success means avoiding something.{" "}
                  </Text>
                </View>
                <Switch
                  onValueChange={(defaultComplete) => {
                    playSelectionHaptic();
                    setForm((current) => ({ ...current, defaultComplete }));
                  }}
                  trackColor={{
                    false: theme.backgroundSelected,
                    true: theme.primary,
                  }}
                  value={form.defaultComplete}
                />
              </View>

              {habit && onDelete ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onDelete(habit)}
                  style={({ pressed }) => [
                    styles.deleteRow,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.tabBorder,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={symbol("trash", "delete")}
                    size={19}
                    tintColor="#B84D54"
                  />
                  <View style={styles.switchCopy}>
                    <Text style={[styles.switchTitle, { color: "#B84D54" }]}>
                      Delete habit
                    </Text>
                    <Text
                      style={[
                        styles.switchDescription,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Permanently remove this habit and its history.
                    </Text>
                  </View>
                </Pressable>
              ) : null}
            </FormSection>
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
      <HabitAudiencePickerModal
        isOpen={audienceOpen}
        selectedFriendIds={form.audienceFriendIds}
        selectedGroupIds={form.audienceGroupIds}
        onClose={() => setAudienceOpen(false)}
        onSave={({ friendIds, groupIds }) => {
          setForm((current) => ({
            ...current,
            visibility: "goal_friends",
            audienceFriendIds: friendIds,
            audienceGroupIds: groupIds,
          }));
          setAudienceOpen(false);
        }}
      />
    </Modal>
  );
}

function HabitAudiencePickerModal({
  isOpen,
  onClose,
  onSave,
  selectedFriendIds,
  selectedGroupIds,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (selection: { friendIds: string[]; groupIds: string[] }) => void;
  selectedFriendIds: string[];
  selectedGroupIds: string[];
}) {
  const theme = useTheme();
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [groups, setGroups] = useState<FriendGroupRow[]>([]);
  const [friendIds, setFriendIds] = useState<string[]>(selectedFriendIds);
  const [groupIds, setGroupIds] = useState<string[]>(selectedGroupIds);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setFriendIds(selectedFriendIds);
    setGroupIds(selectedGroupIds);
    setError(null);
    setIsLoading(true);

    Promise.all([fetchFriends(), fetchFriendGroups()])
      .then(([nextFriends, nextGroups]) => {
        setFriends(
          nextFriends.filter((friend) => friend.status === "accepted"),
        );
        setGroups(nextGroups);
      })
      .catch((loadError) => {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load friends.",
        );
      })
      .finally(() => setIsLoading(false));
  }, [isOpen, selectedFriendIds, selectedGroupIds]);

  const toggle = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];

  const renderRow = ({
    detail,
    icon,
    isSelected,
    onPress,
    title,
  }: {
    detail: string;
    icon: SymbolName;
    isSelected: boolean;
    onPress: () => void;
    title: string;
  }) => (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: isSelected }}
      key={title}
      onPress={() => {
        playSelectionHaptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.audienceRow,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.tabBorder,
        },
        pressed && styles.pressed,
      ]}
    >
      <SymbolView
        name={icon}
        size={19}
        tintColor={isSelected ? theme.primary : theme.textSecondary}
      />
      <View style={styles.switchCopy}>
        <Text style={[styles.switchTitle, { color: theme.text }]}>{title}</Text>
        <Text
          style={[styles.switchDescription, { color: theme.textSecondary }]}
        >
          {detail}
        </Text>
      </View>
      {isSelected ? (
        <SymbolView
          name={symbol("checkmark.circle.fill", "check_circle")}
          size={20}
          tintColor={theme.primary}
        />
      ) : null}
    </Pressable>
  );

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={isOpen}
    >
      <SafeAreaView
        edges={["top", "bottom"]}
        style={[styles.formScreen, { backgroundColor: theme.background }]}
      >
        <View
          style={[styles.formHeader, { borderBottomColor: theme.tabBorder }]}
        >
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={styles.formHeaderButton}
          >
            <Text
              style={[styles.formHeaderButtonText, { color: theme.primary }]}
            >
              Cancel
            </Text>
          </Pressable>
          <Text style={[styles.formTitle, { color: theme.text }]}>
            Select friends
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => onSave({ friendIds, groupIds })}
            style={styles.formHeaderButton}
          >
            <Text
              style={[styles.formHeaderButtonText, { color: theme.primary }]}
            >
              Done
            </Text>
          </Pressable>
        </View>
        <ScrollView
          contentContainerStyle={styles.formContent}
          keyboardShouldPersistTaps="handled"
        >
          {error ? (
            <View style={styles.formErrorBanner}>
              <SymbolView
                name={symbol("exclamationmark.circle.fill", "error")}
                size={16}
                tintColor="#B84D54"
              />
              <Text style={styles.formError}>{error}</Text>
            </View>
          ) : null}
          {isLoading ? (
            <View style={styles.audienceLoading}>
              <ActivityIndicator color={theme.primary} />
              <Text style={[styles.fieldHint, { color: theme.textSecondary }]}>
                Loading friends
              </Text>
            </View>
          ) : (
            <>
              <FormSection title="Groups">
                {groups.length > 0 ? (
                  groups.map((group) =>
                    renderRow({
                      title: group.name,
                      detail: `${group.members.length} friend${
                        group.members.length === 1 ? "" : "s"
                      }`,
                      icon: symbol("person.3", "groups"),
                      isSelected: groupIds.includes(group.id),
                      onPress: () =>
                        setGroupIds((ids) => toggle(ids, group.id)),
                    }),
                  )
                ) : (
                  <Text
                    style={[styles.fieldHint, { color: theme.textSecondary }]}
                  >
                    No groups yet.
                  </Text>
                )}
              </FormSection>
              <FormSection title="Friends">
                {friends.length > 0 ? (
                  friends.map((friend) =>
                    renderRow({
                      title: friend.friendName,
                      detail: friend.friendEmail || "Friend",
                      icon: symbol("person", "person"),
                      isSelected: friendIds.includes(friend.friendId),
                      onPress: () =>
                        setFriendIds((ids) => toggle(ids, friend.friendId)),
                    }),
                  )
                ) : (
                  <Text
                    style={[styles.fieldHint, { color: theme.textSecondary }]}
                  >
                    Add friends before selecting a habit audience.
                  </Text>
                )}
              </FormSection>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

function FormSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.formSection}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
        {title}
      </Text>
      <View style={styles.sectionSurface}>{children}</View>
    </View>
  );
}

function LabeledInput({
  label,
  style,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.inputField}>
      <Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        selectionColor={theme.primary}
        style={[
          styles.input,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.tabBorder,
            color: theme.text,
          },
          style,
        ]}
        {...props}
      />
    </View>
  );
}

function Choice({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const theme = useTheme();
  const selectedBackground = theme.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          backgroundColor: selected
            ? selectedBackground
            : theme.backgroundElement,
          borderColor: selected ? selectedBackground : theme.tabBorder,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.choiceLabel,
          { color: selected ? "#FFFFFF" : theme.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function VerticalNumberStepper({
  accessibilityLabel = "Repeat interval",
  value,
  onChange,
}: {
  accessibilityLabel?: string;
  value: number;
  onChange: (value: number) => void;
}) {
  const theme = useTheme();

  const setValue = useCallback(
    (nextValue: number) => {
      const clampedValue = Math.min(99, Math.max(1, Math.round(nextValue)));
      if (clampedValue === value) return;
      onChange(clampedValue);
    },
    [value, onChange],
  );

  return (
    <View
      accessibilityActions={[
        { name: "increment", label: "Increase repeat interval" },
        { name: "decrement", label: "Decrease repeat interval" },
      ]}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 1, max: 99, now: value }}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === "increment") setValue(value + 1);
        if (nativeEvent.actionName === "decrement") setValue(value - 1);
      }}
      style={[
        styles.numberStepper,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.tabBorder,
        },
      ]}
    >
      <Pressable
        accessibilityLabel="Decrease repeat interval"
        accessibilityRole="button"
        disabled={value <= 1}
        hitSlop={6}
        onPress={() => setValue(value - 1)}
        style={styles.stepperButton}
      >
        <Text
          style={[
            styles.stepperButtonLabel,
            { color: value <= 1 ? theme.textSecondary : theme.text },
          ]}
        >
          −
        </Text>
      </Pressable>
      <Text style={[styles.numberStepperValue, { color: theme.text }]}>
        {value}
      </Text>
      <Pressable
        accessibilityLabel="Increase repeat interval"
        accessibilityRole="button"
        disabled={value >= 99}
        hitSlop={6}
        onPress={() => setValue(value + 1)}
        style={styles.stepperButton}
      >
        <Text
          style={[
            styles.stepperButtonLabel,
            { color: value >= 99 ? theme.textSecondary : theme.text },
          ]}
        >
          +
        </Text>
      </Pressable>
    </View>
  );
}

function IconSearchPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (iconKey: string) => void;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const results = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchingOptions = normalizedQuery
      ? EXPO_SYMBOL_ICON_OPTIONS.filter((option) =>
          [option.label, option.key, ...option.keywords]
            .join(" ")
            .toLowerCase()
            .includes(normalizedQuery),
        )
      : EXPO_SYMBOL_ICON_OPTIONS;

    return matchingOptions.slice(0, 10);
  }, [query]);

  return (
    <View style={styles.iconSearchWrap}>
      <View
        style={[
          styles.iconSearchField,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.tabBorder,
          },
        ]}
      >
        <SymbolView
          name={symbol("magnifyingglass", "search")}
          size={16}
          tintColor={theme.textSecondary}
        />
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Search symbols... e.g. run, book, prayer"
          placeholderTextColor={theme.textSecondary}
          selectionColor={theme.primary}
          style={[styles.iconSearchInput, { color: theme.text }]}
          value={query}
          onChangeText={setQuery}
        />
        {value ? (
          <View
            accessibilityLabel="Selected icon"
            style={styles.iconSearchPreview}
          >
            <GoalIcon iconKey={value} size={20} color={theme.textSecondary} />
          </View>
        ) : null}
      </View>

      {results.length > 0 ? (
        <View
          style={[
            styles.iconResults,
            { borderColor: theme.tabBorder, backgroundColor: theme.tabBar },
          ]}
        >
          {results.map((option) => {
            const selected = option.key === value;
            return (
              <Pressable
                key={option.key}
                accessibilityLabel={option.label}
                onPress={() => {
                  onChange(option.key);
                  setQuery(option.label);
                }}
                style={({ pressed }) => [
                  styles.iconResultItem,
                  {
                    backgroundColor: selected
                      ? theme.primary
                      : theme.backgroundElement,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <GoalIcon
                  iconKey={option.key}
                  size={28}
                  color={
                    selected ? theme.primaryForeground : theme.textSecondary
                  }
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.iconResultLabel,
                    { color: selected ? "#FFFFFF" : theme.textSecondary },
                  ]}
                >
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

function SmallButton({
  disabled,
  label,
  onPress,
  primary,
}: {
  disabled?: boolean;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.smallButton,
        {
          backgroundColor: primary ? theme.primary : theme.tabBar,
          borderColor: primary ? theme.primary : theme.tabBorder,
        },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.smallButtonLabel,
          { color: primary ? theme.primaryForeground : theme.text },
        ]}
      >
        {label}
      </Text>
    </Pressable>
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerIdentity: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  headerIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  title: {
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  description: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  addButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  stats: { flexDirection: "row", gap: 8 },
  stat: {
    flex: 1,
    minWidth: 0,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 1,
  },
  statValue: { fontSize: 19, lineHeight: 23, fontWeight: "800" },
  statLabel: { fontSize: 10, lineHeight: 14, fontWeight: "700" },
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
  filters: { gap: 8, paddingRight: 18 },
  filterChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  filterLabel: { fontSize: 13, lineHeight: 17, fontWeight: "700" },
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
  groups: { gap: 22 },
  group: { gap: 9 },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 3,
  },
  groupTitle: { fontSize: 15, lineHeight: 20, fontWeight: "800" },
  groupCount: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  habitList: { gap: 8 },
  habitCard: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 11,
  },
  habitIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  habitBody: { flex: 1, minWidth: 0, gap: 5 },
  habitTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  habitName: { flexShrink: 1, fontSize: 15, lineHeight: 20, fontWeight: "700" },
  hiddenName: { textDecorationLine: "line-through" },
  habitMetadata: { flexDirection: "row", alignItems: "center", gap: 5 },
  priorityDot: { width: 6, height: 6, borderRadius: 3 },
  metadataText: { fontSize: 11, lineHeight: 15, fontWeight: "600" },
  metadataDivider: { fontSize: 12, lineHeight: 15, fontWeight: "700" },
  moreButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
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
  modalOverlay: {
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
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
  },
  actionRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  actionLabel: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
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
  formErrorBanner: {
    maxWidth: 620,
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: 10,
    marginHorizontal: 18,
    borderRadius: 14,
    backgroundColor: "#F3B7B933",
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  formContent: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    gap: 22,
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
  sectionSurface: { gap: 14 },
  inputField: { gap: 7 },
  fieldLabel: { fontSize: 13, lineHeight: 17, fontWeight: "700" },
  fieldHint: { fontSize: 12, lineHeight: 17, fontWeight: "600" },
  input: {
    minHeight: 49,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "500",
  },
  iconSearchWrap: { gap: 8 },
  iconSearchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  iconSearchInput: { flex: 1, fontSize: 14, fontWeight: "500" },
  iconSearchPreview: { width: 20, height: 20 },
  iconSearchSelected: { fontSize: 12, fontWeight: "600", paddingHorizontal: 2 },
  iconResults: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 10,
  },
  iconResultItem: {
    width: 56,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 4,
  },
  iconResultLabel: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  scheduleSentence: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  },
  scheduleSentenceLabel: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  scheduleSentenceText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  periodChoiceWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  numberStepper: {
    minWidth: 104,
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
  },
  stepperButton: {
    width: 34,
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  stepperButtonLabel: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: "600",
  },
  numberStepperValue: {
    minWidth: 30,
    textAlign: "center",
    fontSize: 21,
    lineHeight: 26,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  dayChipRow: { flexDirection: "row", gap: 6 },
  dayChip: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
  },
  dayChipLabel: { fontSize: 12, fontWeight: "700" },
  monthDateGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  monthDateChip: {
    width: 38,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
  },
  monthDateLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  monthWeekdayGrid: {
    gap: 6,
  },
  monthWeekdayRow: {
    flexDirection: "row",
    gap: 6,
  },
  monthWeekdayChip: {
    width: 38,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
  },
  monthWeekdayChipLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  choice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  choiceLabel: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  audienceSummary: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  audienceAvatarStack: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 2,
  },
  audienceAvatar: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 2,
    borderRadius: 15,
  },
  audienceAvatarImage: {
    width: "100%",
    height: "100%",
  },
  audienceAvatarOverflow: {
    overflow: "visible",
  },
  audienceAvatarText: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
  },
  audienceLoading: {
    minHeight: 120,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  audienceRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  reminderRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 10,
  },
  reminderToggle: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: 10,
  },
  checkboxBox: {
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 7,
  },
  reminderLabel: { fontSize: 14, lineHeight: 19, fontWeight: "700" },
  reminderTimeList: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  reminderTimeInput: {
    width: 92,
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
    textAlign: "center",
    fontSize: 15,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  newCategory: {
    gap: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 17,
    padding: 13,
  },
  categoryActions: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  inlineActions: { flexDirection: "row", justifyContent: "flex-end", gap: 8 },
  inlineAdd: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingVertical: 3,
  },
  inlineAddLabel: { fontSize: 13, lineHeight: 18, fontWeight: "700" },
  smallButton: {
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 13,
  },
  smallButtonLabel: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    padding: 16,
  },
  deleteRow: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    padding: 16,
  },
  switchCopy: { flex: 1, gap: 2 },
  instanceStepperWrap: {
    width: 72,
    alignItems: "center",
  },
  switchTitle: { fontSize: 14, lineHeight: 19, fontWeight: "700" },
  switchDescription: { fontSize: 11, lineHeight: 16, fontWeight: "500" },
  formError: {
    flex: 1,
    color: "#B84D54",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.42 },
});
