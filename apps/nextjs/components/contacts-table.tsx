"use client";

import {
  type Contact,
  type ContactCategory,
  type ContactInput,
  type ContactStatus,
  createContact,
  createContactCategory,
  deleteManyContacts,
  fetchContactCategories,
  fetchContactStatuses,
  fetchContacts,
  todayDateKey,
  updateContact,
} from "@/lib/contacts-client";
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
  Tab,
  Table,
  TableBody,
  TableCell,
  TableColumn,
  TableHeader,
  TableRow,
  Tabs,
  Textarea,
  Tooltip,
  addToast,
  cn,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { MouseEvent as ReactMouseEvent } from "react";
import { useEffect, useMemo, useState } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

type ViewMode = "table" | "category" | "lastAttempt";

type SortDescriptor = {
  column: string;
  direction: "ascending" | "descending";
};

type GroupRow = {
  id: string;
  kind: "category-group" | "last-attempt-group";
  groupName: string;
  itemCount: number;
  children: Contact[];
};

// ── Constants ─────────────────────────────────────────────────────────────────

const COLUMNS = [
  { name: "Name", uid: "name", sortable: true },
  { name: "Organization", uid: "organization", sortable: true },
  { name: "Phone", uid: "phone", sortable: false },
  { name: "Email", uid: "email", sortable: true },
  { name: "Category", uid: "category", sortable: true },
  { name: "Status", uid: "status", sortable: true },
  { name: "Priority", uid: "priority", sortable: true },
  { name: "Next Contact Date", uid: "nextContactDate", sortable: true },
  { name: "Last Contact Attempt", uid: "lastContactAttempt", sortable: true },
  { name: "Last Successful Contact", uid: "lastContacted", sortable: true },
  { name: "Notes", uid: "notes", sortable: false },
  { name: "", uid: "actions", sortable: false },
] as const;

type ColumnUid = (typeof COLUMNS)[number]["uid"];

const INITIAL_VISIBLE_COLUMNS: Set<ColumnUid> = new Set([
  "name",
  "priority",
  "nextContactDate",
  "lastContactAttempt",
  "lastContacted",
  "notes",
  "actions",
]);

const CONTACT_PRIORITIES = ["High", "Medium", "Low"] as const;

const CATEGORY_PALETTE = [
  "bg-blue-500/15 text-blue-600",
  "bg-indigo-500/15 text-indigo-600",
  "bg-rose-500/15 text-rose-600",
  "bg-orange-500/15 text-orange-600",
  "bg-amber-500/15 text-amber-600",
  "bg-teal-500/15 text-teal-600",
  "bg-purple-500/15 text-purple-600",
  "bg-green-500/15 text-green-600",
  "bg-cyan-500/15 text-cyan-600",
];

function categoryColor(
  categoryId: string | null,
  cats: ContactCategory[],
): string {
  const idx = cats.findIndex((c) => c.id === categoryId);
  if (idx === -1) return "bg-default-200 text-foreground-500";
  return (
    CATEGORY_PALETTE[idx % CATEGORY_PALETTE.length] ??
    "bg-default-200 text-foreground-500"
  );
}

const STATUS_RANK: Record<string, number> = {
  Customer: 0,
  "Close to Customer": 1,
  Meeting: 2,
  "Not Sure": 3,
  Archived: 4,
};

const PRIORITY_RANK: Record<string, number> = {
  High: 0,
  Medium: 1,
  Low: 2,
};

const STATUS_COLORS: Record<string, string> = {
  Customer: "bg-teal-500/15 text-teal-600",
  "Close to Customer": "bg-blue-500/15 text-blue-600",
  Meeting: "bg-amber-500/15 text-amber-600",
  "Not Sure": "bg-default-200 text-foreground-500",
  Archived: "bg-default-100 text-foreground-400",
};

const PRIORITY_COLORS: Record<string, string> = {
  High: "bg-rose-500/15 text-rose-600",
  Medium: "bg-amber-500/15 text-amber-600",
  Low: "bg-default-200 text-foreground-500",
};

function emptyContactForm(): ContactInput {
  return {
    name: "",
    organization: "",
    phone: "",
    email: "",
    contactCategoryId: null,
    contactStatusId: null,
    priority: "",
    nextContactDate: null,
    lastContactAttempt: todayDateKey(),
    lastContacted: null,
    notes: "",
  };
}

function resolveLastContactAttempt(
  lastContactAttempt: string | null,
  lastContacted: string | null,
) {
  if (
    lastContacted &&
    (!lastContactAttempt || lastContacted > lastContactAttempt)
  ) {
    return lastContacted;
  }

  return lastContactAttempt;
}

