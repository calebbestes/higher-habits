"use client";

import {
  type Task,
  fetchTasks,
  getTaskImportanceScore,
  getTaskPriorityLevel,
  getTaskUrgency,
  getTaskUrgencyScore,
  todayDateKey,
  updateTask,
} from "@/lib/tasks-client";
import { addToast, cn } from "@heroui/react";
import { Icon } from "@iconify/react";
import { useEffect, useMemo, useState } from "react";

const taskToInput = (task: Task) => ({
  name: task.name,
  importance: task.importance,
  dueDate: task.dueDate,
  completedAt: task.completedAt,
  timeRequired: task.timeRequired,
});

const compareTasksByPriority = (a: Task, b: Task, today: string) => {
  const priorityCompare =
    getTaskPriorityLevel(b, today) - getTaskPriorityLevel(a, today);
  if (priorityCompare !== 0) return priorityCompare;

  const importanceCompare =
    getTaskImportanceScore(b.importance) - getTaskImportanceScore(a.importance);
  if (importanceCompare !== 0) return importanceCompare;

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
};

export function TopTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [updatingTaskIds, setUpdatingTaskIds] = useState<Set<string>>(
    new Set(),
  );
  const today = useMemo(() => todayDateKey(), []);

  useEffect(() => {
    let cancelled = false;

    fetchTasks()
      .then((nextTasks) => {
        if (!cancelled) setTasks(nextTasks);
      })
      .catch((error) => {
        if (cancelled) return;
        addToast({
          title: "Could not load tasks",
          description:
            error instanceof Error
              ? error.message
              : "We couldn't load your top tasks.",
          color: "warning",
        });
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const topTasks = useMemo(
    () =>
      tasks
        .filter((task) => task.completedAt === null)
        .sort((a, b) => compareTasksByPriority(a, b, today))
        .slice(0, 10),
    [tasks, today],
  );

  const completeTask = (task: Task) => {
    const previousTask = task;
    const nextTask = { ...task, completedAt: today };

    setTasks((previous) =>
      previous.map((item) => (item.id === task.id ? nextTask : item)),
    );
    setUpdatingTaskIds((previous) => new Set(previous).add(task.id));

    void updateTask(task.id, taskToInput(nextTask))
      .then((savedTask) => {
        setTasks((previous) =>
          previous.map((item) => (item.id === savedTask.id ? savedTask : item)),
        );
      })
      .catch((error) => {
        setTasks((previous) =>
          previous.map((item) =>
            item.id === previousTask.id ? previousTask : item,
          ),
        );
        addToast({
          title: "Could not complete task",
          description: error instanceof Error ? error.message : undefined,
          color: "danger",
        });
      })
      .finally(() => {
        setUpdatingTaskIds((previous) => {
          const next = new Set(previous);
          next.delete(task.id);
          return next;
        });
      });
  };

  return (
    <main className="mx-auto flex h-full w-full max-w-3xl flex-col px-3 py-5 sm:px-6 sm:py-8">
      <header className="mb-4 flex items-center gap-3">
        <h1 className="text-2xl font-semibold text-foreground sm:text-3xl">
          Top Tasks
        </h1>
        <span className="ml-auto rounded-full bg-default-100 px-3 py-1 text-xs font-semibold tabular-nums text-foreground-500">
          {topTasks.length}/10
        </span>
      </header>

      <section aria-label="Top tasks" className="space-y-2">
        {isLoading ? (
          <div className="flex min-h-20 items-center gap-3 rounded-xl border border-default-200/60 bg-content1/50 px-4 text-sm text-foreground-400">
            <Icon icon="mdi:loading" className="h-5 w-5 animate-spin" />
            Loading tasks
          </div>
        ) : topTasks.length > 0 ? (
          topTasks.map((task) => {
            const isUpdating = updatingTaskIds.has(task.id);

            return (
              <button
                type="button"
                key={task.id}
                onClick={() => completeTask(task)}
                disabled={isUpdating}
                aria-label={`Complete ${task.name}`}
                className="group flex min-h-20 w-full items-center gap-3 rounded-xl border border-default-200/70 bg-content1/50 px-4 py-3 text-left transition-colors hover:border-default-300 hover:bg-default-100/70 disabled:cursor-wait sm:min-h-24 sm:px-5"
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-foreground-400/60 text-transparent transition-colors group-hover:border-success-500/70",
                    isUpdating && "border-foreground-300 text-foreground-400",
                  )}
                >
                  <Icon
                    icon={isUpdating ? "mdi:loading" : "mdi:check"}
                    className={cn("h-4 w-4", isUpdating && "animate-spin")}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-medium text-foreground sm:text-lg">
                    {task.name}
                  </span>
                  {task.timeRequired ? (
                    <span className="mt-0.5 block text-sm text-foreground-400">
                      {task.timeRequired}
                    </span>
                  ) : null}
                </span>
              </button>
            );
          })
        ) : (
          <div className="flex min-h-32 flex-col items-center justify-center rounded-xl border border-dashed border-default-200/70 px-5 text-center text-foreground-400">
            <Icon icon="mdi:check-circle-outline" className="mb-2 h-7 w-7" />
            <p className="text-sm font-medium">No active tasks</p>
          </div>
        )}
      </section>
    </main>
  );
}
