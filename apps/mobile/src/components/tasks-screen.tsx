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

import { MaxContentWidth } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  TASK_IMPORTANCES,
  TASK_TIME_OPTIONS,
  TASK_URGENCIES,
  type Task,
  type TaskInput,
  type TaskUrgency,
  createTask,
  deleteTask,
  fetchTasks,
  getTaskDueDateForUrgency,
  getTaskPriorityLevel,
  getTaskUrgency,
  todayDateKey,
  updateTask,
} from "@/lib/tasks-client";

type SymbolName = SymbolViewProps["name"];
type TaskFilter = "all" | "today" | "soon" | "completed";

const EMPTY_TASK: TaskInput = {
  name: "",
  importance: "Medium",
  dueDate: null,
  completedAt: null,
  timeRequired: "~1 hr",
};

const URGENCY_LABELS: Record<TaskUrgency, string> = {
  today: "Today",
  soon: "Soon",
  later: "Later",
};

const URGENCY_SYMBOLS: Record<TaskUrgency, SymbolName> = {
  today: symbol("sun.max.fill", "today"),
  soon: symbol("calendar.badge.clock", "date_range"),
  later: symbol("tray.full", "inbox"),
};

function symbol(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function toInput(task: Task): TaskInput {
  return {
    name: task.name,
    importance: task.importance,
    dueDate: task.dueDate,
    completedAt: task.completedAt,
    timeRequired: task.timeRequired,
  };
}

function compareTasks(left: Task, right: Task) {
  return (
    getTaskPriorityLevel(right) - getTaskPriorityLevel(left) ||
    (left.dueDate ?? "9999").localeCompare(right.dueDate ?? "9999") ||
    left.name.localeCompare(right.name)
  );
}

function formatDueDate(dateKey: string | null) {
  if (!dateKey) return "No due date";
  if (dateKey === todayDateKey()) return "Due today";

  const [year, month, day] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: year === new Date().getFullYear() ? undefined : "numeric",
  }).format(new Date(year, month - 1, day));
}

