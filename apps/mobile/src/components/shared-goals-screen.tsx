import { Image } from "expo-image";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { CollabHeaderMenu } from "@/components/collab-header-menu";
import { useTheme } from "@/hooks/use-theme";
import { type FriendRow, fetchFriends } from "@/lib/friends-client";
import { setGoalLog, toDateKey } from "@/lib/goal-logs-client";
import { type Goal, fetchGoals } from "@/lib/goals-client";
import {
  type CreateSharedGoalInput,
  type SharedGoalParticipantSnapshot,
  type SharedGoalScoringType,
  type SharedGoalSnapshot,
  createSharedGoal,
  fetchSharedGoals,
  respondToSharedGoal,
  updateSharedGoal,
} from "@/lib/shared-goals-client";

const SCORING_LABELS: Record<SharedGoalScoringType, string> = {
  everyone_completes: "Everyone Completes",
  combined_target: "Combined Target",
  shared_streak: "Shared Streak",
  first_to_target: "First to Target",
  highest_total: "Highest Total",
  best_consistency: "Best Consistency",
  longest_streak: "Longest Streak",
};

const COLLAB_SCORING: SharedGoalScoringType[] = [
  "everyone_completes",
  "combined_target",
  "shared_streak",
];

const COMP_SCORING: SharedGoalScoringType[] = [
  "first_to_target",
  "highest_total",
  "best_consistency",
  "longest_streak",
];

const NEEDS_TARGET = new Set<SharedGoalScoringType>([
  "combined_target",
  "first_to_target",
]);

type SymbolName = SymbolViewProps["name"];

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function todayKey() {
  return toDateKey(new Date());
}

