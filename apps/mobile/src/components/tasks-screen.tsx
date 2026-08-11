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
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BrandedEmptyState } from "@/components/branded-empty-state";
import {
  CelebrationOverlay,
  confettiSource,
} from "@/components/celebration-overlay";
import {
  CreateSectionHeaderTabs,
  PageHeaderTitle,
} from "@/components/section-header-tabs";
import { ProjectProgressCard } from "@/components/tasks/project-progress";
import { TaskActionsModal } from "@/components/tasks/task-actions-modal";
import { TaskFormModal } from "@/components/tasks/task-form-modal";
import { TaskPlanModal } from "@/components/tasks/task-plan-modal";
import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTaskProjects } from "@/hooks/use-task-projects";
import { useTheme } from "@/hooks/use-theme";
import {
  getCachedData,
  isCacheFresh,
  setCachedData,
} from "@/lib/app-data-cache";
import { playSelectionHaptic, playSuccessHaptic } from "@/lib/haptics";
import {
  type PlannedEvent,
  deletePlannedEvent,
  fetchPlannedEvents,
  upsertPlannedEvent,
} from "@/lib/planned-events-client";
import {
  type Task,
  type TaskInput,
  createTask,
  deleteTask,
  fetchTasks,
  getTaskUrgency,
  getTaskUrgencyScore,
  todayDateKey,
  updateTask,
  updateTaskCompletion,
} from "@/lib/tasks-client";

type SymbolName = SymbolViewProps["name"];
type TaskPriorityGroupKey = "high" | "medium" | "low" | "completed";

const TASKS_SCREEN_CACHE_KEY = "screen:tasks";

type TasksScreenCache = {
  plannedEvents: PlannedEvent[];
  tasks: Task[];
};

