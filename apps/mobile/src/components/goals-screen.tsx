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
import { type Habit, fetchHabits } from "@/lib/habits-client";
import {
  type Goal,
  createPlanGoal,
  deletePlanGoal,
  fetchPlanGoals,
  updatePlanGoal,
} from "@/lib/planning-goals-client";

type SymbolName = SymbolViewProps["name"];

function symbol(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

export function GoalsScreen() {
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [habits, setHabits] = useState<Habit[]>([]);
  const [query, setQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setIsRefreshing(true) : setIsLoading(true);
    setError(null);

    try {
      const [nextGoals, nextHabits] = await Promise.all([
        fetchPlanGoals(),
        fetchHabits(),
      ]);
      setGoals(nextGoals);
      setHabits(nextHabits);
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

  const linkedHabitsByGoalId = useMemo(() => {
    const groups = new Map<string, Habit[]>();
    for (const habit of habits) {
      if (!habit.goalId) continue;
      groups.set(habit.goalId, [...(groups.get(habit.goalId) ?? []), habit]);
    }
    return groups;
  }, [habits]);

  const visibleGoals = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return goals;

    return goals.filter((goal) => {
      const linkedHabits = linkedHabitsByGoalId.get(goal.id) ?? [];
      return `${goal.title} ${linkedHabits.map((habit) => habit.name).join(" ")}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [goals, linkedHabitsByGoalId, query]);

  const openCreate = () => {
    setEditingGoal(null);
    setFormOpen(true);
  };

  const openEdit = (goal: Goal) => {
    setEditingGoal(goal);
    setFormOpen(true);
  };

  const saveGoal = async (title: string) => {
    const input = { title };
    const saved = editingGoal
      ? await updatePlanGoal(editingGoal.id, input)
      : await createPlanGoal(input);

    setGoals((current) =>
      editingGoal
        ? current.map((goal) => (goal.id === saved.id ? saved : goal))
        : [saved, ...current],
    );
    setFormOpen(false);
    setEditingGoal(null);
  };

  const confirmDelete = (goal: Goal) => {
    const linkedCount = linkedHabitsByGoalId.get(goal.id)?.length ?? 0;
    Alert.alert(
      "Delete goal?",
      linkedCount
        ? `"${goal.title}" will be deleted and ${linkedCount} linked habit${
            linkedCount === 1 ? "" : "s"
          } will no longer be linked to a goal.`
        : `"${goal.title}" will be permanently deleted.`,
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
              setHabits((current) =>
                current.map((habit) =>
                  habit.goalId === goal.id
                    ? { ...habit, goalId: null, goalTitle: null }
                    : habit,
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
            <PlanReportHeaderMenu currentView="goals" />
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
                  linkedHabits={linkedHabitsByGoalId.get(goal.id) ?? []}
                  onDelete={() => confirmDelete(goal)}
                  onEdit={() => openEdit(goal)}
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
    </View>
  );
}

function GoalCard({
  goal,
  linkedHabits,
  onDelete,
  onEdit,
}: {
  goal: Goal;
  linkedHabits: Habit[];
  onDelete: () => void;
  onEdit: () => void;
}) {
  const theme = useTheme();
  const previewHabits = linkedHabits.slice(0, 3);
  const remainingCount = linkedHabits.length - previewHabits.length;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onEdit}
      style={({ pressed }) => [
        styles.goalCard,
        { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
        pressed && styles.pressed,
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
            {linkedHabits.length} linked habit
            {linkedHabits.length === 1 ? "" : "s"}
          </Text>
        </View>
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

      {previewHabits.length ? (
        <View style={styles.linkedHabitWrap}>
          {previewHabits.map((habit) => (
            <View
              key={habit.id}
              style={[
                styles.linkedHabitChip,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.tabBorder,
                },
              ]}
            >
              <Text
                numberOfLines={1}
                style={[styles.linkedHabitLabel, { color: theme.text }]}
              >
                {habit.name}
              </Text>
            </View>
          ))}
          {remainingCount > 0 ? (
            <Text
              style={[styles.remainingLabel, { color: theme.textSecondary }]}
            >
              +{remainingCount} more
            </Text>
          ) : null}
        </View>
      ) : null}
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
          : "Add a bigger outcome, then link habits that move it forward."}
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
  onSave: (title: string) => Promise<void>;
}) {
  const theme = useTheme();
  const [title, setTitle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(goal?.title ?? "");
    setError(null);
  }, [goal, isOpen]);

  const save = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || isSaving) return;
    setIsSaving(true);
    setError(null);

    try {
      await onSave(trimmedTitle);
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

            {error ? <Text style={styles.formError}>{error}</Text> : null}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
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
    gap: 16,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  addButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
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
  linkedHabitWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
    paddingLeft: 58,
  },
  linkedHabitChip: {
    maxWidth: "100%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  linkedHabitLabel: { fontSize: 11, lineHeight: 15, fontWeight: "700" },
  remainingLabel: { fontSize: 11, lineHeight: 15, fontWeight: "700" },
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
  formError: {
    color: "#9D474D",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "700",
    paddingHorizontal: 4,
  },
  pressed: { opacity: 0.72 },
});
