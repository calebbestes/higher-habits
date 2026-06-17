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

import { isRenderableIconKey } from "@/components/goal-icon";
import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import {
  type Category,
  type Goal,
  type GoalInput,
  type GoalPeriod,
  type GoalPriority,
  type GoalRepeatMonthlyType,
  type GoalVisibility,
  createCategory,
  createGoal,
  deleteGoal,
  fetchCategories,
  fetchGoals,
  updateGoal,
} from "@/lib/goals-client";

type SymbolName = SymbolViewProps["name"];
type GoalFilter = "all" | "high" | "hidden";

const PRIORITIES: GoalPriority[] = ["high", "low"];
const PERIODS: GoalPeriod[] = ["daily", "weekly", "monthly"];
const DAY_LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
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
const VISIBILITY_OPTIONS: Array<{
  value: GoalVisibility;
  label: string;
}> = [
  { value: "only_me", label: "Only me" },
  { value: "goal_friends", label: "Friends tied to goal" },
  { value: "all_friends", label: "All friends" },
];
const PRIORITY_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 1,
};

const GOAL_ICON_OPTIONS = [
  {
    key: "fa7-solid:bullseye",
    label: "Target",
    symbol: symbol("target", "target"),
  },
  {
    key: "mdi:heart-outline",
    label: "Heart",
    symbol: symbol("heart", "favorite"),
  },
  {
    key: "mdi:dumbbell",
    label: "Fitness",
    symbol: symbol("dumbbell", "fitness_center"),
  },
  {
    key: "mdi:book-open-page-variant-outline",
    label: "Read",
    symbol: symbol("book", "menu_book"),
  },
  {
    key: "mdi:briefcase-outline",
    label: "Work",
    symbol: symbol("briefcase", "work"),
  },
  {
    key: "mdi:account-group-outline",
    label: "Social",
    symbol: symbol("person.2", "groups"),
  },
  {
    key: "mdi:cash",
    label: "Money",
    symbol: symbol("dollarsign.circle", "paid"),
  },
  {
    key: "mdi:star-outline",
    label: "Star",
    symbol: symbol("star", "star"),
  },
] as const;

const EMPTY_GOAL: GoalInput = {
  name: "",
  frequencyGoal: null,
  period: "daily",
  repeatInterval: 1,
  repeatDays: [new Date().getDay()],
  repeatMonthlyType: "day_of_month",
  categoryId: "",
  priority: "low",
  visibility: "only_me",
  iconKey: GOAL_ICON_OPTIONS[0].key,
  hidden: false,
};

