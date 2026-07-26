import { SymbolView } from "expo-symbols";
import { Pressable, Text, View } from "react-native";

import { withErrorTrace } from "@/components/component-error-boundary";
import { GoalIcon } from "@/components/goal-icon";
import { useTheme } from "@/hooks/use-theme";
import type { CategoryWithGoals, GoalInCategory } from "@/lib/goal-logs-client";

import { GoalRow } from "./goal-row";
import { getGoalDateStatus, styles, sym } from "./shared";

function CategoryAccordionRowImpl({
  category,
  goals,
  dateKey,
  logsByGoalDate,
  completedCountsByGoalDate,
  plannedTimesByGoalDate,
  updatingKeys,
  isExpanded,
  onToggleExpand,
  onEditGoal,
  onPressGoal,
}: {
  category: CategoryWithGoals;
  goals: GoalInCategory[];
  dateKey: string;
  logsByGoalDate: Record<string, "complete" | "incomplete" | "planned">;
  completedCountsByGoalDate?: Record<string, number>;
  plannedTimesByGoalDate?: Record<
    string,
    { startTime: string | null; endTime: string | null; repeatsDaily?: boolean }
  >;
  updatingKeys: Set<string>;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEditGoal: (goal: GoalInCategory) => void;
  onPressGoal: (goal: GoalInCategory) => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.catAccordion,
        { backgroundColor: theme.tabBar, borderColor: `${theme.tabBorder}99` },
      ]}
    >
      <Pressable
        onPress={onToggleExpand}
        accessibilityRole="button"
        accessibilityState={{ expanded: isExpanded }}
        style={({ pressed }) => [styles.catRow, pressed && styles.pressed]}
      >
        <View
          style={[
            styles.catIconWrap,
            { backgroundColor: theme.backgroundElement },
          ]}
        >
          <GoalIcon
            iconKey={category.icon}
            size={18}
            color={theme.primary}
            filled
          />
        </View>
        <View style={styles.catRowText}>
          <Text style={[styles.catName, { color: theme.text }]}>
            {category.name}
          </Text>
          <Text style={[styles.catCount, { color: theme.textSecondary }]}>
            {goals.length} {goals.length === 1 ? "habit" : "habits"}
          </Text>
        </View>
        <SymbolView
          name={sym(
            isExpanded ? "chevron.up" : "chevron.down",
            isExpanded ? "expand_less" : "expand_more",
          )}
          size={14}
          weight="semibold"
          tintColor={theme.tabIcon}
        />
      </Pressable>

      {isExpanded ? (
        <View
          style={[styles.catGoals, { borderTopColor: `${theme.tabBorder}80` }]}
        >
          {goals.map((goal, index) => (
            <View key={goal.id}>
              {index > 0 ? (
                <View
                  style={[
                    styles.divider,
                    { backgroundColor: `${theme.tabBorder}70` },
                  ]}
                />
              ) : null}
              <GoalRow
                goal={goal}
                status={getGoalDateStatus(goal, dateKey, logsByGoalDate)}
                completedCount={
                  completedCountsByGoalDate?.[`${goal.id}_${dateKey}`] ?? 0
                }
                plannedTime={plannedTimesByGoalDate?.[`${goal.id}_${dateKey}`]}
                isUpdating={updatingKeys.has(`${goal.id}_${dateKey}`)}
                onEdit={() => onEditGoal(goal)}
                onPress={() => onPressGoal(goal)}
              />
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export const CategoryAccordionRow = withErrorTrace(
  CategoryAccordionRowImpl,
  "CategoryAccordionRow",
);
