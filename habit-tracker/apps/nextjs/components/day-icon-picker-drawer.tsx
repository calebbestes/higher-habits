"use client";

import {
  type CustomDayIconKey,
  type CustomDayIconSelection,
  getMonthKey,
  toDateKey,
} from "@/lib/habit-state";
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
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useEffect, useMemo, useState } from "react";
import { DrawerNotesCard } from "./drawer-notes-card";

type DayIconPickerDrawerProps = {
  iconPickerDate: Date | null;
  slotIndex: number;
  selectedIconsByDate: Record<string, CustomDayIconSelection | null>;
  notes: string | null;
  onIconChange: (
    slotKey: string,
    nextIcon: CustomDayIconSelection | null,
  ) => void;
  onNotesChange: (
    dateKey: string,
    nextNotes: string | null,
  ) => Promise<void> | void;
  onClose: () => void;
};

export const CUSTOM_DAY_ICON_OPTIONS = [
  {
    key: "tent",
    label: "Camp monthly",
    icon: "mdi:tent",
    description: "Camp monthly",
    frequency: "monthly",
  },
  {
    key: "heart",
    label: "Date weekly",
    icon: "mdi:heart-outline",
    description: "Date weekly",
    frequency: "weekly",
  },
  {
    key: "party",
    label: "Host party weekly",
    icon: "mdi:party-popper",
    description: "Host party weekly",
    frequency: "weekly",
  },
  {
    key: "lunch",
    label: "Lunch with new friend weekly",
    icon: "mdi:silverware-fork-knife",
    description: "Lunch with new friend weekly",
    frequency: "weekly",
  },
  {
    key: "phone",
    label: "Call family member weekly",
    icon: "mdi:phone-outline",
    description: "Call family member weekly",
    frequency: "weekly",
  },
  {
    key: "financialPlanning",
    label: "Financial Planning",
    icon: "mdi:chart-line",
    description: "Financial planning monthly",
    frequency: "monthly",
  },
  {
    key: "firstAid",
    label: "Volunteer service weekly",
    icon: "mdi:handshake-outline",
    description: "Volunteer service weekly",
    frequency: "weekly",
  },
  {
    key: "temple",
    label: "Temple weekly",
    icon: "mdi:temple-hindu",
    description: "Temple weekly",
    frequency: "weekly",
  },
  {
    key: "book",
    label: "Finish a book monthly",
    icon: "mdi:book-open-page-variant",
    description: "Finish a book monthly",
    frequency: "monthly",
  },
  {
    key: "group",
    label: "Host come follow me weekly",
    icon: "mdi:account-group-outline",
    description: "Host come follow me weekly",
    frequency: "weekly",
  },
  {
    key: "climb",
    label: "Climb biweekly",
    icon: "mdi:image-filter-hdr",
    description: "Climb biweekly",
    frequency: "biweekly",
  },
  {
    key: "tennis",
    label: "Tennis biweekly",
    icon: "mdi:tennis-ball",
    description: "Tennis biweekly",
    frequency: "biweekly",
  },
  {
    key: "cook",
    label: "Cook weekly",
    icon: "mdi:chef-hat",
    description: "Cook weekly",
    frequency: "weekly",
  },
  {
    key: "piano",
    label: "Piano weekly",
    icon: "mdi:piano",
    description: "Piano weekly",
    frequency: "weekly",
  },
  {
    key: "ministering",
    label: "Ministering visit monthly",
    icon: "mdi:home-heart",
    description: "Ministering visit monthly",
    frequency: "monthly",
  },
  {
    key: "czechCall",
    label: "Call Czech friend monthly",
    icon: "mdi:earth",
    description: "Call Czech friend monthly",
    frequency: "monthly",
  },
] as const satisfies ReadonlyArray<{
  key: CustomDayIconKey;
  label: string;
  icon: string;
  description: string;
  frequency: "daily" | "weekly" | "biweekly" | "monthly";
}>;

export type CustomDayIconFrequency =
  typeof CUSTOM_DAY_ICON_OPTIONS[number]["frequency"];

