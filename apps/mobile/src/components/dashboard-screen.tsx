import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MaxContentWidth } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  type CategoryWithGoals,
  type GoalInCategory,
  type GoalLogsSnapshot,
  type PeriodicGoalInfo,
  fetchGoalLogsSnapshot,
  getMonthKey,
  toDateKey,
} from "@/lib/goal-logs-client";

type SymbolName = SymbolViewProps["name"];

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

const GOAL_ICONS: Record<string, SymbolName> = {
  "fa7-solid:bullseye": sym("target", "target"),
  "mdi:heart-outline": sym("heart", "favorite"),
  "mdi:dumbbell": sym("dumbbell", "fitness_center"),
  "mdi:book-open-page-variant-outline": sym("book", "menu_book"),
  "mdi:briefcase-outline": sym("briefcase", "work"),
  "mdi:account-group-outline": sym("person.2", "groups"),
  "mdi:cash": sym("dollarsign.circle", "paid"),
  "mdi:star-outline": sym("star", "star"),
};

type CategoryConfig = { color: string };

const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  Spiritual: { color: "#2C5352" },
  Physical: { color: "#9D7474" },
  Work: { color: "#516162" },
  Social: { color: "#5A8FA0" },
  "Hobbies/Social": { color: "#5A8FA0" },
  "Financial/Career": { color: "#B87D4D" },
};

const DEFAULT_CATEGORY_COLOR = "#516162";

function getCategoryColor(name: string): string {
  return CATEGORY_CONFIG[name]?.color ?? DEFAULT_CATEGORY_COLOR;
}

function goalSymbol(iconKey: string): SymbolName {
  return GOAL_ICONS[iconKey] ?? sym("target", "target");
}

function getLast10Days(today: Date): string[] {
  const days: string[] = [];
  for (let i = 9; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(toDateKey(d));
  }
  return days;
}

