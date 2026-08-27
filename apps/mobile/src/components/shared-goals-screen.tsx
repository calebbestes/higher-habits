import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { Image } from "expo-image";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InteractionManager,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { BrandedEmptyState } from "@/components/branded-empty-state";
import { GoalActionsModal } from "@/components/daily-goals/goal-actions-modal";
import {
  type ActionGoal,
  getGoalDateStatus,
} from "@/components/daily-goals/shared";
import { DatePartPicker } from "@/components/date-part-picker";
import { GoalNoteEditorModal } from "@/components/goal-note-editor-modal";
import {
  CollabSectionHeaderTabs,
  PageHeaderTitle,
} from "@/components/section-header-tabs";
import { SharedGoalInviteModal } from "@/components/shared-goal-invite-modal";
import { useTheme } from "@/hooks/use-theme";
import {
  type FriendFeedEntry,
  type FriendGroupRow,
  type FriendRow,
  fetchFriendGroups,
  fetchFriends,
  sendFriendNudge,
} from "@/lib/friends-client";
import {
  type GoalLogStatus,
  type GoalLogsSnapshot,
  fetchGoalLogsSnapshot,
  getMonthKey,
  setGoalLog,
  setGoalLogNote,
  setGoalLogVisibility,
  toDateKey,
} from "@/lib/goal-logs-client";
import { type GoalPhotoSource, pickGoalPhoto } from "@/lib/goal-photo-picker";
import { uploadGoalPhoto } from "@/lib/goal-photos-client";
import { type Goal, type GoalVisibility, fetchGoals } from "@/lib/goals-client";
import {
  playSelectionHaptic,
  playSuccessHaptic,
  playWarningHaptic,
} from "@/lib/haptics";
import {
  type Goal as PlanGoal,
  fetchPlanGoals,
} from "@/lib/planning-goals-client";
import {
  type CreateSharedGoalInput,
  type SharedGoalParticipantSnapshot,
  type SharedGoalScoringType,
  type SharedGoalSnapshot,
  type SharedGoalStakeType,
  createSharedGoal,
  fetchSharedGoals,
  inviteSharedGoalParticipants,
  respondToSharedGoal,
  updateSharedGoal,
} from "@/lib/shared-goals-client";

const SCORING_LABELS: Record<SharedGoalScoringType, string> = {
  shared_streak: "Collaborative Streak",
  combined_target: "Combined Target",
  first_to_target: "First to Target",
  highest_total: "Highest Total",
  longest_streak: "Longest Streak",
  one_time: "One-time Goal",
};

const SCORING_EXPLAINERS: { label: string; description: string }[] = [
  {
    label: "Collaborative Streak",
    description:
      "Builds one shared streak when every participant completes the goal each day. The streak resets to zero when anyone misses a day.",
  },
  {
    label: "Combined Target",
    description:
      "Pools everyone's completions into one shared number and races toward a target you set (e.g. 100 workouts as a group). Each person's completion pushes the same bar forward.",
  },
  {
    label: "One-time Goal",
    description:
      "Link an existing personal goal. Each participant completes it once, with no recurring target to report.",
  },
];

const COLLAB_SCORING: SharedGoalScoringType[] = [
  "shared_streak",
  "combined_target",
  "one_time",
];

const COMP_SCORING: SharedGoalScoringType[] = [
  "first_to_target",
  "highest_total",
  "longest_streak",
  "one_time",
];

const NEEDS_TARGET = new Set<SharedGoalScoringType>([
  "shared_streak",
  "combined_target",
  "first_to_target",
]);

const STAKE_OPTIONS: {
  type: SharedGoalStakeType;
  label: string;
  description: string;
}[] = [
  {
    type: "none",
    label: "No consequence",
    description: "Keep it pressure-free",
  },
  {
    type: "carrot",
    label: "Carrot",
    description: "A reward for finishing",
  },
  {
    type: "stick",
    label: "Stick",
    description: "A consequence for falling short",
  },
];

type SymbolName = SymbolViewProps["name"];

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function todayKey() {
  return toDateKey(new Date());
}

