import { Image } from "expo-image";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/hooks/use-theme";
import type { FriendFeedEntry, FriendRow } from "@/lib/friends-client";
import type { Goal } from "@/lib/goals-client";
import type { Goal as PlanGoal } from "@/lib/planning-goals-client";

type SharedGoalDetails = NonNullable<FriendFeedEntry["sharedGoal"]>;
type Selection = string | null | undefined;
type SymbolName = SymbolViewProps["name"];

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function scoringLabel(scoringType: SharedGoalDetails["scoringType"]) {
  switch (scoringType) {
    case "shared_streak":
      return "Collaborative streak";
    case "combined_target":
      return "Combined target";
    case "first_to_target":
      return "First to target";
    case "highest_total":
      return "Highest total";
    case "longest_streak":
      return "Longest streak";
    case "one_time":
      return "One-time goal";
  }
}

function formatDate(dateKey: string | null) {
  if (!dateKey) return "No end date";
  const date = new Date(`${dateKey}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? dateKey
    : `Ends ${date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })}`;
}

function Avatar({ image, name }: { image: string | null; name: string }) {
  const theme = useTheme();
  return image ? (
    <Image contentFit="cover" source={{ uri: image }} style={styles.avatar} />
  ) : (
    <View style={[styles.avatar, { backgroundColor: `${theme.primary}18` }]}>
      <Text style={[styles.avatarText, { color: theme.primary }]}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

export function SharedGoalInviteModal({
  entry,
  friends,
  personalGoals,
  personalPlanGoals,
  submitting,
  onClose,
  onJoin,
}: {
  entry: FriendFeedEntry;
  friends: FriendRow[];
  personalGoals: Goal[];
  personalPlanGoals: PlanGoal[];
  submitting: boolean;
  onClose: () => void;
  onJoin: (personalGoalId: string | null, inviteFriendIds: string[]) => void;
}) {
  const theme = useTheme();
  const sharedGoal = entry.sharedGoal;
  const [selectedGoalId, setSelectedGoalId] = useState<Selection>(undefined);
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const isOneTime = sharedGoal?.scoringType === "one_time";

  const inviteableFriends = useMemo(() => {
    if (!sharedGoal?.openInvite) return [];
    const participantIds = new Set(
      sharedGoal.participants.map((participant) => participant.userId),
    );
    return friends.filter(
      (friend) =>
        friend.status === "accepted" && !participantIds.has(friend.friendId),
    );
  }, [friends, sharedGoal]);
  const allFriendsSelected =
    inviteableFriends.length > 0 &&
    selectedFriendIds.length === inviteableFriends.length;
  const linkableGoals = isOneTime
    ? personalPlanGoals.map((goal) => ({ id: goal.id, name: goal.title }))
    : personalGoals.map((goal) => ({ id: goal.id, name: goal.name }));

  if (!sharedGoal) return null;

  const selectAllFriends = () => {
    setSelectedFriendIds(
      allFriendsSelected
        ? []
        : inviteableFriends.map((friend) => friend.friendId),
    );
  };

  return (
    <SafeAreaView
      edges={["top", "bottom"]}
      style={[styles.screen, { backgroundColor: theme.background }]}
    >
      <View style={[styles.header, { borderBottomColor: theme.tabBorder }]}>
        <Pressable
          accessibilityLabel="Close invitation"
          hitSlop={8}
          onPress={onClose}
          style={({ pressed }) => [
            styles.headerButton,
            pressed && styles.pressed,
          ]}
        >
          <SymbolView
            name={sym("xmark", "close")}
            size={22}
            weight="semibold"
            tintColor={theme.primary}
          />
        </Pressable>
        <Text style={[styles.headerTitle, { color: theme.text }]}>
          Shared goal invite
        </Text>
        <View style={styles.headerButton} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.goalCard,
            {
              backgroundColor: `${theme.primary}10`,
              borderColor: `${theme.primary}55`,
            },
          ]}
        >
          <Text style={[styles.kicker, { color: theme.primary }]}>
            YOU'RE INVITED
          </Text>
          <Text style={[styles.goalName, { color: theme.text }]}>
            {sharedGoal.name}
          </Text>
          <Text style={[styles.inviter, { color: theme.textSecondary }]}>
            {entry.friend.name} invited you
          </Text>
          <View style={styles.detailRow}>
            <View style={styles.detailItem}>
              <SymbolView
                name={sym("person.2.fill", "groups")}
                size={16}
                weight="semibold"
                tintColor={theme.primary}
              />
              <Text style={[styles.detailText, { color: theme.textSecondary }]}>
                {sharedGoal.mode === "collaborative"
                  ? "Collaborative"
                  : "Competitive"}
              </Text>
            </View>
            <View style={styles.detailItem}>
              <SymbolView
                name={sym("chart.bar.fill", "bar_chart")}
                size={16}
                weight="semibold"
                tintColor={theme.primary}
              />
              <Text style={[styles.detailText, { color: theme.textSecondary }]}>
                {scoringLabel(sharedGoal.scoringType)}
              </Text>
            </View>
          </View>
          {sharedGoal.target !== null ? (
            <Text style={[styles.targetText, { color: theme.text }]}>
              Target: {sharedGoal.target}
            </Text>
          ) : null}
          <Text style={[styles.dateText, { color: theme.textSecondary }]}>
            {formatDate(sharedGoal.endsOn)}
          </Text>
          <View style={styles.participantRow}>
            <View style={styles.avatarStack}>
              {sharedGoal.participants.slice(0, 5).map((participant, index) => (
                <View
                  key={participant.id}
                  style={[
                    styles.stackedAvatar,
                    { marginLeft: index === 0 ? 0 : -8 },
                  ]}
                >
                  <Avatar image={participant.image} name={participant.name} />
                </View>
              ))}
            </View>
            <Text
              style={[styles.participantText, { color: theme.textSecondary }]}
            >
              {sharedGoal.participants.length} participant
              {sharedGoal.participants.length === 1 ? "" : "s"}
            </Text>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          Link a personal goal
        </Text>
        <Text style={[styles.sectionHint, { color: theme.textSecondary }]}>
          {isOneTime
            ? "Choose an existing personal goal to complete once for this shared goal."
            : "Choose an existing habit to track with this shared goal, or create a new linked habit."}
        </Text>
        <ChoiceRow
          label={
            isOneTime
              ? "No linked goal — I'll link later"
              : "No linked goal — create one for me"
          }
          selected={selectedGoalId === null}
          onPress={() => setSelectedGoalId(null)}
        />
        {linkableGoals.map((goal) => (
          <ChoiceRow
            key={goal.id}
            label={goal.name}
            selected={selectedGoalId === goal.id}
            onPress={() => setSelectedGoalId(goal.id)}
          />
        ))}

        {sharedGoal.openInvite ? (
          <>
            <View style={styles.sectionHeadingRow}>
              <View style={styles.sectionHeadingCopy}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Invite friends
                </Text>
                <Text
                  style={[styles.sectionHint, { color: theme.textSecondary }]}
                >
                  This goal is open to invitations from participants.
                </Text>
              </View>
              <Pressable onPress={selectAllFriends}>
                <Text style={[styles.selectAllText, { color: theme.primary }]}>
                  {allFriendsSelected ? "Clear" : "Select all"}
                </Text>
              </Pressable>
            </View>
            {inviteableFriends.map((friend) => {
              const selected = selectedFriendIds.includes(friend.friendId);
              return (
                <Pressable
                  key={friend.friendId}
                  onPress={() =>
                    setSelectedFriendIds((current) =>
                      selected
                        ? current.filter((id) => id !== friend.friendId)
                        : [...current, friend.friendId],
                    )
                  }
                  style={({ pressed }) => [
                    styles.friendRow,
                    { borderBottomColor: theme.tabBorder },
                    pressed && styles.pressed,
                  ]}
                >
                  <Avatar image={friend.friendImage} name={friend.friendName} />
                  <Text style={[styles.friendName, { color: theme.text }]}>
                    {friend.friendName}
                  </Text>
                  <SymbolView
                    name={sym(
                      selected ? "checkmark.circle.fill" : "circle",
                      selected ? "check_circle" : "radio_button_unchecked",
                    )}
                    size={24}
                    weight="semibold"
                    tintColor={selected ? theme.primary : theme.textSecondary}
                  />
                </Pressable>
              );
            })}
          </>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            borderTopColor: theme.tabBorder,
            backgroundColor: theme.background,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          disabled={selectedGoalId === undefined || submitting}
          onPress={() => {
            if (selectedGoalId !== undefined) {
              onJoin(selectedGoalId, selectedFriendIds);
            }
          }}
          style={({ pressed }) => [
            styles.joinButton,
            {
              backgroundColor:
                selectedGoalId === undefined || submitting
                  ? theme.backgroundSelected
                  : theme.primary,
            },
            pressed && styles.pressed,
          ]}
        >
          {submitting ? (
            <ActivityIndicator color={theme.primaryForeground} />
          ) : (
            <Text
              style={[
                styles.joinButtonText,
                {
                  color:
                    selectedGoalId === undefined
                      ? theme.textSecondary
                      : theme.primaryForeground,
                },
              ]}
            >
              Join shared goal
            </Text>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function ChoiceRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.choiceRow,
        {
          backgroundColor: selected
            ? `${theme.primary}12`
            : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.tabBorder,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.choiceLabel, { color: theme.text }]}>{label}</Text>
      <SymbolView
        name={sym(
          selected ? "checkmark.circle.fill" : "circle",
          selected ? "check_circle" : "radio_button_unchecked",
        )}
        size={23}
        weight="semibold"
        tintColor={selected ? theme.primary : theme.textSecondary}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
  },
  headerButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: 20, fontWeight: "700" },
  content: { gap: 12, padding: 18, paddingBottom: 28 },
  goalCard: { borderRadius: 22, borderWidth: 1, gap: 8, padding: 18 },
  kicker: { fontSize: 12, fontWeight: "800", letterSpacing: 1.2 },
  goalName: { fontSize: 26, fontWeight: "800", lineHeight: 31 },
  inviter: { fontSize: 16 },
  detailRow: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 8 },
  detailItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  detailText: { fontSize: 14, fontWeight: "600" },
  targetText: { fontSize: 16, fontWeight: "700", marginTop: 2 },
  dateText: { fontSize: 14 },
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 4,
  },
  avatarStack: { flexDirection: "row", alignItems: "center" },
  stackedAvatar: { borderRadius: 18 },
  participantText: { fontSize: 14 },
  avatarClip: { borderRadius: 18, overflow: "hidden" },
  avatar: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  avatarText: { fontSize: 16, fontWeight: "800" },
  sectionHeadingRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginTop: 12,
  },
  sectionHeadingCopy: { flex: 1 },
  sectionTitle: { fontSize: 20, fontWeight: "800", marginTop: 10 },
  sectionHint: { fontSize: 15, lineHeight: 21 },
  selectAllText: { fontSize: 15, fontWeight: "700", marginTop: 12 },
  choiceRow: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderRadius: 15,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  choiceLabel: { flex: 1, fontSize: 16, fontWeight: "600" },
  friendRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  friendName: { flex: 1, fontSize: 16, fontWeight: "600" },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, padding: 16 },
  joinButton: {
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    paddingHorizontal: 18,
  },
  joinButtonText: { fontSize: 18, fontWeight: "800" },
  pressed: { opacity: 0.65 },
});