export function DashboardScreen() {
  const theme = useTheme();
  const today = useRef(new Date()).current;
  const currentMonthKey = useMemo(() => getMonthKey(today), [today]);

  const [snapshot, setSnapshot] = useState<GoalLogsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [monthlyOpen, setMonthlyOpen] = useState(true);
  const [dailyOpen, setDailyOpen] = useState(true);
  const [lowerOpen, setLowerOpen] = useState(false);

  const last10Days = useMemo(() => getLast10Days(today), [today]);

  const load = useCallback(
    async (refresh = false) => {
      refresh ? setIsRefreshing(true) : setIsLoading(true);
      setError(null);
      try {
        const tenDaysAgo = new Date(today);
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 9);
        const prevMonthKey = getMonthKey(tenDaysAgo);

        if (prevMonthKey !== currentMonthKey) {
          const [cur, prev] = await Promise.all([
            fetchGoalLogsSnapshot(currentMonthKey),
            fetchGoalLogsSnapshot(prevMonthKey),
          ]);
          setSnapshot({
            ...cur,
            logsByGoalDate: { ...prev.logsByGoalDate, ...cur.logsByGoalDate },
          });
        } else {
          const snap = await fetchGoalLogsSnapshot(currentMonthKey);
          setSnapshot(snap);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load data.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [currentMonthKey, today],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const monthlyGoals = useMemo(() => {
    if (!snapshot) return [];
    const order: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return snapshot.periodicGoals
      .filter((g) => g.period === "monthly" && (g.frequencyGoal ?? 0) > 0)
      .sort((a, b) => (order[a.priority] ?? 1) - (order[b.priority] ?? 1));
  }, [snapshot]);

  const highPriorityCats = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.categories
      .map((cat) => ({
        ...cat,
        goals: cat.goals.filter((g) => g.priority === "high" && !g.hidden),
      }))
      .filter((cat) => cat.goals.length > 0);
  }, [snapshot]);

  const lowerPriorityCats = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.categories
      .map((cat) => ({
        ...cat,
        goals: cat.goals.filter((g) => g.priority !== "high" && !g.hidden),
      }))
      .filter((cat) => cat.goals.length > 0);
  }, [snapshot]);

  const lowerPriorityGoals = useMemo(
    () => lowerPriorityCats.flatMap((cat) => cat.goals),
    [lowerPriorityCats],
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              tintColor={theme.primary}
              onRefresh={() => void load(true)}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pageHeader}>
            <View style={styles.pageHeaderText}>
              <Text style={[styles.pageTitle, { color: theme.text }]}>
                Dashboard
              </Text>
              <Text
                style={[styles.pageSubtitle, { color: theme.textSecondary }]}
              >
                Track your habits and progress
              </Text>
            </View>
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <SymbolView
                name={sym("exclamationmark.circle.fill", "error")}
                size={18}
                tintColor="#9D474D"
              />
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => void load()}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={theme.primary} size="large" />
            </View>
          ) : snapshot ? (
            <View style={styles.sections}>
              {highPriorityCats.length > 0 ? (
                <DashSection
                  title="DAILY GOALS (LAST 10 DAYS)"
                  isOpen={dailyOpen}
                  onToggle={() => setDailyOpen((v) => !v)}
                >
                  {highPriorityCats.map((cat, i) => (
                    <CategoryHeatmap
                      key={cat.id}
                      category={cat}
                      goals={cat.goals}
                      days={last10Days}
                      logsByGoalDate={snapshot.logsByGoalDate}
                      showDivider={i > 0}
                    />
                  ))}
                </DashSection>
              ) : null}

              {monthlyGoals.length > 0 ? (
                <DashSection
                  title="MONTHLY GOAL PROGRESS"
                  isOpen={monthlyOpen}
                  onToggle={() => setMonthlyOpen((v) => !v)}
                >
                  {monthlyGoals.map((goal, i) => (
                    <MonthlyGoalRow
                      key={goal.id}
                      goal={goal}
                      currentMonthKey={currentMonthKey}
                      logsByGoalDate={snapshot.logsByGoalDate}
                      showDivider={i > 0}
                    />
                  ))}
                </DashSection>
              ) : null}

              {lowerPriorityGoals.length > 0 ? (
                <DashSection
                  title="SHOW LOWER PRIORITY GOALS"
                  isOpen={lowerOpen}
                  onToggle={() => setLowerOpen((v) => !v)}
                  collapsedContent={<IconPreview goals={lowerPriorityGoals} />}
                >
                  {lowerPriorityCats.map((cat, i) => (
                    <CategoryHeatmap
                      key={cat.id}
                      category={cat}
                      goals={cat.goals}
                      days={last10Days}
                      logsByGoalDate={snapshot.logsByGoalDate}
                      showDivider={i > 0}
                    />
                  ))}
                </DashSection>
              ) : null}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function DashSection({
  title,
  isOpen,
  onToggle,
  children,
  collapsedContent,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  collapsedContent?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.section,
        { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
      ]}
    >
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.sectionHeader, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
      >
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {title}
        </Text>
        <SymbolView
          name={sym(
            isOpen ? "chevron.up" : "chevron.down",
            isOpen ? "expand_less" : "expand_more",
          )}
          size={14}
          weight="semibold"
          tintColor={theme.textSecondary}
        />
      </Pressable>
      {isOpen ? (
        <View
          style={[styles.sectionContent, { borderTopColor: theme.tabBorder }]}
        >
          {children}
        </View>
      ) : collapsedContent ? (
        collapsedContent
      ) : null}
    </View>
  );
}