function symbol(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function getPriorityGroup(
  task: Task,
): Exclude<TaskPriorityGroupKey, "completed"> {
  if (task.importance === "High") return "high";
  if (task.importance === "Medium") return "medium";
  return "low";
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

function compareTasksByUrgency(a: Task, b: Task, today: string): number {
  const urgencyCompare =
    getTaskUrgencyScore(getTaskUrgency(b, today)) -
    getTaskUrgencyScore(getTaskUrgency(a, today));
  if (urgencyCompare !== 0) return urgencyCompare;

  const aDueDate = a.dueDate ?? "9999-99-99";
  const bDueDate = b.dueDate ?? "9999-99-99";
  const dueDateCompare = aDueDate < bDueDate ? -1 : aDueDate > bDueDate ? 1 : 0;
  if (dueDateCompare !== 0) return dueDateCompare;

  const createdCompare = b.createdAt.localeCompare(a.createdAt);
  return createdCompare !== 0 ? createdCompare : a.name.localeCompare(b.name);
}

export function TasksScreen() {
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();
  const cachedScreen = getCachedData<TasksScreenCache>(TASKS_SCREEN_CACHE_KEY);
  const [tasks, setTasks] = useState<Task[]>(cachedScreen?.data.tasks ?? []);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(!cachedScreen);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [actionTask, setActionTask] = useState<Task | null>(null);
  const [planningTask, setPlanningTask] = useState<Task | null>(null);
  const [plannedEvents, setPlannedEvents] = useState<PlannedEvent[]>(
    cachedScreen?.data.plannedEvents ?? [],
  );
  const [celebrate, setCelebrate] = useState(false);
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const plannedEventsRef = useRef<PlannedEvent[]>(
    cachedScreen?.data.plannedEvents ?? [],
  );
  const tasksRef = useRef<Task[]>(cachedScreen?.data.tasks ?? []);

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  const writeTasksCache = useCallback(
    (
      nextTasks = tasksRef.current,
      nextPlannedEvents = plannedEventsRef.current,
    ) => {
      tasksRef.current = nextTasks;
      plannedEventsRef.current = nextPlannedEvents;
      setCachedData(TASKS_SCREEN_CACHE_KEY, {
        plannedEvents: nextPlannedEvents,
        tasks: nextTasks,
      });
    },
    [],
  );

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    plannedEventsRef.current = plannedEvents;
  }, [plannedEvents]);

  const { projects, reloadProjects, createProject, confirmDeleteProject } =
    useTaskProjects();

  const unlinkTasksFromProject = useCallback((projectId: string) => {
    setSelectedProjectId((current) => (current === projectId ? null : current));
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
      const cached = getCachedData<TasksScreenCache>(TASKS_SCREEN_CACHE_KEY);
      if (!refresh && cached) {
        tasksRef.current = cached.data.tasks;
        plannedEventsRef.current = cached.data.plannedEvents;
        setTasks(cached.data.tasks);
        setPlannedEvents(cached.data.plannedEvents);
        setIsLoading(false);
        if (isCacheFresh(cached)) {
          void reloadProjects();
          return;
        }
      }
      refresh ? setIsRefreshing(true) : setIsLoading(!cached);
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
        writeTasksCache(nextTasks, nextPlannedEvents);
        setTasks(nextTasks);
        setPlannedEvents(nextPlannedEvents);
      } catch (loadError) {
        if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
          return;
        }
        if (!cached) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load tasks.",
          );
        }
      } finally {
        if (isMountedRef.current && requestId === loadRequestIdRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [reloadProjects, writeTasksCache],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const visibleTasks = useMemo(() => {
    return tasks.filter((task) => {
      if (selectedProjectId && task.projectId !== selectedProjectId) {
        return false;
      }
      return true;
    });
  }, [selectedProjectId, tasks]);

  useEffect(() => {
    const selectedProject = selectedProjectId
      ? projects.find((project) => project.id === selectedProjectId)
      : null;
    if (
      selectedProjectId &&
      (!selectedProject ||
        selectedProject.totalTasks <= selectedProject.completedTasks)
    ) {
      setSelectedProjectId(null);
    }
  }, [projects, selectedProjectId]);

  const groups = useMemo(() => {
    const today = todayDateKey();
    const active = visibleTasks.filter((task) => !task.completedAt);
    const completed = visibleTasks
      .filter((task) => task.completedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const priorityGroups = (
      [
        ["high", "High priority"],
        ["medium", "Medium priority"],
        ["low", "Low priority"],
      ] as const
    )
      .map(([key, label]) => ({
        key,
        label,
        tasks: active
          .filter((task) => getPriorityGroup(task) === key)
          .sort((a, b) => compareTasksByUrgency(a, b, today)),
      }))
      .filter((group) => group.tasks.length);

    return completed.length
      ? [
          ...priorityGroups,
          {
            key: "completed" as const,
            label: "Completed",
            tasks: completed,
          },
        ]
      : priorityGroups;
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

    setTasks((current) => {
      const nextTasks = targetTask
        ? current.map((task) => (task.id === saved.id ? saved : task))
        : [...current, saved];
      writeTasksCache(nextTasks);
      return nextTasks;
    });
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
      setPlannedEvents((current) => {
        const nextPlannedEvents = current.map((event) =>
          event.id === result.event.id ? result.event : event,
        );
        writeTasksCache(undefined, nextPlannedEvents);
        return nextPlannedEvents;
      });
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
      setTasks((current) => {
        const nextTasks = [
          ...current.map((item) => (item.id === updated.id ? updated : item)),
          nextTask,
        ].filter((item): item is Task => Boolean(item));
        writeTasksCache(nextTasks);
        return nextTasks;
      });
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
      const nextPlannedEvents = [...filtered, result.event];
      writeTasksCache(undefined, nextPlannedEvents);
      return nextPlannedEvents;
    });
  };

  const clearTaskPlan = async (task: Task) => {
    setActionTask(null);

    try {
      await deletePlannedEvent({ sourceId: task.id, sourceType: "task" });
      if (!isMountedRef.current) return;
      setPlannedEvents((current) => {
        const nextPlannedEvents = current.filter(
          (event) => event.sourceType !== "task" || event.sourceId !== task.id,
        );
        writeTasksCache(undefined, nextPlannedEvents);
        return nextPlannedEvents;
      });
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
            setTasks((current) => {
              const nextTasks = current.filter((item) => item.id !== task.id);
              const nextPlannedEvents = plannedEvents.filter(
                (event) =>
                  event.sourceType !== "task" || event.sourceId !== task.id,
              );
              writeTasksCache(nextTasks, nextPlannedEvents);
              return nextTasks;
            });
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
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.headerIdentity}>
              <View style={styles.headerText}>
                <PageHeaderTitle title="Create" />
                <CreateSectionHeaderTabs currentSection="tasks" />
              </View>
            </View>
            <Pressable
              accessibilityLabel="Add task"
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

          <ProjectProgressCard
            projects={projects}
            selectedProjectId={selectedProjectId}
            onDeleteProject={(project) =>
              confirmDeleteProject(project, unlinkTasksFromProject)
            }
            onSelectProject={(project) =>
              setSelectedProjectId((current) =>
                project === null || current === project.id ? null : project.id,
              )
            }
          />

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
                  <View
                    style={[
                      styles.taskList,
                      { borderTopColor: theme.tabBorder },
                    ]}
                  >
                    {group.tasks.map((task) => (
                      <TaskCard
                        key={task.id}
                        isUpdating={updatingId === task.id}
                        task={task}
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

function TaskCard({
  isUpdating,
  onMore,
  onToggle,
  task,
}: {
  isUpdating: boolean;
  onMore: () => void;
  onToggle: () => void;
  task: Task;
}) {
  const theme = useTheme();
  const completed = Boolean(task.completedAt);

  return (
    <Pressable
      accessibilityLabel={
        completed ? `Reopen ${task.name}` : `Complete ${task.name}`
      }
      accessibilityRole="button"
      disabled={isUpdating}
      onPress={onToggle}
      style={({ pressed }) => [
        styles.taskCard,
        {
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
            borderColor: completed ? theme.primary : `${theme.textSecondary}4D`,
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
        {task.dueDate ? (
          <View style={styles.taskMetadata}>
            <Text style={[styles.metadataText, { color: theme.textSecondary }]}>
              {formatDueDate(task.dueDate)}
            </Text>
          </View>
        ) : null}
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
              name={symbol("line.3.horizontal.decrease.circle", "tune")}
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
            Try a different project.
          </Text>
        </>
      ) : (
        <BrandedEmptyState
          title="Create your first task"
          description="Tasks are specific actions you can finish. Lists organize related tasks—like Groceries or Finances."
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
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
    gap: 14,
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
  headerText: { flex: 1, minWidth: 0, gap: 1 },
  headerIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  title: {
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "700",
  },
  description: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  addButton: {
    width: 36,
    height: 36,
    maxWidth: 36,
    maxHeight: 36,
    minWidth: 36,
    minHeight: 36,
    flexGrow: 0,
    flexShrink: 0,
    alignSelf: "flex-start",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
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
  groups: { gap: 18 },
  group: { gap: 6 },
  groupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 3,
  },
  groupTitle: { fontSize: 22, lineHeight: 27, fontWeight: "700" },
  groupCount: { fontSize: 17, lineHeight: 22, fontWeight: "500" },
  taskList: {
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  taskCard: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 11,
  },
  checkButton: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.25,
    borderRadius: 13,
  },
  taskBody: { flex: 1, minWidth: 0, gap: 4 },
  taskName: { fontSize: 17, lineHeight: 22, fontWeight: "600" },
  completedName: { textDecorationLine: "line-through" },
  taskMetadata: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 5,
  },
  metadataText: { fontSize: 13, lineHeight: 17, fontWeight: "400" },
  moreButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
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
