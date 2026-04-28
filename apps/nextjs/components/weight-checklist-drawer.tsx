"use client";

import {
  EMPTY_WEIGHT_CHECKLIST,
  type WeightChecklistState,
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
  addToast,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useMemo } from "react";
import { DrawerNotesCard } from "./drawer-notes-card";

type WeightChecklistDrawerProps = {
  weightDrawerDate: Date | null;
  checklistsByDate: Record<string, WeightChecklistState>;
  notes: string | null;
  onChecklistChange: (
    dateKey: string,
    nextChecklist: WeightChecklistState,
  ) => void;
  onNotesChange: (dateKey: string, nextNotes: string | null) => Promise<void> | void;
  onClose: () => void;
};

const GYM_ITEM = {
  key: "gym",
  label: "Gym",
  icon: "mdi:dumbbell",
} as const;

const MEDITATE_ITEM = {
  key: "meditate/stretch",
  label: "Meditate/Stretch",
  icon: "mdi:yoga",
} as const;

const BASE_ITEMS = [
  {
    key: "calories2300",
    label: "2300 calories",
    icon: "mdi:fire-circle",
  },
  {
    key: "wakeUpAtSeven",
    label: "Wake up at 7:00",
    icon: "mdi:alarm",
  },
  {
    key: "noPhoneInBathroomBedDriving",
    label: "No phone in bathroom, bed, or driving",
    icon: "mdi:cellphone-off",
  },
  {
    key: "fruitAndVeggies",
    label: "Fruit (Avocado, Banana, Mango) & Veggies (Sweet potato, Spinach, Broccoli)",
    icon: "mdi:fruit-watermelon",
  },
  {
    key: "creatineAndProtein",
    label: "Creatine + Protein shake",
    icon: "mdi:bottle-tonic-plus",
  },
] as const;

export const WEIGHT_CHECKLIST_ITEMS = [GYM_ITEM, ...BASE_ITEMS] as const;

export type WeightChecklistKey = "gym" | "meditate/stretch" | "calories2300" | "wakeUpAtSeven" | "noPhoneInBathroomBedDriving" | "fruitAndVeggies" | "creatineAndProtein";

const getChecklistItems = (date: Date | null) => {
  if (!date || date.getDay() !== 0) return WEIGHT_CHECKLIST_ITEMS;
  return [MEDITATE_ITEM, ...BASE_ITEMS] as const;
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

export const WeightChecklistDrawer = ({
  weightDrawerDate,
  checklistsByDate,
  notes,
  onChecklistChange,
  onNotesChange,
  onClose,
}: WeightChecklistDrawerProps) => {
  const dateKey = useMemo(
    () => (weightDrawerDate ? toDateKey(weightDrawerDate) : ""),
    [weightDrawerDate],
  );

  const dayChecklist = useMemo(
    () =>
      dateKey
        ? (checklistsByDate[dateKey] ?? EMPTY_WEIGHT_CHECKLIST)
        : EMPTY_WEIGHT_CHECKLIST,
    [checklistsByDate, dateKey],
  );

  const checklistItems = useMemo(
    () => getChecklistItems(weightDrawerDate),
    [weightDrawerDate],
  );

  const completedCount = useMemo(
    () => Object.values(dayChecklist).filter(Boolean).length,
    [dayChecklist],
  );

  const toggleItem = (itemKey: WeightChecklistKey) => {
    if (!dateKey) {
      return;
    }

    const current = checklistsByDate[dateKey] ?? EMPTY_WEIGHT_CHECKLIST;
    onChecklistChange(dateKey, {
      ...current,
      [itemKey]: !current[itemKey],
    });
  };

  const resetChecklist = () => {
    if (!dateKey) {
      return;
    }

    onChecklistChange(dateKey, EMPTY_WEIGHT_CHECKLIST);

    addToast({
      title: "Checklist reset",
      description: "The weight checklist was cleared for this day.",
      color: "primary",
    });
  };

  return (
    <Drawer
      isOpen={Boolean(weightDrawerDate)}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
      placement="right"
      backdrop="blur"
      scrollBehavior="inside"
      classNames={{
        base: "m-0 h-dvh w-full max-w-full rounded-none border-l border-slate-200/80 bg-transparent sm:w-2/3 sm:max-w-[38rem]",
        backdrop: "bg-slate-950/45 backdrop-blur-[3px]",
        header: "p-0",
        body: "p-0",
        footer:
          "border-t border-slate-200/80 bg-white/88 px-4 py-4 backdrop-blur sm:px-6",
        closeButton:
          "right-4 top-4 z-20 rounded-full border border-white/70 bg-white/85 text-slate-700 shadow-sm transition hover:bg-white sm:right-5 sm:top-5",
      }}
    >
      <DrawerContent className="h-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(59,130,246,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(16,185,129,0.14),transparent_24%),linear-gradient(180deg,#ffffff_0%,#f4fbff_46%,#ffffff_100%)] shadow-2xl">
        <DrawerHeader className="border-b border-slate-200/70 bg-white/85 px-4 py-5 backdrop-blur sm:px-6">
          <div className="pr-12">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-500 via-cyan-500 to-emerald-500 text-white shadow-lg shadow-sky-500/20">
                <Icon icon="mdi:dumbbell" className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <Chip
                  size="sm"
                  variant="flat"
                  className="border border-sky-200/80 bg-sky-50 text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-800"
                >
                  Daily target
                </Chip>
                <p className="mt-2 text-lg font-semibold text-slate-950">
                  Weight Checklist
                </p>
                <p className="text-sm text-slate-500">
                  {weightDrawerDate ? formatDayLabel(weightDrawerDate) : ""}
                </p>
              </div>
            </div>

           
          </div>
        </DrawerHeader>

        <DrawerBody className="bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.08),transparent_34%)]">
          <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-5">
            <DrawerNotesCard
              value={notes}
              onSave={(nextNotes) => onNotesChange(dateKey, nextNotes)}
              placeholder="Add notes about training, calories, energy, recovery, or what got in the way..."
            />

            <Card
              shadow="none"
              className="border border-slate-200/80 bg-white/90"
            >
              <CardBody className="gap-3 p-3 sm:p-4">
                {checklistItems.map((item) => {
                  const isComplete = dayChecklist[item.key];

                  return (
                    <button
                      type="button"
                      key={item.key}
                      onClick={() => toggleItem(item.key)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-[22px] border p-4 text-left transition-all",
                        isComplete
                          ? "border-emerald-200 bg-emerald-50/80 shadow-sm"
                          : "border-slate-200/80 bg-slate-50/80 hover:border-sky-200 hover:bg-sky-50/50",
                      )}
                    >
                      <div
                        className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border",
                          isComplete
                            ? "border-emerald-200 bg-emerald-500 text-white"
                            : "border-slate-200 bg-white text-slate-500",
                        )}
                      >
                        <Icon
                          icon={isComplete ? "mdi:check-bold" : item.icon}
                          className="h-5 w-5"
                        />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">
                          {item.label}
                        </p>
                        <p className="text-sm text-slate-500">
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
                            ? "border-emerald-200 bg-white text-emerald-700"
                            : "border-slate-200 bg-white text-slate-600",
                        )}
                      >
                        {isComplete ? "Done" : "Pending"}
                      </Chip>
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
            onPress={resetChecklist}
            className="border border-slate-200 bg-white text-slate-700"
          >
            Reset day
          </Button>
          <Button variant="light" onPress={onClose} className="text-slate-600">
            Close
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
