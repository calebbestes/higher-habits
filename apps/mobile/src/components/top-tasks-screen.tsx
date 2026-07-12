import { FloatingLogoLoader } from "@/components/floating-logo-loader";
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

import { BrandedEmptyState } from "@/components/branded-empty-state";
import {
  CelebrationOverlay,
  confettiSource,
} from "@/components/celebration-overlay";
import { PlanReportHeaderMenu } from "@/components/plan-report-header-menu";
import { ProjectProgressCard } from "@/components/tasks/project-progress";
import { TaskActionsModal } from "@/components/tasks/task-actions-modal";
import { TaskFormModal } from "@/components/tasks/task-form-modal";
import { TaskPlanModal } from "@/components/tasks/task-plan-modal";
import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTaskProjects } from "@/hooks/use-task-projects";
import { useTheme } from "@/hooks/use-theme";
import {
  type PlannedEvent,
  deletePlannedEvent,
  fetchPlannedEvents,
  upsertPlannedEvent,
} from "@/lib/planned-events-client";
import {
  type Task,
  type TaskInput,
  compareTasksByPriority,
  createTask,
  deleteTask,
  fetchTasks,
  getTaskImportanceScore,
  getTaskUrgency,
  todayDateKey,
  updateTask,
  updateTaskCompletion,
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
  Medium: "#B87D4D",
  Low: "#A0A0A0",
};

const URGENCY_COLOR: Record<string, string> = {
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
  const [planningTask, setPlanningTask] = useState<Task | null>(null);
  const [plannedEvents, setPlannedEvents] = useState<PlannedEvent[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [celebrate, setCelebrate] = useState(false);

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
      refresh ? setIsRefreshing(true) : setIsLoading(true);
      setError(null);
      try {
        const [fetched, nextPlannedEvents] = await Promise.all([
          fetchTasks(),
          fetchPlannedEvents({ sourceType: "task" }),
          reloadProjects(),
        ]);
        setTasks(fetched);
        setPlannedEvents(nextPlannedEvents);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load tasks.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [reloadProjects],
  );

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
  const plannedEventsByTaskId = useMemo(() => {
    const map = new Map<string, PlannedEvent>();
    for (const event of plannedEvents) {
      if (event.sourceType === "task") map.set(event.sourceId, event);
    }
    return map;
  }, [plannedEvents]);

  const handleComplete = useCallback(
    async (task: Task) => {
      if (completingIds.has(task.id)) return;

      const previous = task;
      const newCompletedAt = task.completedAt ? null : today;
      const next = { ...task, completedAt: newCompletedAt };

      setCompletingIds((prev) => new Set(prev).add(task.id));
      setTasks((prev) => prev.map((t) => (t.id === task.id ? next : t)));

      try {
        const { nextTask, task: saved } = await updateTaskCompletion(
          task,
          newCompletedAt,
        );
        if (!task.completedAt && saved.completedAt) {
          setCelebrate(true);
        }
        setTasks((prev) =>
          [
            ...prev.map((t) => (t.id === saved.id ? saved : t)),
            nextTask,
          ].filter((item): item is Task => Boolean(item)),
        );
        void reloadProjects();
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
    [completingIds, today, reloadProjects],
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
    const existingPlan = editingTask
      ? plannedEventsByTaskId.get(editingTask.id)
      : null;

    setTasks((current) =>
      editingTask
        ? current.map((t) => (t.id === saved.id ? saved : t))
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

    const result = await upsertPlannedEvent({
      dateKey,
      endTime,
      sourceId: planningTask.id,
      sourceType: "task",
      startTime,
      timeZone,
      title: planningTask.name,
    });
    setPlannedEvents((current) => {
      const filtered = current.filter(
        (event) =>
          event.sourceType !== "task" || event.sourceId !== planningTask.id,
      );
      return [...filtered, result.event];
    });
  };

  const clearTaskPlan = async (task: Task) => {
    setActionTask(null);

    try {
      await deletePlannedEvent({ sourceId: task.id, sourceType: "task" });
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
            setTasks((current) => current.filter((t) => t.id !== task.id));
            setPlannedEvents((current) =>
              current.filter(
                (event) =>
                  event.sourceType !== "task" || event.sourceId !== task.id,
              ),
            );
            void reloadProjects();
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

          {/* Project progress */}
          <ProjectProgressCard
            projects={projects}
            onDeleteProject={(project) =>
              confirmDeleteProject(project, unlinkTasksFromProject)
            }
          />

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
              <FloatingLogoLoader />
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
        plannedEvent={
          actionTask ? plannedEventsByTaskId.get(actionTask.id) : null
        }
        onClose={() => setActionTask(null)}
        onClearPlan={clearTaskPlan}
        onEdit={openEdit}
        onDelete={confirmDelete}
        onPlan={openPlanTask}
        onToggle={(task) => void handleComplete(task)}
      />
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
      <TaskPlanModal
        existingPlan={
          planningTask ? plannedEventsByTaskId.get(planningTask.id) : null
        }
        task={planningTask}
        onClose={() => setPlanningTask(null)}
        onSave={saveTaskPlan}
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
      <CelebrationOverlay
        visible={celebrate}
        source={confettiSource}
        withLogo
        onDone={() => setCelebrate(false)}
      />
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
  const urgencyColor =
    urgency === "today"
      ? theme.primary
      : (URGENCY_COLOR[urgency] ?? "transparent");
  const importanceColor =
    task.importance === "High"
      ? theme.primary
      : (IMPORTANCE_COLOR[task.importance] ?? theme.textSecondary);
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
  return (
    <View style={styles.centerState}>
      <BrandedEmptyState
        title="No active tasks"
        description="All caught up! Add new tasks to get started."
      />
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
});
