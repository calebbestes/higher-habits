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
  TASK_IMPORTANCES,
  TASK_TIME_OPTIONS,
  TASK_URGENCIES,
  type Task,
  type TaskInput,
  compareTasksByPriority,
  createTask,
  deleteTask,
  fetchTasks,
  getTaskDueDateForUrgency,
  getTaskImportanceScore,
  getTaskUrgency,
  todayDateKey,
  updateTask,
} from "@/lib/tasks-client";

type SymbolName = SymbolViewProps["name"];
type SortKey = "priority" | "dueDate" | "timeRequired" | "importance";

const SORT_OPTIONS: { key: SortKey; label: string; icon: [string, string] }[] =
  [
    {
      key: "priority",
      label: "Priority",
      icon: ["chart.bar.fill", "bar_chart"],
    },
    { key: "dueDate", label: "Due date", icon: ["calendar", "calendar_today"] },
    {
      key: "timeRequired",
      label: "Time to complete",
      icon: ["clock", "schedule"],
    },
    {
      key: "importance",
      label: "Importance",
      icon: ["exclamationmark.circle", "priority_high"],
    },
  ];

const TIME_ORDER = [
  "~15 min",
  "~30 min",
  "~1 hr",
  "~2 hrs",
  "~4 hrs",
  "~8 hrs",
];

function compareBySortKey(
  a: Task,
  b: Task,
  sort: SortKey,
  today: string,
): number {
  switch (sort) {
    case "priority":
      return compareTasksByPriority(a, b, today);
    case "dueDate": {
      const ad = a.dueDate ?? "9999-99-99";
      const bd = b.dueDate ?? "9999-99-99";
      return ad < bd ? -1 : ad > bd ? 1 : compareTasksByPriority(a, b, today);
    }
    case "timeRequired": {
      const ai = TIME_ORDER.indexOf(a.timeRequired ?? "");
      const bi = TIME_ORDER.indexOf(b.timeRequired ?? "");
      const ai2 = ai === -1 ? 999 : ai;
      const bi2 = bi === -1 ? 999 : bi;
      return ai2 !== bi2 ? ai2 - bi2 : compareTasksByPriority(a, b, today);
    }
    case "importance":
      return (
        getTaskImportanceScore(b.importance) -
          getTaskImportanceScore(a.importance) ||
        compareTasksByPriority(a, b, today)
      );
  }
}

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

const IMPORTANCE_COLOR: Record<string, string> = {
  High: "#9D7474",
  Medium: "#B87D4D",
  Low: "#6B8E6B",
};

const URGENCY_COLOR: Record<string, string> = {
  today: "#9D474D",
  soon: "#B87D4D",
  later: "transparent",
};