function dateKeyAfterDays(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

function formatEndDate(dateStr: string | null): string {
  if (!dateStr) return "Ongoing";
  try {
    const d = new Date(`${dateStr}T12:00:00`);
    return `Ends ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  } catch {
    return dateStr;
  }
}

function parseDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

function formatActivityDate(dateKey: string): string {
  const date = parseDateKey(dateKey);
  const today = new Date();
  const todayAtNoon = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    12,
  );
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((todayAtNoon.getTime() - date.getTime()) / dayMs);

  if (diffDays === 0) return "today";
  if (diffDays === 1) return "yesterday";

  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: date.getFullYear() === today.getFullYear() ? undefined : "numeric",
  });
}

function pluralize(value: number, singular: string, plural = `${singular}s`) {
  return `${value} ${value === 1 ? singular : plural}`;
}

function formatStreak(value: number) {
  return `${value}-day streak`;
}

function getCompetitiveScore(
  goal: SharedGoalSnapshot,
  participant: SharedGoalParticipantSnapshot,
) {
  return goal.scoringType === "longest_streak"
    ? participant.currentStreak
    : participant.completedCount;
}

function formatCompetitiveScore(goal: SharedGoalSnapshot, score: number) {
  if (goal.scoringType === "longest_streak") return formatStreak(score);
  if (goal.scoringType === "first_to_target" && goal.progress.target !== null) {
    return `${score}/${goal.progress.target} completions`;
  }
  return `${score} total`;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

// ─── Avatar ──────────────────────────────────────────────────────────────────

function Avatar({
  image,
  name,
  size,
  borderColor,
}: {
  image: string | null;
  name: string;
  size: number;
  borderColor?: string;
}) {
  const theme = useTheme();

  if (image) {
    return (
      <Image
        source={{ uri: image }}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: borderColor ? 2 : 0,
          borderColor: borderColor ?? "transparent",
        }}
        contentFit="cover"
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.backgroundSelected,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: borderColor ? 2 : 0,
        borderColor: borderColor ?? "transparent",
      }}
    >
      <Text
        style={{
          color: theme.primary,
          fontSize: size * 0.34,
          fontWeight: "600",
        }}
      >
        {getInitials(name)}
      </Text>
    </View>
  );
}

function AvatarStack({
  participants,
  size = 30,
  max = 4,
  borderColor,
}: {
  participants: SharedGoalParticipantSnapshot[];
  size?: number;
  max?: number;
  borderColor?: string;
}) {
  const theme = useTheme();
  const resolvedBorderColor = borderColor ?? theme.background;
  const shown = participants.slice(0, max);
  const extra = participants.length - max;
  const overlap = Math.floor(size * 0.38);

  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {shown.map((p, i) => (
        <View
          key={p.userId}
          style={{
            marginLeft: i === 0 ? 0 : -overlap,
            zIndex: shown.length - i,
          }}
        >
          <Avatar
            image={p.userImage}
            name={p.userName}
            size={size}
            borderColor={resolvedBorderColor}
          />
        </View>
      ))}
      {extra > 0 && (
        <View
          style={{
            marginLeft: -overlap,
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: theme.backgroundSelected,
            alignItems: "center",
            justifyContent: "center",
            borderWidth: 2,
            borderColor: resolvedBorderColor,
            zIndex: 0,
          }}
        >
          <Text
            style={{
              fontSize: size * 0.3,
              fontWeight: "700",
              color: theme.textSecondary,
            }}
          >
            +{extra}
          </Text>
        </View>
      )}
    </View>
  );
}

// ─── Badges ──────────────────────────────────────────────────────────────────

function ModeBadge({ mode }: { mode: "collaborative" | "competitive" }) {
  const theme = useTheme();
  const isCollab = mode === "collaborative";
  return (
    <View style={styles.badge}>
      <SymbolView
        name={
          isCollab
            ? sym("person.2.fill", "groups")
            : sym("trophy.fill", "emoji_events")
        }
        size={13}
        weight="semibold"
        tintColor={theme.primary}
      />
      <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
        {isCollab ? "Collaborative" : "Competitive"}
      </Text>
    </View>
  );
}

function ScoringBadge({ type }: { type: SharedGoalScoringType }) {
  const theme = useTheme();
  return (
    <View style={styles.badge}>
      <SymbolView
        name={sym("chart.bar.fill", "bar_chart")}
        size={13}
        weight="semibold"
        tintColor={theme.textSecondary}
      />
      <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
        {SCORING_LABELS[type]}
      </Text>
    </View>
  );
}

// ─── Progress bar ─────────────────────────────────────────────────────────────

function ProgressBar({
  percent,
  primary,
}: { percent: number; primary: string }) {
  const theme = useTheme();
  const pct = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <View
      style={[
        styles.progressTrack,
        { backgroundColor: theme.backgroundSelected },
      ]}
    >
      <View
        style={[
          styles.progressFill,
          { width: `${pct}%` as `${number}%`, backgroundColor: primary },
        ]}
      />
    </View>
  );
}

// ─── GoalCard ─────────────────────────────────────────────────────────────────

function GoalCard({
  goal,
  onDetails,
  onReport,
  onRelink,
  onMenu,
}: {
  goal: SharedGoalSnapshot;
  onDetails: () => void;
  onReport: () => void;
  onRelink: () => void;
  onMenu: () => void;
}) {
  const theme = useTheme();
  const cur = goal.currentUserParticipant;
  const accepted = goal.participants.filter((p) => p.status === "accepted");
  const completedToday = cur?.completedToday ?? false;
  const isOneTime = goal.scoringType === "one_time";
  const noGoalLinked = cur && !cur.personalGoalId && !cur.personalPlanGoalId;
  const isActive = goal.status === "active";
  const competitiveParticipants = [...accepted].sort((left, right) => {
    if (left.userId === cur?.userId) return -1;
    if (right.userId === cur?.userId) return 1;
    return (
      getCompetitiveScore(goal, right) - getCompetitiveScore(goal, left) ||
      left.userName.localeCompare(right.userName)
    );
  });
  const competitiveMaxScore = Math.max(
    0,
    ...competitiveParticipants.map((participant) =>
      getCompetitiveScore(goal, participant),
    ),
  );
  const competitiveBarMax =
    goal.scoringType === "first_to_target" && goal.progress.target !== null
      ? goal.progress.target
      : competitiveMaxScore;
  const showProgress =
    goal.mode === "collaborative" && goal.progress.target !== null;
  const collaborativeMetric =
    goal.scoringType === "one_time"
      ? `${String(goal.progress.value)}/${String(goal.progress.target ?? accepted.length)} participants complete`
      : goal.scoringType === "shared_streak"
        ? pluralize(goal.progress.value, "day streak")
        : pluralize(goal.progress.value, "total completion");

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.background, borderColor: theme.tabBorder },
      ]}
    >
      {/* Badges + menu */}
      <View style={styles.cardHeaderRow}>
        <View style={styles.badgeRow}>
          <ModeBadge mode={goal.mode} />
          <ScoringBadge type={goal.scoringType} />
        </View>
        <Pressable
          onPress={onMenu}
          hitSlop={8}
          accessibilityLabel="Shared goal options"
          style={styles.cardMenuButton}
        >
          <SymbolView
            name={sym("ellipsis", "more_horiz")}
            size={18}
            weight="semibold"
            tintColor={theme.textSecondary}
          />
        </Pressable>
      </View>

      {/* Goal name */}
      <Text style={[styles.cardTitle, { color: theme.text }]}>{goal.name}</Text>

      {/* End date */}
      <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
        {formatEndDate(goal.endsOn)}
      </Text>

      {/* Progress */}
      {showProgress && (
        <View style={styles.progressSection}>
          <View style={styles.progressRow}>
            <ProgressBar
              percent={goal.progress.percent}
              primary={theme.primary}
            />
          </View>
          <View style={styles.progressMeta}>
            <Text style={[styles.progressText, { color: theme.textSecondary }]}>
              {goal.progress.value} / {goal.progress.target}{" "}
              {goal.scoringType === "shared_streak"
                ? "days in a row"
                : goal.scoringType === "one_time"
                  ? "participants complete"
                  : "total completions"}{" "}
              ({Math.round(goal.progress.percent)}%)
            </Text>
          </View>
        </View>
      )}

      {goal.mode === "collaborative" && !showProgress ? (
        <Text
          style={[styles.collaborativeMetric, { color: theme.textSecondary }]}
        >
          {collaborativeMetric}
        </Text>
      ) : null}

      {goal.mode === "competitive" ? (
        <View style={styles.competitiveParticipants}>
          {competitiveParticipants.map((participant) => {
            const participantScore = getCompetitiveScore(goal, participant);
            const scorePercent =
              competitiveBarMax > 0
                ? Math.min(
                    100,
                    Math.round((participantScore / competitiveBarMax) * 100),
                  )
                : 0;
            const isCurrentUser = participant.userId === cur?.userId;

            return (
              <View
                key={participant.userId}
                style={[
                  styles.competitiveParticipantRow,
                  isCurrentUser && {
                    backgroundColor: `${theme.backgroundElement}99`,
                  },
                ]}
              >
                <Avatar
                  image={participant.userImage}
                  name={participant.userName}
                  size={28}
                />
                <View style={styles.competitiveParticipantInfo}>
                  <View style={styles.competitiveParticipantHeader}>
                    <Text
                      style={[
                        styles.competitiveParticipantName,
                        { color: theme.text },
                      ]}
                    >
                      {isCurrentUser ? "You" : participant.userName}
                    </Text>
                    <Text
                      style={[
                        styles.competitiveParticipantScore,
                        {
                          color: isCurrentUser
                            ? theme.primary
                            : theme.textSecondary,
                        },
                      ]}
                    >
                      {formatCompetitiveScore(goal, participantScore)}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.competitiveScoreTrack,
                      { backgroundColor: theme.backgroundElement },
                    ]}
                  >
                    <View
                      style={[
                        styles.competitiveScoreFill,
                        {
                          width: `${scorePercent}%` as `${number}%`,
                          backgroundColor: isCurrentUser
                            ? theme.primary
                            : theme.textSecondary,
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      ) : null}

      {/* Footer */}
      <View
        style={[styles.cardDivider, { backgroundColor: theme.tabBorder }]}
      />
      <View style={styles.cardFooter}>
        {goal.mode === "collaborative" ? (
          <View style={styles.footerAvatars}>
            <AvatarStack
              participants={accepted}
              size={26}
              borderColor={theme.background}
            />
            <Text
              style={[
                styles.participantCountText,
                { color: theme.textSecondary },
              ]}
            >
              {pluralize(accepted.length, "participant")}
            </Text>
          </View>
        ) : null}
        <View style={styles.footerActions}>
          <Pressable
            onPress={onDetails}
            style={[
              styles.cardBtn,
              styles.cardBtnOutline,
              { borderColor: theme.tabBorder },
            ]}
          >
            <Text style={[styles.cardBtnText, { color: theme.textSecondary }]}>
              Details
            </Text>
          </Pressable>
          {!isActive ? (
            <View
              style={[
                styles.cardBtn,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <Text
                style={[styles.cardBtnText, { color: theme.textSecondary }]}
              >
                {goal.status === "archived" ? "Archived" : "Completed"}
              </Text>
            </View>
          ) : noGoalLinked ? (
            <Pressable
              onPress={onRelink}
              style={[
                styles.cardBtn,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <Text style={[styles.cardBtnText, { color: theme.primary }]}>
                Link Goal
              </Text>
            </Pressable>
          ) : completedToday ? (
            <View
              style={[
                styles.cardBtn,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <SymbolView
                name={sym("checkmark.circle.fill", "check_circle")}
                size={15}
                weight="semibold"
                tintColor={theme.primary}
              />
              <Text style={[styles.cardBtnText, { color: theme.primary }]}>
                Done
              </Text>
            </View>
          ) : isOneTime ? (
            <View
              style={[
                styles.cardBtn,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <Text
                style={[styles.cardBtnText, { color: theme.textSecondary }]}
              >
                Complete linked goal
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={onReport}
              style={[styles.cardBtn, { backgroundColor: theme.primary }]}
            >
              <Text
                style={[styles.cardBtnText, { color: theme.primaryForeground }]}
              >
                Report today
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
}

// ─── InvitationCard ──────────────────────────────────────────────────────────

function InvitationCard({
  goal,
  onOpenDetails,
  onDecline,
}: {
  goal: SharedGoalSnapshot;
  onOpenDetails: () => void;
  onDecline: () => void;
}) {
  const theme = useTheme();
  const owner = goal.participants.find((p) => p.userId === goal.ownerId);

  return (
    <View
      style={[
        styles.card,
        styles.inviteCard,
        { backgroundColor: theme.background, borderColor: theme.primary },
      ]}
    >
      <View style={styles.inviteHeader}>
        <View style={styles.badge}>
          <SymbolView
            name={sym("envelope.fill", "mail")}
            size={13}
            weight="semibold"
            tintColor={theme.primary}
          />
          <Text style={[styles.badgeText, { color: theme.primary }]}>
            Invitation
          </Text>
        </View>
        <ModeBadge mode={goal.mode} />
      </View>
      <Text style={[styles.cardTitle, { color: theme.text }]}>{goal.name}</Text>
      <Text style={[styles.cardSubtitle, { color: theme.textSecondary }]}>
        From: {owner?.userName ?? "Someone"} ·{" "}
        {SCORING_LABELS[goal.scoringType]}
      </Text>
      <View style={styles.inviteActions}>
        <Pressable
          onPress={onDecline}
          style={[
            styles.inviteBtn,
            { borderColor: theme.tabBorder, borderWidth: 1 },
          ]}
        >
          <Text style={[styles.inviteBtnText, { color: theme.textSecondary }]}>
            Decline
          </Text>
        </Pressable>
        <Pressable
          onPress={onOpenDetails}
          style={[styles.inviteBtn, { backgroundColor: theme.primary }]}
        >
          <Text
            style={[styles.inviteBtnText, { color: theme.primaryForeground }]}
          >
            View details
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function toSharedGoalInviteEntry(goal: SharedGoalSnapshot): FriendFeedEntry {
  const owner = goal.participants.find(
    (participant) => participant.userId === goal.ownerId,
  );

  return {
    id: `shared-goal-invite-${goal.id}`,
    kind: "shared_goal",
    friend: {
      id: owner?.userId ?? goal.ownerId,
      name: owner?.userName ?? "Someone",
      image: owner?.userImage ?? null,
      phoneNumber: null,
    },
    goal: {
      id: goal.id,
      name: goal.name,
      icon: "person.2.badge.gearshape.fill",
    },
    category: null,
    dateKey: goal.startsOn ?? todayKey(),
    notes: "",
    reflectionPrompt: null,
    updatedAt: new Date().toISOString(),
    canDeletePhotos: false,
    postType: "journal",
    highlights: ["Shared goal"],
    props: { count: 0, hasPropped: false },
    repost: { count: 0, hasReposted: false },
    sharedGoal: {
      id: goal.id,
      name: goal.name,
      mode: goal.mode,
      scoringType: goal.scoringType,
      target: goal.target,
      startsOn: goal.startsOn,
      endsOn: goal.endsOn,
      openInvite: goal.openInvite,
      status: goal.status,
      currentUserStatus: "invited",
      participants: goal.participants.map((participant) => ({
        id: participant.id,
        userId: participant.userId,
        name: participant.userName,
        image: participant.userImage,
        status: participant.status === "accepted" ? "accepted" : "invited",
      })),
    },
    mentions: [],
    comments: [],
    photos: [],
  };
}

// ─── GoalDetailsSheet ────────────────────────────────────────────────────────

function GoalDetailsSheet({
  goal,
  onClose,
  onReportToday,
  onRelink,
  onLeave,
  onArchive,
}: {
  goal: SharedGoalSnapshot;
  onClose: () => void;
  onReportToday: () => void;
  onRelink: () => void;
  onLeave: () => void;
  onArchive: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [isActionsOpen, setIsActionsOpen] = useState(false);
  const cur = goal.currentUserParticipant;
  const accepted = goal.participants.filter((p) => p.status === "accepted");
  const showProgress = goal.mode === "collaborative";
  const isStreakType = goal.scoringType === "longest_streak";
  const isOneTime = goal.scoringType === "one_time";
  const isCompetitive = goal.mode === "competitive";
  const getParticipantScore = (participant: SharedGoalParticipantSnapshot) =>
    isStreakType ? participant.currentStreak : participant.completedCount;
  const scoreLabel = isStreakType ? "streak" : "total";
  const leaderboard = accepted
    .map((participant) => ({
      participant,
      score: getParticipantScore(participant),
    }))
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.participant.userName.localeCompare(right.participant.userName),
    );
  const leaderScore = leaderboard[0]?.score ?? goal.progress.value;
  const myScore = cur ? getParticipantScore(cur) : 0;
  const isCurrentUserLeading = Boolean(
    cur && goal.progress.leaderUserIds.includes(cur.userId),
  );
  const leaderTieCount = goal.progress.leaderUserIds.length;
  const target = goal.progress.target;
  const competitiveSummary = (() => {
    if (!isCompetitive || !cur) return null;

    if (goal.scoringType === "first_to_target" && target !== null) {
      const remaining = Math.max(target - myScore, 0);

      return {
        title:
          remaining === 0
            ? "Target reached"
            : isCurrentUserLeading
              ? leaderTieCount > 1
                ? "You're tied for 1st"
                : "You're leading"
              : `Leader has ${pluralize(leaderScore, "completion")}`,
        detail:
          remaining === 0
            ? `${myScore} of ${target} completions`
            : `${pluralize(remaining, "completion")} away from target`,
      };
    }

    if (isStreakType) {
      return {
        title: isCurrentUserLeading
          ? leaderTieCount > 1
            ? "You're tied for longest streak"
            : "You're leading"
          : `Leader has a ${formatStreak(leaderScore)}`,
        detail: formatStreak(myScore),
      };
    }

    return {
      title: isCurrentUserLeading
        ? leaderTieCount > 1
          ? "You're tied for 1st"
          : "You're leading"
        : `Leader has ${pluralize(leaderScore, "completion")}`,
      detail: `${pluralize(myScore, "completion")} total`,
    };
  })();

  // Header stats are tailored to the scoring type.
  const statCells: { value: string; label: string }[] = [];
  if (goal.mode === "collaborative") {
    // Everyone completes / combined target: progress toward the goal.
    statCells.push({
      value: `${goal.progress.completedToday}/${goal.progress.acceptedParticipants}`,
      label: isOneTime ? "Completed" : "Done today",
    });
    statCells.push(
      goal.progress.target !== null
        ? {
            value: `${goal.progress.value}/${goal.progress.target}`,
            label: "Progress",
          }
        : { value: `${goal.progress.value}`, label: "Total" },
    );
  } else if (isStreakType) {
    // Longest streak: current streaks only.
    if (cur)
      statCells.push({ value: `${cur.currentStreak}`, label: "My streak" });
    statCells.push({
      value: `${goal.progress.value}`,
      label: "Longest streak",
    });
  } else {
    // First to target / highest total: raw totals.
    if (cur)
      statCells.push({ value: `${cur.completedCount}`, label: "My total" });
    statCells.push({ value: `${leaderScore}`, label: "Leader" });
    if (goal.scoringType === "first_to_target" && target !== null) {
      statCells.push({ value: `${target}`, label: "Target" });
    }
  }

  return (
    <View
      style={[
        styles.sheet,
        {
          backgroundColor: theme.background,
          paddingBottom: insets.bottom + 16,
        },
      ]}
    >
      {/* Drag handle */}
      <View style={styles.sheetHandle}>
        <View
          style={[
            styles.sheetHandleBar,
            { backgroundColor: theme.backgroundElement },
          ]}
        />
      </View>

      {/* Header */}
      <View
        style={[styles.sheetHeader, { borderBottomColor: theme.tabBorder }]}
      >
        <View style={styles.sheetHeaderSideSpacer} />
        <Text
          style={[styles.sheetTitle, { color: theme.text }]}
          numberOfLines={2}
        >
          {goal.name}
        </Text>
        <View style={styles.sheetHeaderActions}>
          <Pressable
            onPress={() => setIsActionsOpen(true)}
            style={styles.sheetHeaderIconButton}
            hitSlop={8}
          >
            <SymbolView
              name={sym("ellipsis", "more_horiz")}
              size={18}
              weight="semibold"
              tintColor={theme.textSecondary}
            />
          </Pressable>
          <Pressable
            onPress={onClose}
            style={styles.sheetHeaderIconButton}
            hitSlop={8}
          >
            <SymbolView
              name={sym("xmark", "close")}
              size={16}
              weight="semibold"
              tintColor={theme.primary}
            />
          </Pressable>
        </View>
      </View>

      <ScrollView
        canCancelContentTouches
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetContent}
        directionalLockEnabled
        showsVerticalScrollIndicator={false}
      >
        {/* Badges */}
        <View style={[styles.badgeRow, styles.detailsBadgeRow]}>
          <ModeBadge mode={goal.mode} />
          <ScoringBadge type={goal.scoringType} />
        </View>

        {/* Stats grid */}
        <View
          style={[
            styles.statsGrid,
            { backgroundColor: theme.backgroundElement },
          ]}
        >
          {statCells.map((cell, index) => (
            <View
              key={cell.label}
              style={[
                styles.statItem,
                index > 0 && styles.statItemBorder,
                index > 0 && { borderColor: theme.tabBorder },
              ]}
            >
              <Text style={[styles.statValue, { color: theme.text }]}>
                {cell.value}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                {cell.label}
              </Text>
            </View>
          ))}
        </View>

        {competitiveSummary ? (
          <Text
            style={[styles.competitiveSummary, { color: theme.textSecondary }]}
          >
            <Text style={{ color: theme.text, fontWeight: "800" }}>
              {competitiveSummary.title}
            </Text>
            {" · "}
            {competitiveSummary.detail}
          </Text>
        ) : null}

        {/* Progress bar */}
        {showProgress && (
          <View style={styles.sheetSection}>
            <Text style={[styles.sheetSectionTitle, { color: theme.text }]}>
              Progress
            </Text>
            <ProgressBar
              percent={goal.progress.percent}
              primary={theme.primary}
            />
            <Text
              style={[
                styles.progressText,
                { color: theme.textSecondary, marginTop: 6 },
              ]}
            >
              {Math.round(goal.progress.percent)}% complete
              {goal.progress.target !== null
                ? ` · ${goal.progress.value} of ${goal.progress.target}`
                : ""}
            </Text>
          </View>
        )}

        {/* My linked goal */}
        {cur && (
          <View style={styles.sheetSection}>
            <Text style={[styles.sheetSectionTitle, { color: theme.text }]}>
              My linked goal
            </Text>
            <View
              style={[
                styles.linkedGoalRow,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <View style={styles.linkedGoalInfo}>
                <View
                  style={[
                    styles.linkedGoalIcon,
                    { backgroundColor: `${theme.primary}16` },
                  ]}
                >
                  <SymbolView
                    name={sym("target", "target")}
                    size={15}
                    weight="semibold"
                    tintColor={theme.primary}
                  />
                </View>
                <View style={styles.linkedGoalText}>
                  <Text
                    style={[
                      styles.linkedGoalLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {isOneTime ? "Linked goal" : "Linked habit"}
                  </Text>
                  <Text
                    style={[
                      styles.linkedGoalName,
                      {
                        color:
                          cur.personalGoalId || cur.personalPlanGoalId
                            ? theme.text
                            : theme.textSecondary,
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {(isOneTime
                      ? cur.personalPlanGoalName
                      : cur.personalGoalName) ?? "No goal linked"}
                  </Text>
                </View>
              </View>
              <Pressable onPress={onRelink}>
                <Text style={[styles.relinkText, { color: theme.primary }]}>
                  {cur.personalGoalId || cur.personalPlanGoalId
                    ? "Change"
                    : "Link"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Participants / leaderboard */}
        <View style={styles.sheetSection}>
          <Text style={[styles.sheetSectionTitle, { color: theme.text }]}>
            {isCompetitive ? "Leaderboard" : "Participants"}
          </Text>
          {isCompetitive
            ? leaderboard.map(({ participant, score }, index) => (
                <View
                  key={participant.userId}
                  style={[
                    styles.leaderboardRow,
                    { borderBottomColor: theme.tabBorder },
                  ]}
                >
                  <Text
                    style={[
                      styles.leaderboardRank,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {index + 1}
                  </Text>
                  <Avatar
                    image={participant.userImage}
                    name={participant.userName}
                    size={32}
                  />
                  <View style={styles.participantInfo}>
                    <Text
                      style={[styles.participantName, { color: theme.text }]}
                    >
                      {participant.userName}
                    </Text>
                    <Text
                      style={[
                        styles.participantStats,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {participant.completedToday
                        ? "Reported today"
                        : "Not reported today"}
                    </Text>
                  </View>
                  <Text
                    style={[styles.leaderboardScore, { color: theme.text }]}
                  >
                    {score}{" "}
                    <Text
                      style={[
                        styles.leaderboardScoreLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {scoreLabel}
                    </Text>
                  </Text>
                </View>
              ))
            : accepted.map((p) => (
                <View
                  key={p.userId}
                  style={[
                    styles.participantRow,
                    { borderBottomColor: theme.tabBorder },
                  ]}
                >
                  <Avatar image={p.userImage} name={p.userName} size={36} />
                  <View style={styles.participantInfo}>
                    <Text
                      style={[styles.participantName, { color: theme.text }]}
                    >
                      {p.userName}
                    </Text>
                    <Text
                      style={[
                        styles.participantStats,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {isStreakType
                        ? `${p.currentStreak} day streak`
                        : `${p.completedCount} total`}
                    </Text>
                  </View>
                  {p.completedToday && (
                    <View
                      style={[
                        styles.doneChip,
                        { backgroundColor: theme.backgroundElement },
                      ]}
                    >
                      <SymbolView
                        name={sym("checkmark", "check")}
                        size={11}
                        weight="semibold"
                        tintColor={theme.primary}
                      />
                      <Text
                        style={[styles.doneChipText, { color: theme.primary }]}
                      >
                        Done
                      </Text>
                    </View>
                  )}
                </View>
              ))}
        </View>

        {/* Recent activity */}
        {goal.recentActivity.length > 0 && (
          <View style={styles.sheetSection}>
            <Text style={[styles.sheetSectionTitle, { color: theme.text }]}>
              Recent activity
            </Text>
            {goal.recentActivity.slice(0, 5).map((a) => (
              <View
                key={`${a.userId}-${a.dateKey}`}
                style={[
                  styles.activityRow,
                  { borderBottomColor: theme.tabBorder },
                ]}
              >
                <Avatar image={a.userImage} name={a.userName} size={28} />
                <Text
                  style={[styles.activityText, { color: theme.textSecondary }]}
                  numberOfLines={1}
                >
                  <Text style={{ color: theme.text, fontWeight: "600" }}>
                    {a.userName}
                  </Text>{" "}
                  completed {formatActivityDate(a.dateKey)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Footer actions */}
      <View style={[styles.sheetFooter, { borderTopColor: theme.tabBorder }]}>
        {cur?.personalGoalId && !isOneTime ? (
          <Pressable
            onPress={onReportToday}
            style={[
              styles.sheetPrimaryBtn,
              cur.completedToday
                ? {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                    borderWidth: StyleSheet.hairlineWidth,
                  }
                : { backgroundColor: theme.primary },
            ]}
          >
            <Text
              style={[
                styles.sheetPrimaryBtnText,
                {
                  color: cur.completedToday
                    ? theme.primary
                    : theme.primaryForeground,
                },
              ]}
            >
              {cur.completedToday ? "Add note or photo" : "Report today"}
            </Text>
          </Pressable>
        ) : null}
      </View>

      <Modal
        visible={isActionsOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsActionsOpen(false)}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setIsActionsOpen(false)}
        >
          <Pressable
            style={[
              styles.menuSheet,
              {
                backgroundColor: theme.background,
                paddingBottom: insets.bottom + 12,
              },
            ]}
            onPress={(event) => event.stopPropagation()}
          >
            <Text style={[styles.menuTitle, { color: theme.text }]}>
              {goal.name}
            </Text>
            {goal.canManage && goal.status === "active" ? (
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  setIsActionsOpen(false);
                  onArchive();
                }}
              >
                <SymbolView
                  name={sym("archivebox", "archive")}
                  size={20}
                  tintColor={theme.text}
                />
                <Text style={[styles.menuItemText, { color: theme.text }]}>
                  Archive
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              style={styles.menuItem}
              onPress={() => {
                setIsActionsOpen(false);
                onLeave();
              }}
            >
              <SymbolView
                name={sym("rectangle.portrait.and.arrow.right", "logout")}
                size={20}
                tintColor="#EF4444"
              />
              <Text style={[styles.menuItemText, { color: "#EF4444" }]}>
                Leave
              </Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── RelinkModal ──────────────────────────────────────────────────────────────

function RelinkModal({
  goal,
  personalGoals,
  personalPlanGoals,
  onClose,
  onRelink,
}: {
  goal: SharedGoalSnapshot;
  personalGoals: Goal[];
  personalPlanGoals: PlanGoal[];
  onClose: () => void;
  onRelink: (goalId: string | null, deleteAuto: boolean) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const isOneTime = goal.scoringType === "one_time";
  const [selected, setSelected] = useState<string | null>(
    (isOneTime
      ? goal.currentUserParticipant?.personalPlanGoalId
      : goal.currentUserParticipant?.personalGoalId) ?? null,
  );
  const autoCreated =
    goal.currentUserParticipant?.personalGoalAutoCreated ?? false;
  const [deleteAuto, setDeleteAuto] = useState(false);
  const linkableGoals = isOneTime
    ? personalPlanGoals.map((personalGoal) => ({
        id: personalGoal.id,
        name: personalGoal.title,
        period: null,
      }))
    : personalGoals.map((personalGoal) => ({
        id: personalGoal.id,
        name: personalGoal.name,
        period: personalGoal.period,
      }));

  return (
    <View
      style={[
        styles.sheet,
        {
          backgroundColor: theme.background,
          paddingBottom: insets.bottom + 16,
        },
      ]}
    >
      <View style={styles.sheetHandle}>
        <View
          style={[
            styles.sheetHandleBar,
            { backgroundColor: theme.backgroundElement },
          ]}
        />
      </View>
      <View
        style={[styles.sheetHeader, { borderBottomColor: theme.tabBorder }]}
      >
        <Text style={[styles.sheetTitle, { color: theme.text }]}>
          Link Personal Goal
        </Text>
        <Pressable onPress={onClose} style={styles.sheetClose} hitSlop={12}>
          <SymbolView
            name={sym("xmark", "close")}
            size={16}
            weight="semibold"
            tintColor={theme.primary}
          />
        </Pressable>
      </View>
      <ScrollView
        canCancelContentTouches
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetContent}
        directionalLockEnabled
      >
        <Text style={[styles.relinkHint, { color: theme.textSecondary }]}>
          Select a personal goal to track for "{goal.name}":
        </Text>
        {/* None option */}
        <Pressable
          onPress={() => setSelected(null)}
          style={[
            styles.goalOption,
            {
              backgroundColor:
                selected === null
                  ? theme.backgroundSelected
                  : theme.backgroundElement,
              borderColor: selected === null ? theme.primary : "transparent",
            },
          ]}
        >
          <Text style={[styles.goalOptionText, { color: theme.textSecondary }]}>
            None (unlink)
          </Text>
        </Pressable>
        {linkableGoals.map((g) => (
          <Pressable
            key={g.id}
            onPress={() => setSelected(g.id)}
            style={[
              styles.goalOption,
              {
                backgroundColor:
                  selected === g.id
                    ? theme.backgroundSelected
                    : theme.backgroundElement,
                borderColor: selected === g.id ? theme.primary : "transparent",
              },
            ]}
          >
            <Text style={[styles.goalOptionText, { color: theme.text }]}>
              {g.name}
            </Text>
            {!isOneTime && g.period && (
              <Text
                style={[styles.goalOptionSub, { color: theme.textSecondary }]}
              >
                {g.period}
              </Text>
            )}
          </Pressable>
        ))}
        {!isOneTime &&
          autoCreated &&
          goal.currentUserParticipant?.personalGoalId && (
            <Pressable
              onPress={() => setDeleteAuto(!deleteAuto)}
              style={styles.deleteAutoRow}
            >
              <View
                style={[
                  styles.checkbox,
                  {
                    backgroundColor: deleteAuto ? theme.primary : "transparent",
                    borderColor: deleteAuto
                      ? theme.primary
                      : theme.textSecondary,
                  },
                ]}
              >
                {deleteAuto && (
                  <SymbolView
                    name={sym("checkmark", "check")}
                    size={11}
                    weight="semibold"
                    tintColor={theme.primaryForeground}
                  />
                )}
              </View>
              <Text
                style={[styles.deleteAutoText, { color: theme.textSecondary }]}
              >
                Delete the auto-created goal
              </Text>
            </Pressable>
          )}
      </ScrollView>
      <View style={[styles.sheetFooter, { borderTopColor: theme.tabBorder }]}>
        <Pressable
          onPress={() => onRelink(selected, deleteAuto)}
          style={[styles.sheetPrimaryBtn, { backgroundColor: theme.primary }]}
        >
          <Text
            style={[
              styles.sheetPrimaryBtnText,
              { color: theme.primaryForeground },
            ]}
          >
            Save
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── CreateGoalModal ──────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5 | 6;

type CreateState = {
  mode: "collaborative" | "competitive" | null;
  name: string;
  scoringType: SharedGoalScoringType | null;
  target: string;
  startsOn: string;
  endsOn: string;
  personalGoalId: string | null;
  invitedUserIds: string[];
  openInvite: boolean;
  requireEvidence: boolean;
  stakeType: SharedGoalStakeType;
  stakeDescription: string;
};

export type CreateSharedGoalInitialValues = Partial<CreateState>;

export function CreateGoalModal({
  personalGoals,
  personalPlanGoals,
  friends,
  friendGroups,
  initialValues,
  onClose,
  onCreate,
}: {
  personalGoals: Goal[];
  personalPlanGoals: PlanGoal[];
  friends: FriendRow[];
  friendGroups: FriendGroupRow[];
  initialValues?: CreateSharedGoalInitialValues;
  onClose: () => void;
  onCreate: (input: CreateSharedGoalInput) => Promise<void>;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>(1);
  const [submitting, setSubmitting] = useState(false);
  const [showScoringInfo, setShowScoringInfo] = useState(false);
  const [noEndDate, setNoEndDate] = useState(
    () => !initialValues?.endsOn?.trim(),
  );
  const [personalGoalSelected, setPersonalGoalSelected] = useState(
    () => initialValues?.personalGoalId !== undefined,
  );
  const isMountedRef = useRef(true);
  const [form, setForm] = useState<CreateState>({
    mode: null,
    name: "",
    scoringType: null,
    target: "",
    startsOn: todayKey(),
    endsOn: dateKeyAfterDays(7),
    personalGoalId: null,
    invitedUserIds: [],
    openInvite: false,
    requireEvidence: true,
    stakeType: "none",
    stakeDescription: "",
    ...initialValues,
  });

  const acceptedFriends = friends.filter((f) => f.status === "accepted");
  const acceptedFriendIds = new Set(acceptedFriends.map((f) => f.friendId));
  const selectedFriendCount = acceptedFriends.filter((friend) =>
    form.invitedUserIds.includes(friend.friendId),
  ).length;
  const allFriendsSelected =
    acceptedFriends.length > 0 &&
    selectedFriendCount === acceptedFriends.length;
  const selectableGroups = friendGroups
    .map((group) => ({
      ...group,
      memberIds: group.members
        .map((member) => member.id)
        .filter((id) => acceptedFriendIds.has(id)),
    }))
    .filter((group) => group.memberIds.length > 0);
  const scoringOptions =
    form.mode === "collaborative" ? COLLAB_SCORING : COMP_SCORING;
  const isOneTime = form.scoringType === "one_time";
  const linkableGoals = isOneTime
    ? personalPlanGoals.map((personalGoal) => ({
        id: personalGoal.id,
        name: personalGoal.title,
        period: null,
      }))
    : personalGoals.map((personalGoal) => ({
        id: personalGoal.id,
        name: personalGoal.name,
        period: personalGoal.period,
      }));
  const needsTarget = form.scoringType
    ? NEEDS_TARGET.has(form.scoringType)
    : false;
  const targetValue = Number.parseInt(form.target, 10);
  const targetReady =
    !needsTarget || (Number.isFinite(targetValue) && targetValue > 0);

  const stakeReady =
    form.stakeType === "none" || form.stakeDescription.trim().length > 0;
  // The consequence page (6) only exists when a carrot/stick is chosen.
  const lastStep: Step = form.stakeType === "none" ? 5 : 6;

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  function canProceed() {
    if (step === 1) return form.mode !== null;
    if (step === 2)
      return (
        form.name.trim().length > 0 && form.scoringType !== null && targetReady
      );
    if (step === 3) return personalGoalSelected;
    return true;
  }

  async function handleCreate() {
    if (!form.mode || !form.scoringType) return;
    setSubmitting(true);
    try {
      await onCreate({
        name: form.name.trim(),
        mode: form.mode,
        scoringType: form.scoringType,
        target: needsTarget ? targetValue : null,
        startsOn: form.startsOn.trim() || null,
        endsOn: noEndDate ? null : form.endsOn.trim() || null,
        personalGoalId: form.personalGoalId,
        invitedUserIds: form.invitedUserIds,
        openInvite: form.openInvite,
        requireEvidence: form.requireEvidence,
        stakeType: form.stakeType,
        stakeDescription:
          form.stakeType === "none"
            ? null
            : form.stakeDescription.trim() || null,
      });
    } finally {
      if (isMountedRef.current) setSubmitting(false);
    }
  }

  function toggleFriend(friendId: string) {
    playSelectionHaptic();
    setForm((f) => ({
      ...f,
      invitedUserIds: f.invitedUserIds.includes(friendId)
        ? f.invitedUserIds.filter((id) => id !== friendId)
        : [...f.invitedUserIds, friendId],
    }));
  }

  function toggleNoEndDate() {
    playSelectionHaptic();
    setNoEndDate((value) => !value);
  }

  function toggleAllFriends() {
    playSelectionHaptic();
    setForm((f) => ({
      ...f,
      invitedUserIds: allFriendsSelected
        ? f.invitedUserIds.filter((id) => !acceptedFriendIds.has(id))
        : [...new Set([...f.invitedUserIds, ...acceptedFriendIds])],
    }));
  }

  function toggleGroup(memberIds: string[]) {
    playSelectionHaptic();
    setForm((f) => {
      const allSelected = memberIds.every((id) =>
        f.invitedUserIds.includes(id),
      );
      const selectedIds = allSelected
        ? f.invitedUserIds.filter((id) => !memberIds.includes(id))
        : [...new Set([...f.invitedUserIds, ...memberIds])];

      return { ...f, invitedUserIds: selectedIds };
    });
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={[
          styles.sheet,
          styles.createSheet,
          {
            backgroundColor: theme.background,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        <View style={styles.sheetHandle}>
          <View
            style={[
              styles.sheetHandleBar,
              { backgroundColor: theme.backgroundElement },
            ]}
          />
        </View>

        {/* Header */}
        <View
          style={[styles.sheetHeader, { borderBottomColor: theme.tabBorder }]}
        >
          <View style={styles.createHeaderLeft}>
            {step > 1 && (
              <Pressable
                onPress={() => setStep((s) => (s - 1) as Step)}
                hitSlop={12}
              >
                <View style={styles.headerTextButton}>
                  <SymbolView
                    name={sym("chevron.left", "chevron_left")}
                    size={15}
                    weight="semibold"
                    tintColor={theme.primary}
                  />
                  <Text style={[styles.backBtn, { color: theme.primary }]}>
                    Back
                  </Text>
                </View>
              </Pressable>
            )}
          </View>
          <Text style={[styles.sheetTitle, { color: theme.text }]}>
            New Shared Goal
          </Text>
          <View style={styles.createHeaderRight}>
            <Text
              style={[styles.stepIndicator, { color: theme.textSecondary }]}
            >
              {step}/{lastStep}
            </Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <SymbolView
                name={sym("xmark", "close")}
                size={16}
                weight="semibold"
                tintColor={theme.primary}
              />
            </Pressable>
          </View>
        </View>

        <ScrollView
          canCancelContentTouches
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetContent}
          directionalLockEnabled
          keyboardShouldPersistTaps="handled"
        >
          {/* Step 1: Mode */}
          {step === 1 && (
            <View style={styles.modeStep}>
              <Text style={[styles.stepHeading, { color: theme.text }]}>
                How will you work together?
              </Text>
              <View
                style={[
                  styles.modeOptions,
                  {
                    backgroundColor: theme.background,
                    borderColor: theme.tabBorder,
                  },
                ]}
              >
                <Pressable
                  onPress={() => {
                    playSelectionHaptic();
                    setForm((f) => ({
                      ...f,
                      mode: "collaborative",
                      scoringType:
                        f.mode === "competitive" ? null : f.scoringType,
                    }));
                  }}
                  style={[
                    styles.modeCard,
                    {
                      backgroundColor:
                        form.mode === "collaborative"
                          ? theme.backgroundSelected
                          : theme.background,
                      borderBottomColor: theme.tabBorder,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.modeIcon,
                      { backgroundColor: theme.backgroundElement },
                    ]}
                  >
                    <SymbolView
                      name={sym("person.2.fill", "groups")}
                      size={20}
                      weight="semibold"
                      tintColor={theme.primary}
                    />
                  </View>
                  <View style={styles.modeText}>
                    <Text style={[styles.modeCardTitle, { color: theme.text }]}>
                      Collaborative
                    </Text>
                    <Text
                      style={[
                        styles.modeCardDesc,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Work together toward one result.
                    </Text>
                  </View>
                  <SymbolView
                    name={sym(
                      form.mode === "collaborative"
                        ? "checkmark.circle.fill"
                        : "circle",
                      form.mode === "collaborative"
                        ? "check_circle"
                        : "radio_button_unchecked",
                    )}
                    size={20}
                    weight="semibold"
                    tintColor={
                      form.mode === "collaborative"
                        ? theme.primary
                        : theme.textSecondary
                    }
                  />
                </Pressable>
                <Pressable
                  onPress={() => {
                    playSelectionHaptic();
                    setForm((f) => ({
                      ...f,
                      mode: "competitive",
                      scoringType:
                        f.mode === "collaborative" ? null : f.scoringType,
                    }));
                  }}
                  style={[
                    styles.modeCard,
                    styles.modeCardLast,
                    {
                      backgroundColor:
                        form.mode === "competitive"
                          ? theme.backgroundSelected
                          : theme.background,
                    },
                  ]}
                >
                  <View
                    style={[
                      styles.modeIcon,
                      { backgroundColor: theme.backgroundElement },
                    ]}
                  >
                    <SymbolView
                      name={sym("trophy.fill", "emoji_events")}
                      size={20}
                      weight="semibold"
                      tintColor={theme.primary}
                    />
                  </View>
                  <View style={styles.modeText}>
                    <Text style={[styles.modeCardTitle, { color: theme.text }]}>
                      Competitive
                    </Text>
                    <Text
                      style={[
                        styles.modeCardDesc,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Compare individual results.
                    </Text>
                  </View>
                  <SymbolView
                    name={sym(
                      form.mode === "competitive"
                        ? "checkmark.circle.fill"
                        : "circle",
                      form.mode === "competitive"
                        ? "check_circle"
                        : "radio_button_unchecked",
                    )}
                    size={20}
                    weight="semibold"
                    tintColor={
                      form.mode === "competitive"
                        ? theme.primary
                        : theme.textSecondary
                    }
                  />
                </Pressable>
              </View>
            </View>
          )}

          {/* Step 2: Details */}
          {step === 2 && (
            <View>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>
                Goal name
              </Text>
              <TextInput
                style={[
                  styles.textInput,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                    borderColor: theme.tabBorder,
                  },
                ]}
                placeholder="e.g. Morning workouts"
                placeholderTextColor={theme.textSecondary}
                value={form.name}
                onChangeText={(v) => setForm((f) => ({ ...f, name: v }))}
                autoFocus
                returnKeyType="next"
              />

              <View style={styles.scoringLabelRow}>
                <Text
                  style={[
                    styles.fieldLabel,
                    { color: theme.text, marginTop: 16 },
                  ]}
                >
                  Scoring type
                </Text>
                <Pressable
                  onPress={() => setShowScoringInfo(true)}
                  hitSlop={10}
                  accessibilityLabel="What do the scoring types mean?"
                  style={{ marginTop: 16 }}
                >
                  <SymbolView
                    name="info.circle"
                    size={18}
                    tintColor={theme.textSecondary}
                  />
                </Pressable>
              </View>
              <View style={styles.scoringRow}>
                {scoringOptions.map((type) => (
                  <Pressable
                    key={type}
                    onPress={() => {
                      playSelectionHaptic();
                      setPersonalGoalSelected(false);
                      setForm((f) => ({
                        ...f,
                        scoringType: type,
                        personalGoalId: null,
                      }));
                    }}
                    style={[
                      styles.scoringChip,
                      {
                        backgroundColor:
                          form.scoringType === type
                            ? theme.primary
                            : theme.backgroundElement,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.scoringChipText,
                        {
                          color:
                            form.scoringType === type
                              ? theme.primaryForeground
                              : theme.textSecondary,
                        },
                      ]}
                    >
                      {SCORING_LABELS[type]}
                    </Text>
                  </Pressable>
                ))}
              </View>

              <Modal
                visible={showScoringInfo}
                transparent
                animationType="fade"
                onRequestClose={() => setShowScoringInfo(false)}
              >
                <Pressable
                  style={styles.infoBackdrop}
                  onPress={() => setShowScoringInfo(false)}
                >
                  <Pressable
                    style={[
                      styles.infoCard,
                      { backgroundColor: theme.backgroundElement },
                    ]}
                    onPress={(e) => e.stopPropagation()}
                  >
                    <Text style={[styles.infoTitle, { color: theme.text }]}>
                      Scoring types
                    </Text>
                    {SCORING_EXPLAINERS.map((item) => (
                      <View key={item.label} style={styles.infoBlock}>
                        <Text style={[styles.infoLabel, { color: theme.text }]}>
                          {item.label}
                        </Text>
                        <Text
                          style={[
                            styles.infoBody,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {item.description}
                        </Text>
                      </View>
                    ))}
                    <Pressable
                      onPress={() => setShowScoringInfo(false)}
                      style={[
                        styles.infoButton,
                        { backgroundColor: theme.primary },
                      ]}
                    >
                      <Text
                        style={[
                          styles.infoButtonText,
                          { color: theme.primaryForeground },
                        ]}
                      >
                        Got it
                      </Text>
                    </Pressable>
                  </Pressable>
                </Pressable>
              </Modal>

              {needsTarget && (
                <>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: theme.text, marginTop: 16 },
                    ]}
                  >
                    {form.scoringType === "shared_streak"
                      ? "Streak target (days)"
                      : "Target (number)"}
                  </Text>
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: theme.backgroundElement,
                        color: theme.text,
                        borderColor: theme.tabBorder,
                      },
                    ]}
                    placeholder="e.g. 30"
                    placeholderTextColor={theme.textSecondary}
                    keyboardType="number-pad"
                    value={form.target}
                    onChangeText={(v) => setForm((f) => ({ ...f, target: v }))}
                  />
                </>
              )}

              <View style={styles.dateRow}>
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: theme.text, marginTop: 16 },
                    ]}
                  >
                    Start date
                  </Text>
                  <DatePartPicker
                    compact
                    value={form.startsOn || null}
                    onChange={(startsOn) =>
                      setForm((f) => ({ ...f, startsOn: startsOn ?? "" }))
                    }
                  />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      {
                        color: noEndDate ? theme.textSecondary : theme.text,
                        marginTop: 16,
                      },
                    ]}
                  >
                    End date
                  </Text>
                  <View
                    pointerEvents={noEndDate ? "none" : "auto"}
                    style={noEndDate ? styles.disabledDatePicker : undefined}
                  >
                    <DatePartPicker
                      compact
                      value={form.endsOn || null}
                      onChange={(endsOn) =>
                        setForm((f) => ({ ...f, endsOn: endsOn ?? "" }))
                      }
                    />
                  </View>
                  <Pressable
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: noEndDate }}
                    onPress={toggleNoEndDate}
                    style={({ pressed }) => [
                      styles.noEndDateToggle,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View
                      style={[
                        styles.checkbox,
                        {
                          backgroundColor: noEndDate
                            ? theme.primary
                            : "transparent",
                          borderColor: noEndDate
                            ? theme.primary
                            : theme.textSecondary,
                        },
                      ]}
                    >
                      {noEndDate && (
                        <SymbolView
                          name={sym("checkmark", "check")}
                          size={12}
                          weight="semibold"
                          tintColor={theme.primaryForeground}
                        />
                      )}
                    </View>
                    <Text style={[styles.noEndDateText, { color: theme.text }]}>
                      No end date
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}

          {/* Step 3: Link goal + invite friends */}
          {step === 3 && (
            <View>
              <Text style={[styles.stepHeading, { color: theme.text }]}>
                Link a personal goal
              </Text>
              <Text style={[styles.stepHint, { color: theme.textSecondary }]}>
                {isOneTime
                  ? "Select an existing personal goal to complete once for this shared goal:"
                  : "Select which of your habits to track for this shared goal:"}
              </Text>
              <Pressable
                onPress={() => {
                  playSelectionHaptic();
                  setPersonalGoalSelected(true);
                  setForm((f) => ({ ...f, personalGoalId: null }));
                }}
                style={[
                  styles.goalOption,
                  {
                    backgroundColor:
                      personalGoalSelected && form.personalGoalId === null
                        ? theme.backgroundSelected
                        : theme.backgroundElement,
                    borderColor:
                      personalGoalSelected && form.personalGoalId === null
                        ? theme.primary
                        : "transparent",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.goalOptionText,
                    { color: theme.textSecondary },
                  ]}
                >
                  None — I'll link later
                </Text>
              </Pressable>
              {linkableGoals.map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() => {
                    playSelectionHaptic();
                    setPersonalGoalSelected(true);
                    setForm((f) => ({ ...f, personalGoalId: g.id }));
                  }}
                  style={[
                    styles.goalOption,
                    {
                      backgroundColor:
                        form.personalGoalId === g.id
                          ? theme.backgroundSelected
                          : theme.backgroundElement,
                      borderColor:
                        form.personalGoalId === g.id
                          ? theme.primary
                          : "transparent",
                    },
                  ]}
                >
                  <Text style={[styles.goalOptionText, { color: theme.text }]}>
                    {g.name}
                  </Text>
                  {!isOneTime && g.period && (
                    <Text
                      style={[
                        styles.goalOptionSub,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {g.period}
                    </Text>
                  )}
                </Pressable>
              ))}
            </View>
          )}

          {/* Step 4: Invite friends */}
          {step === 4 && (
            <View>
              <Text style={[styles.stepHeading, { color: theme.text }]}>
                Invite friends
              </Text>
              <View
                style={[
                  styles.evidenceSwitchRow,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                    marginTop: 18,
                  },
                ]}
              >
                <View style={styles.evidenceSwitchCopy}>
                  <Text
                    style={[styles.evidenceSwitchTitle, { color: theme.text }]}
                  >
                    Make Goal Open Invite
                  </Text>
                  <Text
                    style={[
                      styles.evidenceSwitchDescription,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Let accepted participants invite their own friends.
                  </Text>
                </View>
                <Switch
                  onValueChange={(openInvite) => {
                    playSelectionHaptic();
                    setForm((current) => ({ ...current, openInvite }));
                  }}
                  trackColor={{
                    false: theme.backgroundSelected,
                    true: theme.primary,
                  }}
                  value={form.openInvite}
                />
              </View>
              {acceptedFriends.length === 0 ? (
                <Text style={[styles.stepHint, { color: theme.textSecondary }]}>
                  You don't have any friends to invite yet. Add friends from the
                  Collab tab — or create this goal now and invite people later.
                </Text>
              ) : (
                <>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ selected: allFriendsSelected }}
                    onPress={toggleAllFriends}
                    style={({ pressed }) => [
                      styles.selectAllFriends,
                      {
                        backgroundColor: allFriendsSelected
                          ? `${theme.primary}14`
                          : theme.backgroundElement,
                        borderColor: allFriendsSelected
                          ? theme.primary
                          : theme.tabBorder,
                      },
                      pressed && styles.pressed,
                    ]}
                  >
                    <SymbolView
                      name={sym(
                        allFriendsSelected ? "checkmark.circle.fill" : "circle",
                        allFriendsSelected
                          ? "check_circle"
                          : "radio_button_unchecked",
                      )}
                      size={21}
                      weight="semibold"
                      tintColor={
                        allFriendsSelected ? theme.primary : theme.textSecondary
                      }
                    />
                    <View style={styles.selectAllInfo}>
                      <Text
                        style={[styles.selectAllLabel, { color: theme.text }]}
                      >
                        Invite all friends
                      </Text>
                      <Text
                        style={[
                          styles.selectAllMeta,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {selectedFriendCount}/{acceptedFriends.length} selected
                      </Text>
                    </View>
                    <Text
                      style={[styles.selectAllAction, { color: theme.primary }]}
                    >
                      {allFriendsSelected ? "Clear" : "Select"}
                    </Text>
                  </Pressable>

                  {selectableGroups.length > 0 ? (
                    <View style={styles.groupInviteSection}>
                      <Text
                        style={[
                          styles.groupInviteLabel,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Add a group
                      </Text>
                      <ScrollView
                        horizontal
                        contentContainerStyle={styles.groupInviteList}
                        showsHorizontalScrollIndicator={false}
                      >
                        {selectableGroups.map((group) => {
                          const selectedCount = group.memberIds.filter((id) =>
                            form.invitedUserIds.includes(id),
                          ).length;
                          const selected =
                            selectedCount === group.memberIds.length;
                          return (
                            <Pressable
                              key={group.id}
                              onPress={() => toggleGroup(group.memberIds)}
                              style={({ pressed }) => [
                                styles.groupInviteChip,
                                {
                                  backgroundColor: selected
                                    ? theme.primary
                                    : theme.backgroundElement,
                                  borderColor: selected
                                    ? theme.primary
                                    : theme.tabBorder,
                                },
                                pressed && styles.pressed,
                              ]}
                            >
                              <Text
                                numberOfLines={1}
                                style={[
                                  styles.groupInviteName,
                                  {
                                    color: selected
                                      ? theme.primaryForeground
                                      : theme.text,
                                  },
                                ]}
                              >
                                {group.name}
                              </Text>
                              <Text
                                style={[
                                  styles.groupInviteMeta,
                                  {
                                    color: selected
                                      ? theme.primaryForeground
                                      : theme.textSecondary,
                                  },
                                ]}
                              >
                                {selectedCount}/{group.memberIds.length}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                  ) : null}

                  {acceptedFriends.map((f) => {
                    const selected = form.invitedUserIds.includes(f.friendId);
                    return (
                      <Pressable
                        key={f.friendId}
                        onPress={() => toggleFriend(f.friendId)}
                        style={[
                          styles.friendRow,
                          { borderBottomColor: theme.tabBorder },
                        ]}
                      >
                        <Avatar
                          image={f.friendImage}
                          name={f.friendName}
                          size={36}
                        />
                        <View style={styles.friendInfo}>
                          <Text
                            style={[styles.friendName, { color: theme.text }]}
                          >
                            {f.friendName}
                          </Text>
                          <Text
                            style={[
                              styles.friendEmail,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {f.friendEmail}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.checkbox,
                            {
                              backgroundColor: selected
                                ? theme.primary
                                : "transparent",
                              borderColor: selected
                                ? theme.primary
                                : theme.textSecondary,
                            },
                          ]}
                        >
                          {selected && (
                            <SymbolView
                              name={sym("checkmark", "check")}
                              size={11}
                              weight="semibold"
                              tintColor={theme.primaryForeground}
                            />
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
                </>
              )}
            </View>
          )}

          {/* Step 5: What's on the line */}
          {step === 5 && (
            <View>
              <Text style={[styles.stepHeading, { color: theme.text }]}>
                What's on the line?
              </Text>
              <Text style={[styles.stepHint, { color: theme.textSecondary }]}>
                Add a reward or consequence to raise the stakes — or keep it
                pressure-free.
              </Text>
              <View
                style={[
                  styles.evidenceSwitchRow,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                  },
                ]}
              >
                <View style={styles.evidenceSwitchCopy}>
                  <Text
                    style={[styles.evidenceSwitchTitle, { color: theme.text }]}
                  >
                    Require evidence
                  </Text>
                  <Text
                    style={[
                      styles.evidenceSwitchDescription,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Add a photo or note before marking this goal complete.
                  </Text>
                </View>
                <Switch
                  onValueChange={(requireEvidence) => {
                    playSelectionHaptic();
                    setForm((current) => ({ ...current, requireEvidence }));
                  }}
                  trackColor={{
                    false: theme.backgroundSelected,
                    true: theme.primary,
                  }}
                  value={form.requireEvidence}
                />
              </View>
              {STAKE_OPTIONS.map((option) => {
                const selected = form.stakeType === option.type;
                return (
                  <Pressable
                    key={option.type}
                    onPress={() =>
                      setForm((f) => ({ ...f, stakeType: option.type }))
                    }
                    style={[
                      styles.goalOption,
                      {
                        backgroundColor: selected
                          ? theme.backgroundSelected
                          : theme.backgroundElement,
                        borderColor: selected ? theme.primary : "transparent",
                      },
                    ]}
                  >
                    <Text
                      style={[styles.goalOptionText, { color: theme.text }]}
                    >
                      {option.label}
                    </Text>
                    <Text
                      style={[
                        styles.goalOptionSub,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {option.description}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Step 6: Consequence detail (carrot/stick only) */}
          {step === 6 && form.stakeType !== "none" && (
            <View>
              <Text style={[styles.stepHeading, { color: theme.text }]}>
                {form.stakeType === "carrot"
                  ? "What's the reward?"
                  : "What's the consequence?"}
              </Text>
              <Text style={[styles.stepHint, { color: theme.textSecondary }]}>
                {form.stakeType === "carrot"
                  ? "Describe what everyone is working toward."
                  : "Describe what happens to whoever falls short."}
              </Text>
              <TextInput
                multiline
                placeholder={
                  form.stakeType === "carrot"
                    ? "e.g. Winner gets dinner paid for"
                    : "e.g. Loser does everyone's dishes for a week"
                }
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.textInput,
                  {
                    minHeight: 96,
                    textAlignVertical: "top",
                    color: theme.text,
                    borderColor: theme.tabBorder,
                  },
                ]}
                value={form.stakeDescription}
                onChangeText={(text) =>
                  setForm((f) => ({ ...f, stakeDescription: text }))
                }
              />
            </View>
          )}
        </ScrollView>

        {/* Footer */}
        <View style={[styles.sheetFooter, { borderTopColor: theme.tabBorder }]}>
          {step < lastStep ? (
            <Pressable
              onPress={() => canProceed() && setStep((s) => (s + 1) as Step)}
              style={[
                styles.sheetPrimaryBtn,
                {
                  backgroundColor: canProceed()
                    ? theme.primary
                    : theme.backgroundElement,
                },
              ]}
            >
              <Text
                style={[
                  styles.sheetPrimaryBtnText,
                  {
                    color: canProceed()
                      ? theme.primaryForeground
                      : theme.textSecondary,
                  },
                ]}
              >
                Next
              </Text>
            </Pressable>
          ) : (
            <Pressable
              onPress={handleCreate}
              disabled={submitting || !stakeReady}
              style={[
                styles.sheetPrimaryBtn,
                {
                  backgroundColor:
                    submitting || !stakeReady
                      ? theme.backgroundElement
                      : theme.primary,
                },
              ]}
            >
              {submitting ? (
                <ActivityIndicator
                  color={theme.primaryForeground}
                  size="small"
                />
              ) : (
                <Text
                  style={[
                    styles.sheetPrimaryBtnText,
                    {
                      color: stakeReady
                        ? theme.primaryForeground
                        : theme.textSecondary,
                    },
                  ]}
                >
                  Create Shared Goal
                </Text>
              )}
            </Pressable>
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function SharedGoalsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [goals, setGoals] = useState<SharedGoalSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [personalGoals, setPersonalGoals] = useState<Goal[]>([]);
  const [personalPlanGoals, setPersonalPlanGoals] = useState<PlanGoal[]>([]);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [friendGroups, setFriendGroups] = useState<FriendGroupRow[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<SharedGoalSnapshot | null>(
    null,
  );
  const [invitationDetails, setInvitationDetails] =
    useState<SharedGoalSnapshot | null>(null);
  const [isAcceptingInvitation, setIsAcceptingInvitation] = useState(false);
  const [modeFilter, setModeFilter] =
    useState<SharedGoalSnapshot["mode"]>("collaborative");
  const [showCreate, setShowCreate] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [relinkGoal, setRelinkGoal] = useState<SharedGoalSnapshot | null>(null);

  // ─── Report-today action dialog (shared with daily/monthly goals) ──────────
  const [menuGoal, setMenuGoal] = useState<SharedGoalSnapshot | null>(null);
  const [actionGoal, setActionGoal] = useState<SharedGoalSnapshot | null>(null);
  const [pendingActionGoal, setPendingActionGoal] =
    useState<SharedGoalSnapshot | null>(null);
  const [nudgingGoalId, setNudgingGoalId] = useState<string | null>(null);
  const [logsSnapshot, setLogsSnapshot] = useState<GoalLogsSnapshot | null>(
    null,
  );
  const [noteEditGoal, setNoteEditGoal] = useState<ActionGoal | null>(null);
  const [uploadingPhotoSource, setUploadingPhotoSource] =
    useState<GoalPhotoSource | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  const load = useCallback(async () => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    try {
      const data = await fetchSharedGoals();
      if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
        return;
      }
      setGoals(data);
      setError(null);
    } catch (e) {
      if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
        return;
      }
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      if (isMountedRef.current && requestId === loadRequestIdRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const loadAuxiliary = useCallback(async () => {
    const [g, planGoals, f, groups] = await Promise.allSettled([
      fetchGoals(),
      fetchPlanGoals(),
      fetchFriends(),
      fetchFriendGroups(),
    ]);
    if (!isMountedRef.current) return;
    if (g.status === "fulfilled") setPersonalGoals(g.value);
    if (planGoals.status === "fulfilled") setPersonalPlanGoals(planGoals.value);
    if (f.status === "fulfilled") setFriends(f.value);
    if (groups.status === "fulfilled") setFriendGroups(groups.value);
  }, []);

  const openInvitationDetails = useCallback(
    (goal: SharedGoalSnapshot) => {
      setInvitationDetails(goal);
      if (personalGoals.length === 0 || friends.length === 0) {
        void loadAuxiliary();
      }
    },
    [friends.length, loadAuxiliary, personalGoals.length],
  );

  useEffect(() => {
    void load();
    void loadAuxiliary();
  }, [load, loadAuxiliary]);

  const refreshLogsSnapshot = useCallback(async () => {
    try {
      const snap = await fetchGoalLogsSnapshot(getMonthKey());
      if (!isMountedRef.current) return;
      setLogsSnapshot(snap);
    } catch {
      // Non-fatal: the dialog still works off the shared-goal snapshot.
    }
  }, []);

  const presentGoalActions = useCallback(
    (goal: SharedGoalSnapshot) => {
      setActionGoal(goal);
      void refreshLogsSnapshot();
    },
    [refreshLogsSnapshot],
  );

  useEffect(() => {
    if (!pendingActionGoal || selectedGoal !== null) return;

    const actionGoalToPresent = pendingActionGoal;
    const task = InteractionManager.runAfterInteractions(() => {
      presentGoalActions(actionGoalToPresent);
      setPendingActionGoal(null);
    });

    return () => task.cancel();
  }, [pendingActionGoal, presentGoalActions, selectedGoal]);

  // Opens the same action dialog daily/monthly goals use, targeting the
  // participant's linked personal goal for today.
  function openGoalActions(goal: SharedGoalSnapshot) {
    const cur = goal.currentUserParticipant;
    if (!cur?.personalGoalId) {
      setSelectedGoal(null);
      setRelinkGoal(goal);
      return;
    }

    if (selectedGoal !== null) {
      setPendingActionGoal(goal);
      setSelectedGoal(null);
      return;
    }

    presentGoalActions(goal);
  }

  // The linked personal goal for the open action dialog, shaped as an
  // ActionGoal so the shared modal can render it.
  const actionPersonalGoalId =
    actionGoal?.currentUserParticipant?.personalGoalId ?? null;
  const actionPersonalGoal = actionPersonalGoalId
    ? personalGoals.find((g) => g.id === actionPersonalGoalId)
    : undefined;
  const actionGoalForModal: ActionGoal | null =
    actionGoal && actionPersonalGoalId
      ? {
          id: actionPersonalGoalId,
          name:
            actionPersonalGoal?.name ??
            actionGoal.currentUserParticipant?.personalGoalName ??
            actionGoal.name,
          iconKey: actionPersonalGoal?.iconKey ?? "target",
          categoryId: actionPersonalGoal?.categoryId ?? "",
          goalId: actionPersonalGoal?.goalId ?? null,
          goalTitle: actionPersonalGoal?.goalTitle ?? null,
          priority: actionPersonalGoal?.priority ?? "high",
          hidden: actionPersonalGoal?.hidden ?? false,
          visibility: actionPersonalGoal?.visibility ?? "only_me",
          audienceFriendIds: actionPersonalGoal?.audienceFriendIds ?? [],
          audienceGroupIds: actionPersonalGoal?.audienceGroupIds ?? [],
          period: actionPersonalGoal?.period ?? "daily",
          repeatCadence:
            actionPersonalGoal?.repeatCadence ??
            actionPersonalGoal?.period ??
            "daily",
          frequencyGoal: actionPersonalGoal?.frequencyGoal ?? null,
          defaultComplete: actionPersonalGoal?.defaultComplete ?? false,
          requireEvidence: actionPersonalGoal?.requireEvidence ?? true,
          planOnCalendar: actionPersonalGoal?.planOnCalendar ?? true,
          reminderEnabled: actionPersonalGoal?.reminderEnabled ?? false,
          reminderTime: actionPersonalGoal?.reminderTime ?? null,
        }
      : null;

  const actionLogKey = actionPersonalGoalId
    ? `${actionPersonalGoalId}_${todayKey()}`
    : "";
  const actionStatus = actionLogKey
    ? ((actionGoalForModal && logsSnapshot
        ? getGoalDateStatus(
            actionGoalForModal,
            todayKey(),
            logsSnapshot.logsByGoalDate,
          )
        : undefined) ??
      (actionGoal?.currentUserParticipant?.completedToday
        ? "complete"
        : undefined))
    : undefined;
  const actionHasNote = Boolean(
    actionLogKey && logsSnapshot?.notesByGoalDate[actionLogKey]?.trim(),
  );
  const actionHasPhoto = Boolean(
    actionLogKey &&
      (logsSnapshot?.photoCountsByGoalDate[actionLogKey] ?? 0) > 0,
  );
  const actionVisibility: GoalVisibility =
    (actionLogKey && logsSnapshot?.visibilityByGoalDate[actionLogKey]) ||
    actionPersonalGoal?.visibility ||
    "only_me";

  async function handleActionSetStatus(status: GoalLogStatus) {
    if (!actionPersonalGoalId) return;
    setIsUpdatingStatus(true);
    try {
      await setGoalLog(actionPersonalGoalId, todayKey(), status);
      if (status === "complete") {
        playSuccessHaptic();
      } else {
        playSelectionHaptic();
      }
      if (!isMountedRef.current) return;
      await Promise.all([load(), refreshLogsSnapshot()]);
    } catch (e) {
      if (!isMountedRef.current) return;
      Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
    } finally {
      if (isMountedRef.current) {
        setIsUpdatingStatus(false);
        setActionGoal(null);
      }
    }
  }

  async function handleActionAddPhoto(source: GoalPhotoSource) {
    if (!actionPersonalGoalId || uploadingPhotoSource) return;
    setUploadingPhotoSource(source);
    try {
      const photo = await pickGoalPhoto(source);
      if (!photo) return;
      await uploadGoalPhoto(actionPersonalGoalId, todayKey(), photo);
      if (!isMountedRef.current) return;
      await refreshLogsSnapshot();
    } catch (e) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Could not add photo",
        e instanceof Error ? e.message : "The photo could not be uploaded.",
      );
    } finally {
      if (isMountedRef.current) setUploadingPhotoSource(null);
    }
  }

  async function handleActionSetVisibility(visibility: GoalVisibility) {
    if (!actionPersonalGoalId || isUpdatingVisibility) return;
    setIsUpdatingVisibility(true);
    try {
      await setGoalLogVisibility(actionPersonalGoalId, todayKey(), visibility);
      if (!isMountedRef.current) return;
      await refreshLogsSnapshot();
    } catch (e) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Could not change visibility",
        e instanceof Error ? e.message : "The visibility could not be changed.",
      );
    } finally {
      if (isMountedRef.current) setIsUpdatingVisibility(false);
    }
  }

  async function handleJoinInvitation(
    personalGoalId: string | null,
    inviteFriendIds: string[],
  ) {
    const goal = invitationDetails;
    if (!goal || isAcceptingInvitation) return;

    setIsAcceptingInvitation(true);
    try {
      await respondToSharedGoal(goal.id, {
        action: "accept",
        personalGoalId,
      });

      let inviteError: unknown = null;
      if (inviteFriendIds.length > 0) {
        try {
          await inviteSharedGoalParticipants(goal.id, inviteFriendIds);
        } catch (error) {
          inviteError = error;
        }
      }

      setInvitationDetails(null);
      playSuccessHaptic();
      await load();

      if (isMountedRef.current && inviteError) {
        Alert.alert(
          "Joined shared goal",
          "You joined, but some friend invitations could not be sent.",
        );
      }
    } catch (e) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Could not join shared goal",
        e instanceof Error ? e.message : "Failed.",
      );
    } finally {
      if (isMountedRef.current) setIsAcceptingInvitation(false);
    }
  }

  async function handleDecline(goal: SharedGoalSnapshot) {
    playWarningHaptic();
    Alert.alert("Decline invitation", `Decline "${goal.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline",
        style: "destructive",
        onPress: async () => {
          try {
            await respondToSharedGoal(goal.id, { action: "decline" });
            if (!isMountedRef.current) return;
            await load();
          } catch (e) {
            if (!isMountedRef.current) return;
            Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
          }
        },
      },
    ]);
  }

  async function handleLeave(goal: SharedGoalSnapshot) {
    Alert.alert("Leave goal", `Leave "${goal.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Leave",
        style: "destructive",
        onPress: async () => {
          try {
            setSelectedGoal(null);
            await updateSharedGoal(goal.id, { action: "leave" });
            if (!isMountedRef.current) return;
            await load();
          } catch (e) {
            if (!isMountedRef.current) return;
            Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
          }
        },
      },
    ]);
  }

  async function handleArchive(goal: SharedGoalSnapshot) {
    try {
      setSelectedGoal(null);
      await updateSharedGoal(goal.id, {
        action: "setStatus",
        status: "archived",
      });
      if (!isMountedRef.current) return;
      await load();
    } catch (e) {
      if (!isMountedRef.current) return;
      Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
    }
  }

  async function handleComplete(goal: SharedGoalSnapshot) {
    try {
      setSelectedGoal(null);
      await updateSharedGoal(goal.id, {
        action: "setStatus",
        status: "completed",
      });
      if (!isMountedRef.current) return;
      await load();
    } catch (e) {
      if (!isMountedRef.current) return;
      Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
    }
  }

  async function handleRelink(
    goal: SharedGoalSnapshot,
    goalId: string | null,
    deleteAuto: boolean,
  ) {
    try {
      setRelinkGoal(null);
      await respondToSharedGoal(goal.id, {
        action: "relink",
        personalGoalId: goalId,
        deletePreviousAutoCreated: deleteAuto,
      });
      playSuccessHaptic();
      if (!isMountedRef.current) return;
      await load();
    } catch (e) {
      if (!isMountedRef.current) return;
      Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
    }
  }

  async function handleCreate(input: CreateSharedGoalInput) {
    await createSharedGoal(input);
    playSuccessHaptic();
    if (!isMountedRef.current) return;
    setShowCreate(false);
    await load();
  }

  async function handleNudge(goal: SharedGoalSnapshot) {
    if (nudgingGoalId) return;

    const currentUserId = goal.currentUserParticipant?.userId;
    const recipientFriends = goal.participants
      .filter(
        (participant) =>
          participant.status === "accepted" &&
          participant.userId !== currentUserId,
      )
      .flatMap((participant) => {
        const friend = friends.find(
          (row) => row.friendId === participant.userId,
        );
        return friend ? [friend] : [];
      });

    if (recipientFriends.length === 0) {
      Alert.alert("No one to nudge", "There are no accepted friends to nudge.");
      return;
    }

    setNudgingGoalId(goal.id);
    try {
      await Promise.all(
        recipientFriends.map((friend) =>
          sendFriendNudge(friend.id, `Quick nudge for ${goal.name}.`),
        ),
      );
      playSuccessHaptic();
      Alert.alert(
        "Nudge sent",
        recipientFriends.length === 1
          ? `${recipientFriends[0]?.friendName ?? "Your friend"} got a quick nudge.`
          : `${recipientFriends.length} friends got a quick nudge.`,
      );
    } catch (nudgeError) {
      Alert.alert(
        "Could not send nudge",
        nudgeError instanceof Error ? nudgeError.message : "Please try again.",
      );
    } finally {
      setNudgingGoalId(null);
    }
  }

  const collaborativeGoals = goals.filter((g) => g.mode === "collaborative");
  const competitiveGoals = goals.filter((g) => g.mode === "competitive");
  const visibleGoals =
    modeFilter === "collaborative" ? collaborativeGoals : competitiveGoals;
  const modeLabel =
    modeFilter === "collaborative" ? "Collaborative" : "Competitive";
  const invitations = visibleGoals.filter(
    (g) =>
      g.status === "active" && g.currentUserParticipant?.status === "invited",
  );
  const active = visibleGoals.filter(
    (g) =>
      g.status === "active" && g.currentUserParticipant?.status !== "invited",
  );
  const completed = visibleGoals.filter(
    (g) => g.status === "completed" || g.status === "archived",
  );
  const hasVisibleGoals = invitations.length > 0 || active.length > 0;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: theme.background,
            borderBottomColor: theme.tabBorder,
          },
        ]}
      >
        <View style={styles.headerTitle}>
          <PageHeaderTitle title="Collab" />
          <CollabSectionHeaderTabs currentSection="shared-goals" />
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="New shared goal"
            onPress={() => setShowCreate(true)}
            hitSlop={8}
            style={({ pressed }) => [
              styles.addButton,
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={sym("plus", "add")}
              size={28}
              weight="semibold"
              tintColor={theme.primary}
            />
          </Pressable>
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <FloatingLogoLoader />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={[styles.errorText, { color: theme.textSecondary }]}>
            {error}
          </Text>
          <Pressable
            onPress={load}
            style={[styles.retryBtn, { borderColor: theme.primary }]}
          >
            <Text style={[styles.retryBtnText, { color: theme.primary }]}>
              Retry
            </Text>
          </Pressable>
        </View>
      ) : goals.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            No shared goals yet
          </Text>
          <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
            Create a shared goal to stay accountable with friends.
          </Text>
          <Pressable
            onPress={() => setShowCreate(true)}
            style={[styles.emptyCreateBtn, { backgroundColor: theme.primary }]}
          >
            <Text
              style={[
                styles.emptyCreateBtnText,
                { color: theme.primaryForeground },
              ]}
            >
              Create Shared Goal
            </Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          canCancelContentTouches
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 16 },
          ]}
          directionalLockEnabled
          showsVerticalScrollIndicator={false}
        >
          <View
            accessibilityRole="tablist"
            style={[
              styles.modeTabs,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.tabBorder,
              },
            ]}
          >
            {[
              {
                key: "collaborative" as const,
                label: "Collaborative",
                count: collaborativeGoals.length,
              },
              {
                key: "competitive" as const,
                label: "Competitive",
                count: competitiveGoals.length,
              },
            ].map((tab) => {
              const selected = modeFilter === tab.key;
              return (
                <Pressable
                  key={tab.key}
                  accessibilityLabel={`${tab.label} shared goals`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected }}
                  onPress={() => setModeFilter(tab.key)}
                  style={[
                    styles.modeTab,
                    selected && {
                      backgroundColor: theme.tabBar,
                      borderColor: theme.tabBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.modeTabLabel,
                      { color: selected ? theme.text : theme.textSecondary },
                    ]}
                  >
                    {tab.label}
                  </Text>
                  <Text
                    style={[
                      styles.modeTabCount,
                      { color: selected ? theme.primary : theme.textSecondary },
                    ]}
                  >
                    {tab.count}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {invitations.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Invitations
              </Text>
              {invitations.map((g) => (
                <InvitationCard
                  key={g.id}
                  goal={g}
                  onOpenDetails={() => openInvitationDetails(g)}
                  onDecline={() => handleDecline(g)}
                />
              ))}
            </View>
          )}

          {active.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Active Goals
              </Text>
              {active.map((g) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  onDetails={() => setSelectedGoal(g)}
                  onReport={() => openGoalActions(g)}
                  onRelink={() => setRelinkGoal(g)}
                  onMenu={() => setMenuGoal(g)}
                />
              ))}
            </View>
          )}

          {!hasVisibleGoals && (
            <View style={styles.center}>
              <BrandedEmptyState
                compact
                title={`No active ${modeLabel.toLowerCase()} shared goals`}
                description="Switch tabs to view the other type. Completed and archived goals are hidden."
              />
            </View>
          )}

          {completed.length > 0 && (
            <View style={styles.section}>
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ expanded: showCompleted }}
                onPress={() => setShowCompleted((value) => !value)}
                style={({ pressed }) => [
                  styles.completedToggle,
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={sym(
                    showCompleted ? "chevron.down" : "chevron.right",
                    showCompleted ? "expand_more" : "chevron_right",
                  )}
                  size={13}
                  weight="bold"
                  tintColor={theme.textSecondary}
                />
                <Text
                  style={[
                    styles.completedToggleText,
                    { color: theme.textSecondary },
                  ]}
                >
                  {`SHOW COMPLETED (${completed.length})`}
                </Text>
              </Pressable>
              {showCompleted
                ? completed.map((g) => (
                    <GoalCard
                      key={g.id}
                      goal={g}
                      onDetails={() => setSelectedGoal(g)}
                      onReport={() => openGoalActions(g)}
                      onRelink={() => setRelinkGoal(g)}
                      onMenu={() => setMenuGoal(g)}
                    />
                  ))
                : null}
            </View>
          )}
        </ScrollView>
      )}

      {/* Invitation details */}
      <Modal
        visible={invitationDetails !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setInvitationDetails(null)}
      >
        {invitationDetails ? (
          <SharedGoalInviteModal
            entry={toSharedGoalInviteEntry(invitationDetails)}
            friends={friends}
            personalGoals={personalGoals}
            personalPlanGoals={personalPlanGoals}
            submitting={isAcceptingInvitation}
            onClose={() => setInvitationDetails(null)}
            onJoin={(personalGoalId, inviteFriendIds) =>
              void handleJoinInvitation(personalGoalId, inviteFriendIds)
            }
          />
        ) : null}
      </Modal>

      {/* Details sheet */}
      <Modal
        visible={selectedGoal !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setSelectedGoal(null)}
      >
        {selectedGoal && (
          <GoalDetailsSheet
            goal={selectedGoal}
            onClose={() => setSelectedGoal(null)}
            onReportToday={() => openGoalActions(selectedGoal)}
            onRelink={() => {
              setSelectedGoal(null);
              setRelinkGoal(selectedGoal);
            }}
            onLeave={() => handleLeave(selectedGoal)}
            onArchive={() => handleArchive(selectedGoal)}
          />
        )}
      </Modal>

      {/* Relink modal */}
      <Modal
        visible={relinkGoal !== null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setRelinkGoal(null)}
      >
        {relinkGoal && (
          <RelinkModal
            goal={relinkGoal}
            personalGoals={personalGoals}
            personalPlanGoals={personalPlanGoals}
            onClose={() => setRelinkGoal(null)}
            onRelink={(goalId, deleteAuto) =>
              handleRelink(relinkGoal, goalId, deleteAuto)
            }
          />
        )}
      </Modal>

      {/* Create modal */}
      <Modal
        visible={showCreate}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowCreate(false)}
      >
        <CreateGoalModal
          personalGoals={personalGoals}
          personalPlanGoals={personalPlanGoals}
          friends={friends}
          friendGroups={friendGroups}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      </Modal>

      {/* Report-today action dialog (shared with daily/monthly goals) */}
      <GoalActionsModal
        goal={actionGoalForModal}
        visible={actionGoal !== null}
        hasNote={actionHasNote}
        hasPhoto={actionHasPhoto}
        visibility={actionVisibility}
        status={actionStatus}
        isUpdating={isUpdatingStatus}
        isUpdatingVisibility={isUpdatingVisibility}
        uploadingPhotoSource={uploadingPhotoSource}
        onAddPhoto={(source) => void handleActionAddPhoto(source)}
        onOpenNote={() => {
          setNoteEditGoal(actionGoalForModal);
          setActionGoal(null);
        }}
        onSetVisibility={(visibility) =>
          void handleActionSetVisibility(visibility)
        }
        onSetStatus={(status) => void handleActionSetStatus(status)}
        onDismiss={() => setActionGoal(null)}
        onShown={() => {}}
      />

      {noteEditGoal ? (
        <GoalNoteEditorModal
          dateKey={todayKey()}
          goalName={noteEditGoal.name}
          initialValue={
            logsSnapshot?.notesByGoalDate[`${noteEditGoal.id}_${todayKey()}`] ??
            null
          }
          onClose={() => setNoteEditGoal(null)}
          onSave={async (notes) => {
            await setGoalLogNote(noteEditGoal.id, todayKey(), notes);
            if (!isMountedRef.current) return;
            await refreshLogsSnapshot();
          }}
        />
      ) : null}

      {/* Card options menu */}
      <Modal
        visible={menuGoal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setMenuGoal(null)}
      >
        <Pressable
          style={styles.menuBackdrop}
          onPress={() => setMenuGoal(null)}
        >
          <Pressable
            style={[
              styles.menuSheet,
              {
                backgroundColor: theme.background,
                paddingBottom: insets.bottom + 12,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            {menuGoal ? (
              <>
                <Text style={[styles.menuTitle, { color: theme.text }]}>
                  {menuGoal.name}
                </Text>
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    const g = menuGoal;
                    setMenuGoal(null);
                    setRelinkGoal(g);
                  }}
                >
                  <SymbolView
                    name={sym("link", "link")}
                    size={20}
                    tintColor={theme.text}
                  />
                  <Text style={[styles.menuItemText, { color: theme.text }]}>
                    Relink goal
                  </Text>
                </Pressable>
                {menuGoal.status === "active" && (
                  <Pressable
                    disabled={nudgingGoalId === menuGoal.id}
                    style={styles.menuItem}
                    onPress={() => {
                      const g = menuGoal;
                      setMenuGoal(null);
                      void handleNudge(g);
                    }}
                  >
                    {nudgingGoalId === menuGoal.id ? (
                      <ActivityIndicator color={theme.primary} size="small" />
                    ) : (
                      <SymbolView
                        name={sym("hand.tap.fill", "touch_app")}
                        size={20}
                        tintColor={theme.primary}
                      />
                    )}
                    <Text
                      style={[styles.menuItemText, { color: theme.primary }]}
                    >
                      Nudge participants
                    </Text>
                  </Pressable>
                )}
                {menuGoal.canManage && menuGoal.status === "active" && (
                  <>
                    <Pressable
                      style={styles.menuItem}
                      onPress={() => {
                        const g = menuGoal;
                        setMenuGoal(null);
                        void handleComplete(g);
                      }}
                    >
                      <SymbolView
                        name={sym("checkmark.circle", "check_circle")}
                        size={20}
                        tintColor={theme.text}
                      />
                      <Text
                        style={[styles.menuItemText, { color: theme.text }]}
                      >
                        Mark completed
                      </Text>
                    </Pressable>
                    <Pressable
                      style={styles.menuItem}
                      onPress={() => {
                        const g = menuGoal;
                        setMenuGoal(null);
                        void handleArchive(g);
                      }}
                    >
                      <SymbolView
                        name={sym("archivebox", "archive")}
                        size={20}
                        tintColor={theme.text}
                      />
                      <Text
                        style={[styles.menuItemText, { color: theme.text }]}
                      >
                        Archive
                      </Text>
                    </Pressable>
                  </>
                )}
                <Pressable
                  style={styles.menuItem}
                  onPress={() => {
                    const g = menuGoal;
                    setMenuGoal(null);
                    void handleLeave(g);
                  }}
                >
                  <SymbolView
                    name={sym("rectangle.portrait.and.arrow.right", "logout")}
                    size={20}
                    tintColor="#EF4444"
                  />
                  <Text style={[styles.menuItemText, { color: "#EF4444" }]}>
                    Leave
                  </Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  addButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  pressed: { opacity: 0.6 },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  errorText: {
    fontSize: 15,
    textAlign: "center",
    marginBottom: 16,
  },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  retryBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: 15,
    textAlign: "center",
    lineHeight: 22,
    marginBottom: 24,
  },
  emptyCreateBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyCreateBtnText: {
    fontSize: 15,
    fontWeight: "700",
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 16,
  },
  modeTabs: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 20,
    padding: 3,
    gap: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
  },
  modeTab: {
    flex: 1,
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "transparent",
    borderRadius: 12,
  },
  modeTabLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  modeTabCount: {
    fontSize: 14,
    fontWeight: "800",
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginHorizontal: 16,
    marginBottom: 10,
  },
  completedToggle: {
    marginHorizontal: 16,
    marginBottom: 10,
    minHeight: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  completedToggleText: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0,
  },
  // Card
  card: {
    marginHorizontal: 16,
    marginBottom: 18,
    borderRadius: 12,
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  inviteCard: {
    borderWidth: 1,
  },
  cardHeaderRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 12,
  },
  cardMenuButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    marginTop: -4,
    marginRight: -4,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 14,
    flexShrink: 1,
  },
  detailsBadgeRow: {
    marginBottom: 12,
    paddingLeft: 2,
  },
  menuBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  menuSheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 14,
    paddingHorizontal: 12,
  },
  menuTitle: {
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 12,
    paddingBottom: 8,
    opacity: 0.6,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingVertical: 15,
    paddingHorizontal: 12,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: "600",
  },
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 4,
    letterSpacing: -0.15,
  },
  cardSubtitle: {
    fontSize: 13,
    marginBottom: 10,
  },
  progressSection: {
    marginBottom: 10,
  },
  progressRow: {
    marginBottom: 4,
  },
  progressMeta: {
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  progressText: {
    fontSize: 12,
  },
  collaborativeMetric: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 2,
  },
  competitiveParticipants: {
    gap: 6,
    marginBottom: 2,
  },
  competitiveParticipantRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 5,
  },
  competitiveParticipantInfo: {
    flex: 1,
    gap: 4,
  },
  competitiveParticipantHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  competitiveParticipantName: {
    flex: 1,
    fontSize: 13,
    fontWeight: "700",
  },
  competitiveParticipantScore: {
    fontSize: 12,
    fontWeight: "700",
  },
  competitiveScoreTrack: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  competitiveScoreFill: {
    height: 4,
    borderRadius: 2,
  },
  progressTrack: {
    width: "100%",
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
  },
  cardDivider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: 10,
  },
  cardFooter: {
    gap: 8,
  },
  footerAvatars: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  participantCountText: {
    fontSize: 13,
  },
  footerActions: {
    flexDirection: "row",
    gap: 8,
  },
  cardBtn: {
    flex: 1,
    minHeight: 40,
    flexDirection: "row",
    gap: 5,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  cardBtnOutline: {
    borderWidth: 1,
  },
  cardBtnText: {
    fontSize: 13,
    fontWeight: "700",
  },
  // Invitation card
  inviteHeader: {
    flexDirection: "row",
    gap: 6,
    marginBottom: 10,
  },
  inviteActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  inviteBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  inviteBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  // Sheet (shared for details, relink, create)
  sheet: {
    flex: 1,
  },
  createSheet: {
    flex: 1,
  },
  sheetHandle: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 4,
  },
  sheetHandleBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
  },
  sheetHeaderSideSpacer: {
    width: 72,
  },
  sheetHeaderActions: {
    width: 72,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },
  sheetHeaderIconButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  sheetClose: {
    width: 32,
    alignItems: "flex-end",
  },
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    padding: 20,
    paddingBottom: 8,
  },
  sheetSection: {
    marginBottom: 20,
  },
  sheetSectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 10,
  },
  sheetFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  sheetPrimaryBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetPrimaryBtnText: {
    fontSize: 16,
    fontWeight: "700",
  },
  sheetSecondaryActions: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingBottom: 4,
  },
  sheetSecBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  sheetSecBtnText: {
    fontSize: 14,
    fontWeight: "600",
  },
  // Stats grid
  statsGrid: {
    flexDirection: "row",
    borderRadius: 12,
    overflow: "hidden",
    marginBottom: 16,
  },
  statItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 8,
  },
  statItemBorder: {
    borderLeftWidth: StyleSheet.hairlineWidth,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 2,
  },
  statLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  competitiveSummary: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
    marginTop: -4,
    marginBottom: 18,
  },
  // Linked goal row
  linkedGoalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  linkedGoalInfo: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginRight: 12,
  },
  linkedGoalIcon: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  linkedGoalText: {
    flex: 1,
    minWidth: 0,
  },
  linkedGoalLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  linkedGoalName: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
  },
  relinkText: {
    fontSize: 14,
    fontWeight: "700",
  },
  // Leaderboard row
  leaderboardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  leaderboardRank: {
    width: 18,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "800",
  },
  leaderboardScore: {
    maxWidth: 112,
    textAlign: "right",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  leaderboardScoreLabel: {
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "700",
  },
  // Participant row
  participantRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  participantInfo: {
    flex: 1,
  },
  participantName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  participantStats: {
    fontSize: 12,
  },
  doneChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
  },
  doneChipText: {
    fontSize: 11,
    fontWeight: "700",
  },
  // Activity row
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  activityText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  // Relink modal
  relinkHint: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  goalOption: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginBottom: 8,
  },
  goalOptionText: {
    fontSize: 15,
    fontWeight: "600",
  },
  goalOptionSub: {
    fontSize: 12,
    marginTop: 2,
  },
  deleteAutoRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 8,
    paddingVertical: 4,
  },
  deleteAutoText: {
    fontSize: 14,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  // Create modal
  createHeaderLeft: {
    width: 64,
    alignItems: "flex-start",
  },
  createHeaderRight: {
    width: 64,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 10,
  },
  backBtn: {
    fontSize: 16,
    fontWeight: "500",
  },
  headerTextButton: { flexDirection: "row", alignItems: "center", gap: 2 },
  stepIndicator: {
    fontSize: 13,
    fontWeight: "600",
  },
  modeStep: {
    gap: 8,
  },
  modeOptions: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  stepHeading: {
    fontSize: 17,
    fontWeight: "700",
    marginBottom: 8,
  },
  stepHint: {
    fontSize: 14,
    marginBottom: 12,
  },
  evidenceSwitchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
  },
  evidenceSwitchCopy: { flex: 1, gap: 2 },
  evidenceSwitchTitle: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
  },
  evidenceSwitchDescription: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: "500",
  },
  modeCard: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  modeCardLast: { borderBottomWidth: 0 },
  modeIcon: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  modeText: { flex: 1, gap: 2 },
  modeCardTitle: {
    fontSize: 16,
    fontWeight: "600",
  },
  modeCardDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  textInput: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  scoringLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  scoringRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingBottom: 4,
  },
  infoBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  infoCard: {
    borderRadius: 16,
    padding: 20,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 14,
  },
  infoBlock: {
    marginBottom: 14,
  },
  infoLabel: {
    fontSize: 15,
    fontWeight: "700",
    marginBottom: 4,
  },
  infoBody: {
    fontSize: 14,
    lineHeight: 20,
  },
  infoButton: {
    marginTop: 4,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
  },
  infoButtonText: {
    fontSize: 15,
    fontWeight: "700",
  },
  scoringChip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 9,
  },
  scoringChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  dateRow: {
    flexDirection: "row",
  },
  disabledDatePicker: {
    opacity: 0.42,
  },
  noEndDateToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 30,
    marginTop: 6,
  },
  noEndDateText: {
    fontSize: 13,
    fontWeight: "600",
  },
  selectAllFriends: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  selectAllInfo: {
    flex: 1,
    gap: 2,
  },
  selectAllLabel: {
    fontSize: 14,
    fontWeight: "700",
  },
  selectAllMeta: {
    fontSize: 12,
  },
  selectAllAction: {
    fontSize: 13,
    fontWeight: "800",
  },
  groupInviteSection: {
    marginBottom: 8,
    gap: 8,
  },
  groupInviteLabel: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  groupInviteList: {
    gap: 8,
    paddingRight: 20,
  },
  groupInviteChip: {
    minWidth: 112,
    maxWidth: 180,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  groupInviteName: {
    fontSize: 14,
    fontWeight: "800",
  },
  groupInviteMeta: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },
  friendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  friendInfo: {
    flex: 1,
  },
  friendName: {
    fontSize: 15,
    fontWeight: "600",
    marginBottom: 2,
  },
  friendEmail: {
    fontSize: 12,
  },
});
