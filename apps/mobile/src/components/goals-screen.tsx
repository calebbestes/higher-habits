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
import {
  type Goal,
  type GoalInput,
  createPlanGoal,
  deletePlanGoal,
  fetchPlanGoals,
  updatePlanGoal,
} from "@/lib/planning-goals-client";

type SymbolName = SymbolViewProps["name"];
type CheckpointDraft = {
  localId: string;
  title: string;
  targetDate: string;
  completed: boolean;
};

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function symbol(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
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

  const load = useCallback(async (refresh = false) => {
    refresh ? setIsRefreshing(true) : setIsLoading(true);
    setError(null);

    try {
      setGoals(await fetchPlanGoals());
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
  onDelete,
  onEdit,
}: {
  goal: Goal;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const theme = useTheme();

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
            {goal.checkpoints.length} checkpoint
            {goal.checkpoints.length === 1 ? "" : "s"}
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

      {goal.checkpoints.length ? (
        <GoalTimeline checkpoints={goal.checkpoints} />
      ) : null}
    </Pressable>
  );
}

function GoalTimeline({ checkpoints }: { checkpoints: Goal["checkpoints"] }) {
  const theme = useTheme();
  return (
    <View style={styles.timeline}>
      {checkpoints.map((checkpoint, index) => {
        const isLast = index === checkpoints.length - 1;
        return (
          <View key={checkpoint.id} style={styles.timelineItem}>
            <View style={styles.timelineMarkerColumn}>
              <View
                style={[
                  styles.timelineDot,
                  {
                    backgroundColor: checkpoint.completed
                      ? theme.primary
                      : theme.backgroundElement,
                    borderColor: checkpoint.completed
                      ? theme.primary
                      : theme.tabBorder,
                  },
                ]}
              />
              {!isLast ? (
                <View
                  style={[
                    styles.timelineLine,
                    { backgroundColor: theme.tabBorder },
                  ]}
                />
              ) : null}
            </View>
            <View style={styles.timelineText}>
              <Text
                numberOfLines={2}
                style={[
                  styles.timelineTitle,
                  { color: theme.text },
                  checkpoint.completed && styles.completedTimelineTitle,
                ]}
              >
                {checkpoint.title}
              </Text>
              {checkpoint.targetDate ? (
                <Text
                  style={[styles.timelineDate, { color: theme.textSecondary }]}
                >
                  {checkpoint.targetDate}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
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
    justifyContent: "space-between",
  },
  pageHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    flex: 1,
  },
  pageHeaderText: { gap: 1 },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
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
  timeline: {
    gap: 0,
    paddingLeft: 58,
    paddingTop: 2,
  },
  timelineItem: {
    flexDirection: "row",
    minHeight: 34,
    gap: 9,
  },
  timelineMarkerColumn: {
    width: 14,
    alignItems: "center",
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    marginTop: 3,
  },
  timelineLine: {
    width: StyleSheet.hairlineWidth,
    flex: 1,
    marginTop: 3,
  },
  timelineText: {
    flex: 1,
    minWidth: 0,
    paddingBottom: 10,
  },
  timelineTitle: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  completedTimelineTitle: { textDecorationLine: "line-through", opacity: 0.7 },
  timelineDate: { fontSize: 10, lineHeight: 14, fontWeight: "700" },
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
