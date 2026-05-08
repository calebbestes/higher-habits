"use client";

import {
  type GoalLogsSnapshot,
  fetchGoalLogsSnapshot,
} from "@/lib/goal-logs-client";
import {
  Button,
  Select,
  SelectItem,
  SelectSection,
  Spinner,
  cn,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import parse from "html-react-parser";
import { useEffect, useMemo, useState } from "react";

type Period = "30d" | "6m";

type GoalOption = {
  key: string;
  label: string;
  icon: string;
};

type MergedData = {
  categories: GoalLogsSnapshot["categories"];
  logsByGoalDate: Record<string, "complete">;
  notesByGoalDate: Record<string, string>;
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
    logsByGoalDate: Object.assign(
      {},
      ...snapshots.map((s) => s.logsByGoalDate),
    ),
    notesByGoalDate: Object.assign(
      {},
      ...snapshots.map((s) => s.notesByGoalDate ?? {}),
    ),
  };
}

function getEntries(
  data: MergedData,
  goalId: string,
  startDateKey: string,
): { dateKey: string; notes: string }[] {
  const todayKey = toDateKey(new Date());
  const results: { dateKey: string; notes: string }[] = [];
  for (const [key, notes] of Object.entries(data.notesByGoalDate)) {
    if (!key.startsWith(`${goalId}_`)) continue;
    const dateKey = key.slice(goalId.length + 1);
    if (dateKey < startDateKey || dateKey > todayKey) continue;
    if (data.logsByGoalDate[key] !== "complete") continue;
    if (!notes?.trim()) continue;
    results.push({ dateKey, notes });
  }
  return results.sort((a, b) => b.dateKey.localeCompare(a.dateKey));
}

export function JournalPageClient() {
  const [period, setPeriod] = useState<Period>("30d");
  const [selectedGoalKey, setSelectedGoalKey] = useState<string>("");
  const [data, setData] = useState<MergedData | null>(null);
  const [loading, setLoading] = useState(false);

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
      .map((cat) => ({
        title: cat.name,
        goals: cat.goals
          .map((goal): GoalOption & { count: number } => ({
            key: goal.id,
            label: goal.name,
            icon: goal.iconKey || "mdi:circle",
            count: getEntries(data, goal.id, startDateKey).length,
          }))
          .filter(({ count }) => count > 0)
          .sort((a, b) => b.count - a.count)
          .map(({ count: _c, ...g }) => g),
      }))
      .filter((s) => s.goals.length > 0);
  }, [data, startDateKey]);

  const allGoals = useMemo(
    () => availableSections.flatMap((s) => s.goals),
    [availableSections],
  );

  const selectedGoal = allGoals.find((o) => o.key === selectedGoalKey);

  useEffect(() => {
    if (!selectedGoalKey || !data) return;
    if (
      !availableSections.some((s) =>
        s.goals.some((g) => g.key === selectedGoalKey),
      )
    ) {
      setSelectedGoalKey("");
    }
  }, [availableSections, selectedGoalKey, data]);

  const entries = useMemo(() => {
    if (!data || !selectedGoal) return [];
    return getEntries(data, selectedGoal.key, startDateKey);
  }, [data, selectedGoal, startDateKey]);

  const periodLabel = period === "30d" ? "last 30 days" : "last 6 months";

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-foreground">Journal</h1>
        <p className="mt-0.5 text-sm text-foreground-500">
          Notes from days where a goal was completed
        </p>
      </div>

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Select
            label="Goal"
            placeholder={
              loading
                ? "Loading…"
                : availableSections.length === 0
                  ? "No goals with notes yet"
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
            {availableSections.map((section) => (
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
            Complete a goal and add a note to see it here
          </p>
        </div>
      ) : !selectedGoalKey ? (
        <div className="rounded-2xl border border-dashed border-divider px-6 py-14 text-center">
          <Icon
            icon="fa7-solid:book-open"
            className="mx-auto mb-3 h-8 w-8 text-foreground-300"
          />
          <p className="text-sm text-foreground-500">
            Select a goal above to see your journal entries
          </p>
        </div>
      ) : entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-divider px-6 py-14 text-center">
          {selectedGoal && (
            <Icon
              icon={selectedGoal.icon}
              className="mx-auto mb-3 h-8 w-8 text-foreground-300"
            />
          )}
          <p className="text-sm font-medium text-foreground-600">
            No entries for {selectedGoal?.label ?? "this goal"} in the{" "}
            {periodLabel}
          </p>
          <p className="mt-1 text-xs text-foreground-400">
            Complete the goal and add a note to see it here
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {entries.map(({ dateKey, notes }) => (
            <div
              key={dateKey}
              className="rounded-2xl border border-divider bg-content1 px-5 py-4"
            >
              <div className="mb-3 flex items-center gap-2.5">
                {selectedGoal && (
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Icon icon={selectedGoal.icon} className="h-3.5 w-3.5" />
                  </div>
                )}
                <div>
                  <p className="text-[13px] font-semibold text-foreground">
                    {formatDate(dateKey)}
                  </p>
                  {selectedGoal && (
                    <p className="text-[11px] text-foreground-400">
                      {selectedGoal.label}
                    </p>
                  )}
                </div>
              </div>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
