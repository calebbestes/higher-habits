import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
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
import { ProjectProgressCard } from "@/components/tasks/project-progress";
import { toInput } from "@/components/tasks/shared";
import { TaskActionsModal } from "@/components/tasks/task-actions-modal";
import { TaskFormModal } from "@/components/tasks/task-form-modal";
import { TaskPlanModal } from "@/components/tasks/task-plan-modal";
import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTaskProjects } from "@/hooks/use-task-projects";
import { useTheme } from "@/hooks/use-theme";
import { playSelectionHaptic, playSuccessHaptic } from "@/lib/haptics";
import {
  type PlannedEvent,
  deletePlannedEvent,
  fetchPlannedEvents,
  upsertPlannedEvent,
} from "@/lib/planned-events-client";
import {
  TASK_URGENCIES,
  type Task,
  type TaskInput,
  type TaskUrgency,
  createTask,
  deleteTask,
  fetchTasks,
  getTaskPriorityLevel,
  getTaskUrgency,
  todayDateKey,
  updateTask,
  updateTaskCompletion,
} from "@/lib/tasks-client";

type SymbolName = SymbolViewProps["name"];
type TaskFilter = "all" | "today" | "soon" | "completed";

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

export function TasksScreen() {
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();
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
  const [planningTask, setPlanningTask] = useState<Task | null>(null);
  const [plannedEvents, setPlannedEvents] = useState<PlannedEvent[]>([]);
  const [celebrate, setCelebrate] = useState(false);
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  const { projects, reloadProjects, createProject, confirmDeleteProject } =
    useTaskProjects();

  const unlinkTasksFromProject = useCallback((projectId: string) => {
    setTasks((current) =>
      current.map((task) =>
        task.projectId === projectId ? { ...task, projectId: null } : task,
      ),
    );
  }, []);

  const load = useCallback(
    async (refresh = false) => {
      const requestId = loadRequestIdRef.current + 1;
      loadRequestIdRef.current = requestId;
      refresh ? setIsRefreshing(true) : setIsLoading(true);
      setError(null);

      try {
        const [nextTasks, nextPlannedEvents] = await Promise.all([
          fetchTasks(),
          fetchPlannedEvents({ sourceType: "task" }),
          reloadProjects(),
        ]);
        if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
          return;
        }
        setTasks(nextTasks);
        setPlannedEvents(nextPlannedEvents);
      } catch (loadError) {
        if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
          return;
        }
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load tasks.",
        );
      } finally {
        if (isMountedRef.current && requestId === loadRequestIdRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [reloadProjects],
  );

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
  const plannedEventsByTaskId = useMemo(() => {
    const map = new Map<string, PlannedEvent>();
    for (const event of plannedEvents) {
      if (event.sourceType === "task") map.set(event.sourceId, event);
    }
    return map;
  }, [plannedEvents]);

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
    const targetTask = editingTask;
    const saved = editingTask
      ? await updateTask(editingTask.id, input)
      : await createTask(input);
    const existingPlan = targetTask
      ? plannedEventsByTaskId.get(targetTask.id)
      : null;
    if (!isMountedRef.current) return;

    setTasks((current) =>
      targetTask
        ? current.map((task) => (task.id === saved.id ? saved : task))
        : [...current, saved],
    );
    if (existingPlan) {
      const result = await upsertPlannedEvent({
        dateKey: existingPlan.date,
        endTime: existingPlan.endTime,
        sourceId: saved.id,
        sourceType: "task",
        startTime: existingPlan.startTime,
        timeZone: null,
        title: saved.name,
      });
      if (!isMountedRef.current) return;
      setPlannedEvents((current) =>
        current.map((event) =>
          event.id === result.event.id ? result.event : event,
        ),
      );
    }
    setFormOpen(false);
    setEditingTask(null);
    void reloadProjects();
  };

  const toggleComplete = async (task: Task) => {
    setActionTask(null);
    if (updatingId) return;

    setUpdatingId(task.id);
    setError(null);
    try {
      const { nextTask, task: updated } = await updateTaskCompletion(
        task,
        task.completedAt ? null : todayDateKey(),
      );
      if (!isMountedRef.current) return;
      if (!task.completedAt && updated.completedAt) {
        playSuccessHaptic();
        setCelebrate(true);
      } else {
        playSelectionHaptic();
      }
      setTasks((current) =>
        [
          ...current.map((item) => (item.id === updated.id ? updated : item)),
          nextTask,
        ].filter((item): item is Task => Boolean(item)),
      );
      void reloadProjects();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "Could not update task.",
      );
    } finally {
      if (isMountedRef.current) setUpdatingId(null);
    }
  };

  const openPlanTask = (task: Task) => {
    setActionTask(null);
    setPlanningTask(task);
  };

  const saveTaskPlan = async ({
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
    if (!planningTask) return;
    const taskId = planningTask.id;
    const taskName = planningTask.name;

    const result = await upsertPlannedEvent({
      dateKey,
      endTime,
      sourceId: taskId,
      sourceType: "task",
      startTime,
      timeZone,
      title: taskName,
    });
    if (!isMountedRef.current || planningTask?.id !== taskId) return;
    setPlannedEvents((current) => {
      const filtered = current.filter(
        (event) => event.sourceType !== "task" || event.sourceId !== taskId,
      );
      return [...filtered, result.event];
    });
  };

  const clearTaskPlan = async (task: Task) => {
    setActionTask(null);

    try {
      await deletePlannedEvent({ sourceId: task.id, sourceType: "task" });
      if (!isMountedRef.current) return;
      setPlannedEvents((current) =>
        current.filter(
          (event) => event.sourceType !== "task" || event.sourceId !== task.id,
        ),
      );
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : "Could not clear task plan.",
      );
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
            if (!isMountedRef.current) return;
            setTasks((current) =>
              current.filter((item) => item.id !== task.id),
            );
            setPlannedEvents((current) =>
              current.filter(
                (event) =>
                  event.sourceType !== "task" || event.sourceId !== task.id,
              ),
            );
            void reloadProjects();
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
          canCancelContentTouches={false}
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
            <Stat label="Due today" value={todayCount} accent={theme.primary} />
            <Stat label="Done today" value={completedCount} accent="#527B65" />
          </View>

          <ProjectProgressCard
            projects={projects}
            onDeleteProject={(project) =>
              confirmDeleteProject(project, unlinkTasksFromProject)
            }
          />

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
              <FloatingLogoLoader />
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
        projects={projects}
        onCreateProject={createProject}
        onClose={() => {
          setFormOpen(false);
          setEditingTask(null);
        }}
        onSave={saveTask}
      />
      <TaskActionsModal
        task={actionTask}
        plannedEvent={
          actionTask ? plannedEventsByTaskId.get(actionTask.id) : null
        }
        onClose={() => setActionTask(null)}
        onClearPlan={clearTaskPlan}
        onDelete={confirmDelete}
        onEdit={openEdit}
        onPlan={openPlanTask}
        onToggle={toggleComplete}
      />
      <TaskPlanModal
        existingPlan={
          planningTask ? plannedEventsByTaskId.get(planningTask.id) : null
        }
        task={planningTask}
        onClose={() => setPlanningTask(null)}
        onSave={saveTaskPlan}
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
      ? theme.primary
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
      {hasTasks ? (
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
            No tasks found
          </Text>
          <Text
            style={[styles.emptyDescription, { color: theme.textSecondary }]}
          >
            Try a different search or filter.
          </Text>
        </>
      ) : (
        <BrandedEmptyState
          title="Create your first task"
          description="Choose what matters, set the urgency, and clear it."
        />
      )}
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
  pressed: { opacity: 0.72 },
});
