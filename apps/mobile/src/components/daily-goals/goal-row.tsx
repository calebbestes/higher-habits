import { Image } from "expo-image";
import { SymbolView } from "expo-symbols";
import { Pressable, Text, View } from "react-native";

import { withErrorTrace } from "@/components/component-error-boundary";
import { GoalIcon } from "@/components/goal-icon";
import { useTheme } from "@/hooks/use-theme";
import type { FriendGroupRow, FriendRow } from "@/lib/friends-client";
import { formatStoredPlanTimeDisplay } from "@/lib/plan-time";

import { type ActionGoal, type GoalDateStatus, styles, sym } from "./shared";

function GoalRowImpl({
  goal,
  status,
  completedCount = 0,
  friends,
  friendGroups,
  plannedTime,
  onEdit,
  onPress,
}: {
  goal: ActionGoal;
  status: GoalDateStatus;
  completedCount?: number;
  friends?: FriendRow[];
  friendGroups?: FriendGroupRow[];
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
  const hasSlip = status === "incomplete";
  const isPlanned = status === "planned";
  const plannedTimeDisplay = isPlanned
    ? formatStoredPlanTimeDisplay(plannedTime?.startTime)
    : null;
  const statusIcon = isComplete
    ? sym("checkmark", "check")
    : isPlanned
      ? sym("clock", "schedule")
      : hasSlip
        ? sym("xmark", "close")
        : null;
  const statusColor = hasSlip ? "#B84D54" : theme.primary;
  const instanceTarget =
    goal.period === "daily" ? Math.max(goal.frequencyGoal ?? 1, 1) : 1;
  const progressLabel =
    instanceTarget > 1
      ? `${Math.min(completedCount, instanceTarget)}/${instanceTarget}`
      : null;
  const hasPlannedTime = Boolean(plannedTimeDisplay);

  const audienceFriends = getAudienceFriends(
    goal,
    friends ?? [],
    friendGroups ?? [],
  );
  const sharedFriends = getSharedFriends(goal);
  const visibleFriends =
    goal.visibility === "goal_friends" ? audienceFriends : sharedFriends;
  const friendBadges = visibleFriends.slice(0, 3);

  return (
    <View style={styles.goalRow}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${goal.name}, ${hasSlip ? "slip recorded" : (status ?? "not reported")}. Tap to open actions.`}
        onPress={onPress}
        style={({ pressed }) => [styles.goalRowMain, pressed && styles.pressed]}
      >
        <View
          style={[
            styles.goalStatusControl,
            {
              backgroundColor: isComplete
                ? `${theme.primary}24`
                : "transparent",
              borderColor:
                isComplete || isPlanned || hasSlip
                  ? `${statusColor}AA`
                  : theme.tabBorder,
            },
          ]}
        >
          {statusIcon ? (
            <SymbolView
              name={statusIcon}
              size={10}
              weight="bold"
              tintColor={statusColor}
            />
          ) : null}
        </View>

        {/* Goal icon */}
        <View style={styles.goalIcon}>
          <GoalIcon
            filled
            iconKey={goal.iconKey}
            size={15}
            color={theme.textSecondary}
          />
        </View>

        {/* Goal name */}
        <View style={styles.goalTextStack}>
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
          <Text
            numberOfLines={1}
            style={[styles.goalVisibilityText, { color: theme.textSecondary }]}
          >
            {[
              getDefaultVisibilityLabel(
                goal.visibility,
                audienceFriends.length,
              ),
              progressLabel,
            ]
              .filter(Boolean)
              .join(" · ")}
          </Text>
        </View>

        {friendBadges.length ? (
          <View style={styles.sharedFriendBadgeStack}>
            {friendBadges.map((friend, index) => (
              <View
                key={friend.userId}
                style={[
                  styles.sharedFriendBadge,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBar,
                    marginLeft: index === 0 ? 0 : -8,
                    zIndex: friendBadges.length - index,
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
      </Pressable>

      {onEdit ? (
        <Pressable
          accessibilityLabel={`Edit ${goal.name}`}
          accessibilityRole="button"
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
    </View>
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

function getAudienceFriends(
  goal: ActionGoal,
  friends: FriendRow[],
  groups: FriendGroupRow[],
) {
  const friendsById = new Map<
    string,
    { userId: string; name: string; image: string | null }
  >();
  const selectedFriendIds = new Set(goal.audienceFriendIds ?? []);
  const selectedGroupIds = new Set(goal.audienceGroupIds ?? []);

  for (const friend of friends) {
    if (!selectedFriendIds.has(friend.friendId)) continue;
    friendsById.set(friend.friendId, {
      userId: friend.friendId,
      name: friend.friendName,
      image: friend.friendImage,
    });
  }

  for (const group of groups) {
    if (!selectedGroupIds.has(group.id)) continue;
    for (const member of group.members) {
      friendsById.set(member.id, {
        userId: member.id,
        name: member.name,
        image: member.image,
      });
    }
  }

  return [...friendsById.values()];
}

function getDefaultVisibilityLabel(
  visibility: ActionGoal["visibility"],
  audienceCount: number,
) {
  if (visibility === "all_friends") return "Public";
  if (visibility === "goal_friends") {
    return audienceCount > 0
      ? `${audienceCount} friends selected`
      : "Select friends";
  }
  return "Private";
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