function formatDateKeyLabel(value: string): string {
  const [year, month, day] = value.split("-").map(Number);

  if (!year || !month || !day) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(year, month - 1, day));
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function TopContent({
  filterValue,
  onClear,
  onSearchChange,
  visibleColumns,
  setVisibleColumns,
  displayCount,
  onRowsPerPageChange,
  refetch,
  viewMode,
  onAddNew,
  onAddCategory,
  showArchived,
  onToggleArchived,
  archivedCount,
  actionSlot,
}: {
  filterValue: string;
  onClear: () => void;
  onSearchChange: (v: string) => void;
  visibleColumns: Set<ColumnUid>;
  setVisibleColumns: (s: Set<ColumnUid>) => void;
  displayCount: number;
  onRowsPerPageChange: (n: number) => void;
  refetch: () => void;
  viewMode: ViewMode;
  onAddNew: () => void;
  onAddCategory: () => void;
  showArchived: boolean;
  onToggleArchived: () => void;
  archivedCount: number;
  actionSlot?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      {/* Row 1 */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Input
            isClearable
            className="w-52 sm:w-72"
            placeholder="Search contacts…"
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
            {displayCount} record{displayCount !== 1 ? "s" : ""}
          </span>
          {archivedCount > 0 && (
            <Button
              variant={showArchived ? "flat" : "light"}
              size="sm"
              className="hidden text-foreground-500 sm:flex"
              onPress={onToggleArchived}
            >
              {showArchived ? "Hide archived" : `${archivedCount} archived`}
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Column toggle */}
          <Dropdown>
            <DropdownTrigger>
              <Button
                variant="flat"
                size="sm"
                endContent={
                  <Icon icon="fa7-solid:chevron-down" className="h-3 w-3" />
                }
                className="hidden sm:flex"
              >
                Columns
              </Button>
            </DropdownTrigger>
            <DropdownMenu
              disallowEmptySelection
              aria-label="Columns"
              closeOnSelect={false}
              selectedKeys={visibleColumns}
              selectionMode="multiple"
              onSelectionChange={(keys) =>
                setVisibleColumns(new Set(keys as Set<ColumnUid>))
              }
            >
              {COLUMNS.filter((c) => c.uid !== "actions").map((col) => (
                <DropdownItem key={col.uid}>{col.name}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>

          {actionSlot}

          {/* Refresh */}
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

          {/* Add Category button */}
          <Button
            variant="flat"
            size="sm"
            startContent={<Icon icon="fa7-solid:tag" className="h-3.5 w-3.5" />}
            onPress={onAddCategory}
          >
            Add Category
          </Button>

          {/* Add Contact button */}
          <Button
            color="primary"
            size="sm"
            startContent={
              <Icon icon="fa7-solid:plus" className="h-3.5 w-3.5" />
            }
            onPress={onAddNew}
          >
            Add Contact
          </Button>
        </div>
      </div>

      {/* Row 2 */}
      <div className="flex items-center justify-between">
        <div />
        {viewMode === "table" && (
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
        )}
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

// ── Contact Form Modal ─────────────────────────────────────────────────────────

function ContactFormModal({
  isOpen,
  contact,
  categories,
  statuses,
  onClose,
  onSave,
  isSaving,
}: {
  isOpen: boolean;
  contact: Contact | null;
  categories: ContactCategory[];
  statuses: ContactStatus[];
  onClose: () => void;
  onSave: (input: ContactInput) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<ContactInput>(
    () => contact ?? emptyContactForm(),
  );

  useEffect(() => {
    if (isOpen) {
      setForm(contact ?? emptyContactForm());
    }
  }, [isOpen, contact]);

  const set = (field: keyof ContactInput) => (v: string) =>
    setForm((prev) => ({ ...prev, [field]: v }));

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(o) => !o && onClose()}
      size="xl"
      placement="center"
    >
      <ModalContent>
        <ModalHeader>{contact ? "Edit Contact" : "New Contact"}</ModalHeader>
        <ModalBody className="gap-4 pb-2">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Input
              label="Name"
              placeholder="Full name"
              value={form.name}
              onValueChange={set("name")}
              isRequired
              autoFocus
            />
            <Input
              label="Organization"
              placeholder="Organization or company"
              value={form.organization}
              onValueChange={set("organization")}
            />
            <Input
              label="Phone"
              placeholder="+1 555 000 0000"
              value={form.phone}
              onValueChange={set("phone")}
            />
            <Input
              label="Email"
              placeholder="email@example.com"
              type="email"
              value={form.email}
              onValueChange={set("email")}
            />
            <Select
              label="Category"
              placeholder="Select category"
              selectedKeys={
                form.contactCategoryId
                  ? new Set([form.contactCategoryId])
                  : new Set()
              }
              onSelectionChange={(keys) =>
                setForm((prev) => ({
                  ...prev,
                  contactCategoryId: ([...keys][0] as string) ?? null,
                }))
              }
            >
              {categories.map((c) => (
                <SelectItem key={c.id}>{c.name}</SelectItem>
              ))}
            </Select>
            <Select
              label="Status"
              placeholder="Select status"
              selectedKeys={
                form.contactStatusId
                  ? new Set([form.contactStatusId])
                  : new Set()
              }
              onSelectionChange={(keys) =>
                setForm((prev) => ({
                  ...prev,
                  contactStatusId: ([...keys][0] as string) ?? null,
                }))
              }
            >
              {statuses.map((s) => (
                <SelectItem key={s.id}>{s.name}</SelectItem>
              ))}
            </Select>
            <Select
              label="Priority"
              placeholder="Select priority"
              selectedKeys={
                form.priority ? new Set([form.priority]) : new Set()
              }
              onSelectionChange={(keys) =>
                set("priority")(([...keys][0] as string) ?? "")
              }
            >
              {CONTACT_PRIORITIES.map((p) => (
                <SelectItem key={p}>{p}</SelectItem>
              ))}
            </Select>
            <Input
              label="Last Contact Attempt"
              type="date"
              value={form.lastContactAttempt ?? ""}
              min={form.lastContacted ?? undefined}
              onValueChange={(v) =>
                setForm((prev) => ({
                  ...prev,
                  lastContactAttempt: resolveLastContactAttempt(
                    v || null,
                    prev.lastContacted,
                  ),
                }))
              }
              isRequired
            />
            <Input
              label="Last Successful Contact"
              type="date"
              value={form.lastContacted ?? ""}
              onValueChange={(v) =>
                setForm((prev) => {
                  const lastContacted = v || null;

                  return {
                    ...prev,
                    lastContacted,
                    lastContactAttempt: resolveLastContactAttempt(
                      prev.lastContactAttempt,
                      lastContacted,
                    ),
                  };
                })
              }
            />
            <Input
              label="Next Contact Date"
              type="date"
              value={form.nextContactDate ?? ""}
              onValueChange={(v) =>
                setForm((prev) => ({ ...prev, nextContactDate: v || null }))
              }
            />
          </div>
          <Textarea
            label="Notes"
            placeholder="Additional notes…"
            value={form.notes}
            onValueChange={set("notes")}
            minRows={3}
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={onClose}>
            Cancel
          </Button>
          <Button
            color="primary"
            isDisabled={!form.name.trim() || !form.lastContactAttempt}
            isLoading={isSaving}
            onPress={() => onSave(form)}
          >
            {contact ? "Save changes" : "Add contact"}
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
}

// ── Add Category Modal ────────────────────────────────────────────────────────

function AddCategoryModal({
  isOpen,
  onClose,
  onSave,
  isSaving,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState("");

  useEffect(() => {
    if (isOpen) {
      setName("");
    }
  }, [isOpen]);

  const handleClose = () => {
    setName("");
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onOpenChange={(o) => !o && handleClose()}
      size="sm"
      placement="center"
    >
      <ModalContent>
        <ModalHeader>New Category</ModalHeader>
        <ModalBody>
          <Input
            label="Category name"
            placeholder="e.g. Prospect"
            value={name}
            onValueChange={setName}
            autoFocus
          />
        </ModalBody>
        <ModalFooter>
          <Button variant="flat" onPress={handleClose}>
            Cancel
          </Button>
          <Button
            color="primary"
            isDisabled={!name.trim()}
            isLoading={isSaving}
            onPress={() => onSave(name.trim())}
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
          Delete {count > 1 ? `${count} contacts` : "contact"}
        </ModalHeader>
        <ModalBody>
          <p className="text-sm text-foreground-600">
            {count > 1
              ? `Are you sure you want to delete ${count} contacts? This cannot be undone.`
              : "Are you sure you want to delete this contact? This cannot be undone."}
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

export function ContactsTable() {
  const queryClient = useQueryClient();

  // Data
  const {
    data = [],
    isLoading,
    refetch,
  } = useQuery({
    queryKey: ["contacts"],
    queryFn: fetchContacts,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: fetchContactCategories,
  });

  const { data: statuses = [] } = useQuery({
    queryKey: ["contactStatuses"],
    queryFn: fetchContactStatuses,
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: ContactInput }) =>
      id ? updateContact(id, input) : createContact(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
      setFormOpen(false);
      setEditingContact(null);
      addToast({
        title: editingContact ? "Contact updated" : "Contact added",
        color: "success",
      });
    },
    onError: (err) => {
      addToast({
        title: "Could not save contact",
        description: err instanceof Error ? err.message : undefined,
        color: "danger",
      });
    },
  });

  const addCategoryMutation = useMutation({
    mutationFn: (name: string) => createContactCategory(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      setCategoryFormOpen(false);
      addToast({ title: "Category added", color: "success" });
    },
    onError: (err) => {
      addToast({
        title: "Could not add category",
        description: err instanceof Error ? err.message : undefined,
        color: "danger",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (ids: string[]) => deleteManyContacts(ids),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
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
    mutationFn: ({ id, input }: { id: string; input: ContactInput }) =>
      updateContact(id, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["contacts"] });
    },
    onError: (err) => {
      addToast({
        title: "Could not update",
        description: err instanceof Error ? err.message : undefined,
        color: "danger",
      });
    },
  });

  const handleInlineUpdate = (
    id: string,
    field: keyof ContactInput,
    value: string | null,
  ) => {
    const contact = data.find((c) => c.id === id);
    if (!contact) return;

    const lastContacted =
      field === "lastContacted" ? value : contact.lastContacted;
    const lastContactAttempt = resolveLastContactAttempt(
      field === "lastContactAttempt" ? value : contact.lastContactAttempt,
      lastContacted,
    );

    inlineUpdateMutation.mutate({
      id,
      input: {
        name: contact.name,
        organization: contact.organization,
        phone: contact.phone,
        email: contact.email,
        contactCategoryId: contact.contactCategoryId,
        contactStatusId: contact.contactStatusId,
        priority: contact.priority,
        nextContactDate: contact.nextContactDate,
        lastContacted: contact.lastContacted,
        notes: contact.notes,
        [field]: value,
        lastContactAttempt,
      },
    });
  };

  // UI state
  const [filterValue, setFilterValue] = useState("");
  const [selectedKeys, setSelectedKeys] = useState<Selection>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(
    new Set(),
  );
  const [expandedAttemptDates, setExpandedAttemptDates] = useState<Set<string>>(
    new Set(),
  );
  const [expandedCompanyKeys, setExpandedCompanyKeys] = useState<Set<string>>(
    new Set(),
  );
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnUid>>(
    INITIAL_VISIBLE_COLUMNS,
  );
  const [rowsPerPage, setRowsPerPage] = useState(24);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: "priority",
    direction: "ascending",
  });
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>("table");
  const [showArchived, setShowArchived] = useState(false);
  const [categoryFormOpen, setCategoryFormOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pendingDeleteContact, setPendingDeleteContact] =
    useState<Contact | null>(null);
  const [editingNotesId, setEditingNotesId] = useState<string | null>(null);
  const [editingNotesValue, setEditingNotesValue] = useState("");

  const startEditingNotes = (contact: Contact) => {
    setEditingNotesId(contact.id);
    setEditingNotesValue(contact.notes);
  };

  const stopEditingNotes = () => {
    setEditingNotesId(null);
  };

  const saveEditingNotes = (contact: Contact) => {
    handleInlineUpdate(contact.id, "notes", editingNotesValue);
    stopEditingNotes();
  };

  const handleNotesDisplayClick = (
    event: ReactMouseEvent<HTMLElement>,
    contact: Contact,
  ) => {
    event.stopPropagation();

    if (event.detail >= 2) {
      startEditingNotes(contact);
    }
  };

  const archivedStatusId = useMemo(
    () => statuses.find((s) => s.name === "Archived")?.id,
    [statuses],
  );

  const archivedCount = useMemo(
    () => data.filter((c) => c.contactStatusId === archivedStatusId).length,
    [data, archivedStatusId],
  );

  // Derived: filter
  const filteredItems = useMemo(() => {
    const list = showArchived
      ? data
      : data.filter((c) => c.contactStatusId !== archivedStatusId);
    if (!filterValue) return list;
    const re = new RegExp(
      filterValue.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&"),
      "i",
    );
    return list.filter(
      (c) =>
        re.test(c.name) ||
        re.test(c.organization) ||
        re.test(c.email) ||
        re.test(
          categories.find((cat) => cat.id === c.contactCategoryId)?.name ?? "",
        ) ||
        re.test(statuses.find((s) => s.id === c.contactStatusId)?.name ?? ""),
    );
  }, [data, filterValue, showArchived, categories, statuses, archivedStatusId]);

  // Derived: sort
  const sortedItems = useMemo(() => {
    const col = sortDescriptor.column;
    const dir = sortDescriptor.direction === "ascending" ? 1 : -1;

    const byStatus = (a: Contact, b: Contact) =>
      (STATUS_RANK[
        statuses.find((s) => s.id === a.contactStatusId)?.name ?? ""
      ] ?? 99) -
      (STATUS_RANK[
        statuses.find((s) => s.id === b.contactStatusId)?.name ?? ""
      ] ?? 99);

    const byPriority = (a: Contact, b: Contact) =>
      (PRIORITY_RANK[a.priority] ?? 99) - (PRIORITY_RANK[b.priority] ?? 99);

    const byNotes = (a: Contact, b: Contact) =>
      (a.notes ? 0 : 1) - (b.notes ? 0 : 1);

    const byLastContacted = (a: Contact, b: Contact) => {
      const ad = a.lastContacted ?? "9999-99-99";
      const bd = b.lastContacted ?? "9999-99-99";
      return ad < bd ? -1 : ad > bd ? 1 : 0;
    };

    return [...filteredItems].sort((a, b) => {
      let cmp: number;
      if (col === "status") {
        cmp = byStatus(a, b) * dir;
      } else if (col === "priority") {
        cmp = byPriority(a, b) * dir;
      } else if (col === "category") {
        const an =
          categories.find((c) => c.id === a.contactCategoryId)?.name ?? "";
        const bn =
          categories.find((c) => c.id === b.contactCategoryId)?.name ?? "";
        cmp = an.localeCompare(bn) * dir;
      } else {
        const av = String(a[col as keyof Contact] ?? "").toLowerCase();
        const bv = String(b[col as keyof Contact] ?? "").toLowerCase();
        cmp = (av < bv ? -1 : av > bv ? 1 : 0) * dir;
      }
      if (cmp !== 0) return cmp;
      // tiebreaker 1: priority rank
      const pc = byPriority(a, b);
      if (pc !== 0) return pc;
      // tiebreaker 2: notes first
      const nc = byNotes(a, b);
      if (nc !== 0) return nc;
      // tiebreaker 3: least recently contacted first
      return byLastContacted(a, b);
    });
  }, [filteredItems, sortDescriptor, categories, statuses]);

  // Derived: pagination
  const pages = Math.max(1, Math.ceil(sortedItems.length / rowsPerPage));
  const tableItems = useMemo(
    () => sortedItems.slice((page - 1) * rowsPerPage, page * rowsPerPage),
    [sortedItems, page, rowsPerPage],
  );

  // Derived: category groups
  const groupedItems = useMemo(() => {
    const grouped = new Map<string, Contact[]>();
    for (const c of sortedItems) {
      const key =
        categories.find((cat) => cat.id === c.contactCategoryId)?.name ??
        "Uncategorized";
      if (!grouped.has(key)) grouped.set(key, []);
      const bucket = grouped.get(key);
      if (bucket) bucket.push(c);
    }
    return [...grouped.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(
        ([groupName, children]): GroupRow => ({
          id: `group-${groupName}`,
          kind: "category-group",
          groupName,
          itemCount: children.length,
          children,
        }),
      );
  }, [sortedItems, categories]);

  const lastAttemptGroups = useMemo(() => {
    const grouped = new Map<string, Contact[]>();

    for (const c of sortedItems) {
      const key = c.lastContactAttempt;
      if (!grouped.has(key)) grouped.set(key, []);
      const bucket = grouped.get(key);
      if (bucket) bucket.push(c);
    }

    return [...grouped.entries()]
      .sort(([a], [b]) => (a === b ? 0 : a > b ? -1 : 1))
      .map(
        ([groupName, children]): GroupRow => ({
          id: `last-attempt-${groupName}`,
          kind: "last-attempt-group",
          groupName,
          itemCount: children.length,
          children,
        }),
      );
  }, [sortedItems]);

  // Header columns
  const headerColumns = useMemo(
    () =>
      COLUMNS.filter((c) => visibleColumns.has(c.uid) || c.uid === "actions"),
    [visibleColumns],
  );

  const categoryDataCols = useMemo(
    () => headerColumns.filter((c) => c.uid !== "actions"),
    [headerColumns],
  );

  // Selection helpers
  const selectedCount = useMemo(() => {
    if (selectedKeys === "all") return filteredItems.length;
    return (selectedKeys as Set<string>).size;
  }, [selectedKeys, filteredItems]);

  const selectedIds = useMemo<string[]>(() => {
    if (selectedKeys === "all") return filteredItems.map((c) => c.id);
    return [...(selectedKeys as Set<string>)].map(String);
  }, [selectedKeys, filteredItems]);

  const handleSelectionChange = (keys: Selection) => {
    if (keys === "all") {
      setSelectedKeys(new Set(filteredItems.map((c) => c.id)));
      return;
    }
    const nextKeys = new Set(keys as Set<string>);
    const pageIds = new Set(tableItems.map((c) => c.id));
    const merged = new Set(selectedKeys as Set<string>);
    for (const id of pageIds) {
      if (nextKeys.has(id)) merged.add(id);
      else merged.delete(id);
    }
    setSelectedKeys(merged);
  };

  // Cell renderer
  const renderCell = (row: Contact, columnKey: string) => {
    switch (columnKey) {
      case "name":
        return (
          <div className="flex flex-col">
            <span className="text-sm font-semibold">{row.name}</span>
            <span className="max-w-[200px] truncate text-xs text-foreground-400">
              {row.organization}
            </span>
          </div>
        );
      case "organization":
        return (
          <span className="text-sm text-foreground-600">
            {row.organization || <span className="text-foreground-300">—</span>}
          </span>
        );
      case "phone":
        return row.phone ? (
          <a
            href={`tel:${row.phone}`}
            className="text-sm text-foreground-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.phone}
          </a>
        ) : (
          <span className="text-foreground-300">—</span>
        );
      case "email":
        return row.email ? (
          <a
            href={`mailto:${row.email}`}
            className="text-sm text-foreground-600 hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {row.email}
          </a>
        ) : (
          <span className="text-foreground-300">—</span>
        );
      case "category": {
        const catName = categories.find(
          (c) => c.id === row.contactCategoryId,
        )?.name;
        return (
          <Dropdown placement="bottom-start">
            <DropdownTrigger>
              <button
                type="button"
                className="cursor-pointer rounded-full focus:outline-none"
                onClick={(e) => e.stopPropagation()}
              >
                {catName ? (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium hover:opacity-80",
                      categoryColor(row.contactCategoryId, categories),
                    )}
                  >
                    {catName}
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
              disallowEmptySelection={false}
              selectedKeys={
                row.contactCategoryId
                  ? new Set([row.contactCategoryId])
                  : new Set()
              }
              onSelectionChange={(keys) => {
                const selected = ([...keys][0] as string) ?? null;
                handleInlineUpdate(row.id, "contactCategoryId", selected);
              }}
            >
              {categories.map((c) => (
                <DropdownItem key={c.id}>{c.name}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        );
      }
      case "status":
        return (
          <Dropdown placement="bottom-start">
            <DropdownTrigger>
              <button
                type="button"
                className="cursor-pointer rounded-full focus:outline-none"
                onClick={(e) => e.stopPropagation()}
              >
                {row.contactStatusId ? (
                  <span
                    className={cn(
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium hover:opacity-80",
                      STATUS_COLORS[
                        statuses.find((s) => s.id === row.contactStatusId)
                          ?.name ?? ""
                      ] ?? "bg-default-200 text-foreground-500",
                    )}
                  >
                    {statuses.find((s) => s.id === row.contactStatusId)?.name}
                  </span>
                ) : (
                  <span className="rounded-full px-2.5 py-0.5 text-xs text-foreground-300 hover:bg-default-100 hover:text-foreground-500">
                    Set status
                  </span>
                )}
              </button>
            </DropdownTrigger>
            <DropdownMenu
              aria-label="Status"
              selectionMode="single"
              disallowEmptySelection={false}
              selectedKeys={
                row.contactStatusId ? new Set([row.contactStatusId]) : new Set()
              }
              onSelectionChange={(keys) => {
                const selected = ([...keys][0] as string) ?? null;
                handleInlineUpdate(row.id, "contactStatusId", selected);
              }}
            >
              {statuses.map((s) => (
                <DropdownItem key={s.id}>{s.name}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
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
                      "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium hover:opacity-80",
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
                handleInlineUpdate(
                  row.id,
                  "priority",
                  selected ? String(selected) : "",
                );
              }}
            >
              {CONTACT_PRIORITIES.map((p) => (
                <DropdownItem key={p}>{p}</DropdownItem>
              ))}
            </DropdownMenu>
          </Dropdown>
        );
      case "nextContactDate":
        return (
          <input
            type="date"
            value={row.nextContactDate ?? ""}
            onChange={(e) =>
              handleInlineUpdate(
                row.id,
                "nextContactDate",
                e.target.value || null,
              )
            }
            onClick={(e) => e.stopPropagation()}
            className="cursor-pointer bg-transparent text-sm text-foreground-600 outline-none [color-scheme:inherit] hover:text-foreground"
          />
        );
      case "lastContactAttempt":
        return (
          <input
            type="date"
            value={row.lastContactAttempt}
            min={row.lastContacted ?? undefined}
            onChange={(e) =>
              handleInlineUpdate(
                row.id,
                "lastContactAttempt",
                e.target.value || null,
              )
            }
            onClick={(e) => e.stopPropagation()}
            className="cursor-pointer bg-transparent text-sm text-foreground-600 outline-none [color-scheme:inherit] hover:text-foreground"
          />
        );
      case "lastContacted":
        return (
          <input
            type="date"
            value={row.lastContacted ?? ""}
            onChange={(e) =>
              handleInlineUpdate(
                row.id,
                "lastContacted",
                e.target.value || null,
              )
            }
            onClick={(e) => e.stopPropagation()}
            className="cursor-pointer bg-transparent text-sm text-foreground-600 outline-none [color-scheme:inherit] hover:text-foreground"
          />
        );
      case "notes":
        if (editingNotesId === row.id) {
          return (
            <textarea
              ref={(el) => el?.focus()}
              value={editingNotesValue}
              rows={2}
              onChange={(e) => setEditingNotesValue(e.target.value)}
              onBlur={() => saveEditingNotes(row)}
              onKeyDown={(e) => {
                if (e.key === "Escape") stopEditingNotes();
                e.stopPropagation();
              }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              className="w-full resize-none rounded-lg bg-default-100 px-2 py-1 text-sm text-foreground outline-none focus:ring-1 focus:ring-primary"
            />
          );
        }
        return (
          <button
            type="button"
            className="w-full cursor-text text-left"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => handleNotesDisplayClick(e, row)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              startEditingNotes(row);
            }}
          >
            {row.notes ? (
              <span className="line-clamp-2 text-sm text-foreground-600 hover:text-foreground">
                {row.notes}
              </span>
            ) : (
              <span className="text-xs text-foreground-300 hover:text-foreground-500">
                Add notes…
              </span>
            )}
          </button>
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
                    setEditingContact(row);
                    setFormOpen(true);
                  }}
                >
                  Edit
                </DropdownItem>
                <DropdownItem
                  key="delete"
                  className="text-danger"
                  color="danger"
                  startContent={
                    <Icon icon="fa7-solid:trash-can" className="h-3.5 w-3.5" />
                  }
                  onPress={() => {
                    setPendingDeleteContact(row);
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

  const renderFolderContactRow = (contact: Contact, indent: string) => (
    <div
      key={contact.id}
      className={cn(
        "flex items-center gap-2 border-t border-divider py-3 pr-4 hover:bg-default-50",
        indent,
      )}
    >
      {categoryDataCols.map((col) => (
        <div
          key={col.uid}
          className={cn("min-w-0", col.uid === "name" ? "flex-2" : "flex-1")}
        >
          {renderCell(contact, col.uid)}
        </div>
      ))}
      <div className="w-10 shrink-0">
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
                setEditingContact(contact);
                setFormOpen(true);
              }}
            >
              Edit
            </DropdownItem>
            <DropdownItem
              key="delete"
              className="text-danger"
              color="danger"
              startContent={
                <Icon icon="fa7-solid:trash-can" className="h-3.5 w-3.5" />
              }
              onPress={() => {
                setPendingDeleteContact(contact);
                setDeleteOpen(true);
              }}
            >
              Delete
            </DropdownItem>
          </DropdownMenu>
        </Dropdown>
      </div>
    </div>
  );

  // All company keys that exist across all groups
  const allCompanyKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const group of groupedItems) {
      const companies = new Map<string, number>();
      for (const c of group.children) {
        const co = c.organization || "No Organization";
        companies.set(co, (companies.get(co) ?? 0) + 1);
      }
      for (const co of companies.keys()) {
        keys.add(`${group.groupName}::${co}`);
      }
    }
    return keys;
  }, [groupedItems]);

  const allExpanded =
    expandedCategories.size >= groupedItems.length &&
    expandedCompanyKeys.size >= allCompanyKeys.size;

  const allAttemptDatesExpanded =
    lastAttemptGroups.length > 0 &&
    lastAttemptGroups.every((group) =>
      expandedAttemptDates.has(group.groupName),
    );

  const viewTabs = (
    <Tabs
      selectedKey={viewMode}
      onSelectionChange={(key) => setViewMode(key as ViewMode)}
      size="sm"
      variant="underlined"
    >
      <Tab
        key="table"
        title={
          <span className="flex items-center gap-2">
            <Icon icon="fa7-solid:table" className="h-3.5 w-3.5" />
            Table
          </span>
        }
      />
      <Tab
        key="category"
        title={
          <span className="flex items-center gap-2">
            <Icon icon="fa7-solid:folder" className="h-3.5 w-3.5" />
            Category
          </span>
        }
      />
      <Tab
        key="lastAttempt"
        title={
          <span className="flex items-center gap-2">
            <Icon icon="fa7-solid:calendar-day" className="h-3.5 w-3.5" />
            Last Attempt
          </span>
        }
      />
    </Tabs>
  );

  const folderActionSlot =
    viewMode === "category" ? (
      <Button
        variant="flat"
        size="sm"
        startContent={
          <Icon
            icon={allExpanded ? "fa7-solid:angles-up" : "fa7-solid:angles-down"}
            className="h-3.5 w-3.5"
          />
        }
        onPress={() => {
          if (allExpanded) {
            setExpandedCategories(new Set());
            setExpandedCompanyKeys(new Set());
          } else {
            setExpandedCategories(
              new Set(groupedItems.map((g) => g.groupName)),
            );
            setExpandedCompanyKeys(new Set(allCompanyKeys));
          }
        }}
      >
        {allExpanded ? "Collapse all" : "Expand all"}
      </Button>
    ) : viewMode === "lastAttempt" ? (
      <Button
        variant="flat"
        size="sm"
        startContent={
          <Icon
            icon={
              allAttemptDatesExpanded
                ? "fa7-solid:angles-up"
                : "fa7-solid:angles-down"
            }
            className="h-3.5 w-3.5"
          />
        }
        onPress={() => {
          if (allAttemptDatesExpanded) {
            setExpandedAttemptDates(new Set());
          } else {
            setExpandedAttemptDates(
              new Set(lastAttemptGroups.map((g) => g.groupName)),
            );
          }
        }}
      >
        {allAttemptDatesExpanded ? "Collapse all" : "Expand all"}
      </Button>
    ) : undefined;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Icon icon="fa7-solid:address-book" className="h-4 w-4" />
        </div>
        <div>
          <h1 className="text-xl font-bold">Contacts</h1>
          <p className="text-xs text-foreground-500">
            Manage your relationships
          </p>
        </div>
      </div>

      {/* Tabs row */}
      <div className="flex items-center justify-between">
        {viewTabs}
        {folderActionSlot}
      </div>

      <TopContent
        filterValue={filterValue}
        onClear={() => {
          setFilterValue("");
          setPage(1);
        }}
        onSearchChange={(v) => {
          setFilterValue(v);
          setPage(1);
        }}
        visibleColumns={visibleColumns}
        setVisibleColumns={setVisibleColumns}
        displayCount={filteredItems.length}
        onRowsPerPageChange={(n) => {
          setRowsPerPage(n);
          setPage(1);
        }}
        refetch={refetch}
        viewMode={viewMode}
        onAddNew={() => {
          setEditingContact(null);
          setFormOpen(true);
        }}
        onAddCategory={() => setCategoryFormOpen(true)}
        showArchived={showArchived}
        onToggleArchived={() => setShowArchived((p) => !p)}
        archivedCount={archivedCount}
      />

      {/* Table view */}
      {viewMode === "table" && (
        <>
          <Table
            isHeaderSticky
            aria-label="Contacts table"
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
            <TableHeader columns={headerColumns}>
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
              items={tableItems}
              isLoading={isLoading}
              loadingContent={<Spinner />}
              emptyContent={
                <div className="py-12 text-center text-sm text-foreground-400">
                  No contacts yet. Add one to get started.
                </div>
              }
            >
              {(contact) => (
                <TableRow key={contact.id}>
                  {(columnKey) => (
                    <TableCell
                      onDoubleClick={
                        String(columnKey) === "notes"
                          ? (event) => {
                              event.stopPropagation();
                              startEditingNotes(contact);
                            }
                          : undefined
                      }
                      className={
                        String(columnKey) === "notes"
                          ? "cursor-text"
                          : undefined
                      }
                    >
                      {renderCell(contact, String(columnKey))}
                    </TableCell>
                  )}
                </TableRow>
              )}
            </TableBody>
          </Table>

          <BottomContent page={page} pages={pages} setPage={setPage} />
        </>
      )}

      {/* Category view */}
      {viewMode === "category" && (
        <div className="flex flex-col gap-3">
          {isLoading && (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          )}
          {!isLoading && groupedItems.length === 0 && (
            <div className="rounded-2xl border border-dashed border-default-200 py-12 text-center text-sm text-foreground-400">
              No contacts yet.
            </div>
          )}
          {/* Single column header for all category rows */}
          {!isLoading && groupedItems.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-default-100 px-4 py-2">
              {categoryDataCols.map((col) => (
                <div
                  key={col.uid}
                  className={cn(
                    "text-xs font-semibold uppercase tracking-wider text-foreground-500",
                    col.uid === "name" ? "flex-2" : "flex-1",
                  )}
                >
                  {col.name}
                </div>
              ))}
              <div className="w-10 shrink-0" />
            </div>
          )}
          {groupedItems.map((group) => {
            const isCatExpanded = expandedCategories.has(group.groupName);

            // Build organization sub-groups
            const companyMap = new Map<string, Contact[]>();
            for (const c of group.children) {
              const co = c.organization || "No Organization";
              if (!companyMap.has(co)) companyMap.set(co, []);
              const bucket = companyMap.get(co);
              if (bucket) bucket.push(c);
            }
            const companies = [...companyMap.entries()].sort(([a], [b]) =>
              a.localeCompare(b),
            );

            return (
              <div
                key={group.id}
                className="overflow-hidden rounded-2xl border border-divider bg-content1"
              >
                {/* Category header */}
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-default-50"
                  onClick={() =>
                    setExpandedCategories((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.groupName))
                        next.delete(group.groupName);
                      else next.add(group.groupName);
                      return next;
                    })
                  }
                >
                  <Icon
                    icon={
                      isCatExpanded
                        ? "fa7-solid:folder-open"
                        : "fa7-solid:folder"
                    }
                    className="h-4 w-4 text-foreground-400"
                  />
                  <span className="font-semibold">{group.groupName}</span>
                  <Chip size="sm" variant="flat" className="ml-1">
                    {group.itemCount}
                  </Chip>
                  <Icon
                    icon={
                      isCatExpanded
                        ? "fa7-solid:chevron-up"
                        : "fa7-solid:chevron-down"
                    }
                    className="ml-auto h-3 w-3 text-foreground-400"
                  />
                </button>

                {/* Company sub-folders */}
                {isCatExpanded &&
                  companies.map(([companyName, contacts]) => {
                    const companyKey = `${group.groupName}::${companyName}`;
                    const isCoExpanded = expandedCompanyKeys.has(companyKey);

                    return (
                      <div key={companyKey} className="border-t border-divider">
                        {/* Company header */}
                        <button
                          type="button"
                          className="flex w-full items-center gap-3 py-2.5 pl-10 pr-4 transition-colors hover:bg-default-50"
                          onClick={() =>
                            setExpandedCompanyKeys((prev) => {
                              const next = new Set(prev);
                              if (next.has(companyKey)) next.delete(companyKey);
                              else next.add(companyKey);
                              return next;
                            })
                          }
                        >
                          <Icon
                            icon={
                              isCoExpanded
                                ? "fa7-solid:folder-open"
                                : "fa7-solid:folder"
                            }
                            className="h-3.5 w-3.5 text-foreground-400"
                          />
                          <span className="text-sm font-medium">
                            {companyName}
                          </span>
                          <Chip size="sm" variant="flat" className="ml-1">
                            {contacts.length}
                          </Chip>
                          <Icon
                            icon={
                              isCoExpanded
                                ? "fa7-solid:chevron-up"
                                : "fa7-solid:chevron-down"
                            }
                            className="ml-auto h-3 w-3 text-foreground-400"
                          />
                        </button>

                        {/* Contact rows */}
                        {isCoExpanded &&
                          contacts.map((c) =>
                            renderFolderContactRow(c, "pl-10"),
                          )}
                      </div>
                    );
                  })}
              </div>
            );
          })}
        </div>
      )}

      {/* Last attempt date view */}
      {viewMode === "lastAttempt" && (
        <div className="flex flex-col gap-3">
          {isLoading && (
            <div className="flex justify-center py-12">
              <Spinner />
            </div>
          )}
          {!isLoading && lastAttemptGroups.length === 0 && (
            <div className="rounded-2xl border border-dashed border-default-200 py-12 text-center text-sm text-foreground-400">
              No contacts yet.
            </div>
          )}
          {!isLoading && lastAttemptGroups.length > 0 && (
            <div className="flex items-center gap-2 rounded-xl bg-default-100 px-4 py-2">
              {categoryDataCols.map((col) => (
                <div
                  key={col.uid}
                  className={cn(
                    "text-xs font-semibold uppercase tracking-wider text-foreground-500",
                    col.uid === "name" ? "flex-2" : "flex-1",
                  )}
                >
                  {col.name}
                </div>
              ))}
              <div className="w-10 shrink-0" />
            </div>
          )}
          {lastAttemptGroups.map((group) => {
            const isDateExpanded = expandedAttemptDates.has(group.groupName);

            return (
              <div
                key={group.id}
                className="overflow-hidden rounded-2xl border border-divider bg-content1"
              >
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-4 py-3 transition-colors hover:bg-default-50"
                  onClick={() =>
                    setExpandedAttemptDates((prev) => {
                      const next = new Set(prev);
                      if (next.has(group.groupName))
                        next.delete(group.groupName);
                      else next.add(group.groupName);
                      return next;
                    })
                  }
                >
                  <Icon
                    icon={
                      isDateExpanded
                        ? "fa7-solid:folder-open"
                        : "fa7-solid:folder"
                    }
                    className="h-4 w-4 text-foreground-400"
                  />
                  <span className="font-semibold">
                    {formatDateKeyLabel(group.groupName)}
                  </span>
                  <Chip size="sm" variant="flat" className="ml-1">
                    {group.itemCount}
                  </Chip>
                  <Icon
                    icon={
                      isDateExpanded
                        ? "fa7-solid:chevron-up"
                        : "fa7-solid:chevron-down"
                    }
                    className="ml-auto h-3 w-3 text-foreground-400"
                  />
                </button>

                {isDateExpanded &&
                  group.children.map((contact) =>
                    renderFolderContactRow(contact, "pl-10"),
                  )}
              </div>
            );
          })}
        </div>
      )}

      {/* Action bar — bulk selection */}
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
              setPendingDeleteContact(null);
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
      <AddCategoryModal
        isOpen={categoryFormOpen}
        onClose={() => setCategoryFormOpen(false)}
        onSave={(name) => addCategoryMutation.mutate(name)}
        isSaving={addCategoryMutation.isPending}
      />

      <ContactFormModal
        isOpen={formOpen}
        contact={editingContact}
        categories={categories}
        statuses={statuses}
        onClose={() => {
          setFormOpen(false);
          setEditingContact(null);
        }}
        onSave={(input) =>
          saveMutation.mutate({ id: editingContact?.id ?? null, input })
        }
        isSaving={saveMutation.isPending}
      />

      <DeleteModal
        isOpen={deleteOpen}
        count={pendingDeleteContact ? 1 : selectedCount}
        onClose={() => {
          setDeleteOpen(false);
          setPendingDeleteContact(null);
        }}
        onConfirm={() => {
          const ids = pendingDeleteContact
            ? [pendingDeleteContact.id]
            : selectedIds;
          deleteMutation.mutate(ids);
        }}
        isDeleting={deleteMutation.isPending}
      />
    </div>
  );
}
