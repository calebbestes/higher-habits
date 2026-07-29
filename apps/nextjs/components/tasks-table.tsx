"use client";

import {
  TASK_IMPORTANCES,
  TASK_RECURRENCES,
  TASK_URGENCIES,
  type Task,
  type TaskInput,
  type TaskUrgency,
  createTask,
  deleteManyTasks,
  fetchTasks,
  getTaskDueDateForUrgency,
  getTaskImportanceScore,
  getTaskPriorityLevel,
  getTaskUrgency,
  getTaskUrgencyScore,
  taskToInput,
  todayDateKey,
  updateTask,
  updateTaskCompletion,
} from "@/lib/tasks-client";
import {
  Button,
  Chip,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownTrigger,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Pagination,
  Select,
  SelectItem,
  type Selection,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tooltip,
  addToast,
  cn,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { SettingsLink } from "@/components/settings-link";

type SortDescriptor = {
  column: string;
  direction: "ascending" | "descending";
};

const COLUMNS = [
  { name: "Name", uid: "name", sortable: true },
  { name: "Priority", uid: "priority", sortable: true },
  { name: "Importance", uid: "importance", sortable: true },
  { name: "Urgency", uid: "urgency", sortable: true },
  { name: "Due Date", uid: "dueDate", sortable: true },
  { name: "Time", uid: "timeRequired", sortable: true },
  { name: "Date Created", uid: "createdAt", sortable: true },
  { name: "", uid: "actions", sortable: false },
] as const;

const TIME_REQUIRED_OPTIONS = ["~30 min", "~1 hr", "Multiple hours"] as const;

const TIME_REQUIRED_RANK: Record<string, number> = {
  "~30 min": 0,
  "~1 hr": 1,
  "Multiple hours": 2,
};

const IMPORTANCE_COLORS: Record<string, string> = {
  High: "bg-rose-500/15 text-rose-600",
  Medium: "bg-amber-500/15 text-amber-600",
  Low: "bg-default-200 text-foreground-500",
};

const URGENCY_COLORS: Record<string, string> = {
  today: "bg-rose-500/15 text-rose-600",
  soon: "bg-amber-500/15 text-amber-600",
  later: "bg-default-200 text-foreground-500",
};

const TIME_REQUIRED_COLORS: Record<string, string> = {
  "~30 min": "bg-teal-500/15 text-teal-600",
  "~1 hr": "bg-blue-500/15 text-blue-600",
  "Multiple hours": "bg-orange-500/15 text-orange-600",
};

const EMPTY_FORM: TaskInput = {
  name: "",
  importance: "Medium",
  dueDate: null,
  completedAt: null,
  timeRequired: "~1 hr",
  recurrence: "none",
  recurrenceWeekday: null,
  recurrenceMonthDay: null,
};

function formatCreatedAt(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function formatUrgency(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatPriorityLevel(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function priorityLevelColor(value: number): string {
  if (value >= 2.5) {
    return "bg-rose-500/15 text-rose-600";
  }

  if (value >= 1.5) {
    return "bg-amber-500/15 text-amber-600";
  }

  return "bg-default-200 text-foreground-500";
}

function TopContent({
  filterValue,
  onClear,
  onSearchChange,
  displayCount,
  onRowsPerPageChange,
  refetch,
  onAddNew,
}: {
  filterValue: string;
  onClear: () => void;
  onSearchChange: (v: string) => void;
  displayCount: number;
  onRowsPerPageChange: (n: number) => void;
  refetch: () => void;
  onAddNew: () => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Input
            isClearable
            className="w-52 sm:w-72"
            placeholder="Search tasks..."
            startContent={
              <Icon
                icon="fa7-solid:magnifying-glass"
                className="h-3.5 w-3.5 text-foreground-400"
              />
            }
            value={filterValue}
            onClear={onClear}
            onValueChange={onSearchChange}
            size="sm"
            radius="lg"
          />
          <span className="hidden text-xs text-foreground-400 sm:block">
            {displayCount} task{displayCount !== 1 ? "s" : ""}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Tooltip content="Refresh" color="foreground">
            <Button
              isIconOnly
              variant="flat"
              size="sm"
              onPress={() => refetch()}
            >
              <Icon icon="fa7-solid:rotate-right" className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>

          <Button
            color="primary"
            size="sm"
            startContent={
              <Icon icon="fa7-solid:plus" className="h-3.5 w-3.5" />
            }
            onPress={onAddNew}
          >
            Add Task
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-end">
        <Select
          aria-label="Rows per page"
          size="sm"
          className="w-32"
          defaultSelectedKeys={["24"]}
          onSelectionChange={(keys) => {
            const val = Number([...keys][0]);
            if (!Number.isNaN(val)) onRowsPerPageChange(val);
          }}
        >
          {[24, 48, 96].map((n) => (
            <SelectItem key={String(n)}>{String(n)} / page</SelectItem>
          ))}
        </Select>
      </div>
    </div>
  );
}

function BottomContent({
  page,
  pages,
  setPage,
}: {
  page: number;
  pages: number;
  setPage: (n: number) => void;
}) {
  if (pages <= 1) return null;

  return (
    <div className="flex justify-center py-2">
      <Pagination
        isCompact
        showControls
        showShadow={false}
        color="primary"
        page={page}
        total={pages}
        onChange={setPage}
      />
    </div>
  );
}

function TaskFormModal({
  isOpen,
  task,
  onClose,
  onSave,
  isSaving,
}: {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onSave: (input: TaskInput) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<TaskInput>(
    task ? taskToInput(task) : EMPTY_FORM,
  );

  useEffect(() => {
    if (isOpen) {
      setForm(task ? taskToInput(task) : EMPTY_FORM);
    }
  }, [isOpen, task]);

  const set = (field: keyof TaskInput) => (v: string) =>
    setForm((prev) => ({ ...prev, [field]: v }));

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      size="lg"
      placement="center"
    >
      <ModalContent>
        <ModalHeader>{task ? "Edit Task" : "New Task"}</ModalHeader>
        <ModalBody className="gap-4 pb-2">
          <Input
            label="Name"
            placeholder="What needs doing?"
            value={form.name}
            onValueChange={set("name")}
            isRequired
            autoFocus
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Importance"
              placeholder="Select importance"
              selectedKeys={
                form.importance ? new Set([form.importance]) : new Set()
              }
              onSelectionChange={(keys) =>
                set("importance")(([...keys][0] as string) ?? "")
              }
            >
              {TASK_IMPORTANCES.map((importance) => (
                <SelectItem key={importance}>{importance}</SelectItem>
              ))}
            </Select>
            <Input
              label="Due Date"
              type="date"
              value={form.dueDate ?? ""}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  dueDate: value || null,
                }))
              }
              description="Used to calculate urgency."
            />
            <Select
              label="Time Required"
              placeholder="Select time"
              selectedKeys={
                form.timeRequired ? new Set([form.timeRequired]) : new Set()
              }
              onSelectionChange={(keys) =>
                set("timeRequired")(([...keys][0] as string) ?? "")
              }
            >
              {TIME_REQUIRED_OPTIONS.map((time) => (
                <SelectItem key={time}>{time}</SelectItem>
              ))}
            </Select>
            <Select
              label="Repeat"
              placeholder="Select repeat"
              selectedKeys={
                form.recurrence ? new Set([form.recurrence]) : new Set()
              }
              onSelectionChange={(keys) =>
                setForm((prev) => ({
                  ...prev,
                  recurrence:
                    ([...keys][0] as TaskInput["recurrence"]) ?? "none",
                }))
              }
            >
              {TASK_RECURRENCES.map((recurrence) => (
                <SelectItem key={recurrence.value}>
                  {recurrence.label}
                </SelectItem>
              ))}
            </Select>
            <Input
              label="Date Completed"
              type="date"
              value={form.completedAt ?? ""}
              onValueChange={(value) =>
                setForm((prev) => ({
                  ...prev,
                  completedAt: value || null,
                }))
              }
              description="Completed tasks older than today are hidden."
            />
          </div>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>
            Cancel
          </Button>
          <Button
            color="primary"
            isDisabled={!form.name.trim()}
            isLoading={isSaving}
            onPress={() => onSave({ ...form, name: form.name.trim() })}
          >
            {task ? "Save changes" : "Add task"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function DeleteModal({
  isOpen,
  count,
  onClose,
  onConfirm,
  isDeleting,
}: {
  isOpen: boolean;
  count: number;
  onClose: () => void;
  onConfirm: () => void;
  isDeleting: boolean;
}) {
  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(open) => !open && onClose()}
      size="sm"
      placement="center"
    >
      <ModalContent>
        <ModalHeader>
          Delete {count > 1 ? `${count} tasks` : "task"}
        </ModalHeader>
        <ModalBody>
          <p className="text-sm text-foreground-600">
            {count > 1
              ? `Are you sure you want to delete ${count} tasks? This cannot be undone.`
              : "Are you sure you want to delete this task? This cannot be undone."}
          </p>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>
            Cancel
          </Button>
          <Button color="danger" isLoading={isDeleting} onPress={onConfirm}>
            Delete
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

export function TasksTable() {
  const queryClient = useQueryClient();
  const today = todayDateKey();
  const {
    data = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["tasks", today],
    queryFn: fetchTasks,
  });

  const [filterValue, setFilterValue] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [rowsPerPage, setRowsPerPage] = useState(24);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "priority",
    direction: "descending",
  });
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingDeleteTask, setPendingDeleteTask] = useState<Task | null>(null);

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: TaskInput }) =>
      id ? updateTask(id, input) : createTask(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setFormOpen(false);
      setEditingTask(null);
      addToast({
        title: editingTask ? "Task updated" : "Task added",
        color: "success",
      });
    },
    onError: (err) => {
      addToast({
        title: "Could not save task",
        description: err instanceof Error ? err.message : undefined,
        color: "danger",
      });
    },
  });

  const inlineUpdateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: TaskInput }) =>
      updateTask(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err) => {
      addToast({
        title: "Could not update task",
        description: err instanceof Error ? err.message : undefined,
        color: "danger",
      });
    },
  });
  const completionMutation = useMutation({
    mutationFn: ({
      completedAt,
      task,
    }: {
      completedAt: string | null;
      task: Task;
    }) => updateTaskCompletion(task, completedAt),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
    },
    onError: (err) => {
      addToast({
        title: "Could not update task",
        description: err instanceof Error ? err.message : undefined,
        color: "danger",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => deleteManyTasks(ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tasks"] });
      setDeleteOpen(false);
      setPendingDeleteTask(null);
      setSelectedKeys(new Set());
      addToast({ title: "Deleted", color: "success" });
    },
    onError: (err) => {
      addToast({
        title: "Could not delete",
        description: err instanceof Error ? err.message : undefined,
        color: "danger",
      });
    },
  });

  const handleInlineUpdate = (
    id: string,
    field: keyof TaskInput,
    value: string | null,
  ) => {
    const task = data.find((item) => item.id === id);
    if (!task) return;

    if (field === "completedAt") {
      completionMutation.mutate({ completedAt: value, task });
      return;
    }

    inlineUpdateMutation.mutate({
      id,
      input: {
        ...taskToInput(task),
        [field]: value,
      },
    });
  };

  const filteredItems = useMemo(() => {
    if (!filterValue) return data;
    const re = new RegExp(
      filterValue.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"),
      "i",
    );

    return data.filter(
      (task) =>
        re.test(task.name) ||
        re.test(task.importance) ||
        re.test(task.dueDate ?? "") ||
        re.test(formatUrgency(getTaskUrgency(task, today))) ||
        re.test(String(getTaskPriorityLevel(task, today))) ||
        re.test(task.timeRequired),
    );
  }, [data, filterValue, today]);

  const sortedItems = useMemo(() => {
    const col = sortDescriptor.column;
    const dir = sortDescriptor.direction === "ascending" ? 1 : -1;

    return [...filteredItems].sort((a, b) => {
      let cmp = 0;

      if (col === "priority") {
        cmp = getTaskPriorityLevel(a, today) - getTaskPriorityLevel(b, today);
      } else if (col === "importance") {
        cmp =
          getTaskImportanceScore(a.importance) -
          getTaskImportanceScore(b.importance);
      } else if (col === "urgency") {
        cmp =
          getTaskUrgencyScore(getTaskUrgency(a, today)) -
          getTaskUrgencyScore(getTaskUrgency(b, today));
      } else if (col === "dueDate") {
        const av = a.dueDate ?? "9999-99-99";
        const bv = b.dueDate ?? "9999-99-99";
        cmp = av < bv ? -1 : av > bv ? 1 : 0;
      } else if (col === "timeRequired") {
        cmp =
          (TIME_REQUIRED_RANK[a.timeRequired] ?? 99) -
          (TIME_REQUIRED_RANK[b.timeRequired] ?? 99);
      } else {
        const av = String(a[col as keyof Task] ?? "").toLowerCase();
        const bv = String(b[col as keyof Task] ?? "").toLowerCase();
        cmp = av < bv ? -1 : av > bv ? 1 : 0;
      }

      if (cmp !== 0) return cmp * dir;

      const priorityCmp =
        getTaskPriorityLevel(b, today) - getTaskPriorityLevel(a, today);
      if (priorityCmp !== 0) return priorityCmp;

      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [filteredItems, sortDescriptor, today]);

  const pages = Math.max(1, Math.ceil(sortedItems.length / rowsPerPage));
  const tableItems = useMemo(
    () => sortedItems.slice((page - 1) * rowsPerPage, page * rowsPerPage),
    [sortedItems, page, rowsPerPage],
  );

  const selectedCount = useMemo(() => {
    if (selectedKeys === "all") return filteredItems.length;
    return (selectedKeys as Set<string>).size;
  }, [selectedKeys, filteredItems]);

  const selectedIds = useMemo<string[]>(() => {
    if (selectedKeys === "all") return filteredItems.map((task) => task.id);
    return [...(selectedKeys as Set<string>)].map(String);
  }, [selectedKeys, filteredItems]);

  const handleSelectionChange = (keys: Selection) => {
    if (keys === "all") {
      setSelectedKeys(new Set(filteredItems.map((task) => task.id)));
      return;
    }

    const nextKeys = new Set(keys as Set<string>);
    const pageIds = new Set(tableItems.map((task) => task.id));
    const merged = new Set(selectedKeys as Set<string>);

    for (const id of pageIds) {
      if (nextKeys.has(id)) merged.add(id);
      else merged.delete(id);
    }

    setSelectedKeys(merged);
  };

  const renderCell = (task: Task, columnKey: string) => {
    const isCompletedToday = task.completedAt === today;

    switch (columnKey) {
      case "name":
        return (
          <div className="flex flex-col gap-1">
            <span
              className={cn(
                "text-sm font-semibold",
                isCompletedToday && "text-foreground-400 line-through",
              )}
            >
              {task.name}
            </span>
            {isCompletedToday && (
              <span className="flex items-center gap-1 text-xs text-success-600">
                <Icon icon="fa7-solid:circle-check" className="h-3 w-3" />
                Completed today
              </span>
            )}
          </div>
        );
      case "priority":
        return (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
              priorityLevelColor(getTaskPriorityLevel(task, today)),
            )}
          >
            {formatPriorityLevel(getTaskPriorityLevel(task, today))}
          </span>
        );
      case "importance":
        return (
          <Dropdown placement="bottom-start">
            <DropdownTrigger>
              <button
                type="button"
                className="cursor-pointer rounded-full focus:outline-none"
                onClick={(event) => event.stopPropagation()}
              >
                {task.importance ? (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium hover:opacity-80",
                      IMPORTANCE_COLORS[task.importance] ??
                        "bg-default-200 text-foreground-500",
                    )}
                  >
                    {task.importance}
                  </span>
                ) : (
                  <span className="rounded-full px-2.5 py-0.5 text-xs text-foreground-300 hover:bg-default-100 hover:text-foreground-500">
                    Set importance
                  </span>
                )}
              </button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Importance"
              selectionMode="single"
              disallowEmptySelection={false}
              selectedKeys={
                task.importance ? new Set([task.importance]) : new Set()
              }
              onSelectionChange={(keys) => {
                const selected = [...keys][0];
                handleInlineUpdate(
                  task.id,
                  "importance",
                  selected ? String(selected) : "",
                );
              }}
            >
              {TASK_IMPORTANCES.map((importance) => (
                <DropdownItem key={importance}>{importance}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        );
      case "urgency": {
        const urgency = getTaskUrgency(task, today);
        return (
          <Dropdown placement="bottom-start">
            <DropdownTrigger>
              <button
                type="button"
                className="cursor-pointer rounded-full focus:outline-none"
                onClick={(event) => event.stopPropagation()}
              >
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium hover:opacity-80",
                    URGENCY_COLORS[urgency],
                  )}
                >
                  {formatUrgency(urgency)}
                </span>
              </button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Urgency"
              selectionMode="single"
              disallowEmptySelection={false}
              selectedKeys={new Set([urgency])}
              onSelectionChange={(keys) => {
                const selected = [...keys][0] as TaskUrgency | undefined;
                if (!selected) return;

                handleInlineUpdate(
                  task.id,
                  "dueDate",
                  getTaskDueDateForUrgency(selected, today),
                );
              }}
            >
              {TASK_URGENCIES.map((value) => (
                <DropdownItem key={value}>{formatUrgency(value)}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        );
      }
      case "dueDate":
        return (
          <input
            type="date"
            value={task.dueDate ?? ""}
            onChange={(event) =>
              handleInlineUpdate(task.id, "dueDate", event.target.value || null)
            }
            onClick={(event) => event.stopPropagation()}
            className="cursor-pointer bg-transparent text-sm text-foreground-600 outline-none [color-scheme:inherit] hover:text-foreground"
          />
        );
      case "timeRequired":
        return (
          <Dropdown placement="bottom-start">
            <DropdownTrigger>
              <button
                type="button"
                className="cursor-pointer rounded-full focus:outline-none"
                onClick={(event) => event.stopPropagation()}
              >
                {task.timeRequired ? (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium hover:opacity-80",
                      TIME_REQUIRED_COLORS[task.timeRequired] ??
                        "bg-default-200 text-foreground-500",
                    )}
                  >
                    {task.timeRequired}
                  </span>
                ) : (
                  <span className="rounded-full px-2.5 py-0.5 text-xs text-foreground-300 hover:bg-default-100 hover:text-foreground-500">
                    Set time
                  </span>
                )}
              </button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Time Required"
              selectionMode="single"
              disallowEmptySelection={false}
              selectedKeys={
                task.timeRequired ? new Set([task.timeRequired]) : new Set()
              }
              onSelectionChange={(keys) => {
                const selected = [...keys][0];
                handleInlineUpdate(
                  task.id,
                  "timeRequired",
                  selected ? String(selected) : "",
                );
              }}
            >
              {TIME_REQUIRED_OPTIONS.map((time) => (
                <DropdownItem key={time}>{time}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        );
      case "createdAt":
        return (
          <span className="text-sm text-foreground-600">
            {formatCreatedAt(task.createdAt)}
          </span>
        );
      case "actions":
        return (
          <div className="flex justify-end">
            <Dropdown>
              <DropdownTrigger>
                <Button isIconOnly size="sm" variant="light">
                  <Icon
                    icon="fa7-solid:ellipsis-vertical"
                    className="h-3.5 w-3.5"
                  />
                </Button>
              </DropdownTrigger>
              <DropdownMenu aria-label="Actions">
                <DropdownItem
                  key="edit"
                  startContent={
                    <Icon icon="fa7-solid:pen" className="h-3.5 w-3.5" />
                  }
                  onPress={() => {
                    setEditingTask(task);
                    setFormOpen(true);
                  }}
                >
                  Edit
                </DropdownItem>
                <DropdownItem
                  key={isCompletedToday ? "reopen" : "complete"}
                  startContent={
                    <Icon
                      icon={
                        isCompletedToday
                          ? "fa7-solid:rotate-left"
                          : "fa7-solid:circle-check"
                      }
                      className="h-3.5 w-3.5"
                    />
                  }
                  onPress={() =>
                    handleInlineUpdate(
                      task.id,
                      "completedAt",
                      isCompletedToday ? null : today,
                    )
                  }
                >
                  {isCompletedToday ? "Reopen" : "Complete today"}
                </DropdownItem>
                <DropdownItem
                  key="delete"
                  className="text-danger"
                  color="danger"
                  startContent={
                    <Icon icon="fa7-solid:trash-can" className="h-3.5 w-3.5" />
                  }
                  onPress={() => {
                    setPendingDeleteTask(task);
                    setDeleteOpen(true);
                  }}
                >
                  Delete
                </DropdownItem>
              </DropdownMenu>
            </Dropdown>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Icon icon="fa7-solid:list-check" className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Tasks</h1>
          <p className="text-xs text-foreground-500">
            Plan what matters and clear it daily
          </p>
        </div>
        <SettingsLink className="ml-auto" />
      </div>

      <TopContent
        filterValue={filterValue}
        onClear={() => {
          setFilterValue("");
          setPage(1);
        }}
        onSearchChange={(value) => {
          setFilterValue(value);
          setPage(1);
        }}
        displayCount={filteredItems.length}
        onRowsPerPageChange={(n) => {
          setRowsPerPage(n);
          setPage(1);
        }}
        refetch={refetch}
        onAddNew={() => {
          setEditingTask(null);
          setFormOpen(true);
        }}
      />

      <Table
        isHeaderSticky
        aria-label="Tasks table"
        selectionMode="multiple"
        selectedKeys={selectedKeys}
        onSelectionChange={handleSelectionChange}
        sortDescriptor={sortDescriptor}
        onSortChange={(desc) =>
          setSortDescriptor({
            column: String(desc.column),
            direction: desc.direction ?? "ascending",
          })
        }
        classNames={{
          wrapper: "min-h-[200px] rounded-2xl",
          th: "bg-default-100 text-foreground-500 text-xs uppercase tracking-wider",
        }}
      >
        <TableHeader columns={COLUMNS}>
          {(column) => (
            <TableColumn
              key={column.uid}
              allowsSorting={column.sortable}
              align={column.uid === "actions" ? "end" : "start"}
              width={column.uid === "actions" ? 60 : undefined}
            >
              {column.name}
            </TableColumn>
          )}
        </TableHeader>
        <TableBody
          items={tableItems}
          isLoading={isLoading}
          loadingContent={<Spinner />}
          emptyContent={
            <div className="py-12 text-center text-sm text-foreground-400">
              No tasks yet. Add one to get started.
            </div>
          }
        >
          {(task) => (
            <TableRow key={task.id}>
              {(columnKey) => (
                <TableCell>{renderCell(task, String(columnKey))}</TableCell>
              )}
            </TableRow>
          )}
        </TableBody>
      </Table>

      <BottomContent page={page} pages={pages} setPage={setPage} />

      {selectedCount > 0 && (
        <div className="fixed inset-x-4 bottom-6 z-50 flex items-center gap-3 rounded-2xl border border-divider bg-content1/95 px-4 py-3 shadow-xl backdrop-blur-sm sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-fit sm:min-w-[320px]">
          <Chip size="sm" variant="flat" color="primary">
            {selectedCount} friends selected
          </Chip>
          <div className="h-5 w-px bg-divider" />
          <Button
            color="danger"
            variant="flat"
            size="sm"
            startContent={
              <Icon icon="fa7-solid:trash-can" className="h-3.5 w-3.5" />
            }
            onPress={() => {
              setPendingDeleteTask(null);
              setDeleteOpen(true);
            }}
          >
            Delete
          </Button>
          <div className="h-5 w-px bg-divider" />
          <Tooltip content="Clear selection" color="foreground">
            <Button
              isIconOnly
              variant="light"
              size="sm"
              onPress={() => setSelectedKeys(new Set())}
            >
              <Icon icon="fa7-solid:xmark" className="h-3.5 w-3.5" />
            </Button>
          </Tooltip>
        </div>
      )}

      <TaskFormModal
        isOpen={formOpen}
        task={editingTask}
        onClose={() => {
          setFormOpen(false);
          setEditingTask(null);
        }}
        onSave={(input) =>
          saveMutation.mutate({ id: editingTask?.id ?? null, input })
        }
        isSaving={saveMutation.isPending}
      />

      <DeleteModal
        isOpen={deleteOpen}
        count={pendingDeleteTask ? 1 : selectedCount}
        onClose={() => {
          setDeleteOpen(false);
          setPendingDeleteTask(null);
        }}
        onConfirm={() => {
          const ids = pendingDeleteTask ? [pendingDeleteTask.id] : selectedIds;
          deleteMutation.mutate(ids);
        }}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}
