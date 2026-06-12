"use client";

import {
  type Category,
  type CategoryInput,
  type Goal,
  type GoalInput,
  createCategory,
  createGoal,
  deleteManyGoals,
  fetchCategories,
  fetchGoals,
  updateGoal,
} from "@/lib/goals-client";
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
  Select,
  SelectItem,
  type Selection,
  Spinner,
  Switch,
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
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { SettingsLink } from "@/components/settings-link";

// ── Constants ──────────────────────────────────────────────────────────────────

const COLUMNS = [
  { name: "Goal", uid: "name", sortable: true },
  { name: "Category", uid: "category", sortable: true },
  { name: "Period", uid: "period", sortable: true },
  { name: "Frequency", uid: "frequency", sortable: false },
  { name: "Priority", uid: "priority", sortable: true },
  { name: "", uid: "actions", sortable: false },
] as const;

const GOAL_PERIODS = ["daily", "weekly", "monthly"] as const;
const GOAL_PRIORITIES = ["high", "medium", "low"] as const;
const GOAL_VISIBILITIES = [
  { value: "only_me", label: "Only me" },
  { value: "goal_friends", label: "Friends tied to goal" },
  { value: "all_friends", label: "All friends" },
] as const;

const PRIORITY_RANK: Record<string, number> = { high: 0, medium: 1, low: 2 };

const PERIOD_COLORS: Record<string, string> = {
  daily: "bg-[#A0D5D5]/35 text-[#2C5352]",
  weekly: "bg-[#F3B7B9]/45 text-[#9D7474]",
  monthly: "bg-[#9D7474]/15 text-[#9D7474]",
};

const CATEGORY_COLORS: Record<string, string> = {
  Spiritual: "bg-[#A0D5D5]/35 text-[#2C5352]",
  Physical: "bg-[#F3B7B9]/50 text-[#9D7474]",
  Work: "bg-[#2C5352]/10 text-[#2C5352]",
  Social: "bg-[#A0D5D5]/35 text-[#2C5352]",
  "Hobbies/Social": "bg-[#516162]/10 text-[#516162]",
  "Financial/Career": "bg-[#F3B7B9]/45 text-[#9D7474]",
  Custom: "bg-[#516162]/10 text-[#516162]",
};

const PRIORITY_COLORS: Record<string, string> = {
  high: "bg-[#F3B7B9]/55 text-[#9D7474]",
  medium: "bg-[#A0D5D5]/35 text-[#2C5352]",
  low: "bg-[#516162]/10 text-[#516162]",
};

const EMPTY_FORM: GoalInput = {
  name: "",
  frequencyGoal: null,
  period: null,
  categoryId: "",
  priority: "medium",
  visibility: "only_me",
  iconKey: "",
  hidden: false,
};

// ── Icon Picker ────────────────────────────────────────────────────────────────

function IconPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [results, setResults] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync query when value changes externally (e.g. editing an existing goal)
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Debounced Iconify search
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `https://api.iconify.design/search?query=${encodeURIComponent(query)}&limit=30`,
        );
        const data = (await res.json()) as { icons?: string[] };
        setResults(data.icons ?? []);
      } catch {
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        label="Icon"
        placeholder="Search icons… e.g. dumbbell"
        value={query}
        onValueChange={(v) => {
          setQuery(v);
          onChange(v);
          setIsOpen(true);
        }}
        onFocus={() => query.length >= 2 && setIsOpen(true)}
        endContent={
          isLoading ? (
            <Spinner size="sm" className="shrink-0" />
          ) : value ? (
            <Icon
              icon={value}
              className="h-4 w-4 shrink-0 text-foreground-500"
            />
          ) : undefined
        }
        description="Any Iconify icon name"
      />
      {isOpen && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-xl border border-divider bg-content1 shadow-lg">
          <div className="grid max-h-52 grid-cols-6 gap-0.5 overflow-y-auto p-2">
            {results.map((icon) => (
              <button
                key={icon}
                type="button"
                title={icon}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(icon);
                  setQuery(icon);
                  setIsOpen(false);
                }}
                className="flex flex-col items-center gap-1 rounded-lg p-2 hover:bg-default-100"
              >
                <Icon icon={icon} className="h-5 w-5 text-foreground-600" />
                <span className="w-full truncate text-center text-[9px] text-foreground-400">
                  {icon.split(":")[1] ?? icon}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Goal Form Modal ────────────────────────────────────────────────────────────

function GoalFormModal({
  isOpen,
  goal,
  categories,
  onClose,
  onCreateCategory,
  onSave,
  isCreatingCategory,
  isSaving,
}: {
  isOpen: boolean;
  goal: Goal | null;
  categories: Category[];
  onClose: () => void;
  onCreateCategory: (input: CategoryInput) => Promise<Category>;
  onSave: (input: GoalInput) => void;
  isCreatingCategory: boolean;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<GoalInput>(
    goal
      ? {
          name: goal.name,
          frequencyGoal: goal.frequencyGoal,
          period: goal.period,
          categoryId: goal.categoryId,
          priority: goal.priority,
          visibility: goal.visibility,
          iconKey: goal.iconKey,
          hidden: goal.hidden,
        }
      : EMPTY_FORM,
  );
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryIcon, setNewCategoryIcon] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    setForm(
      goal
        ? {
            name: goal.name,
            frequencyGoal: goal.frequencyGoal,
            period: goal.period,
            categoryId: goal.categoryId,
            priority: goal.priority,
            visibility: goal.visibility,
            iconKey: goal.iconKey,
            hidden: goal.hidden,
          }
        : EMPTY_FORM,
    );
    setIsAddingCategory(false);
    setNewCategoryName("");
    setNewCategoryIcon("");
  }, [isOpen, goal]);

  const handleCreateCategory = async () => {
    try {
      const category = await onCreateCategory({
        name: newCategoryName.trim(),
        icon: newCategoryIcon.trim(),
      });

      setForm((prev) => ({ ...prev, categoryId: category.id }));
      setIsAddingCategory(false);
      setNewCategoryName("");
      setNewCategoryIcon("");
    } catch {
      // Toast handling lives in the parent mutation.
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      size="lg"
      placement="center"
    >
      <ModalContent>
        <ModalHeader>{goal ? "Edit Goal" : "New Goal"}</ModalHeader>
        <ModalBody className="gap-4 pb-2">
          {/* Name + icon preview */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-default-100">
              {form.iconKey ? (
                <Icon
                  icon={form.iconKey}
                  className="h-5 w-5 text-foreground-600"
                />
              ) : (
                <Icon
                  icon="fa7-solid:bullseye"
                  className="h-5 w-5 text-foreground-300"
                />
              )}
            </div>
            <Input
              label="Name"
              placeholder="What do you want to achieve?"
              value={form.name}
              onValueChange={(v) => setForm((p) => ({ ...p, name: v }))}
              isRequired
              autoFocus
              className="flex-1"
            />
          </div>

          <IconPicker
            value={form.iconKey}
            onChange={(v) => setForm((p) => ({ ...p, iconKey: v }))}
          />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Category"
              placeholder="Select category"
              isRequired
              selectedKeys={
                form.categoryId ? new Set([form.categoryId]) : new Set()
              }
              onSelectionChange={(keys) =>
                setForm((p) => ({
                  ...p,
                  categoryId: ([...keys][0] as string) ?? "",
                }))
              }
            >
              {categories.map((c) => (
                <SelectItem
                  key={c.id}
                  startContent={
                    c.icon ? (
                      <Icon icon={c.icon} className="h-3.5 w-3.5" />
                    ) : undefined
                  }
                >
                  {c.name}
                </SelectItem>
              ))}
            </Select>

            <div className="sm:col-span-2">
              {isAddingCategory ? (
                <div className="rounded-xl border border-divider bg-default-50 p-3">
                  <div className="space-y-3">
                    <Input
                      label="New category name"
                      value={newCategoryName}
                      onValueChange={setNewCategoryName}
                      isRequired
                    />
                    <IconPicker
                      value={newCategoryIcon}
                      onChange={setNewCategoryIcon}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        color="primary"
                        isLoading={isCreatingCategory}
                        isDisabled={!newCategoryName.trim()}
                        onPress={() => void handleCreateCategory()}
                      >
                        Save category
                      </Button>
                      <Button
                        size="sm"
                        variant="flat"
                        onPress={() => {
                          setIsAddingCategory(false);
                          setNewCategoryName("");
                          setNewCategoryIcon("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="flat"
                  startContent={
                    <Icon icon="fa7-solid:plus" className="h-3 w-3" />
                  }
                  onPress={() => setIsAddingCategory(true)}
                >
                  Create category
                </Button>
              )}
            </div>

            <Select
              label="Priority"
              placeholder="Select priority"
              isRequired
              selectedKeys={
                form.priority ? new Set([form.priority]) : new Set()
              }
              onSelectionChange={(keys) =>
                setForm((p) => ({
                  ...p,
                  priority: ([...keys][0] as string) ?? "medium",
                }))
              }
            >
              {GOAL_PRIORITIES.map((p) => (
                <SelectItem key={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </SelectItem>
              ))}
            </Select>

            <Select
              label="Period"
              placeholder="Select period"
              selectedKeys={form.period ? new Set([form.period]) : new Set()}
              onSelectionChange={(keys) => {
                const val = ([...keys][0] as string) || null;
                setForm((p) => ({
                  ...p,
                  period: val as GoalInput["period"],
                }));
              }}
            >
              {GOAL_PERIODS.map((p) => (
                <SelectItem key={p}>
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </SelectItem>
              ))}
            </Select>

            <Input
              label="Frequency"
              placeholder="e.g. 3"
              type="number"
              min={1}
              value={
                form.frequencyGoal != null ? String(form.frequencyGoal) : ""
              }
              onValueChange={(v) =>
                setForm((p) => ({
                  ...p,
                  frequencyGoal: v ? Math.max(1, Number.parseInt(v, 10)) : null,
                }))
              }
              description="Times per period"
            />

            <Select
              label="Visibility"
              selectedKeys={new Set([form.visibility])}
              onSelectionChange={(keys) =>
                setForm((p) => ({
                  ...p,
                  visibility:
                    ([...keys][0] as GoalInput["visibility"]) ?? "only_me",
                }))
              }
            >
              {GOAL_VISIBILITIES.map((option) => (
                <SelectItem key={option.value}>{option.label}</SelectItem>
              ))}
            </Select>
          </div>

          <Switch
            isSelected={form.hidden}
            onValueChange={(v) => setForm((p) => ({ ...p, hidden: v }))}
            size="sm"
          >
            Archive
          </Switch>
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>
            Cancel
          </Button>
          <Button
            color="primary"
            isDisabled={!form.name.trim() || !form.categoryId}
            isLoading={isSaving}
            onPress={() => onSave(form)}
          >
            {goal ? "Save changes" : "Add goal"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

function CategoryFormModal({
  isOpen,
  onClose,
  onSave,
  isSaving,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (input: CategoryInput) => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");

  useEffect(() => {
    if (isOpen) {
      setName("");
      setIcon("");
    }
  }, [isOpen]);

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      size="md"
      placement="center"
    >
      <ModalContent>
        <ModalHeader>New Category</ModalHeader>
        <ModalBody className="gap-4 pb-2">
          <Input
            label="Name"
            placeholder="Category name"
            value={name}
            onValueChange={setName}
            isRequired
            autoFocus
          />
          <IconPicker value={icon} onChange={setIcon} />
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>
            Cancel
          </Button>
          <Button
            color="primary"
            isDisabled={!name.trim()}
            isLoading={isSaving}
            onPress={() =>
              onSave({
                name: name.trim(),
                icon: icon.trim(),
              })
            }
          >
            Add category
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ── Delete Confirmation Modal ──────────────────────────────────────────────────

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
      onOpenChange={(o) => !o && onClose()}
      size="sm"
      placement="center"
    >
      <ModalContent>
        <ModalHeader>
          Delete {count > 1 ? `${count} goals` : "goal"}
        </ModalHeader>
        <ModalBody>
          <p className="text-sm text-foreground-600">
            {count > 1
              ? `Are you sure you want to delete ${count} goals? This cannot be undone.`
              : "Are you sure you want to delete this goal? This cannot be undone."}
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

// ── Main Component ─────────────────────────────────────────────────────────────

export function GoalsTable() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    data = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["goals"],
    queryFn: fetchGoals,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchCategories,
  });

  const createCategoryMutation = useMutation({
    mutationFn: (input: CategoryInput) => createCategory(input),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["categories"] });
      setCategoryFormOpen(false);
      addToast({
        title: "Category added",
        color: "success",
      });
    },
    onError: (err) => {
      addToast({
        title: "Could not create category",
        description: err instanceof Error ? err.message : undefined,
        color: "danger",
      });
    },
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: GoalInput }) =>
      id ? updateGoal(id, input) : createGoal(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      setFormOpen(false);
      setEditingGoal(null);
      addToast({
        title: editingGoal ? "Goal updated" : "Goal added",
        color: "success",
      });
    },
    onError: (err) => {
      addToast({
        title: "Could not save goal",
        description: err instanceof Error ? err.message : undefined,
        color: "danger",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => deleteManyGoals(ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      setDeleteOpen(false);
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

  const inlineUpdateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: GoalInput }) =>
      updateGoal(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
    },
    onError: (err) => {
      addToast({
        title: "Could not update",
        description: err instanceof Error ? err.message : undefined,
        color: "danger",
      });
    },
  });

  const handleInlineUpdate = (id: string, updates: Partial<GoalInput>) => {
    const goal = data.find((g) => g.id === id);
    if (!goal) return;
    inlineUpdateMutation.mutate({
      id,
      input: {
        name: goal.name,
        frequencyGoal: goal.frequencyGoal,
        period: goal.period,
        categoryId: goal.categoryId,
        priority: goal.priority,
        visibility: goal.visibility,
        iconKey: goal.iconKey,
        hidden: goal.hidden,
        ...updates,
      },
    });
  };

  // UI state
  const [filterValue, setFilterValue] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [sortDescriptor, setSortDescriptor] = useState({
    column: "priority",
    direction: "ascending" as "ascending" | "descending",
  });
  const [formOpen, setFormOpen] = useState(false);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingDeleteGoal, setPendingDeleteGoal] = useState<Goal | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameValue, setEditingNameValue] = useState("");
  const [editingFreqId, setEditingFreqId] = useState<string | null>(null);
  const [editingFreqValue, setEditingFreqValue] = useState("");

  const filteredItems = useMemo(() => {
    if (!filterValue) return data;
    const re = new RegExp(
      filterValue.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"),
      "i",
    );
    return data.filter(
      (g) =>
        re.test(g.name) ||
        re.test(g.categoryName) ||
        re.test(g.period ?? "") ||
        re.test(g.priority),
    );
  }, [data, filterValue]);

  const sortedItems = useMemo(() => {
    const col = sortDescriptor.column as keyof Goal;
    const dir = sortDescriptor.direction === "ascending" ? 1 : -1;

    const byPriority = (a: Goal, b: Goal) =>
      (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);

    return [...filteredItems].sort((a, b) => {
      let cmp: number;
      if (col === "priority") {
        cmp = byPriority(a, b) * dir;
      } else {
        const av = String(a[col] ?? "").toLowerCase();
        const bv = String(b[col] ?? "").toLowerCase();
        cmp = (av < bv ? -1 : av > bv ? 1 : 0) * dir;
      }
      if (cmp !== 0) return cmp;
      const pc = byPriority(a, b);
      if (pc !== 0) return pc;
      return a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1;
    });
  }, [filteredItems, sortDescriptor]);

  const selectedCount = useMemo(() => {
    if (selectedKeys === "all") return filteredItems.length;
    return (selectedKeys as Set<string>).size;
  }, [selectedKeys, filteredItems]);

  const selectedIds = useMemo<string[]>(() => {
    if (selectedKeys === "all") return filteredItems.map((g) => g.id);
    return [...(selectedKeys as Set<string>)].map(String);
  }, [selectedKeys, filteredItems]);

  const renderCell = (row: Goal, columnKey: string) => {
    switch (columnKey) {
      case "name":
        if (editingNameId === row.id) {
          return (
            <input
              ref={(el) => el?.focus()}
              value={editingNameValue}
              onChange={(e) => setEditingNameValue(e.target.value)}
              onBlur={() => {
                if (editingNameValue.trim())
                  handleInlineUpdate(row.id, { name: editingNameValue.trim() });
                setEditingNameId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  if (editingNameValue.trim())
                    handleInlineUpdate(row.id, {
                      name: editingNameValue.trim(),
                    });
                  setEditingNameId(null);
                }
                if (e.key === "Escape") setEditingNameId(null);
                e.stopPropagation();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded-lg bg-default-100 px-2 py-1 text-sm font-medium text-foreground outline-none focus:ring-1 focus:ring-primary"
            />
          );
        }
        return (
          <button
            type="button"
            className="flex w-full cursor-text items-center gap-2 text-left"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingNameId(row.id);
              setEditingNameValue(row.name);
            }}
          >
            {row.iconKey && (
              <Icon
                icon={row.iconKey}
                className={cn(
                  "h-4 w-4 shrink-0",
                  row.hidden ? "text-foreground-300" : "text-foreground-500",
                )}
              />
            )}
            <span
              className={cn(
                "text-sm font-medium",
                row.hidden && "text-foreground-400 line-through",
              )}
            >
              {row.name}
            </span>
          </button>
        );

      case "category":
        return (
          <Dropdown placement="bottom-start">
            <DropdownTrigger>
              <button
                type="button"
                className="cursor-pointer rounded-full focus:outline-none"
                onClick={(e) => e.stopPropagation()}
              >
                {row.categoryName ? (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium hover:opacity-80",
                      CATEGORY_COLORS[row.categoryName] ??
                        "bg-default-200 text-foreground-500",
                    )}
                  >
                    {row.categoryIcon && (
                      <Icon icon={row.categoryIcon} className="h-3 w-3" />
                    )}
                    {row.categoryName}
                  </span>
                ) : (
                  <span className="rounded-full px-2.5 py-0.5 text-xs text-foreground-300 hover:bg-default-100 hover:text-foreground-500">
                    Set category
                  </span>
                )}
              </button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Category"
              selectionMode="single"
              disallowEmptySelection
              selectedKeys={
                row.categoryId ? new Set([row.categoryId]) : new Set()
              }
              onSelectionChange={(keys) => {
                const selected = [...keys][0];
                if (selected)
                  handleInlineUpdate(row.id, {
                    categoryId: String(selected),
                  });
              }}
            >
              {categories.map((c) => (
                <DropdownItem
                  key={c.id}
                  startContent={
                    c.icon ? (
                      <Icon icon={c.icon} className="h-3.5 w-3.5" />
                    ) : undefined
                  }
                >
                  {c.name}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        );

      case "period":
        return (
          <Dropdown placement="bottom-start">
            <DropdownTrigger>
              <button
                type="button"
                className="cursor-pointer rounded-full focus:outline-none"
                onClick={(e) => e.stopPropagation()}
              >
                {row.period ? (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize hover:opacity-80",
                      PERIOD_COLORS[row.period] ??
                        "bg-default-200 text-foreground-500",
                    )}
                  >
                    {row.period}
                  </span>
                ) : (
                  <span className="rounded-full px-2.5 py-0.5 text-xs text-foreground-300 hover:bg-default-100 hover:text-foreground-500">
                    Set period
                  </span>
                )}
              </button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Period"
              selectionMode="single"
              disallowEmptySelection={false}
              selectedKeys={row.period ? new Set([row.period]) : new Set()}
              onSelectionChange={(keys) => {
                const val = ([...keys][0] as string) || null;
                handleInlineUpdate(row.id, {
                  period: val as GoalInput["period"],
                });
              }}
            >
              {GOAL_PERIODS.map((p) => (
                <DropdownItem key={p} className="capitalize">
                  {p}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        );

      case "frequency":
        if (editingFreqId === row.id) {
          return (
            <input
              ref={(el) => el?.focus()}
              value={editingFreqValue}
              type="number"
              min={1}
              onChange={(e) => setEditingFreqValue(e.target.value)}
              onBlur={() => {
                const val = editingFreqValue
                  ? Math.max(1, Number.parseInt(editingFreqValue, 10))
                  : null;
                handleInlineUpdate(row.id, { frequencyGoal: val });
                setEditingFreqId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  const val = editingFreqValue
                    ? Math.max(1, Number.parseInt(editingFreqValue, 10))
                    : null;
                  handleInlineUpdate(row.id, { frequencyGoal: val });
                  setEditingFreqId(null);
                }
                if (e.key === "Escape") setEditingFreqId(null);
                e.stopPropagation();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="w-20 rounded-lg bg-default-100 px-2 py-1 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
            />
          );
        }
        return (
          <button
            type="button"
            className="cursor-text text-left"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => {
              e.stopPropagation();
              setEditingFreqId(row.id);
              setEditingFreqValue(
                row.frequencyGoal != null ? String(row.frequencyGoal) : "",
              );
            }}
          >
            {row.frequencyGoal != null ? (
              <span className="text-sm text-foreground-600 hover:text-foreground">
                {row.frequencyGoal}×
              </span>
            ) : (
              <span className="text-xs text-foreground-300 hover:text-foreground-500">
                —
              </span>
            )}
          </button>
        );

      case "priority":
        return (
          <Dropdown placement="bottom-start">
            <DropdownTrigger>
              <button
                type="button"
                className="cursor-pointer rounded-full focus:outline-none"
                onClick={(e) => e.stopPropagation()}
              >
                {row.priority ? (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium capitalize hover:opacity-80",
                      PRIORITY_COLORS[row.priority] ??
                        "bg-default-200 text-foreground-500",
                    )}
                  >
                    {row.priority}
                  </span>
                ) : (
                  <span className="rounded-full px-2.5 py-0.5 text-xs text-foreground-300 hover:bg-default-100 hover:text-foreground-500">
                    Set priority
                  </span>
                )}
              </button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Priority"
              selectionMode="single"
              disallowEmptySelection={false}
              selectedKeys={row.priority ? new Set([row.priority]) : new Set()}
              onSelectionChange={(keys) => {
                const selected = [...keys][0];
                if (selected)
                  handleInlineUpdate(row.id, { priority: String(selected) });
              }}
            >
              {GOAL_PRIORITIES.map((p) => (
                <DropdownItem key={p} className="capitalize">
                  {p}
                </DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
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
                    setEditingGoal(row);
                    setFormOpen(true);
                  }}
                >
                  Edit
                </DropdownItem>
                <DropdownItem
                  key="make-shared"
                  startContent={
                    <Icon
                      icon="mdi:account-group-outline"
                      className="h-3.5 w-3.5"
                    />
                  }
                  onPress={() =>
                    router.push(
                      `/friends?section=shared-goals&goalId=${row.id}`,
                    )
                  }
                >
                  Make Shared
                </DropdownItem>
                <DropdownItem
                  key="toggle-hidden"
                  startContent={
                    <Icon
                      icon={row.hidden ? "mdi:restore" : "mdi:archive-outline"}
                      className="h-3.5 w-3.5"
                    />
                  }
                  onPress={() =>
                    handleInlineUpdate(row.id, { hidden: !row.hidden })
                  }
                >
                  {row.hidden ? "Restore" : "Archive"}
                </DropdownItem>
                <DropdownItem
                  key="delete"
                  className="text-danger"
                  color="danger"
                  startContent={
                    <Icon icon="fa7-solid:trash-can" className="h-3.5 w-3.5" />
                  }
                  onPress={() => {
                    setPendingDeleteGoal(row);
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
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Icon icon="fa7-solid:bullseye" className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Goals</h1>
          <p className="text-xs text-foreground-500">Track your priorities</p>
        </div>
        <SettingsLink className="ml-auto" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Input
            isClearable
            className="w-52 sm:w-72"
            placeholder="Search goals…"
            startContent={
              <Icon
                icon="fa7-solid:magnifying-glass"
                className="h-3.5 w-3.5 text-foreground-400"
              />
            }
            value={filterValue}
            onClear={() => setFilterValue("")}
            onValueChange={setFilterValue}
            size="sm"
            radius="lg"
          />
          <span className="hidden text-xs text-foreground-400 sm:block">
            {filteredItems.length} goal{filteredItems.length !== 1 ? "s" : ""}
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
            variant="flat"
            size="sm"
            startContent={
              <Icon icon="fa7-solid:folder-plus" className="h-3.5 w-3.5" />
            }
            onPress={() => setCategoryFormOpen(true)}
          >
            Add Category
          </Button>
          <Button
            color="primary"
            size="sm"
            startContent={
              <Icon icon="fa7-solid:plus" className="h-3.5 w-3.5" />
            }
            onPress={() => {
              setEditingGoal(null);
              setFormOpen(true);
            }}
          >
            Add Goal
          </Button>
        </div>
      </div>

      {/* Table */}
      <Table
        isHeaderSticky
        aria-label="Goals table"
        selectionMode="multiple"
        selectedKeys={selectedKeys}
        onSelectionChange={(keys) => {
          if (keys === "all") {
            setSelectedKeys(new Set(filteredItems.map((g) => g.id)));
            return;
          }
          setSelectedKeys(new Set(keys as Set<string>));
        }}
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
          {(col) => (
            <TableColumn
              key={col.uid}
              allowsSorting={col.sortable}
              align={col.uid === "actions" ? "end" : "start"}
              width={col.uid === "actions" ? 60 : undefined}
            >
              {col.name}
            </TableColumn>
          )}
        </TableHeader>
        <TableBody
          items={sortedItems}
          isLoading={isLoading}
          loadingContent={<Spinner />}
          emptyContent={
            <div className="py-12 text-center text-sm text-foreground-400">
              No goals yet. Add one to get started.
            </div>
          }
        >
          {(goal) => (
            <TableRow key={goal.id}>
              {(columnKey) => (
                <TableCell>{renderCell(goal, String(columnKey))}</TableCell>
              )}
            </TableRow>
          )}
        </TableBody>
      </Table>

      {/* Bulk action bar */}
      {selectedCount > 0 && (
        <div className="fixed inset-x-4 bottom-6 z-50 flex items-center gap-3 rounded-2xl border border-divider bg-content1/95 px-4 py-3 shadow-xl backdrop-blur-sm sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-fit sm:min-w-[320px]">
          <Chip size="sm" variant="flat" color="primary">
            {selectedCount} selected
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
              setPendingDeleteGoal(null);
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

      {/* Modals */}
      <CategoryFormModal
        isOpen={categoryFormOpen}
        onClose={() => setCategoryFormOpen(false)}
        onSave={(input) => createCategoryMutation.mutate(input)}
        isSaving={createCategoryMutation.isPending}
      />

      <GoalFormModal
        isOpen={formOpen}
        goal={editingGoal}
        categories={categories}
        onClose={() => {
          setFormOpen(false);
          setEditingGoal(null);
        }}
        onCreateCategory={(input) => createCategoryMutation.mutateAsync(input)}
        onSave={(input) =>
          saveMutation.mutate({ id: editingGoal?.id ?? null, input })
        }
        isCreatingCategory={createCategoryMutation.isPending}
        isSaving={saveMutation.isPending}
      />

      <DeleteModal
        isOpen={deleteOpen}
        count={pendingDeleteGoal ? 1 : selectedCount}
        onClose={() => {
          setDeleteOpen(false);
          setPendingDeleteGoal(null);
        }}
        onConfirm={() => {
          const ids = pendingDeleteGoal ? [pendingDeleteGoal.id] : selectedIds;
          deleteMutation.mutate(ids);
        }}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}
