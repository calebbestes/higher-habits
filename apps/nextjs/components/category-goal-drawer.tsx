"use client";

import type { CategoryWithGoals } from "@/lib/goal-logs-client";
import {
  Button,
  Card,
  CardBody,
  Chip,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Tooltip,
  addToast,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useMemo } from "react";

type Props = {
  isOpen: boolean;
  date: Date | null;
  category: CategoryWithGoals | null;
  logsByGoalDate: Record<string, "complete" | "planned">;
  onToggle: (goalId: string, dateKey: string) => void;
  onClose: () => void;
};

const CATEGORY_STYLE: Record<
  string,
  {
    gradient: string;
    shadow: string;
    activeItem: string;
    checkboxActive: string;
    hoverBorder: string;
  }
> = {
  Spiritual: {
    gradient: "from-[#2C5352] via-[#516162] to-[#A0D5D5]",
    shadow: "shadow-[#2C5352]/20",
    activeItem:
      "border-[#A0D5D5] bg-[#A0D5D5]/20 dark:border-[#A0D5D5]/50 dark:bg-[#2C5352]/40",
    checkboxActive: "border-[#2C5352] bg-[#2C5352] text-white",
    hoverBorder:
      "hover:border-[#A0D5D5] hover:bg-[#A0D5D5]/15 dark:hover:bg-[#2C5352]/30",
  },
  Physical: {
    gradient: "from-[#9D7474] via-[#516162] to-[#2C5352]",
    shadow: "shadow-[#9D7474]/20",
    activeItem:
      "border-[#F3B7B9] bg-[#F3B7B9]/20 dark:border-[#F3B7B9]/50 dark:bg-[#9D7474]/30",
    checkboxActive: "border-[#9D7474] bg-[#9D7474] text-white",
    hoverBorder:
      "hover:border-[#F3B7B9] hover:bg-[#F3B7B9]/15 dark:hover:bg-[#9D7474]/25",
  },
  Work: {
    gradient: "from-[#516162] via-[#9D7474] to-[#2C5352]",
    shadow: "shadow-[#516162]/20",
    activeItem:
      "border-[#516162]/40 bg-[#516162]/10 dark:border-[#A0D5D5]/30 dark:bg-[#516162]/30",
    checkboxActive: "border-[#516162] bg-[#516162] text-white",
    hoverBorder:
      "hover:border-[#516162]/40 hover:bg-[#516162]/10 dark:hover:bg-[#516162]/25",
  },
};

const DEFAULT_STYLE: (typeof CATEGORY_STYLE)[string] = {
  gradient: "from-[#516162] via-[#9D7474] to-[#2C5352]",
  shadow: "shadow-[#516162]/20",
  activeItem:
    "border-[#A0D5D5] bg-[#A0D5D5]/20 dark:border-[#A0D5D5]/50 dark:bg-[#516162]/30",
  checkboxActive: "border-[#2C5352] bg-[#2C5352] text-white",
  hoverBorder: "hover:border-default-300 hover:bg-default-100/50",
};

const cn = (...values: Array<string | false | null | undefined>) =>
  values.filter(Boolean).join(" ");

const formatDayLabel = (date: Date) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);

const toDateKey = (date: Date) => {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
};