function symbol(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function resolveSymbol(
  iconKey: string,
  fallback = GOAL_ICON_OPTIONS[0].symbol,
) {
  return (
    GOAL_ICON_OPTIONS.find((option) => option.key === iconKey)?.symbol ??
    fallback
  );
}

function frequencyLabel(goal: Goal) {
  const interval = goal.repeatInterval ?? 1;
  const unit =
    goal.period === "daily"
      ? "day"
      : goal.period === "weekly"
        ? "week"
        : "month";
  const base =
    interval === 1 ? capitalize(goal.period) : `Every ${interval} ${unit}s`;
  if (goal.period === "weekly" && goal.repeatDays?.length) {
    return `${base} · ${goal.repeatDays.map((d) => DAY_LETTERS[d]).join("")}`;
  }
  return base;
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function toInput(goal: Goal): GoalInput {
  return {
    name: goal.name,
    frequencyGoal: goal.frequencyGoal,
    period: goal.period,
    repeatInterval: goal.repeatInterval ?? 1,
    repeatDays: goal.repeatDays ?? [new Date().getDay()],
    repeatMonthlyType:
      (goal.repeatMonthlyType as GoalRepeatMonthlyType | null) ??
      "day_of_month",
    categoryId: goal.categoryId,
    priority: goal.priority,
    visibility: goal.visibility,
    iconKey: goal.iconKey,
    hidden: goal.hidden,
  };
}

export function GoalsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<GoalFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [actionGoal, setActionGoal] = useState<Goal | null>(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setIsRefreshing(true) : setIsLoading(true);
    setError(null);

    try {
      const [nextGoals, nextCategories] = await Promise.all([
        fetchGoals(),
        fetchCategories(),
      ]);
      setGoals(nextGoals);
      setCategories(nextCategories);
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

    return goals
      .filter((goal) => {
        if (filter === "high" && goal.priority !== "high") return false;
        if (filter === "hidden" && !goal.hidden) return false;
        if (!normalizedQuery) return true;
        return `${goal.name} ${goal.categoryName} ${goal.period ?? ""} ${
          goal.priority
        }`
          .toLowerCase()
          .includes(normalizedQuery);
      })
      .sort(
        (left, right) =>
          PRIORITY_ORDER[left.priority] - PRIORITY_ORDER[right.priority] ||
          left.name.localeCompare(right.name),
      );
  }, [filter, goals, query]);

  const groupedGoals = useMemo(() => {
    const groups = new Map<string, Goal[]>();
    for (const goal of visibleGoals) {
      const key = goal.categoryName || "Uncategorized";
      groups.set(key, [...(groups.get(key) ?? []), goal]);
    }
    return [...groups.entries()].sort(([left], [right]) =>
      left.localeCompare(right),
    );
  }, [visibleGoals]);

  const openCreate = () => {
    setEditingGoal(null);
    setFormOpen(true);
  };

  const openEdit = (goal: Goal) => {
    setActionGoal(null);
    setEditingGoal(goal);
    setFormOpen(true);
  };

  const saveGoal = async (input: GoalInput) => {
    const saved = editingGoal
      ? await updateGoal(editingGoal.id, input)
      : await createGoal(input);

    setGoals((current) =>
      editingGoal
        ? current.map((goal) => (goal.id === saved.id ? saved : goal))
        : [...current, saved],
    );
    setFormOpen(false);
    setEditingGoal(null);
  };

  const addCategory = async (name: string, icon: string) => {
    const category = await createCategory({ name, icon });
    setCategories((current) =>
      [...current, category].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    );
    return category;
  };

  const toggleHidden = async (goal: Goal) => {
    setActionGoal(null);
    try {
      const updated = await updateGoal(goal.id, {
        ...toInput(goal),
        hidden: !goal.hidden,
      });
      setGoals((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update goal.",
      );
    }
  };

  const confirmDelete = (goal: Goal) => {
    setActionGoal(null);
    Alert.alert(
      "Delete goal?",
      `"${goal.name}" and its history will be permanently deleted.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteGoal(goal.id);
              setGoals((current) =>
                current.filter((item) => item.id !== goal.id),
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

  const highCount = goals.filter((goal) => goal.priority === "high").length;
  const hiddenCount = goals.filter((goal) => goal.hidden).length;

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
                <Text style={[styles.title, { color: theme.text }]}>Goals</Text>
                <Text
                  style={[styles.description, { color: theme.textSecondary }]}
                >
                  Track your priorities
                </Text>
              </View>
            </View>
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
                size={22}
                weight="semibold"
                tintColor={theme.primaryForeground}
              />
            </Pressable>
          </View>

          <View style={styles.stats}>
            <Stat label="Goals" value={goals.length} />
            <Stat label="High priority" value={highCount} accent="#9D7474" />
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
              <ActivityIndicator color={theme.primary} size="large" />
            </View>
          ) : groupedGoals.length ? (
            <View style={styles.groups}>
              {groupedGoals.map(([categoryName, categoryGoals]) => (
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
                      {categoryGoals.length}
                    </Text>
                  </View>
                  <View style={styles.goalList}>
                    {categoryGoals.map((goal) => (
                      <GoalCard
                        key={goal.id}
                        goal={goal}
                        onEdit={() => openEdit(goal)}
                        onMore={() => setActionGoal(goal)}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState hasGoals={goals.length > 0} onAdd={openCreate} />
          )}
        </ScrollView>
      </SafeAreaView>

      <GoalFormModal
        categories={categories}
        goal={editingGoal}
        isOpen={formOpen}
        onAddCategory={addCategory}
        onClose={() => {
          setFormOpen(false);
          setEditingGoal(null);
        }}
        onSave={saveGoal}
      />
      <GoalActionsModal
        goal={actionGoal}
        onClose={() => setActionGoal(null)}
        onDelete={confirmDelete}
        onEdit={openEdit}
        onShare={(goal) => {
          setActionGoal(null);
          router.push({
            pathname: "/collab",
            params: { section: "shared-goals", goalId: goal.id },
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
      onPress={onPress}
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

function GoalCard({
  goal,
  onEdit,
  onMore,
}: {
  goal: Goal;
  onEdit: () => void;
  onMore: () => void;
}) {
  const theme = useTheme();
  const priorityColor =
    goal.priority === "high" ? "#9D7474" : theme.textSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onEdit}
      style={({ pressed }) => [
        styles.goalCard,
        {
          backgroundColor: theme.tabBar,
          borderColor: theme.tabBorder,
          opacity: goal.hidden ? 0.58 : 1,
        },
        pressed && styles.pressed,
      ]}
    >
      <View
        style={[styles.goalIcon, { backgroundColor: theme.backgroundElement }]}
      >
        <SymbolView
          name={resolveSymbol(goal.iconKey)}
          size={22}
          weight="semibold"
          tintColor={goal.hidden ? theme.textSecondary : theme.primary}
        />
      </View>
      <View style={styles.goalBody}>
        <View style={styles.goalTitleRow}>
          <Text
            numberOfLines={1}
            style={[
              styles.goalName,
              { color: theme.text },
              goal.hidden && styles.hiddenName,
            ]}
          >
            {goal.name}
          </Text>
          {goal.hidden ? (
            <SymbolView
              name={symbol("archivebox", "inventory_2")}
              size={15}
              tintColor={theme.textSecondary}
            />
          ) : null}
        </View>
        <View style={styles.goalMetadata}>
          <View
            style={[styles.priorityDot, { backgroundColor: priorityColor }]}
          />
          <Text style={[styles.metadataText, { color: theme.textSecondary }]}>
            {capitalize(goal.priority)}
          </Text>
          <Text
            style={[styles.metadataDivider, { color: theme.textSecondary }]}
          >
            ·
          </Text>
          <Text style={[styles.metadataText, { color: theme.textSecondary }]}>
            {frequencyLabel(goal)}
          </Text>
        </View>
      </View>
      <Pressable
        accessibilityLabel={`More actions for ${goal.name}`}
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
  hasGoals,
  onAdd,
}: {
  hasGoals: boolean;
  onAdd: () => void;
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
          ? "Try a different search or filter."
          : "Set a priority and schedule, then start building momentum."}
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

function GoalActionsModal({
  goal,
  onClose,
  onDelete,
  onEdit,
  onShare,
  onToggleHidden,
}: {
  goal: Goal | null;
  onClose: () => void;
  onDelete: (goal: Goal) => void;
  onEdit: (goal: Goal) => void;
  onShare: (goal: Goal) => void;
  onToggleHidden: (goal: Goal) => void;
}) {
  const theme = useTheme();
  if (!goal) return null;

  const actions = [
    {
      label: "Edit goal",
      icon: symbol("pencil", "edit"),
      onPress: () => onEdit(goal),
    },
    {
      label: "Make shared",
      icon: symbol("person.2", "groups"),
      onPress: () => onShare(goal),
    },
    {
      label: goal.hidden ? "Restore goal" : "Archive goal",
      icon: symbol(
        goal.hidden ? "arrow.uturn.backward" : "archivebox",
        goal.hidden ? "restore" : "inventory_2",
      ),
      onPress: () => void onToggleHidden(goal),
    },
    {
      label: "Delete goal",
      icon: symbol("trash", "delete"),
      danger: true,
      onPress: () => onDelete(goal),
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
            {goal.name}
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

export function GoalFormModal({
  categories,
  goal,
  initialValues,
  isOpen,
  onAddCategory,
  onClose,
  onSave,
}: {
  categories: Category[];
  goal: Goal | null;
  initialValues?: Partial<GoalInput>;
  isOpen: boolean;
  onAddCategory: (name: string, icon: string) => Promise<Category>;
  onClose: () => void;
  onSave: (input: GoalInput) => Promise<void>;
}) {
  const theme = useTheme();
  const [form, setForm] = useState<GoalInput>(EMPTY_GOAL);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [categoryIcon, setCategoryIcon] = useState<string>("mdi:heart-outline");
  const categoriesRef = useRef(categories);
  categoriesRef.current = categories;
  const initialValuesRef = useRef(initialValues);
  initialValuesRef.current = initialValues;

  useEffect(() => {
    if (!isOpen) return;
    setForm(
      goal
        ? toInput(goal)
        : {
            ...EMPTY_GOAL,
            ...initialValuesRef.current,
            categoryId: categoriesRef.current[0]?.id ?? "",
          },
    );
    setError(null);
    setAddingCategory(false);
    setCategoryName("");
  }, [goal, isOpen]);

  const save = async () => {
    if (!form.name.trim() || !form.categoryId || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSave({ ...form, name: form.name.trim() });
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save goal.",
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
              disabled={!form.name.trim() || !form.categoryId || isSaving}
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

          <ScrollView
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <FormSection title="Goal">
              <LabeledInput
                autoFocus
                label="Name"
                onChangeText={(name) =>
                  setForm((current) => ({ ...current, name }))
                }
                placeholder="What do you want to achieve?"
                returnKeyType="done"
                value={form.name}
              />
              <Text style={[styles.fieldLabel, { color: theme.text }]}>
                Icon
              </Text>
              <IconSearchPicker
                value={form.iconKey}
                onChange={(iconKey) =>
                  setForm((current) => ({ ...current, iconKey }))
                }
              />
            </FormSection>

            <FormSection title="Category">
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
              {addingCategory ? (
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
                    label="New category"
                    onChangeText={setCategoryName}
                    placeholder="Category name"
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
                      label="Add category"
                      onPress={() => void saveCategory()}
                    />
                  </View>
                </View>
              ) : (
                <Pressable
                  onPress={() => setAddingCategory(true)}
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
                    Create category
                  </Text>
                </Pressable>
              )}
            </FormSection>

            <FormSection title="Schedule">
              <View style={styles.inputField}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>
                  Repeat
                </Text>
                <View style={styles.choiceWrap}>
                  {PERIODS.map((period) => (
                    <Choice
                      key={period}
                      label={capitalize(period)}
                      selected={form.period === period}
                      onPress={() =>
                        setForm((current) => ({ ...current, period }))
                      }
                    />
                  ))}
                </View>
              </View>

              <>
                <View style={styles.repeatIntervalRow}>
                  <Text style={[styles.fieldLabel, { color: theme.text }]}>
                    Repeat every
                  </Text>
                  <VerticalNumberStepper
                    value={form.repeatInterval ?? 1}
                    onChange={(repeatInterval) =>
                      setForm((current) => ({ ...current, repeatInterval }))
                    }
                  />
                  <Text style={[styles.intervalUnit, { color: theme.text }]}>
                    {form.period === "daily"
                      ? "day"
                      : form.period === "weekly"
                        ? "week"
                        : "month"}
                    {(form.repeatInterval ?? 1) !== 1 ? "s" : ""}
                  </Text>
                </View>

                {/* Weekly: day-of-week chips */}
                {form.period === "weekly" ? (
                  <View style={styles.inputField}>
                    <Text style={[styles.fieldLabel, { color: theme.text }]}>
                      Repeat on
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
                      const weekdayLabel = `${ORDINALS[getWeekOfMonth(today)]} ${WEEKDAY_NAMES[today.getDay()]}`;
                      return (
                        <View style={styles.inputField}>
                          <View style={styles.choiceWrap}>
                            <Choice
                              label={`Day ${today.getDate()}`}
                              selected={
                                (form.repeatMonthlyType ?? "day_of_month") ===
                                "day_of_month"
                              }
                              onPress={() =>
                                setForm((f) => ({
                                  ...f,
                                  repeatMonthlyType: "day_of_month",
                                }))
                              }
                            />
                            <Choice
                              label={weekdayLabel}
                              selected={
                                form.repeatMonthlyType === "day_of_week"
                              }
                              onPress={() =>
                                setForm((f) => ({
                                  ...f,
                                  repeatMonthlyType: "day_of_week",
                                }))
                              }
                            />
                          </View>
                        </View>
                      );
                    })()
                  : null}
              </>
            </FormSection>

            <FormSection title="Priority">
              <View style={styles.choiceWrap}>
                {PRIORITIES.map((priority) => (
                  <Choice
                    key={priority}
                    label={capitalize(priority)}
                    selected={form.priority === priority}
                    tone={priority === "high" ? "blush" : undefined}
                    onPress={() =>
                      setForm((current) => ({ ...current, priority }))
                    }
                  />
                ))}
              </View>
            </FormSection>

            <FormSection title="Visibility">
              <View style={styles.choiceWrap}>
                {VISIBILITY_OPTIONS.map((option) => (
                  <Choice
                    key={option.value}
                    label={option.label}
                    selected={form.visibility === option.value}
                    onPress={() =>
                      setForm((current) => ({
                        ...current,
                        visibility: option.value,
                      }))
                    }
                  />
                ))}
              </View>
            </FormSection>

            <View
              style={[
                styles.switchRow,
                { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
              ]}
            >
              <View style={styles.switchCopy}>
                <Text style={[styles.switchTitle, { color: theme.text }]}>
                  Archive
                </Text>
                <Text
                  style={[
                    styles.switchDescription,
                    { color: theme.textSecondary },
                  ]}
                >
                  Archive this goal and keep it out of planning views.
                </Text>
              </View>
              <Switch
                onValueChange={(hidden) =>
                  setForm((current) => ({ ...current, hidden }))
                }
                trackColor={{
                  false: theme.backgroundSelected,
                  true: theme.primary,
                }}
                value={form.hidden}
              />
            </View>

            {error ? <Text style={styles.formError}>{error}</Text> : null}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
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
      <View
        style={[
          styles.sectionSurface,
          { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
        ]}
      >
        {children}
      </View>
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
  tone,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
  tone?: "blush";
}) {
  const theme = useTheme();
  const selectedBackground = tone === "blush" ? "#9D7474" : theme.primary;
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
  value,
  onChange,
}: {
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
      accessibilityLabel="Repeat interval"
      accessibilityRole="adjustable"
      accessibilityValue={{ min: 1, max: 99, now: value }}
      onAccessibilityAction={({ nativeEvent }) => {
        if (nativeEvent.actionName === "increment") setValue(value + 1);
        if (nativeEvent.actionName === "decrement") setValue(value - 1);
      }}
      style={[
        styles.verticalNumberStepper,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.tabBorder,
        },
      ]}
    >
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
      <Text style={[styles.verticalNumberStepperValue, { color: theme.text }]}>
        {value}
      </Text>
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
    </View>
  );
}

function iconSvgUrl(iconKey: string, color: string) {
  const colon = iconKey.indexOf(":");
  if (colon === -1) return null;
  const prefix = iconKey.slice(0, colon);
  const name = iconKey.slice(colon + 1);
  return `https://api.iconify.design/${prefix}/${name}.svg?color=${encodeURIComponent(color)}`;
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
  const [results, setResults] = useState<string[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        // Restrict to icon sets GoalIcon can actually render (see goal-icon.tsx).
        // Without this, searches surface icons from sets like boxicons/tdesign
        // that fall back to the generic target icon once saved.
        const res = await fetch(
          `https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=24&prefixes=mdi,fa6-solid`,
        );
        const data = (await res.json()) as { icons?: string[] };
        setResults((data.icons ?? []).filter(isRenderableIconKey));
      } catch {
        setResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
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
          placeholder="Search icons… e.g. dumbbell"
          placeholderTextColor={theme.textSecondary}
          selectionColor={theme.primary}
          style={[styles.iconSearchInput, { color: theme.text }]}
          value={query}
          onChangeText={setQuery}
        />
        {isSearching ? (
          <ActivityIndicator size="small" color={theme.textSecondary} />
        ) : value ? (
          <Image
            source={{ uri: iconSvgUrl(value, "#6B7280") ?? "" }}
            style={styles.iconSearchPreview}
            contentFit="contain"
          />
        ) : null}
      </View>

      {results.length > 0 ? (
        <View
          style={[
            styles.iconResults,
            { borderColor: theme.tabBorder, backgroundColor: theme.tabBar },
          ]}
        >
          {results.map((iconKey) => {
            const selected = iconKey === value;
            const url = iconSvgUrl(iconKey, selected ? "#FFFFFF" : "#6B7280");
            const shortName = iconKey.split(":")[1] ?? iconKey;
            return (
              <Pressable
                key={iconKey}
                accessibilityLabel={iconKey}
                onPress={() => {
                  onChange(iconKey);
                  setResults([]);
                  setQuery(shortName);
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
                {url ? (
                  <Image
                    source={{ uri: url }}
                    style={styles.iconResultImg}
                    contentFit="contain"
                  />
                ) : null}
                <Text
                  numberOfLines={1}
                  style={[
                    styles.iconResultLabel,
                    { color: selected ? "#FFFFFF" : theme.textSecondary },
                  ]}
                >
                  {shortName}
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
  goalList: { gap: 8 },
  goalCard: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 11,
  },
  goalIcon: {
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  goalBody: { flex: 1, minWidth: 0, gap: 5 },
  goalTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  goalName: { flexShrink: 1, fontSize: 15, lineHeight: 20, fontWeight: "700" },
  hiddenName: { textDecorationLine: "line-through" },
  goalMetadata: { flexDirection: "row", alignItems: "center", gap: 5 },
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
  iconResultImg: { width: 28, height: 28 },
  iconResultLabel: {
    fontSize: 8,
    lineHeight: 10,
    fontWeight: "600",
    textAlign: "center",
  },
  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  repeatIntervalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  verticalNumberStepper: {
    width: 54,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
  },
  stepperButton: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
  },
  stepperButtonLabel: {
    fontSize: 22,
    lineHeight: 24,
    fontWeight: "600",
  },
  verticalNumberStepperValue: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "600",
    fontVariant: ["tabular-nums"],
  },
  intervalUnit: { fontSize: 13, fontWeight: "600" },
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
  choice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  choiceLabel: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  newCategory: {
    gap: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 17,
    padding: 13,
  },
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
  switchCopy: { flex: 1, gap: 2 },
  switchTitle: { fontSize: 14, lineHeight: 19, fontWeight: "700" },
  switchDescription: { fontSize: 11, lineHeight: 16, fontWeight: "500" },
  formError: {
    color: "#B84D54",
    paddingHorizontal: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  pressed: { opacity: 0.68 },
  disabled: { opacity: 0.42 },
});
