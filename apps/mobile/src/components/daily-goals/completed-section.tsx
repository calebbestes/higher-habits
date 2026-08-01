import { SymbolView } from "expo-symbols";
import { Pressable, Text, View } from "react-native";

import { withErrorTrace } from "@/components/component-error-boundary";
import { useTheme } from "@/hooks/use-theme";
import type { FriendGroupRow, FriendRow } from "@/lib/friends-client";
import type { CategoryWithGoals, GoalInCategory } from "@/lib/goal-logs-client";

import { GoalRow } from "./goal-row";
import { getGoalDateStatus, styles, sym } from "./shared";

function CompletedSectionImpl({
  completedList,
  dateKey,
  logsByGoalDate,
  plannedTimesByGoalDate,
  friends,
  friendGroups,
  updatingKeys,
  isOpen,
  onToggle,
  onEditGoal,
  onPressGoal,
}: {
  completedList: { goal: GoalInCategory; category: CategoryWithGoals }[];
  dateKey: string;
  logsByGoalDate: Record<string, "complete" | "incomplete" | "planned">;
  plannedTimesByGoalDate?: Record<
    string,
    { startTime: string | null; endTime: string | null; repeatsDaily?: boolean }
  >;
  friends: FriendRow[];
  friendGroups: FriendGroupRow[];
  updatingKeys: Set<string>;
  isOpen: boolean;
  onToggle: () => void;
  onEditGoal: (goal: GoalInCategory) => void;
  onPressGoal: (goal: GoalInCategory) => void;
}) {
  const theme = useTheme();
  if (completedList.length === 0) return null;

  return (
    <View style={styles.priorityBlock}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.priorityHeader,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
      >
        <View style={styles.priorityHeaderLabelRow}>
          <SymbolView
            name={sym(
              isOpen ? "chevron.down" : "chevron.right",
              isOpen ? "expand_more" : "chevron_right",
            )}
            size={13}
            weight="bold"
            tintColor={theme.textSecondary}
          />
          <Text style={[styles.priorityLabel, { color: theme.textSecondary }]}>
            {`SHOW COMPLETED (${completedList.length})`}
          </Text>
        </View>
      </Pressable>
      {isOpen ? (
        <View
          style={[
            styles.goalSurface,
            { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
          ]}
        >
          {completedList.map(({ goal }, index) => (
            <View key={goal.id}>
              {index > 0 ? (
                <View
                  style={[styles.divider, { backgroundColor: theme.tabBorder }]}
                />
              ) : null}
              <GoalRow
                goal={goal}
                status={getGoalDateStatus(goal, dateKey, logsByGoalDate)}
                plannedTime={plannedTimesByGoalDate?.[`${goal.id}_${dateKey}`]}
                friends={friends}
                friendGroups={friendGroups}
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

export const CompletedSection = withErrorTrace(
  CompletedSectionImpl,
  "CompletedSection",
);