function formatDueDate(dueDate: string, today: string): string {
  if (dueDate === today) return "Due today";
  if (dueDate < today) {
    const [y, m, d] = dueDate.split("-").map(Number);
    const date = new Date(y, (m as number) - 1, d as number);
    return `Due ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
  }
  const [y, m, d] = dueDate.split("-").map(Number);
  const date = new Date(y, (m as number) - 1, d as number);
  return `Due ${date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

export function TopTasksScreen() {
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();
  const today = useRef(todayDateKey()).current;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [sort, setSort] = useState<SortKey>("priority");
  const [sortPickerOpen, setSortPickerOpen] = useState(false);
  const [actionTask, setActionTask] = useState<Task | null>(null);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async (refresh = false) => {
    refresh ? setIsRefreshing(true) : setIsLoading(true);
    setError(null);
    try {
      const fetched = await fetchTasks();
      setTasks(fetched);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load tasks.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const activeTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.completedAt === null)
        .sort((a, b) => compareBySortKey(a, b, sort, today)),
    [tasks, sort, today],
  );

  const completedTasks = useMemo(
    () => tasks.filter((t) => t.completedAt !== null),
    [tasks],
  );

  const handleComplete = useCallback(
    async (task: Task) => {
      if (completingIds.has(task.id)) return;

      const previous = task;
      const newCompletedAt = task.completedAt ? null : today;
      const next = { ...task, completedAt: newCompletedAt };

      setCompletingIds((prev) => new Set(prev).add(task.id));
      setTasks((prev) => prev.map((t) => (t.id === task.id ? next : t)));

      try {
        const saved = await updateTask(task.id, {
          name: task.name,
          importance: task.importance,
          dueDate: task.dueDate,
          completedAt: newCompletedAt,
          timeRequired: task.timeRequired,
        });
        setTasks((prev) => prev.map((t) => (t.id === saved.id ? saved : t)));
      } catch (err) {
        setTasks((prev) =>
          prev.map((t) => (t.id === previous.id ? previous : t)),
        );
        setError(
          err instanceof Error ? err.message : "Could not complete task.",
        );
      } finally {
        setCompletingIds((prev) => {
          const next = new Set(prev);
          next.delete(task.id);
          return next;
        });
      }
    },
    [completingIds, today],
  );

  const openCreate = () => {
    setEditingTask(null);
    setFormOpen(true);
  };

  const openEdit = (task: Task) => {
    setActionTask(null);
    setEditingTask(task);
    setFormOpen(true);
  };

  const saveTask = async (input: TaskInput) => {
    const saved = editingTask
      ? await updateTask(editingTask.id, input)
      : await createTask(input);
    setTasks((current) =>
      editingTask
        ? current.map((t) => (t.id === saved.id ? saved : t))
        : [...current, saved],
    );
    setFormOpen(false);
    setEditingTask(null);
  };

  const confirmDelete = (task: Task) => {
    setActionTask(null);
    Alert.alert("Delete task?", `"${task.name}" will be permanently deleted.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteTask(task.id);
            setTasks((current) => current.filter((t) => t.id !== task.id));
          } catch (err) {
            setError(
              err instanceof Error ? err.message : "Could not delete task.",
            );
          }
        },
      },
    ]);
  };

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
            <View style={styles.pageHeaderLeft}>
              <View style={styles.pageHeaderText}>
                <PlanReportHeaderMenu currentView="top-tasks" />
              </View>
            </View>
            <View style={styles.headerActions}>
              <Pressable
                accessibilityLabel="Sort tasks"
                onPress={() => setSortPickerOpen(true)}
                style={({ pressed }) => [
                  styles.iconButton,
                  { backgroundColor: theme.backgroundElement },
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={sym("arrow.up.arrow.down", "swap_vert")}
                  size={16}
                  weight="semibold"
                  tintColor={theme.textSecondary}
                />
              </Pressable>
              <Pressable
                accessibilityLabel="Add task"
                onPress={openCreate}
                style={({ pressed }) => [
                  styles.iconButton,
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

          {/* Task list */}
          {isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={theme.primary} size="large" />
            </View>
          ) : activeTasks.length === 0 && completedTasks.length === 0 ? (
            <EmptyState />
          ) : (
            <View style={styles.lists}>
              {activeTasks.length > 0 ? (
                <View
                  style={[
                    styles.taskList,
                    {
                      borderColor: theme.tabBorder,
                      backgroundColor: theme.tabBar,
                    },
                  ]}
                >
                  {activeTasks.map((task, index) => (
                    <View key={task.id}>
                      {index > 0 ? (
                        <View
                          style={[
                            styles.divider,
                            { backgroundColor: theme.tabBorder },
                          ]}
                        />
                      ) : null}
                      <TaskRow
                        task={task}
                        today={today}
                        isCompleting={completingIds.has(task.id)}
                        onComplete={() => void handleComplete(task)}
                        onMore={() => setActionTask(task)}
                      />
                    </View>
                  ))}
                </View>
              ) : (
                <EmptyState />
              )}

              {completedTasks.length > 0 ? (
                <View>
                  <Pressable
                    onPress={() => setCompletedExpanded((v) => !v)}
                    style={({ pressed }) => [
                      styles.completedToggle,
                      { backgroundColor: theme.backgroundElement },
                      pressed && styles.pressed,
                    ]}
                  >
                    <SymbolView
                      name={sym(
                        completedExpanded ? "chevron.up" : "chevron.down",
                        completedExpanded ? "expand_less" : "expand_more",
                      )}
                      size={14}
                      weight="semibold"
                      tintColor={theme.textSecondary}
                    />
                    <Text
                      style={[
                        styles.completedToggleText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {completedExpanded ? "Hide" : "Show"} completed (
                      {completedTasks.length})
                    </Text>
                  </Pressable>

                  {completedExpanded ? (
                    <View
                      style={[
                        styles.taskList,
                        {
                          borderColor: theme.tabBorder,
                          backgroundColor: theme.tabBar,
                          marginTop: 8,
                        },
                      ]}
                    >
                      {completedTasks.map((task, index) => (
                        <View key={task.id}>
                          {index > 0 ? (
                            <View
                              style={[
                                styles.divider,
                                { backgroundColor: theme.tabBorder },
                              ]}
                            />
                          ) : null}
                          <TaskRow
                            task={task}
                            today={today}
                            isCompleting={completingIds.has(task.id)}
                            onComplete={() => void handleComplete(task)}
                            onMore={() => setActionTask(task)}
                          />
                        </View>
                      ))}
                    </View>
                  ) : null}
                </View>
              ) : null}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <TaskActionsModal
        task={actionTask}
        onClose={() => setActionTask(null)}
        onEdit={openEdit}
        onDelete={confirmDelete}
        onToggle={(task) => void handleComplete(task)}
      />
      <TaskFormModal
        isOpen={formOpen}
        task={editingTask}
        onClose={() => {
          setFormOpen(false);
          setEditingTask(null);
        }}
        onSave={saveTask}
      />

      <Modal
        animationType="fade"
        transparent
        visible={sortPickerOpen}
        onRequestClose={() => setSortPickerOpen(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setSortPickerOpen(false)}
          />
          <View
            style={[
              styles.actionSheet,
              { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
            ]}
          >
            <Text style={[styles.actionTitle, { color: theme.text }]}>
              Sort by
            </Text>
            {SORT_OPTIONS.map((option) => (
              <Pressable
                key={option.key}
                onPress={() => {
                  setSort(option.key);
                  setSortPickerOpen(false);
                }}
                style={({ pressed }) => [
                  styles.actionRow,
                  pressed && { backgroundColor: theme.backgroundElement },
                ]}
              >
                <SymbolView
                  name={sym(option.icon[0], option.icon[1])}
                  size={20}
                  tintColor={
                    sort === option.key ? theme.primary : theme.tabIcon
                  }
                />
                <Text
                  style={[
                    styles.actionLabel,
                    { color: sort === option.key ? theme.primary : theme.text },
                  ]}
                >
                  {option.label}
                </Text>
                {sort === option.key ? (
                  <SymbolView
                    name={sym("checkmark", "check")}
                    size={14}
                    weight="bold"
                    tintColor={theme.primary}
                  />
                ) : null}
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function TaskRow({
  task,
  today,
  isCompleting,
  onComplete,
  onMore,
}: {
  task: Task;
  today: string;
  isCompleting: boolean;
  onComplete: () => void;
  onMore: () => void;
}) {
  const theme = useTheme();
  const completed = Boolean(task.completedAt);
  const urgency = getTaskUrgency(task, today);
  const urgencyColor = URGENCY_COLOR[urgency] ?? "transparent";
  const importanceColor =
    IMPORTANCE_COLOR[task.importance] ?? theme.textSecondary;
  const hasUrgency = urgency !== "later" && !completed;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        completed ? `Reopen ${task.name}` : `Complete ${task.name}`
      }
      onPress={onComplete}
      disabled={isCompleting}
      style={({ pressed }) => [
        styles.taskRow,
        completed && { opacity: 0.6 },
        pressed && !isCompleting && styles.pressed,
      ]}
    >
      {/* Checkbox */}
      <Pressable
        onPress={onComplete}
        disabled={isCompleting}
        hitSlop={8}
        style={[
          styles.checkbox,
          {
            borderColor: completed
              ? theme.primary
              : isCompleting
                ? theme.primary
                : theme.tabBorder,
            backgroundColor: completed
              ? theme.primary
              : isCompleting
                ? `${theme.primary}18`
                : "transparent",
          },
        ]}
      >
        {isCompleting ? (
          <ActivityIndicator
            size="small"
            color={completed ? theme.primaryForeground : theme.primary}
          />
        ) : completed ? (
          <SymbolView
            name={sym("checkmark", "check")}
            size={13}
            weight="bold"
            tintColor={theme.primaryForeground}
          />
        ) : null}
      </Pressable>

      {/* Content */}
      <View style={styles.taskContent}>
        <Text
          style={[
            styles.taskName,
            { color: theme.text },
            completed && styles.completedName,
          ]}
          numberOfLines={2}
        >
          {task.name}
        </Text>
        <View style={styles.taskMeta}>
          {task.dueDate ? (
            <Text
              style={[
                styles.taskMetaText,
                { color: hasUrgency ? urgencyColor : theme.textSecondary },
              ]}
            >
              {formatDueDate(task.dueDate, today)}
            </Text>
          ) : null}
          {task.dueDate && (task.timeRequired || task.importance !== "Low") ? (
            <Text style={[styles.taskMetaDot, { color: theme.textSecondary }]}>
              ·
            </Text>
          ) : null}
          {task.timeRequired ? (
            <Text style={[styles.taskMetaText, { color: theme.textSecondary }]}>
              {task.timeRequired}
            </Text>
          ) : null}
          {task.timeRequired && task.importance !== "Low" ? (
            <Text style={[styles.taskMetaDot, { color: theme.textSecondary }]}>
              ·
            </Text>
          ) : null}
          {task.importance !== "Low" ? (
            <Text style={[styles.taskMetaText, { color: importanceColor }]}>
              {task.importance}
            </Text>
          ) : null}
        </View>
      </View>

      <Pressable
        accessibilityLabel={`More actions for ${task.name}`}
        hitSlop={8}
        onPress={(e) => {
          e.stopPropagation();
          onMore();
        }}
        style={({ pressed }) => [
          styles.moreButton,
          pressed && { backgroundColor: theme.backgroundElement },
        ]}
      >
        <SymbolView
          name={sym("ellipsis", "more_horiz")}
          size={20}
          tintColor={theme.textSecondary}
        />
      </Pressable>
    </Pressable>
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
          name={sym("checkmark.circle", "check_circle")}
          size={28}
          tintColor={theme.primary}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        No active tasks
      </Text>
      <Text style={[styles.emptyDescription, { color: theme.textSecondary }]}>
        All caught up! Add new tasks to get started.
      </Text>
    </View>
  );
}

const EMPTY_TASK: TaskInput = {
  name: "",
  importance: "Medium",
  dueDate: null,
  completedAt: null,
  timeRequired: "~1 hr",
};

function toInput(task: Task): TaskInput {
  return {
    name: task.name,
    importance: task.importance,
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    timeRequired: task.timeRequired,
  };
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function TaskActionsModal({
  task,
  onClose,
  onEdit,
  onDelete,
  onToggle,
}: {
  task: Task | null;
  onClose: () => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggle: (task: Task) => void;
}) {
  const theme = useTheme();
  if (!task) return null;

  const actions = [
    {
      label: "Edit task",
      icon: sym("pencil", "edit"),
      onPress: () => onEdit(task),
    },
    {
      label: task.completedAt ? "Mark as active" : "Mark as complete",
      icon: sym(
        task.completedAt ? "arrow.uturn.backward.circle" : "checkmark.circle",
        task.completedAt ? "undo" : "check_circle",
      ),
      onPress: () => onToggle(task),
    },
    {
      label: "Delete task",
      icon: sym("trash", "delete"),
      danger: true,
      onPress: () => onDelete(task),
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
            {task.name}
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

function TaskFormModal({
  isOpen,
  task,
  onClose,
  onSave,
}: {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onSave: (input: TaskInput) => Promise<void>;
}) {
  const theme = useTheme();
  const [form, setForm] = useState<TaskInput>(EMPTY_TASK);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setForm(task ? toInput(task) : EMPTY_TASK);
    setError(null);
  }, [isOpen, task]);

  const dueDateValid =
    !form.dueDate || /^\d{4}-\d{2}-\d{2}$/.test(form.dueDate);

  const save = async () => {
    if (!form.name.trim() || !dueDateValid || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSave({ ...form, name: form.name.trim() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save task.");
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
              {task ? "Edit Task" : "New Task"}
            </Text>
            <Pressable
              disabled={!form.name.trim() || !dueDateValid || isSaving}
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
                        form.name.trim() && dueDateValid
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
            <FormSection title="Task">
              <View style={styles.inputField}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>
                  Name
                </Text>
                <TextInput
                  autoFocus
                  placeholderTextColor={theme.textSecondary}
                  selectionColor={theme.primary}
                  placeholder="What needs to get done?"
                  returnKeyType="done"
                  value={form.name}
                  onChangeText={(name) => setForm((f) => ({ ...f, name }))}
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.tabBorder,
                      color: theme.text,
                    },
                  ]}
                />
              </View>
            </FormSection>
            <FormSection title="Priority">
              <Text style={[styles.fieldLabel, { color: theme.text }]}>
                Importance
              </Text>
              <View style={styles.choiceWrap}>
                {TASK_IMPORTANCES.map((imp) => (
                  <Choice
                    key={imp}
                    label={imp}
                    selected={form.importance === imp}
                    tone={imp === "High" ? "blush" : undefined}
                    onPress={() => setForm((f) => ({ ...f, importance: imp }))}
                  />
                ))}
              </View>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>
                Urgency
              </Text>
              <View style={styles.choiceWrap}>
                {TASK_URGENCIES.map((urgency) => (
                  <Choice
                    key={urgency}
                    label={capitalize(urgency)}
                    selected={getTaskUrgency(form) === urgency}
                    tone={urgency === "today" ? "blush" : undefined}
                    onPress={() =>
                      setForm((f) => ({
                        ...f,
                        dueDate: getTaskDueDateForUrgency(urgency),
                      }))
                    }
                  />
                ))}
              </View>
            </FormSection>
            <FormSection title="Schedule">
              <View style={styles.inputField}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>
                  Exact due date
                </Text>
                <TextInput
                  autoCapitalize="none"
                  autoCorrect={false}
                  placeholderTextColor={theme.textSecondary}
                  selectionColor={theme.primary}
                  placeholder="YYYY-MM-DD"
                  value={form.dueDate ?? ""}
                  onChangeText={(dueDate) =>
                    setForm((f) => ({ ...f, dueDate: dueDate.trim() || null }))
                  }
                  style={[
                    styles.input,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.tabBorder,
                      color: theme.text,
                    },
                  ]}
                />
              </View>
              {!dueDateValid ? (
                <Text style={styles.fieldError}>Use YYYY-MM-DD format.</Text>
              ) : null}
              <Text style={[styles.fieldLabel, { color: theme.text }]}>
                Time required
              </Text>
              <View style={styles.choiceWrap}>
                {TASK_TIME_OPTIONS.map((t) => (
                  <Choice
                    key={t}
                    label={t}
                    selected={form.timeRequired === t}
                    onPress={() => setForm((f) => ({ ...f, timeRequired: t }))}
                  />
                ))}
              </View>
            </FormSection>
            <FormSection title="Status">
              <View style={styles.statusChoices}>
                <Choice
                  label="Active"
                  selected={!form.completedAt}
                  onPress={() => setForm((f) => ({ ...f, completedAt: null }))}
                />
                <Choice
                  label="Completed today"
                  selected={Boolean(form.completedAt)}
                  onPress={() =>
                    setForm((f) => ({ ...f, completedAt: todayDateKey() }))
                  }
                />
              </View>
            </FormSection>
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
}: { children: React.ReactNode; title: string }) {
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

function Choice({
  label,
  onPress,
  selected,
  tone,
}: { label: string; onPress: () => void; selected: boolean; tone?: "blush" }) {
  const theme = useTheme();
  const selectedBg = tone === "blush" ? "#9D7474" : theme.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          backgroundColor: selected ? selectedBg : theme.backgroundElement,
          borderColor: selected ? selectedBg : theme.tabBorder,
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
    justifyContent: "space-between",
  },
  pageHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    flex: 1,
  },
  pageHeaderIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  pageHeaderText: { gap: 1 },
  pageTitle: {
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  pageSubtitle: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  iconButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
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
  lists: { gap: 8 },
  taskList: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    overflow: "hidden",
  },
  completedToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  completedToggleText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
  },
  divider: { height: StyleSheet.hairlineWidth, marginLeft: 68 },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 72,
  },
  urgencyStripe: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  checkbox: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  taskContent: { flex: 1, gap: 3 },
  taskName: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "600",
  },
  completedName: { textDecorationLine: "line-through" },
  taskMeta: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    flexWrap: "wrap",
  },
  taskMetaText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  taskMetaDot: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },
  pressed: { opacity: 0.72 },
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
  actionLabel: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: "700" },
  moreButton: {
    width: 32,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
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
  fieldError: {
    color: "#B84D54",
    marginTop: -9,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
  },
  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  choiceLabel: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  statusChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  formError: {
    color: "#B84D54",
    paddingHorizontal: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
});