function formatEndDate(dateStr: string | null): string {
  if (!dateStr) return "No end date";
  try {
    const d = new Date(`${dateStr}T12:00:00`);
    return `Ends ${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;
  } catch {
    return dateStr;
  }
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
}: {
  goal: SharedGoalSnapshot;
  onDetails: () => void;
  onReport: () => void;
  onRelink: () => void;
}) {
  const theme = useTheme();
  const cur = goal.currentUserParticipant;
  const accepted = goal.participants.filter((p) => p.status === "accepted");
  const completedToday = cur?.completedToday ?? false;
  const noGoalLinked = cur && !cur.personalGoalId;
  const showProgress =
    goal.mode === "collaborative" && goal.progress.percent !== undefined;

  const leaderNames = goal.progress.leaderUserIds
    .map((id) => goal.participants.find((p) => p.userId === id)?.userName ?? "")
    .filter(Boolean)
    .slice(0, 2)
    .join(", ");

  return (
    <View style={[styles.card, { backgroundColor: theme.background }]}>
      {/* Badges */}
      <View style={styles.badgeRow}>
        <ModeBadge mode={goal.mode} />
        <ScoringBadge type={goal.scoringType} />
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
            {goal.progress.target !== null ? (
              <Text
                style={[styles.progressText, { color: theme.textSecondary }]}
              >
                {goal.progress.value} / {goal.progress.target} (
                {Math.round(goal.progress.percent)}%)
              </Text>
            ) : (
              <Text
                style={[styles.progressText, { color: theme.textSecondary }]}
              >
                {goal.progress.value} total
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Competitive leader text */}
      {goal.mode === "competitive" && leaderNames && (
        <Text style={[styles.leaderText, { color: theme.textSecondary }]}>
          {goal.progress.leaderUserIds.length === 1
            ? `Leading: ${leaderNames}`
            : `Tied: ${leaderNames}`}
        </Text>
      )}

      {/* Footer */}
      <View
        style={[styles.cardDivider, { backgroundColor: theme.tabBorder }]}
      />
      <View style={styles.cardFooter}>
        <View style={styles.footerAvatars}>
          <AvatarStack
            participants={accepted}
            size={26}
            borderColor={theme.background}
          />
          <Text style={[styles.doneCount, { color: theme.textSecondary }]}>
            {goal.progress.completedToday}/{goal.progress.acceptedParticipants}{" "}
            done
          </Text>
        </View>
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
          {noGoalLinked ? (
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
  onAccept,
  onDecline,
}: {
  goal: SharedGoalSnapshot;
  onAccept: () => void;
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
          onPress={onAccept}
          style={[styles.inviteBtn, { backgroundColor: theme.primary }]}
        >
          <Text
            style={[styles.inviteBtnText, { color: theme.primaryForeground }]}
          >
            Accept
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

// ─── GoalDetailsSheet ────────────────────────────────────────────────────────

function GoalDetailsSheet({
  goal,
  onClose,
  onReportToday,
  onRelink,
  onLeave,
  onMarkComplete,
  onArchive,
}: {
  goal: SharedGoalSnapshot;
  onClose: () => void;
  onReportToday: () => void;
  onRelink: () => void;
  onLeave: () => void;
  onMarkComplete: () => void;
  onArchive: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const cur = goal.currentUserParticipant;
  const accepted = goal.participants.filter((p) => p.status === "accepted");
  const showProgress = goal.mode === "collaborative";

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
        <Text
          style={[styles.sheetTitle, { color: theme.text }]}
          numberOfLines={2}
        >
          {goal.name}
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
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Badges */}
        <View style={[styles.badgeRow, { marginBottom: 12 }]}>
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
          <View style={styles.statItem}>
            <Text style={[styles.statValue, { color: theme.text }]}>
              {goal.progress.completedToday}/
              {goal.progress.acceptedParticipants}
            </Text>
            <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
              Done today
            </Text>
          </View>
          {goal.target !== null && (
            <View
              style={[
                styles.statItem,
                styles.statItemBorder,
                { borderColor: theme.tabBorder },
              ]}
            >
              <Text style={[styles.statValue, { color: theme.text }]}>
                {goal.progress.value}/{goal.target}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                Progress
              </Text>
            </View>
          )}
          {cur && (
            <View
              style={[
                styles.statItem,
                styles.statItemBorder,
                { borderColor: theme.tabBorder },
              ]}
            >
              <Text style={[styles.statValue, { color: theme.text }]}>
                {cur.currentStreak}
              </Text>
              <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
                My streak
              </Text>
            </View>
          )}
        </View>

        {/* Progress bar */}
        {showProgress && (
          <View style={styles.sheetSection}>
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
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
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
              My linked goal
            </Text>
            <View
              style={[
                styles.linkedGoalRow,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <Text
                style={[
                  styles.linkedGoalName,
                  {
                    color: cur.personalGoalId
                      ? theme.text
                      : theme.textSecondary,
                  },
                ]}
              >
                {cur.personalGoalName ?? "No goal linked"}
              </Text>
              <Pressable onPress={onRelink}>
                <Text style={[styles.relinkText, { color: theme.primary }]}>
                  {cur.personalGoalId ? "Change" : "Link"}
                </Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* Participants */}
        <View style={styles.sheetSection}>
          <Text style={[styles.sectionTitle, { color: theme.text }]}>
            Participants
          </Text>
          {accepted.map((p) => (
            <View
              key={p.userId}
              style={[
                styles.participantRow,
                { borderBottomColor: theme.tabBorder },
              ]}
            >
              <Avatar image={p.userImage} name={p.userName} size={36} />
              <View style={styles.participantInfo}>
                <Text style={[styles.participantName, { color: theme.text }]}>
                  {p.userName}
                </Text>
                <Text
                  style={[
                    styles.participantStats,
                    { color: theme.textSecondary },
                  ]}
                >
                  {p.completedCount} total · {p.currentStreak} streak
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
                  <Text style={[styles.doneChipText, { color: theme.primary }]}>
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
            <Text style={[styles.sectionTitle, { color: theme.text }]}>
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
                  completed on {a.dateKey}
                </Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Footer actions */}
      <View style={[styles.sheetFooter, { borderTopColor: theme.tabBorder }]}>
        {cur && !cur.completedToday && cur.personalGoalId && (
          <Pressable
            onPress={onReportToday}
            style={[styles.sheetPrimaryBtn, { backgroundColor: theme.primary }]}
          >
            <Text
              style={[
                styles.sheetPrimaryBtnText,
                { color: theme.primaryForeground },
              ]}
            >
              Report today
            </Text>
          </Pressable>
        )}
        <View style={styles.sheetSecondaryActions}>
          {goal.canManage && goal.status === "active" && (
            <>
              <Pressable onPress={onMarkComplete} style={styles.sheetSecBtn}>
                <Text
                  style={[
                    styles.sheetSecBtnText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Mark complete
                </Text>
              </Pressable>
              <Pressable onPress={onArchive} style={styles.sheetSecBtn}>
                <Text
                  style={[
                    styles.sheetSecBtnText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Archive
                </Text>
              </Pressable>
            </>
          )}
          <Pressable onPress={onLeave} style={styles.sheetSecBtn}>
            <Text style={[styles.sheetSecBtnText, { color: "#EF4444" }]}>
              Leave
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── RelinkModal ──────────────────────────────────────────────────────────────

function RelinkModal({
  goal,
  personalGoals,
  onClose,
  onRelink,
}: {
  goal: SharedGoalSnapshot;
  personalGoals: Goal[];
  onClose: () => void;
  onRelink: (goalId: string | null, deleteAuto: boolean) => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(
    goal.currentUserParticipant?.personalGoalId ?? null,
  );
  const autoCreated =
    goal.currentUserParticipant?.personalGoalAutoCreated ?? false;
  const [deleteAuto, setDeleteAuto] = useState(false);

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
        style={styles.sheetScroll}
        contentContainerStyle={styles.sheetContent}
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
        {personalGoals.map((g) => (
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
            {g.period && (
              <Text
                style={[styles.goalOptionSub, { color: theme.textSecondary }]}
              >
                {g.period}
              </Text>
            )}
          </Pressable>
        ))}
        {autoCreated && goal.currentUserParticipant?.personalGoalId && (
          <Pressable
            onPress={() => setDeleteAuto(!deleteAuto)}
            style={styles.deleteAutoRow}
          >
            <View
              style={[
                styles.checkbox,
                {
                  backgroundColor: deleteAuto ? theme.primary : "transparent",
                  borderColor: deleteAuto ? theme.primary : theme.textSecondary,
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

type CreateState = {
  mode: "collaborative" | "competitive" | null;
  name: string;
  scoringType: SharedGoalScoringType | null;
  target: string;
  startsOn: string;
  endsOn: string;
  personalGoalId: string | null;
  invitedUserIds: string[];
};

function CreateGoalModal({
  personalGoals,
  friends,
  onClose,
  onCreate,
}: {
  personalGoals: Goal[];
  friends: FriendRow[];
  onClose: () => void;
  onCreate: (input: CreateSharedGoalInput) => Promise<void>;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<CreateState>({
    mode: null,
    name: "",
    scoringType: null,
    target: "",
    startsOn: "",
    endsOn: "",
    personalGoalId: null,
    invitedUserIds: [],
  });

  const acceptedFriends = friends.filter((f) => f.status === "accepted");
  const scoringOptions =
    form.mode === "collaborative" ? COLLAB_SCORING : COMP_SCORING;
  const needsTarget = form.scoringType
    ? NEEDS_TARGET.has(form.scoringType)
    : false;

  function canProceed() {
    if (step === 1) return form.mode !== null;
    if (step === 2)
      return form.name.trim().length > 0 && form.scoringType !== null;
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
        target:
          needsTarget && form.target ? Number.parseInt(form.target, 10) : null,
        startsOn: form.startsOn.trim() || null,
        endsOn: form.endsOn.trim() || null,
        personalGoalId: form.personalGoalId,
        invitedUserIds: form.invitedUserIds,
      });
    } finally {
      setSubmitting(false);
    }
  }

  function toggleFriend(friendId: string) {
    setForm((f) => ({
      ...f,
      invitedUserIds: f.invitedUserIds.includes(friendId)
        ? f.invitedUserIds.filter((id) => id !== friendId)
        : [...f.invitedUserIds, friendId],
    }));
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
                onPress={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
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
              {step}/3
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
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetContent}
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
                  onPress={() =>
                    setForm((f) => ({
                      ...f,
                      mode: "collaborative",
                      scoringType:
                        f.mode === "competitive" ? null : f.scoringType,
                    }))
                  }
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
                  onPress={() =>
                    setForm((f) => ({
                      ...f,
                      mode: "competitive",
                      scoringType:
                        f.mode === "collaborative" ? null : f.scoringType,
                    }))
                  }
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

              <Text
                style={[
                  styles.fieldLabel,
                  { color: theme.text, marginTop: 16 },
                ]}
              >
                Scoring type
              </Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.scoringRow}
              >
                {scoringOptions.map((type) => (
                  <Pressable
                    key={type}
                    onPress={() =>
                      setForm((f) => ({ ...f, scoringType: type }))
                    }
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
              </ScrollView>

              {needsTarget && (
                <>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: theme.text, marginTop: 16 },
                    ]}
                  >
                    Target (number)
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
                  <TextInput
                    style={[
                      styles.textInput,
                      {
                        backgroundColor: theme.backgroundElement,
                        color: theme.text,
                        borderColor: theme.tabBorder,
                      },
                    ]}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.textSecondary}
                    value={form.startsOn}
                    onChangeText={(v) =>
                      setForm((f) => ({ ...f, startsOn: v }))
                    }
                  />
                </View>
                <View style={{ width: 12 }} />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.fieldLabel,
                      { color: theme.text, marginTop: 16 },
                    ]}
                  >
                    End date
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
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.textSecondary}
                    value={form.endsOn}
                    onChangeText={(v) => setForm((f) => ({ ...f, endsOn: v }))}
                  />
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
                Select which of your goals to track for this shared goal:
              </Text>
              <Pressable
                onPress={() => setForm((f) => ({ ...f, personalGoalId: null }))}
                style={[
                  styles.goalOption,
                  {
                    backgroundColor:
                      form.personalGoalId === null
                        ? theme.backgroundSelected
                        : theme.backgroundElement,
                    borderColor:
                      form.personalGoalId === null
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
              {personalGoals.map((g) => (
                <Pressable
                  key={g.id}
                  onPress={() =>
                    setForm((f) => ({ ...f, personalGoalId: g.id }))
                  }
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
                  {g.period && (
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

              {acceptedFriends.length > 0 && (
                <>
                  <Text
                    style={[
                      styles.stepHeading,
                      { color: theme.text, marginTop: 24 },
                    ]}
                  >
                    Invite friends
                  </Text>
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
        </ScrollView>

        {/* Footer */}
        <View style={[styles.sheetFooter, { borderTopColor: theme.tabBorder }]}>
          {step < 3 ? (
            <Pressable
              onPress={() => canProceed() && setStep((s) => (s + 1) as 2 | 3)}
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
              disabled={submitting}
              style={[
                styles.sheetPrimaryBtn,
                {
                  backgroundColor: submitting
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
                    { color: theme.primaryForeground },
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
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [selectedGoal, setSelectedGoal] = useState<SharedGoalSnapshot | null>(
    null,
  );
  const [showCreate, setShowCreate] = useState(false);
  const [relinkGoal, setRelinkGoal] = useState<SharedGoalSnapshot | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await fetchSharedGoals();
      setGoals(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadAuxiliary = useCallback(async () => {
    const [g, f] = await Promise.allSettled([fetchGoals(), fetchFriends()]);
    if (g.status === "fulfilled") setPersonalGoals(g.value);
    if (f.status === "fulfilled") setFriends(f.value);
  }, []);

  useEffect(() => {
    void load();
    void loadAuxiliary();
  }, [load, loadAuxiliary]);

  async function handleReport(goal: SharedGoalSnapshot) {
    const cur = goal.currentUserParticipant;
    if (!cur?.personalGoalId) {
      setSelectedGoal(null);
      setRelinkGoal(goal);
      return;
    }
    try {
      await setGoalLog(cur.personalGoalId, todayKey(), "complete");
      await load();
      if (selectedGoal?.id === goal.id) {
        setSelectedGoal((prev) =>
          prev
            ? {
                ...prev,
                currentUserParticipant: prev.currentUserParticipant
                  ? { ...prev.currentUserParticipant, completedToday: true }
                  : null,
              }
            : null,
        );
      }
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
    }
  }

  async function handleAccept(goal: SharedGoalSnapshot) {
    try {
      await respondToSharedGoal(goal.id, {
        action: "accept",
        personalGoalId: null,
      });
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
    }
  }

  async function handleDecline(goal: SharedGoalSnapshot) {
    Alert.alert("Decline invitation", `Decline "${goal.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Decline",
        style: "destructive",
        onPress: async () => {
          try {
            await respondToSharedGoal(goal.id, { action: "decline" });
            await load();
          } catch (e) {
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
            await load();
          } catch (e) {
            Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
          }
        },
      },
    ]);
  }

  async function handleMarkComplete(goal: SharedGoalSnapshot) {
    try {
      setSelectedGoal(null);
      await updateSharedGoal(goal.id, {
        action: "setStatus",
        status: "completed",
      });
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
    }
  }

  async function handleArchive(goal: SharedGoalSnapshot) {
    try {
      setSelectedGoal(null);
      await updateSharedGoal(goal.id, {
        action: "setStatus",
        status: "archived",
      });
      await load();
    } catch (e) {
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
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
    }
  }

  async function handleCreate(input: CreateSharedGoalInput) {
    await createSharedGoal(input);
    setShowCreate(false);
    await load();
  }

  const invitations = goals.filter(
    (g) =>
      g.status === "active" && g.currentUserParticipant?.status === "invited",
  );
  const active = goals.filter(
    (g) =>
      g.status === "active" && g.currentUserParticipant?.status !== "invited",
  );
  const completed = goals.filter(
    (g) => g.status === "completed" || g.status === "archived",
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.backgroundElement }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + 8,
            backgroundColor: theme.backgroundElement,
            borderBottomColor: theme.tabBorder,
          },
        ]}
      >
        <CollabHeaderMenu currentSection="shared-goals" />
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="New shared goal"
            onPress={() => setShowCreate(true)}
            hitSlop={8}
            style={({ pressed }) => [
              styles.addButton,
              { backgroundColor: theme.primary },
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={sym("plus", "add")}
              size={20}
              weight="semibold"
              tintColor={theme.primaryForeground}
            />
          </Pressable>
        </View>
      </View>

      {/* Content */}
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} size="large" />
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
          style={styles.scroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + 16 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {invitations.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Invitations
              </Text>
              {invitations.map((g) => (
                <InvitationCard
                  key={g.id}
                  goal={g}
                  onAccept={() => handleAccept(g)}
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
                  onReport={() => handleReport(g)}
                  onRelink={() => setRelinkGoal(g)}
                />
              ))}
            </View>
          )}

          {completed.length > 0 && (
            <View style={styles.section}>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Completed / Archived
              </Text>
              {completed.map((g) => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  onDetails={() => setSelectedGoal(g)}
                  onReport={() => handleReport(g)}
                  onRelink={() => setRelinkGoal(g)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      )}

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
            onReportToday={() => handleReport(selectedGoal)}
            onRelink={() => {
              setSelectedGoal(null);
              setRelinkGoal(selectedGoal);
            }}
            onLeave={() => handleLeave(selectedGoal)}
            onMarkComplete={() => handleMarkComplete(selectedGoal)}
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
          friends={friends}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
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
    paddingHorizontal: 18,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
    marginHorizontal: 16,
    marginBottom: 10,
  },
  // Card
  card: {
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
  },
  inviteCard: {
    borderWidth: 1,
  },
  badgeRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 14,
    marginBottom: 12,
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
  leaderText: {
    fontSize: 13,
    marginBottom: 10,
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
  doneCount: {
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
  // Linked goal row
  linkedGoalRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
  },
  linkedGoalName: {
    fontSize: 15,
    fontWeight: "600",
    flex: 1,
    marginRight: 12,
  },
  relinkText: {
    fontSize: 14,
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
  scoringRow: {
    gap: 8,
    paddingBottom: 4,
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
