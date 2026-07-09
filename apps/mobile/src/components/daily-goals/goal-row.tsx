import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { Pressable, Text, View } from "react-native";

import { withErrorTrace } from "@/components/component-error-boundary";
import { GoalIcon } from "@/components/goal-icon";
import { useTheme } from "@/hooks/use-theme";
import { formatStoredPlanTimeDisplay } from "@/lib/plan-time";

import { type ActionGoal, styles, sym } from "./shared";

function GoalRowImpl({
  goal,
  status,
  plannedTime,
  onEdit,
  onPress,
}: {
  goal: ActionGoal;
  status: "complete" | "planned" | undefined;
  plannedTime?: {
    startTime: string | null;
    endTime: string | null;
    repeatsDaily?: boolean;
  } | null;
  isUpdating: boolean;
  onEdit?: () => void;
  onPress: () => void;
}) {
  const theme = useTheme();
  const isComplete = status === "complete";
  const isPlanned = status === "planned";
  const plannedTimeDisplay = isPlanned
    ? formatStoredPlanTimeDisplay(plannedTime?.startTime)
    : null;
  const hasPlannedTime = Boolean(plannedTimeDisplay);

  const sharedFriends = getSharedFriends(goal).slice(0, 3);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${goal.name}, ${status ?? "not reported"}. Tap to open actions.`}
      onPress={onPress}
      style={({ pressed }) => [styles.goalRow, pressed && styles.pressed]}
    >
      {/* Goal icon */}
      <View style={styles.goalIcon}>
        <GoalIcon
          filled
          iconKey={goal.iconKey}
          size={17}
          color={theme.primary}
        />
      </View>

      {/* Goal name */}
      <Text
        numberOfLines={2}
        style={[
          styles.goalName,
          { color: isComplete ? theme.textSecondary : theme.text },
          isComplete && styles.completedText,
        ]}
      >
        {goal.name}
      </Text>

      {sharedFriends.length ? (
        <View style={styles.sharedFriendBadgeStack}>
          {sharedFriends.map((friend, index) => (
            <View
              key={friend.userId}
              style={[
                styles.sharedFriendBadge,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.tabBar,
                  marginLeft: index === 0 ? 0 : -8,
                  zIndex: sharedFriends.length - index,
                },
              ]}
            >
              {friend.image ? (
                <Image
                  source={{ uri: friend.image }}
                  style={styles.sharedFriendBadgeImage}
                />
              ) : (
                <Text
                  style={[
                    styles.sharedFriendBadgeText,
                    { color: theme.primary },
                  ]}
                >
                  {getInitials(friend.name)}
                </Text>
              )}
            </View>
          ))}
        </View>
      ) : null}

      {hasPlannedTime && plannedTimeDisplay ? (
        <View style={styles.planTimeBadge}>
          <Text style={[styles.planTimeBadgeTime, { color: theme.primary }]}>
            {plannedTimeDisplay}
          </Text>
        </View>
      ) : null}

      {onEdit ? (
        <Pressable
          accessibilityLabel={`Edit ${goal.name}`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={(event) => {
            event.stopPropagation();
            onEdit();
          }}
          style={({ pressed }) => [
            styles.goalMenuButton,
            pressed && styles.pressed,
          ]}
        >
          <SymbolView
            name={sym("ellipsis", "more_horiz")}
            size={17}
            weight="semibold"
            tintColor={theme.textSecondary}
          />
        </Pressable>
      ) : null}
    </Pressable>
  );
}

function getSharedFriends(goal: ActionGoal) {
  const friendsById = new Map<
    string,
    { userId: string; name: string; image: string | null }
  >();

  for (const sharedGoal of goal.sharedGoals ?? []) {
    for (const friend of sharedGoal.friends ?? []) {
      friendsById.set(friend.userId, friend);
    }
  }

  return [...friendsById.values()];
}

function getInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export const GoalRow = withErrorTrace(GoalRowImpl, "GoalRow");