const CUSTOM_DAY_ICON_FREQUENCY_LABELS: Record<CustomDayIconFrequency, string> =
  {
    weekly: "Weekly goal",
    biweekly: "Biweekly goal",
    monthly: "Monthly goal",
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

export const DayIconPickerDrawer = ({
  iconPickerDate,
  slotIndex,
  selectedIconsByDate,
  notes,
  onIconChange,
  onNotesChange,
  onClose,
}: DayIconPickerDrawerProps) => {
  const rawDateKey = useMemo(
    () => (iconPickerDate ? toDateKey(iconPickerDate) : ""),
    [iconPickerDate],
  );
  const slotKey = rawDateKey ? `${rawDateKey}_${slotIndex}` : "";

  const savedSelection = slotKey ? selectedIconsByDate[slotKey] ?? null : null;
  const selectedIconKey = savedSelection?.iconKey ?? null;
  const monthKey = iconPickerDate ? getMonthKey(iconPickerDate) : "";
  const daysInMonth = iconPickerDate
    ? new Date(
        iconPickerDate.getFullYear(),
        iconPickerDate.getMonth() + 1,
        0,
      ).getDate()
    : 30;
  const [pendingIconKey, setPendingIconKey] = useState<CustomDayIconKey | null>(
    null,
  );

  useEffect(() => {
    setPendingIconKey(selectedIconKey);
  }, [selectedIconKey]);

  const selectedIcon = CUSTOM_DAY_ICON_OPTIONS.find(
    (option) => option.key === pendingIconKey,
  );

  const getMonthlyTargetCount = (frequency: CustomDayIconFrequency) => {
    switch (frequency) {
      case "monthly":
        return 1;
      case "biweekly":
        return 2;
      case "weekly":
        return 4;
      default:
        return daysInMonth;
    }
  };

  const getMonthlyProgress = (
    iconKey: CustomDayIconKey,
    frequency: CustomDayIconFrequency,
  ) => {
    let completedCount = 0;
    let plannedCount = 0;

    for (const [entryDateKey, selection] of Object.entries(
      selectedIconsByDate,
    )) {
      if (entryDateKey.startsWith(monthKey) && selection?.iconKey === iconKey) {
        if (selection.status === "complete") completedCount++;
        else if (selection.status === "planned") plannedCount++;
      }
    }

    const targetCount = getMonthlyTargetCount(frequency);
    const completedFraction = Math.min(completedCount / targetCount, 1);
    const plannedFraction = Math.min(
      plannedCount / targetCount,
      1 - completedFraction,
    );

    return {
      completedCount,
      plannedCount,
      targetCount,
      completedFraction,
      plannedFraction,
    };
  };

  const handleSelectIcon = (iconKey: CustomDayIconKey) => {
    setPendingIconKey(iconKey);
  };

  const handleClearIcon = () => {
    if (slotKey) {
      onIconChange(slotKey, null);
    }
    setPendingIconKey(null);
    onClose();
  };

  const handleClose = () => {
    onClose();
  };

  const isSavedSelectionPlanned =
    Boolean(pendingIconKey) &&
    savedSelection?.iconKey === pendingIconKey &&
    savedSelection.status === "planned";

  const isSavedSelectionComplete =
    Boolean(pendingIconKey) &&
    savedSelection?.iconKey === pendingIconKey &&
    savedSelection.status === "complete";

  const primaryActionLabel =
    isSavedSelectionPlanned || isSavedSelectionComplete
      ? "Completed"
      : "Planned";

  const handlePrimaryAction = () => {
    if (!slotKey || !pendingIconKey) {
      return;
    }

    onIconChange(slotKey, {
      iconKey: pendingIconKey,
      status:
        isSavedSelectionPlanned || isSavedSelectionComplete
          ? "complete"
          : "planned",
    });
    onClose();
  };

  return (
    <Drawer
      isOpen={Boolean(iconPickerDate)}
      onOpenChange={(open) => {
        if (!open) {
          handleClose();
        }
      }}
      placement="right"
      backdrop="blur"
      scrollBehavior="inside"
      classNames={{
        base: "m-0 h-dvh w-full max-w-full rounded-none border-l border-slate-200/80 bg-transparent sm:w-2/3 sm:max-w-[60rem]",
        backdrop: "bg-slate-950/45 backdrop-blur-[3px]",
        header: "p-0",
        body: "p-0",
        footer:
          "border-t border-slate-200/80 bg-white/88 px-4 py-4 backdrop-blur sm:px-6",
        closeButton:
          "right-4 top-4 z-20 rounded-full border border-white/70 bg-white/85 text-slate-700 shadow-sm transition hover:bg-white sm:right-5 sm:top-5",
      }}
    >
      <DrawerContent className="h-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.16),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_24%),linear-gradient(180deg,#ffffff_0%,#f8fbff_46%,#ffffff_100%)] shadow-2xl">
        <DrawerHeader className="border-b border-slate-200/70 bg-white/85 px-4 py-5 backdrop-blur sm:px-6">
          <div className="pr-12">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-blue-500 to-emerald-500 text-white shadow-lg shadow-sky-500/20">
                <Icon icon="mdi:shape-plus" className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <Chip
                  size="sm"
                  variant="flat"
                  className="border border-sky-200/80 bg-sky-50 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-800"
                >
                  Custom corner
                </Chip>
                <p className="mt-2 text-lg font-semibold text-slate-950">
                  Choose Day Icon
                </p>
                <p className="text-sm text-slate-500">
                  {iconPickerDate ? formatDayLabel(iconPickerDate) : ""}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200/80 bg-white/90 p-3 shadow-sm shadow-slate-200/40">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                Current icon
              </p>
              <div className="mt-2 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-700">
                  <Icon
                    icon={selectedIcon?.icon ?? "mdi:plus"}
                    className="h-6 w-6"
                  />
                </div>
                <div>
                  <p className="font-semibold text-slate-900">
                    {selectedIcon?.label ?? "Nothing selected"}
                  </p>
                  <p className="text-sm text-slate-500">
                    {selectedIcon
                      ? CUSTOM_DAY_ICON_FREQUENCY_LABELS[selectedIcon.frequency]
                      : "Pick an icon to fill the bottom-right corner for this day."}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </DrawerHeader>

        <DrawerBody className="bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_34%)]">
          <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-5">
            <DrawerNotesCard
              value={notes}
              onSave={(nextNotes) => onNotesChange(rawDateKey, nextNotes)}
              placeholder="Add notes, context, or specifics for this custom goal on this day..."
            />

            <Card
              shadow="none"
              className="border border-slate-200/80 bg-white/90"
            >
              <CardBody className="grid gap-3 p-3 sm:grid-cols-2 sm:p-4">
                {CUSTOM_DAY_ICON_OPTIONS.map((option) => {
                  const isSelected = option.key === pendingIconKey;
                  const {
                    completedCount,
                    targetCount,
                    completedFraction,
                    plannedFraction,
                  } = getMonthlyProgress(option.key, option.frequency);

                  return (
                    <button
                      type="button"
                      key={option.key}
                      onClick={() => handleSelectIcon(option.key)}
                      className={cn(
                        "flex items-start gap-3 rounded-[22px] border p-4 text-left transition-all",
                        isSelected
                          ? "border-sky-300 bg-sky-50 shadow-sm"
                          : "border-slate-200/80 bg-slate-50/80 hover:border-sky-200 hover:bg-sky-50/50",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border",
                          isSelected
                            ? "border-sky-200 bg-sky-500 text-white"
                            : "border-slate-200 bg-white text-slate-600",
                        )}
                      >
                        <Icon icon={option.icon} className="h-6 w-6" />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">
                          {option.label}
                        </p>
                        <p className="text-sm text-slate-500">
                          {CUSTOM_DAY_ICON_FREQUENCY_LABELS[option.frequency]}
                        </p>
                        <div className="mt-3 space-y-1.5">
                          <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                            <span>Monthly progress</span>
                            <span>
                              {completedCount}/{targetCount}
                            </span>
                          </div>
                          <div className="flex h-2 overflow-hidden rounded-full bg-slate-200/80">
                            <div
                              className={cn(
                                "h-full transition-[width]",
                                isSelected ? "bg-sky-500" : "bg-slate-400",
                              )}
                              style={{ width: `${completedFraction * 100}%` }}
                            />
                            <div
                              className="h-full transition-[width]"
                              style={{
                                width: `${plannedFraction * 100}%`,
                                backgroundImage: `repeating-linear-gradient(45deg, ${
                                  isSelected ? "#0ea5e9" : "#94a3b8"
                                } 0px, ${
                                  isSelected ? "#0ea5e9" : "#94a3b8"
                                } 3px, transparent 3px, transparent 7px)`,
                              }}
                            />
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </CardBody>
            </Card>
          </div>
        </DrawerBody>

        <DrawerFooter className="flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Button
            variant="flat"
            onPress={handleClearIcon}
            className="border border-slate-200 bg-white text-slate-700"
          >
            Clear icon
          </Button>
          <Button
            variant="light"
            onPress={handleClose}
            className="text-slate-600"
          >
            Close
          </Button>
          <Button
            color="primary"
            onPress={handlePrimaryAction}
            isDisabled={!pendingIconKey}
            className="bg-slate-950 text-white shadow-lg shadow-slate-950/10"
          >
            {primaryActionLabel}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
