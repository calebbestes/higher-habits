"use client";

import {
  type GoalLogsSnapshot,
  deleteGoalLog,
  fetchGoalLogsSnapshot,
  setGoalLogVisibility,
} from "@/lib/goal-logs-client";
import {
  type GoalPhoto,
  fetchGoalPhotosForRange,
} from "@/lib/goal-photos-client";
import {
  Button,
  Dropdown,
  DropdownItem,
  DropdownMenu,
  DropdownSection,
  DropdownTrigger,
  Modal,
  ModalBody,
  ModalContent,
  Select,
  SelectItem,
  SelectSection,
  Spinner,
  addToast,
  cn,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import parse from "html-react-parser";
import { useEffect, useMemo, useState } from "react";

import { SettingsLink } from "@/components/settings-link";
import type { GoalVisibility } from "@/lib/goals-client";

type Period = "30d" | "6m";

type GoalOption = {
  key: string;
  label: string;
  icon: string;
};

type MergedData = {
  categories: GoalLogsSnapshot["categories"];
  periodicGoals: GoalLogsSnapshot["periodicGoals"];
  logsByGoalDate: Record<string, "complete">;
  notesByGoalDate: Record<string, string>;
  photoCountsByGoalDate: Record<string, number>;
  visibilityByGoalDate: Record<string, GoalVisibility>;
};

type JournalEntry = {
  dateKey: string;
  goalId: string;
  goalLabel: string;
  goalIcon: string;
  notes: string;
  photoCount: number;
  visibility: GoalVisibility;
};

function formatDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function toDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function getMonthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getMonthKeysForPeriod(period: Period): string[] {
  const today = new Date();
  const months = new Set<string>();
  months.add(getMonthKey(today));
  if (period === "30d") {
    const d = new Date(today);
    d.setDate(d.getDate() - 30);
    months.add(getMonthKey(d));
  } else {
    for (let i = 1; i <= 6; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      months.add(getMonthKey(d));
    }
  }
  return [...months];
}

function mergeSnapshots(snapshots: GoalLogsSnapshot[]): MergedData {
  return {
    categories: snapshots[0]?.categories ?? [],
    periodicGoals: snapshots[0]?.periodicGoals ?? [],
    logsByGoalDate: Object.assign(
      {},
      ...snapshots.map((s) => s.logsByGoalDate),
    ),
    notesByGoalDate: Object.assign(
      {},
      ...snapshots.map((s) => s.notesByGoalDate ?? {}),
    ),
    photoCountsByGoalDate: Object.assign(
      {},
      ...snapshots.map((s) => s.photoCountsByGoalDate ?? {}),
    ),
    visibilityByGoalDate: Object.assign(
      {},
      ...snapshots.map((s) => s.visibilityByGoalDate ?? {}),
    ),
  };
}

function getEntries(
  data: MergedData,
  goal: GoalOption,
  startDateKey: string,
): JournalEntry[] {
  const todayKey = toDateKey(new Date());
  const entryKeys = new Set([
    ...Object.keys(data.notesByGoalDate),
    ...Object.keys(data.photoCountsByGoalDate),
  ]);
  const results: JournalEntry[] = [];

  for (const key of entryKeys) {
    if (!key.startsWith(`${goal.key}_`)) continue;
    const dateKey = key.slice(goal.key.length + 1);
    if (dateKey < startDateKey || dateKey > todayKey) continue;
    if (data.logsByGoalDate[key] !== "complete") continue;
    const notes = data.notesByGoalDate[key] ?? "";
    const photoCount = data.photoCountsByGoalDate[key] ?? 0;
    if (!notes.trim() && photoCount === 0) continue;
    results.push({
      dateKey,
      goalId: goal.key,
      goalLabel: goal.label,
      goalIcon: goal.icon,
      notes,
      photoCount,
      visibility: data.visibilityByGoalDate[key] ?? "only_me",
    });
  }

  return results.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

export function JournalPageClient() {
  const [period, setPeriod] = useState<Period>("30d");
  const [selectedGoalKey, setSelectedGoalKey] = useState<string>("all");
  const [data, setData] = useState<MergedData | null>(null);
  const [loading, setLoading] = useState(false);
  const [photosByDate, setPhotosByDate] = useState<Record<string, GoalPhoto[]>>(
    {},
  );
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [activePhoto, setActivePhoto] = useState<GoalPhoto | null>(null);
  const [updatingPostKey, setUpdatingPostKey] = useState<string | null>(null);

  const monthKeys = useMemo(() => getMonthKeysForPeriod(period), [period]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all(monthKeys.map((mk) => fetchGoalLogsSnapshot(mk))).then(
      (results) => {
        if (!cancelled) {
          setData(mergeSnapshots(results));
          setLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [monthKeys]);

  const startDateKey = useMemo(() => {
    const today = new Date();
    if (period === "30d") {
      const d = new Date(today);
      d.setDate(d.getDate() - 30);
      return toDateKey(d);
    }
    const d = new Date(today.getFullYear(), today.getMonth() - 6, 1);
    return toDateKey(d);
  }, [period]);

  const availableSections = useMemo(() => {
    if (!data) return [];
    return data.categories
      .map((cat) => {
        const goals = [
          ...cat.goals,
          ...data.periodicGoals.filter((goal) => goal.categoryId === cat.id),
        ];

        return {
          title: cat.name,
          goals: goals
            .map((goal): GoalOption & { count: number } => {
              const option = {
                key: goal.id,
                label: goal.name,
                icon: goal.iconKey || "mdi:circle",
              };

              return {
                ...option,
                count: getEntries(data, option, startDateKey).length,
              };
            })
            .filter(({ count }) => count > 0)
            .sort((a, b) => b.count - a.count)
            .map(({ count: _c, ...g }) => g),
        };
      })
      .filter((s) => s.goals.length > 0);
  }, [data, startDateKey]);

  const allGoals = useMemo(
    () => availableSections.flatMap((s) => s.goals),
    [availableSections],
  );
  const selectSections = useMemo(
    () => [
      {
        title: "Journal",
        goals: [
          {
            key: "all",
            label: "All goals",
            icon: "mdi:book-open-page-variant-outline",
          },
        ],
      },
      ...availableSections,
    ],
    [availableSections],
  );

  const selectedGoal = allGoals.find((goal) => goal.key === selectedGoalKey);

  useEffect(() => {
    if (!selectedGoalKey || selectedGoalKey === "all" || !data) return;
    if (
      !availableSections.some((s) =>
        s.goals.some((g) => g.key === selectedGoalKey),
      )
    ) {
      setSelectedGoalKey("all");
    }
  }, [availableSections, selectedGoalKey, data]);

  const entries = useMemo(() => {
    if (!data) return [];

    const goals = selectedGoalKey === "all" ? allGoals : [selectedGoal];
    return goals
      .filter((goal): goal is GoalOption => goal != null)
      .flatMap((goal) => getEntries(data, goal, startDateKey))
      .sort(
        (a, b) =>
          b.dateKey.localeCompare(a.dateKey) ||
          a.goalLabel.localeCompare(b.goalLabel),
      );
  }, [allGoals, data, selectedGoal, selectedGoalKey, startDateKey]);

  useEffect(() => {
    let cancelled = false;

    if (entries.every((entry) => entry.photoCount === 0)) {
      setPhotosByDate({});
      setLoadingPhotos(false);
      setPhotoLoadFailed(false);
      return;
    }

    setPhotosByDate({});
    setLoadingPhotos(true);
    setPhotoLoadFailed(false);
    void fetchGoalPhotosForRange(
      selectedGoalKey === "all" ? null : (selectedGoal?.key ?? null),
      startDateKey,
      toDateKey(new Date()),
    )
      .then((photos) => {
        if (cancelled) return;

        setPhotosByDate(
          photos.reduce<Record<string, GoalPhoto[]>>((grouped, photo) => {
            const key = `${photo.goalId}_${photo.dateKey}`;
            grouped[key] ??= [];
            grouped[key].push(photo);
            return grouped;
          }, {}),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setPhotosByDate({});
          setPhotoLoadFailed(true);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPhotos(false);
      });

    return () => {
      cancelled = true;
    };
  }, [entries, selectedGoal, selectedGoalKey, startDateKey]);

  const periodLabel = period === "30d" ? "last 30 days" : "last 6 months";

  const updatePostVisibility = async (
    entry: JournalEntry,
    visibility: GoalVisibility,
  ) => {
    if (entry.visibility === visibility) return;
    const key = `${entry.goalId}_${entry.dateKey}`;
    setUpdatingPostKey(key);

    try {
      await setGoalLogVisibility(entry.goalId, entry.dateKey, visibility);
      setData((current) =>
        current
          ? {
              ...current,
              visibilityByGoalDate: {
                ...current.visibilityByGoalDate,
                [key]: visibility,
              },
            }
          : current,
      );
    } catch (error) {
      addToast({
        title: "Could not change visibility",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      });
    } finally {
      setUpdatingPostKey(null);
    }
  };

  const removePost = async (entry: JournalEntry) => {
    if (
      !window.confirm(
        "Delete this log? This permanently deletes its report, note, photos, and feed activity.",
      )
    ) {
      return;
    }

    const key = `${entry.goalId}_${entry.dateKey}`;
    setUpdatingPostKey(key);

    try {
      await deleteGoalLog(entry.goalId, entry.dateKey);
      setData((current) => {
        if (!current) return current;
        const logsByGoalDate = { ...current.logsByGoalDate };
        const notesByGoalDate = { ...current.notesByGoalDate };
        const photoCountsByGoalDate = { ...current.photoCountsByGoalDate };
        const visibilityByGoalDate = { ...current.visibilityByGoalDate };
        delete logsByGoalDate[key];
        delete notesByGoalDate[key];
        delete photoCountsByGoalDate[key];
        delete visibilityByGoalDate[key];
        return {
          ...current,
          logsByGoalDate,
          notesByGoalDate,
          photoCountsByGoalDate,
          visibilityByGoalDate,
        };
      });
      setPhotosByDate((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    } catch (error) {
      addToast({
        title: "Could not delete log",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      });
    } finally {
      setUpdatingPostKey(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <div className="mb-6 flex items-start gap-3">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Journal</h1>
          <p className="mt-0.5 text-sm text-foreground-500">
            Notes and photos from days where a goal was completed
          </p>
        </div>
        <SettingsLink className="ml-auto" />
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Select
            label="Goal"
            placeholder={
              loading
                ? "Loading…"
                : availableSections.length === 0
                  ? "No goals with journal entries yet"
                  : "Select a goal…"
            }
            isDisabled={loading || availableSections.length === 0}
            selectedKeys={
              selectedGoalKey ? new Set([selectedGoalKey]) : new Set()
            }
            onSelectionChange={(keys) =>
              setSelectedGoalKey(([...keys][0] as string | undefined) ?? "")
            }
            classNames={{ trigger: "h-10" }}
            size="sm"
          >
            {selectSections.map((section) => (
              <SelectSection
                key={section.title}
                title={section.title}
                showDivider
              >
                {section.goals.map((opt) => (
                  <SelectItem
                    key={opt.key}
                    startContent={
                      <Icon
                        icon={opt.icon}
                        className="h-4 w-4 text-foreground-500"
                      />
                    }
                  >
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectSection>
            ))}
          </Select>
        </div>

        <div className="flex items-center gap-1 rounded-xl border border-divider bg-content1 px-1 py-1">
          {(["30d", "6m"] as Period[]).map((p) => (
            <Button
              key={p}
              size="sm"
              variant={period === p ? "solid" : "light"}
              color={period === p ? "primary" : "default"}
              onPress={() => setPeriod(p)}
              className="h-8 px-3 text-xs font-medium"
            >
              {p === "30d" ? "Last 30 days" : "Last 6 months"}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Spinner size="sm" />
        </div>
      ) : availableSections.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-divider px-6 py-14 text-center">
          <Icon
            icon="fa7-solid:book-open"
            className="mx-auto mb-3 h-8 w-8 text-foreground-300"
          />
          <p className="text-sm font-medium text-foreground-600">
            No journal entries yet
          </p>
          <p className="mt-1 text-xs text-foreground-400">
            Complete a goal and add a note or photo to see it here
          </p>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-divider px-6 py-14 text-center">
          {selectedGoalKey === "all" ? (
            <Icon
              icon="fa7-solid:book-open"
              className="mx-auto mb-3 h-8 w-8 text-foreground-300"
            />
          ) : selectedGoal ? (
            <Icon
              icon={selectedGoal.icon}
              className="mx-auto mb-3 h-8 w-8 text-foreground-300"
            />
          ) : null}
          <p className="text-sm font-medium text-foreground-600">
            No entries for{" "}
            {selectedGoalKey === "all"
              ? "any goals"
              : (selectedGoal?.label ?? "this goal")}{" "}
            in the {periodLabel}
          </p>
          <p className="mt-1 text-xs text-foreground-400">
            Complete the goal and add a note or photo to see it here
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map((entry) => {
            const { dateKey, goalId, goalLabel, goalIcon, notes, photoCount } =
              entry;
            const photos = photosByDate[`${goalId}_${dateKey}`] ?? [];
            const postKey = `${goalId}_${dateKey}`;

            return (
              <div
                key={`${goalId}_${dateKey}`}
                className="rounded-2xl border border-divider bg-content1 px-5 py-4"
              >
                <div
                  className={cn(
                    "flex items-center gap-2.5",
                    notes.trim() || photoCount > 0 ? "mb-3" : "",
                  )}
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon icon={goalIcon} className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-foreground">
                      {formatDate(dateKey)}
                    </p>
                    <p className="text-[11px] text-foreground-400">
                      {goalLabel}
                    </p>
                  </div>
                  <Dropdown placement="bottom-end">
                    <DropdownTrigger>
                      <Button
                        isIconOnly
                        aria-label={`Open options for ${goalLabel} on ${formatDate(dateKey)}`}
                        isLoading={updatingPostKey === postKey}
                        radius="lg"
                        size="sm"
                        variant="flat"
                      >
                        <Icon icon="mdi:dots-horizontal" className="h-4 w-4" />
                      </Button>
                    </DropdownTrigger>
                    <DropdownMenu
                      aria-label="Post options"
                      disabledKeys={
                        updatingPostKey === postKey
                          ? new Set([
                              "only_me",
                              "goal_friends",
                              "all_friends",
                              "delete",
                            ])
                          : new Set()
                      }
                      onAction={(key) => {
                        if (key === "delete") {
                          void removePost(entry);
                          return;
                        }
                        void updatePostVisibility(entry, key as GoalVisibility);
                      }}
                    >
                      <DropdownSection title="Visibility" showDivider>
                        <DropdownItem
                          key="only_me"
                          startContent={
                            <Icon icon="mdi:account" className="h-4 w-4" />
                          }
                          endContent={
                            entry.visibility === "only_me" ? (
                              <Icon icon="mdi:check" className="h-4 w-4" />
                            ) : null
                          }
                        >
                          Only me
                        </DropdownItem>
                        <DropdownItem
                          key="goal_friends"
                          startContent={
                            <Icon
                              icon="mdi:account-multiple"
                              className="h-4 w-4"
                            />
                          }
                          endContent={
                            entry.visibility === "goal_friends" ? (
                              <Icon icon="mdi:check" className="h-4 w-4" />
                            ) : null
                          }
                        >
                          Goal friends
                        </DropdownItem>
                        <DropdownItem
                          key="all_friends"
                          startContent={
                            <Icon
                              icon="mdi:account-group"
                              className="h-4 w-4"
                            />
                          }
                          endContent={
                            entry.visibility === "all_friends" ? (
                              <Icon icon="mdi:check" className="h-4 w-4" />
                            ) : null
                          }
                        >
                          All friends
                        </DropdownItem>
                      </DropdownSection>
                      <DropdownItem
                        key="delete"
                        className="text-danger"
                        color="danger"
                        startContent={
                          <Icon icon="mdi:delete-outline" className="h-4 w-4" />
                        }
                      >
                        Delete log
                      </DropdownItem>
                    </DropdownMenu>
                  </Dropdown>
                </div>
                {notes.trim() ? (
                  <div
                    className={cn(
                      "text-sm leading-relaxed text-foreground-700",
                      "[&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-bold",
                      "[&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold",
                      "[&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-medium",
                      "[&_p]:mb-1 last:[&_p]:mb-0",
                      "[&_ul]:ml-4 [&_ul]:list-disc [&_ul]:mb-1",
                      "[&_ol]:ml-4 [&_ol]:list-decimal [&_ol]:mb-1",
                      "[&_li]:mb-0.5",
                      "[&_strong]:font-semibold",
                      "[&_em]:italic",
                    )}
                  >
                    {parse(notes)}
                  </div>
                ) : null}
                {photoCount > 0 ? (
                  <div
                    className={cn(
                      "grid gap-2",
                      notes.trim() ? "mt-4" : "",
                      photoCount === 1 ? "grid-cols-1" : "grid-cols-2",
                    )}
                  >
                    {loadingPhotos && photos.length === 0 ? (
                      <div
                        className={cn(
                          "animate-pulse rounded-lg bg-default-100",
                          photoCount === 1
                            ? "aspect-[4/3]"
                            : "col-span-2 aspect-[2/1]",
                        )}
                      />
                    ) : photos.length > 0 ? (
                      photos.map((photo) => (
                        <button
                          key={photo.id}
                          type="button"
                          aria-label={`Open photo from ${formatDate(dateKey)}`}
                          onClick={() => setActivePhoto(photo)}
                          className={cn(
                            "overflow-hidden rounded-lg bg-default-100",
                            photoCount === 1 ? "aspect-[4/3]" : "aspect-square",
                          )}
                        >
                          <img
                            src={photo.url}
                            alt={`Goal evidence from ${formatDate(dateKey)}`}
                            className="h-full w-full object-cover transition-transform duration-200 hover:scale-[1.02]"
                          />
                        </button>
                      ))
                    ) : (
                      <div className="col-span-2 flex min-h-20 items-center justify-center rounded-lg bg-default-50 px-4 text-center text-xs text-foreground-400">
                        {photoLoadFailed
                          ? "Photos could not be loaded."
                          : "No photos found."}
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={activePhoto != null}
        onOpenChange={(open) => {
          if (!open) setActivePhoto(null);
        }}
        placement="center"
        size="3xl"
        classNames={{ base: "mx-3 overflow-hidden sm:mx-auto" }}
      >
        <ModalContent>
          <ModalBody className="p-0">
            {activePhoto ? (
              <img
                src={activePhoto.url}
                alt="Goal journal evidence"
                className="max-h-[80dvh] w-full object-contain"
              />
            ) : null}
          </ModalBody>
        </ModalContent>
      </Modal>
    </div>
  );
}