function capitalize(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function TasksScreen() {
  const theme = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [actionTask, setActionTask] = useState<Task | null>(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setIsRefreshing(true) : setIsLoading(true);
    setError(null);

    try {
      setTasks(await fetchTasks());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load tasks.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleTasks = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return tasks.filter((task) => {
      const urgency = getTaskUrgency(task);
      if (filter === "completed" && !task.completedAt) return false;
      if (filter === "today" && (task.completedAt || urgency !== "today")) {
        return false;
      }
      if (filter === "soon" && (task.completedAt || urgency !== "soon")) {
        return false;
      }
      if (!normalizedQuery) return true;
      return `${task.name} ${task.importance} ${task.timeRequired}`
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [filter, query, tasks]);

  const groups = useMemo(() => {
    const active = visibleTasks.filter((task) => !task.completedAt);
    const completed = visibleTasks.filter((task) => task.completedAt);
    const urgencyGroups = TASK_URGENCIES.map((urgency) => ({
      key: urgency,
      label: URGENCY_LABELS[urgency],
      icon: URGENCY_SYMBOLS[urgency],
      tasks: active
        .filter((task) => getTaskUrgency(task) === urgency)
        .sort(compareTasks),
    })).filter((group) => group.tasks.length);

    if (completed.length) {
      urgencyGroups.push({
        key: "completed" as TaskUrgency,
        label: "Completed Today",
        icon: symbol("checkmark.circle.fill", "check_circle"),
        tasks: completed.sort(compareTasks),
      });
    }

    return urgencyGroups;
  }, [visibleTasks]);

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
        ? current.map((task) => (task.id === saved.id ? saved : task))
        : [...current, saved],
    );
    setFormOpen(false);
    setEditingTask(null);
  };

  const toggleComplete = async (task: Task) => {
    setActionTask(null);
    if (updatingId) return;

    setUpdatingId(task.id);
    setError(null);
    try {
      const updated = await updateTask(task.id, {
        ...toInput(task),
        completedAt: task.completedAt ? null : todayDateKey(),
      });
      setTasks((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update task.",
      );
    } finally {
      setUpdatingId(null);
    }
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
            setTasks((current) =>
              current.filter((item) => item.id !== task.id),
            );
          } catch (deleteError) {
            setError(
              deleteError instanceof Error
                ? deleteError.message
                : "Could not delete task.",
            );
          }
        },
      },
    ]);
  };

  const activeCount = tasks.filter((task) => !task.completedAt).length;
  const todayCount = tasks.filter(
    (task) => !task.completedAt && getTaskUrgency(task) === "today",
  ).length;
  const completedCount = tasks.filter((task) => task.completedAt).length;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
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
                  name={symbol("checklist", "checklist")}
                  size={21}
                  weight="semibold"
                  tintColor={theme.primaryForeground}
                />
              </View>
              <View>
                <Text style={[styles.title, { color: theme.text }]}>Tasks</Text>
                <Text
                  style={[styles.description, { color: theme.textSecondary }]}
                >
                  Plan what matters and clear it daily
                </Text>
              </View>
            </View>
            <Pressable
              accessibilityLabel="Add task"
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
            <Stat label="Active" value={activeCount} />
            <Stat label="Due today" value={todayCount} accent="#9D7474" />
            <Stat label="Done today" value={completedCount} accent="#527B65" />
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
              accessibilityLabel="Search tasks"
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={setQuery}
              placeholder="Search tasks"
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
                ["today", "Today"],
                ["soon", "Soon"],
                ["completed", "Completed"],
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
          ) : groups.length ? (
            <View style={styles.groups}>
              {groups.map((group) => (
                <View key={group.label} style={styles.group}>
                  <View style={styles.groupHeader}>
                    <SymbolView
                      name={group.icon}
                      size={16}
                      tintColor={theme.primary}
                    />
                    <Text style={[styles.groupTitle, { color: theme.text }]}>
                      {group.label}
                    </Text>
                    <Text
                      style={[
                        styles.groupCount,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {group.tasks.length}
                    </Text>
                  </View>
                  <View style={styles.taskList}>
                    {group.tasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        isUpdating={updatingId === task.id}
                        task={task}
                        onEdit={() => openEdit(task)}
                        onMore={() => setActionTask(task)}
                        onToggle={() => void toggleComplete(task)}
                      />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <EmptyState hasTasks={tasks.length > 0} onAdd={openCreate} />
          )}
        </ScrollView>
      </SafeAreaView>

      <TaskFormModal
        isOpen={formOpen}
        task={editingTask}
        onClose={() => {
          setFormOpen(false);
          setEditingTask(null);
        }}
        onSave={saveTask}
      />
      <TaskActionsModal
        task={actionTask}
        onClose={() => setActionTask(null)}
        onDelete={confirmDelete}
        onEdit={openEdit}
        onToggle={toggleComplete}
      />
    </View>
  );
}

function Stat({
  accent,
  label,
  value,
}: {
  accent?: string;
  label: string;
  value: number;
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
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
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

function TaskCard({
  isUpdating,
  onEdit,
  onMore,
  onToggle,
  task,
}: {
  isUpdating: boolean;
  onEdit: () => void;
  onMore: () => void;
  onToggle: () => void;
  task: Task;
}) {
  const theme = useTheme();
  const completed = Boolean(task.completedAt);
  const priority = getTaskPriorityLevel(task);
  const priorityColor =
    task.importance === "High"
      ? "#9D7474"
      : task.importance === "Medium"
        ? theme.primary
        : theme.textSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onEdit}
      style={({ pressed }) => [
        styles.taskCard,
        {
          backgroundColor: theme.tabBar,
          borderColor: theme.tabBorder,
          opacity: completed ? 0.66 : 1,
        },
        pressed && styles.pressed,
      ]}
    >
      <Pressable
        accessibilityLabel={
          completed ? `Reopen ${task.name}` : `Complete ${task.name}`
        }
        accessibilityRole="checkbox"
        accessibilityState={{ checked: completed }}
        disabled={isUpdating}
        hitSlop={8}
        onPress={(event) => {
          event.stopPropagation();
          onToggle();
        }}
        style={[
          styles.checkButton,
          {
            backgroundColor: completed ? theme.primary : "transparent",
            borderColor: completed ? theme.primary : theme.tabBorder,
          },
        ]}
      >
        {isUpdating ? (
          <ActivityIndicator
            color={completed ? theme.primaryForeground : theme.primary}
            size="small"
          />
        ) : completed ? (
          <SymbolView
            name={symbol("checkmark", "check")}
            size={16}
            weight="bold"
            tintColor={theme.primaryForeground}
          />
        ) : null}
      </Pressable>
      <View style={styles.taskBody}>
        <Text
          numberOfLines={2}
          style={[
            styles.taskName,
            { color: theme.text },
            completed && styles.completedName,
          ]}
        >
          {task.name}
        </Text>
        <View style={styles.taskMetadata}>
          <View
            style={[styles.priorityDot, { backgroundColor: priorityColor }]}
          />
          <Text style={[styles.metadataText, { color: theme.textSecondary }]}>
            {task.importance}
          </Text>
          <Text
            style={[styles.metadataDivider, { color: theme.textSecondary }]}
          >
            ·
          </Text>
          <Text style={[styles.metadataText, { color: theme.textSecondary }]}>
            {task.timeRequired}
          </Text>
          <Text
            style={[styles.metadataDivider, { color: theme.textSecondary }]}
          >
            ·
          </Text>
          <Text style={[styles.metadataText, { color: theme.textSecondary }]}>
            {formatDueDate(task.dueDate)}
          </Text>
        </View>
      </View>
      <View
        style={[
          styles.priorityBadge,
          { backgroundColor: theme.backgroundElement },
        ]}
      >
        <Text style={[styles.priorityScore, { color: priorityColor }]}>
          {priority.toFixed(priority % 1 ? 1 : 0)}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={`More actions for ${task.name}`}
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
  hasTasks,
  onAdd,
}: {
  hasTasks: boolean;
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
            hasTasks ? "magnifyingglass" : "checklist",
            hasTasks ? "search" : "checklist",
          )}
          size={28}
          tintColor={theme.primary}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        {hasTasks ? "No tasks found" : "Create your first task"}
      </Text>
      <Text style={[styles.emptyDescription, { color: theme.textSecondary }]}>
        {hasTasks
          ? "Try a different search or filter."
          : "Choose what matters, set the urgency, and clear it."}
      </Text>
      {!hasTasks ? (
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
            Add task
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function TaskActionsModal({
  onClose,
  onDelete,
  onEdit,
  onToggle,
  task,
}: {
  onClose: () => void;
  onDelete: (task: Task) => void;
  onEdit: (task: Task) => void;
  onToggle: (task: Task) => void;
  task: Task | null;
}) {
  const theme = useTheme();
  if (!task) return null;

  const actions = [
    {
      label: "Edit task",
      icon: symbol("pencil", "edit"),
      onPress: () => onEdit(task),
    },
    {
      label: task.completedAt ? "Reopen task" : "Complete today",
      icon: symbol(
        task.completedAt ? "arrow.uturn.backward.circle" : "checkmark.circle",
        task.completedAt ? "undo" : "check_circle",
      ),
      onPress: () => void onToggle(task),
    },
    {
      label: "Delete task",
      icon: symbol("trash", "delete"),
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
  onClose,
  onSave,
  task,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (input: TaskInput) => Promise<void>;
  task: Task | null;
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
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save task.",
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
              <LabeledInput
                autoFocus
                label="Name"
                onChangeText={(name) =>
                  setForm((current) => ({ ...current, name }))
                }
                placeholder="What needs to get done?"
                returnKeyType="done"
                value={form.name}
              />
            </FormSection>

            <FormSection title="Priority">
              <Text style={[styles.fieldLabel, { color: theme.text }]}>
                Importance
              </Text>
              <View style={styles.choiceWrap}>
                {TASK_IMPORTANCES.map((importance) => (
                  <Choice
                    key={importance}
                    label={importance}
                    selected={form.importance === importance}
                    tone={importance === "High" ? "blush" : undefined}
                    onPress={() =>
                      setForm((current) => ({ ...current, importance }))
                    }
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
                      setForm((current) => ({
                        ...current,
                        dueDate: getTaskDueDateForUrgency(urgency),
                      }))
                    }
                  />
                ))}
              </View>
            </FormSection>

            <FormSection title="Schedule">
              <LabeledInput
                autoCapitalize="none"
                autoCorrect={false}
                label="Exact due date"
                onChangeText={(dueDate) =>
                  setForm((current) => ({
                    ...current,
                    dueDate: dueDate.trim() || null,
                  }))
                }
                placeholder="YYYY-MM-DD"
                value={form.dueDate ?? ""}
              />
              {!dueDateValid ? (
                <Text style={styles.fieldError}>Use YYYY-MM-DD format.</Text>
              ) : null}
              <Text style={[styles.fieldLabel, { color: theme.text }]}>
                Time required
              </Text>
              <View style={styles.choiceWrap}>
                {TASK_TIME_OPTIONS.map((timeRequired) => (
                  <Choice
                    key={timeRequired}
                    label={timeRequired}
                    selected={form.timeRequired === timeRequired}
                    onPress={() =>
                      setForm((current) => ({ ...current, timeRequired }))
                    }
                  />
                ))}
              </View>
            </FormSection>

            <FormSection title="Status">
              <View style={styles.statusChoices}>
                <Choice
                  label="Active"
                  selected={!form.completedAt}
                  onPress={() =>
                    setForm((current) => ({ ...current, completedAt: null }))
                  }
                />
                <Choice
                  label="Completed today"
                  selected={Boolean(form.completedAt)}
                  onPress={() =>
                    setForm((current) => ({
                      ...current,
                      completedAt: todayDateKey(),
                    }))
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
    flex: 1,
    minWidth: 0,
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
  taskList: { gap: 8 },
  taskCard: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 11,
  },
  checkButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: 10,
  },
  taskBody: { flex: 1, minWidth: 0, gap: 5 },
  taskName: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
  completedName: { textDecorationLine: "line-through" },
  taskMetadata: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
  },
  priorityDot: { width: 6, height: 6, borderRadius: 3 },
  metadataText: { fontSize: 10, lineHeight: 14, fontWeight: "600" },
  metadataDivider: { fontSize: 11, lineHeight: 14, fontWeight: "700" },
  priorityBadge: {
    minWidth: 31,
    height: 31,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  priorityScore: { fontSize: 11, lineHeight: 14, fontWeight: "800" },
  moreButton: {
    width: 32,
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
  pressed: { opacity: 0.72 },
});
