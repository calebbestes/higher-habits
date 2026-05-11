"use client";

import type {
  CategoryWithGoals,
  PeriodicGoalInfo,
} from "@/lib/goal-logs-client";
import { toDateKey } from "@/lib/habit-state";
import {
  Accordion,
  AccordionItem,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useMemo } from "react";

const cn = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

const formatDayLabel = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);

type Props = {
  iconPickerDate: Date | null;
  categories: CategoryWithGoals[];
  periodicGoals: PeriodicGoalInfo[];
  logsByGoalDate: Record<string, "complete" | "planned">;
  onToggleGoal: (goalId: string, dateKey: string) => void;
  onClose: () => void;
};

export const DayIconPickerDrawer = ({
  iconPickerDate,
  categories,
  periodicGoals,
  logsByGoalDate,
  onToggleGoal,
  onClose,
}: Props) => {
  const dateKey = useMemo(
    () => (iconPickerDate ? toDateKey(iconPickerDate) : ""),
    [iconPickerDate],
  );

  const grouped = useMemo(() => {
    const categoryMap = new Map(categories.map((c) => [c.id, c]));
    const groups = new Map<
      string,
      { name: string; icon: string; goals: PeriodicGoalInfo[] }
    >();

    for (const goal of periodicGoals) {
      const cat = categoryMap.get(goal.categoryId);
      const key = cat?.id ?? "__other__";
      if (!groups.has(key)) {
        groups.set(key, {
          name: cat?.name ?? "Other",
          icon: cat?.icon ?? "mdi:star-outline",
          goals: [],
        });
      }
      const entry = groups.get(key);
      if (entry) entry.goals.push(goal);
    }

    return [...groups.values()];
  }, [categories, periodicGoals]);

  return (
    <Drawer
      isOpen={Boolean(iconPickerDate)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="right"
      backdrop="blur"
      scrollBehavior="inside"
      classNames={{
        base: "m-0 h-dvh w-full max-w-full rounded-none border-l border-divider sm:w-2/3",
        backdrop: "bg-slate-950/45 backdrop-blur-[3px]",
        header: "p-0",
        body: "p-0",
        closeButton:
          "right-4 top-4 z-20 rounded-full border border-content1/70 bg-content1/85 text-foreground-600 shadow-sm transition hover:bg-content1",
      }}
    >
      <DrawerContent className="h-full bg-content1 shadow-2xl">
        <DrawerHeader className="border-b border-divider bg-content1/85 px-5 py-5 backdrop-blur">
          <div className="pr-10">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 to-emerald-500 text-white shadow-lg shadow-sky-500/20">
                <Icon icon="mdi:calendar-check" className="h-5 w-5" />
              </div>
              <div>
                <p className="text-base font-semibold text-foreground">
                  Monthly Goals
                </p>
                <p className="text-sm text-foreground-500">
                  {iconPickerDate ? formatDayLabel(iconPickerDate) : ""}
                </p>
              </div>
            </div>
          </div>
        </DrawerHeader>

        <DrawerBody>
          {periodicGoals.length === 0 ? (
            <p className="py-10 text-center text-sm text-foreground-400">
              No monthly goals configured.
              <br />
              Add them on the Goals page.
            </p>
          ) : (
            <Accordion
              selectionMode="multiple"
              defaultExpandedKeys={grouped.map((_, i) => String(i))}
              className="px-0"
              itemClasses={{
                base: "border-b border-divider last:border-b-0",
                heading: "px-5 py-1",
                title: "text-sm font-semibold text-foreground",
                content: "px-4 pb-4 pt-0",
                trigger: "py-4",
              }}
            >
              {grouped.map((group, i) => {
                const doneCount = group.goals.filter(
                  (g) => logsByGoalDate[`${g.id}_${dateKey}`] === "complete",
                ).length;
                return (
                  <AccordionItem
                    key={String(i)}
                    title={
                      <div className="flex items-center gap-2">
                        <Icon
                          icon={group.icon || "mdi:star-outline"}
                          className="h-4 w-4 text-foreground-500"
                        />
                        <span>{group.name}</span>
                        {doneCount > 0 && (
                          <span className="ml-auto rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-medium text-emerald-600">
                            {doneCount}/{group.goals.length}
                          </span>
                        )}
                      </div>
                    }
                  >
                    <div className="grid gap-2 sm:grid-cols-2">
                      {group.goals.map((goal) => {
                        const status = logsByGoalDate[`${goal.id}_${dateKey}`];
                        const isDone = status === "complete";
                        const isPlanned = status === "planned";
                        return (
                          <button
                            type="button"
                            key={goal.id}
                            onClick={() => onToggleGoal(goal.id, dateKey)}
                            className={cn(
                              "flex items-center gap-3 rounded-2xl border p-3 text-left transition-all",
                              isDone
                                ? "border-emerald-400/40 bg-emerald-500/10"
                                : isPlanned
                                  ? "border-amber-400/40 bg-amber-500/10"
                                  : "border-divider bg-content2/60 hover:border-default-300 hover:bg-content2",
                            )}
                          >
                            <div
                              className={cn(
                                "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-all",
                                isDone
                                  ? "border-emerald-400/50 bg-emerald-500 text-white"
                                  : isPlanned
                                    ? "border-amber-400/50 bg-amber-500/20 text-amber-500"
                                    : "border-default-300 bg-content1 text-foreground-500",
                              )}
                            >
                              <Icon
                                icon={goal.iconKey || "mdi:star-outline"}
                                className="h-5 w-5"
                              />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-foreground">
                                {goal.name}
                              </p>
                              <p className="text-xs capitalize text-foreground-400">
                                {goal.period ?? "periodic"} goal
                              </p>
                            </div>
                            <div
                              className={cn(
                                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-all",
                                isDone
                                  ? "border-emerald-500 bg-emerald-500 text-white"
                                  : isPlanned
                                    ? "border-amber-400 bg-amber-400/20 text-amber-500"
                                    : "border-default-300 text-transparent",
                              )}
                            >
                              <Icon
                                icon={
                                  isPlanned ? "mdi:clock-outline" : "mdi:check"
                                }
                                className="h-3.5 w-3.5"
                              />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </AccordionItem>
                );
              })}
            </Accordion>
          )}
        </DrawerBody>
      </DrawerContent>
    </Drawer>
  );
};