function MonthlyGoalRow({
  goal,
  currentMonthKey,
  logsByGoalDate,
  showDivider,
}: {
  goal: PeriodicGoalInfo;
  currentMonthKey: string;
  logsByGoalDate: Record<string, "complete" | "planned">;
  showDivider: boolean;
}) {
  const theme = useTheme();

  const completions = useMemo(() => {
    let count = 0;
    const prefix = `${goal.id}_${currentMonthKey}-`;
    for (const [key, val] of Object.entries(logsByGoalDate)) {
      if (key.startsWith(prefix) && val === "complete") count++;
    }
    return count;
  }, [goal.id, currentMonthKey, logsByGoalDate]);

  const total = goal.frequencyGoal ?? 1;
  const pct = Math.min(completions / total, 1);
  const isComplete = pct >= 1;

  return (
    <View>
      {showDivider ? (
        <View
          style={[styles.rowDivider, { backgroundColor: theme.tabBorder }]}
        />
      ) : null}
      <View style={styles.monthlyRow}>
        <View
          style={[
            styles.monthlyIcon,
            {
              backgroundColor: isComplete
                ? `${theme.primary}22`
                : theme.backgroundElement,
            },
          ]}
        >
          <SymbolView
            name={goalSymbol(goal.iconKey)}
            size={18}
            weight="semibold"
            tintColor={isComplete ? theme.primary : theme.tabIcon}
          />
        </View>
        <View style={styles.progressBarWrap}>
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            {pct > 0 ? (
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: theme.primary,
                    width: `${Math.round(pct * 100)}%`,
                  },
                ]}
              />
            ) : null}
          </View>
        </View>
        <Text style={[styles.progressCount, { color: theme.textSecondary }]}>
          {completions}/{total}
        </Text>
      </View>
    </View>
  );
}

function CategoryHeatmap({
  category,
  goals,
  days,
  logsByGoalDate,
  showDivider,
}: {
  category: CategoryWithGoals;
  goals: GoalInCategory[];
  days: string[];
  logsByGoalDate: Record<string, "complete" | "planned">;
  showDivider: boolean;
}) {
  const theme = useTheme();
  const color = getCategoryColor(category.name);

  return (
    <View style={styles.catHeatmap}>
      {showDivider ? (
        <View style={[styles.catDivider, { backgroundColor: theme.tabBorder }]} />
      ) : null}
      <Text style={[styles.catLabel, { color }]}>
        {category.name.toUpperCase()}
      </Text>
      {goals.map((goal) => {
        const dayStatuses = days.map(
          (d) => logsByGoalDate[`${goal.id}_${d}`] === "complete",
        );
        return (
          <View key={goal.id} style={styles.heatmapRow}>
            <View
              style={[
                styles.heatmapIcon,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <SymbolView
                name={goalSymbol(goal.iconKey)}
                size={13}
                weight="semibold"
                tintColor={theme.tabIcon}
              />
            </View>
            <View style={styles.dayBlocks}>
              {days.map((d, i) => (
                <View
                  key={d}
                  style={[
                    styles.dayBlock,
                    { backgroundColor: dayStatuses[i] ? color : `${color}25` },
                  ]}
                />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function IconPreview({ goals }: { goals: GoalInCategory[] }) {
  const theme = useTheme();
  return (
    <View style={styles.iconPreview}>
      {goals.map((goal) => (
        <View
          key={goal.id}
          style={[
            styles.iconPreviewItem,
            { backgroundColor: theme.backgroundElement },
          ]}
        >
          <SymbolView
            name={goalSymbol(goal.iconKey)}
            size={16}
            weight="semibold"
            tintColor={theme.textSecondary}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 18,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  pageHeaderIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  pageHeaderText: { gap: 1 },
  pageTitle: {
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  pageSubtitle: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: "#F3B7B933",
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  errorText: {
    flex: 1,
    color: "#9D474D",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  retryText: { color: "#9D474D", fontSize: 12, fontWeight: "800" },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  sections: { gap: 14 },
  section: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    overflow: "hidden",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sectionTitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  sectionContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pressed: { opacity: 0.72 },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  monthlyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 9,
    paddingHorizontal: 4,
  },
  monthlyIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  progressBarWrap: { flex: 1 },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    minWidth: 6,
  },
  progressCount: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    width: 38,
    textAlign: "right",
  },
  catHeatmap: {
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 5,
  },
  catDivider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  catLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  heatmapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 32,
  },
  heatmapIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  dayBlocks: {
    flex: 1,
    flexDirection: "row",
    gap: 3,
  },
  dayBlock: {
    flex: 1,
    height: 28,
    borderRadius: 7,
  },
  iconPreview: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  iconPreviewItem: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
});