export const CategoryGoalDrawer = ({
  isOpen,
  date,
  category,
  logsByGoalDate,
  onToggle,
  onClose,
}: Props) => {
  const dateKey = useMemo(() => (date ? toDateKey(date) : ""), [date]);
  const style = category
    ? (CATEGORY_STYLE[category.name] ?? DEFAULT_STYLE)
    : DEFAULT_STYLE;

  const completedCount = useMemo(
    () =>
      category?.goals.filter(
        (g) => logsByGoalDate[`${g.id}_${dateKey}`] === "complete",
      ).length ?? 0,
    [category, dateKey, logsByGoalDate],
  );

  const resetDay = () => {
    if (!category || !dateKey) return;
    for (const goal of category.goals) {
      if (logsByGoalDate[`${goal.id}_${dateKey}`] === "complete") {
        onToggle(goal.id, dateKey);
      }
    }
    addToast({
      title: "Checklist reset",
      description: `${category.name} goals cleared for this day.`,
      color: "primary",
    });
  };

  return (
    <Drawer
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      placement="right"
      backdrop="blur"
      scrollBehavior="inside"
      classNames={{
        base: "m-0 h-dvh w-full max-w-full rounded-none border-l border-divider bg-transparent sm:w-2/3 sm:max-w-[80rem]",
        backdrop: "bg-slate-950/45 backdrop-blur-[3px]",
        header: "p-0",
        body: "p-0",
        footer:
          "border-t border-divider bg-content1/88 px-4 py-4 backdrop-blur sm:px-6",
        closeButton:
          "right-4 top-4 z-20 rounded-full border border-content1/70 bg-content1/85 text-foreground-600 shadow-sm transition hover:bg-content1 sm:right-5 sm:top-5",
      }}
    >
      <DrawerContent className="h-full overflow-hidden bg-content1 shadow-2xl">
        <DrawerHeader className="border-b border-divider bg-content1/85 px-4 py-5 backdrop-blur sm:px-6">
          <div className="pr-12">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-lg",
                  style.gradient,
                  style.shadow,
                )}
              >
                <Icon
                  icon={category?.icon || "mdi:bullseye"}
                  className="h-5 w-5"
                />
              </div>
              <div className="min-w-0">
                <p className="mt-2 text-lg font-semibold text-foreground">
                  {category?.name ?? "Goals"}
                </p>
                <p className="text-sm text-foreground-500">
                  {date ? formatDayLabel(date) : ""}
                </p>
              </div>
            </div>
          </div>
        </DrawerHeader>

        <DrawerBody>
          <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-5">
            <Card
              shadow="none"
              className="border border-divider bg-content1/90"
            >
              <CardBody className="gap-3 p-3 sm:p-4">
                {(category?.goals ?? []).map((goal) => {
                  const isComplete =
                    logsByGoalDate[`${goal.id}_${dateKey}`] === "complete";
                  const button = (
                    <button
                      type="button"
                      key={goal.id}
                      onClick={() => onToggle(goal.id, dateKey)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[22px] border p-4 text-left transition-all",
                        isComplete
                          ? style.activeItem
                          : `border-divider bg-content2/80 ${style.hoverBorder}`,
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
                          isComplete
                            ? style.checkboxActive
                            : "border-default-300 bg-content1 text-foreground-500",
                        )}
                      >
                        <Icon
                          icon={
                            isComplete
                              ? "mdi:check-bold"
                              : goal.iconKey || "mdi:circle"
                          }
                          className="h-5 w-5"
                        />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground">
                          {goal.name}
                        </p>
                        <p className="text-sm text-foreground-500">
                          {isComplete
                            ? "Completed for the day"
                            : "Tap to mark complete"}
                        </p>
                      </div>
                      <Chip
                        size="sm"
                        variant="flat"
                        className={cn(
                          "shrink-0 border",
                          isComplete
                            ? "border-[#A0D5D5] bg-[#A0D5D5]/20 text-[#2C5352]"
                            : "border-default-300 bg-content1 text-foreground-500",
                        )}
                      >
                        {isComplete ? "Done" : "Pending"}
                      </Chip>
                    </button>
                  );

                  if (!isComplete) {
                    return button;
                  }

                  return (
                    <Tooltip
                      content="Add note"
                      color="foreground"
                      key={goal.id}
                    >
                      {button}
                    </Tooltip>
                  );
                })}
              </CardBody>
            </Card>
          </div>
        </DrawerBody>

        <DrawerFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="flat"
              onPress={resetDay}
              className="border border-divider bg-content1 text-foreground-600"
            >
              Reset day
            </Button>
            <span className="text-sm text-foreground-500">
              {completedCount}/{category?.goals.length ?? 0} completed
            </span>
          </div>
          <Button
            variant="light"
            onPress={onClose}
            className="text-foreground-500"
          >
            Close
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
