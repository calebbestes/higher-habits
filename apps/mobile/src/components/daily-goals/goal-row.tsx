import { SymbolView } from "expo-symbols";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { withErrorTrace } from "@/components/component-error-boundary";
import { GoalIcon } from "@/components/goal-icon";
import { useTheme } from "@/hooks/use-theme";

import { type ActionGoal, styles, sym } from "./shared";

function GoalRowImpl({
  goal,
  status,
  isUpdating,
  onEdit,
  onPress,
}: {
  goal: ActionGoal;
  status: "complete" | "planned" | undefined;
  isUpdating: boolean;
  onEdit?: () => void;
  onPress: () => void;
}) {
  const theme = useTheme();
  const isComplete = status === "complete";
  const isPlanned = status === "planned";

  const statusBg = isComplete
    ? theme.primary
    : isPlanned
      ? "#B87D4D"
      : "transparent";
  const statusBorder = isComplete
    ? theme.primary
    : isPlanned
      ? "#B87D4D"
      : theme.tabBorder;
  const rowBg = isComplete
    ? `${theme.primary}12`
    : isPlanned
      ? "#B87D4D0E"
      : "transparent";

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${goal.name}, ${status ?? "not reported"}. Tap to open actions.`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.goalRow,
        { backgroundColor: rowBg },
        pressed && styles.pressed,
      ]}
    >
      {/* Status toggle */}
      <View
        style={[
          styles.statusButton,
          { backgroundColor: statusBg, borderColor: statusBorder },
        ]}
      >
        {isUpdating ? (
          <ActivityIndicator
            size="small"
            color={isComplete || isPlanned ? "#FFFFFF" : theme.primary}
          />
        ) : isComplete ? (
          <SymbolView
            name={sym("checkmark", "check")}
            size={13}
            weight="bold"
            tintColor="#FFFFFF"
          />
        ) : isPlanned ? (
          <SymbolView
            name={sym("clock", "schedule")}
            size={13}
            weight="semibold"
            tintColor="#FFFFFF"
          />
        ) : null}
      </View>

      {/* Goal icon */}
      <View
        style={[styles.goalIcon, { backgroundColor: theme.backgroundElement }]}
      >
        <GoalIcon
          iconKey={goal.iconKey}
          size={17}
          color={isComplete ? theme.primary : theme.tabIcon}
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
            { backgroundColor: theme.backgroundElement },
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

export const GoalRow = withErrorTrace(GoalRowImpl, "GoalRow");
