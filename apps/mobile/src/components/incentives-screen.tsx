import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { type MenuAction, MenuView } from "@expo/ui/community/menu";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import {
  type MutableRefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  CollabSectionHeaderTabs,
  PageHeaderTitle,
} from "@/components/section-header-tabs";
import { useTheme } from "@/hooks/use-theme";
import {
  type FriendIncentiveRow,
  type FriendRow,
  type SendIncentivePayload,
  type StreakGoalScope,
  acceptFriendIncentive,
  fetchFriends,
  sendFriendIncentive,
  sendFriendNudge,
} from "@/lib/friends-client";
import { playSuccessHaptic } from "@/lib/haptics";

// ─── Constants ────────────────────────────────────────────────────────────────

const SCOPE_LABELS: Record<StreakGoalScope, string> = {
  all: "All goals",
  shared: "Shared goal",
  single: "Single goal",
  high: "High priority goals",
};

const SCOPE_OPTIONS: Array<{ value: StreakGoalScope; label: string }> = [
  { value: "all", label: "All goals" },
  { value: "single", label: "Single goal" },
  { value: "high", label: "High priority goals" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

type SymbolName = SymbolViewProps["name"];

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function menuSelectedState(selected: boolean): MenuAction["state"] {
  return selected ? "on" : undefined;
}

function getGoalLabel(friend: FriendRow, incentive: FriendIncentiveRow) {
  if (!incentive.goalScope || incentive.goalScope === "all") {
    return SCOPE_LABELS.all;
  }
  if (incentive.goalScope !== "single") {
    return SCOPE_LABELS[incentive.goalScope];
  }
  const name =
    incentive.goalName ??
    friend.goalOptions.find((g) => g.id === incentive.goalId)?.name;
  return name ?? SCOPE_LABELS.single;
}

function runLockedPress(
  locks: MutableRefObject<Set<string>>,
  key: string,
  action: () => void,
) {
  if (locks.current.has(key)) return;

  locks.current.add(key);
  action();
  setTimeout(() => {
    locks.current.delete(key);
  }, 500);
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  name,
  size = 36,
}: {
  name: string;
  size?: number;
}) {
  const theme = useTheme();

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: theme.backgroundSelected,
        alignItems: "center",
        justifyContent: "center",
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

// ─── ProgressBar ──────────────────────────────────────────────────────────────

function ProgressBar({ percent, color }: { percent: number; color: string }) {
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
          { width: `${pct}%` as `${number}%`, backgroundColor: color },
        ]}
      />
    </View>
  );
}

function GoalDropdown({
  goals,
  selectedGoalId,
  selectedGoalName,
  onSelect,
}: {
  goals: Array<{ id: string; name: string }>;
  selectedGoalId: string;
  selectedGoalName?: string;
  onSelect: (goalId: string) => void;
}) {
  const theme = useTheme();
  const actions: MenuAction[] = goals.map((goal) => ({
    id: goal.id,
    title: goal.name,
    state: menuSelectedState(goal.id === selectedGoalId),
  }));

  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => onSelect(nativeEvent.event)}
      style={styles.goalDropdownMenu}
      title="Select goal"
    >
      <View
        accessible
        accessibilityLabel="Select goal"
        accessibilityRole="button"
        style={[
          styles.goalDropdown,
          {
            backgroundColor: theme.background,
            borderColor: theme.tabBorder,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          style={[
            styles.goalDropdownText,
            { color: selectedGoalName ? theme.text : theme.textSecondary },
          ]}
        >
          {selectedGoalName ?? "Select a goal"}
        </Text>
        <SymbolView
          name={sym("chevron.down", "keyboard_arrow_down")}
          size={14}
          weight="semibold"
          tintColor={theme.textSecondary}
        />
      </View>
    </MenuView>
  );
}

// ─── IncentiveCard ────────────────────────────────────────────────────────────

function IncentiveCard({
  friend,
  incentive,
  direction,
  accepting,
  nudging,
  onAccept,
  onNudge,
}: {
  friend: FriendRow;
  incentive: FriendIncentiveRow;
  direction: "sent" | "received";
  accepting: boolean;
  nudging: boolean;
  onAccept: () => void;
  onNudge: () => void;
}) {
  const theme = useTheme();
  const accent = theme.primary;
  const accentForeground = theme.primaryForeground;
  const isReceived = direction === "received";
  const isAccepted = incentive.accepted === true;
  const goalLabel = getGoalLabel(friend, incentive);
  const daysLabel = incentive.streakDays
    ? `${incentive.streakDays} days`
    : null;
  const percentLabel = incentive.streakPercent
    ? `${incentive.streakPercent}%`
    : null;
  const statusLabel = isAccepted
    ? "Accepted"
    : isReceived
      ? "Needs response"
      : "Pending";

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
      ]}
    >
      <View style={styles.cardTopRow}>
        <View
          style={[
            styles.challengeTypePill,
            { backgroundColor: `${theme.primary}12` },
          ]}
        >
          <SymbolView
            name={sym("flag.checkered", "sports_score")}
            size={13}
            weight="semibold"
            tintColor={accent}
          />
          <Text style={[styles.challengeTypeText, { color: theme.text }]}>
            Challenge
          </Text>
        </View>
        <Text style={[styles.cardHeaderDate, { color: theme.textSecondary }]}>
          {formatDate(incentive.createdAt)}
        </Text>
      </View>

      <View style={styles.cardHeader}>
        <Avatar name={friend.friendName} size={42} />
        <View style={styles.cardHeaderText}>
          <Text style={[styles.cardHeaderName, { color: theme.text }]}>
            {friend.friendName}
          </Text>
          <Text style={[styles.cardHeaderDate, { color: theme.textSecondary }]}>
            {isReceived ? "Challenged you" : "You challenged them"}
          </Text>
        </View>
        <View
          style={[
            styles.acceptedStatus,
            {
              backgroundColor: isAccepted ? `${accent}10` : "transparent",
              borderColor: isAccepted ? `${accent}30` : theme.tabBorder,
            },
          ]}
        >
          {isAccepted ? (
            <SymbolView
              name={sym("checkmark.circle.fill", "check_circle")}
              size={13}
              weight="semibold"
              tintColor={accent}
            />
          ) : null}
          <Text
            style={[
              styles.acceptedStatusText,
              { color: isAccepted ? accent : theme.textSecondary },
            ]}
          >
            {statusLabel}
          </Text>
        </View>
      </View>

      <View style={styles.challengeBody}>
        <Text style={[styles.body, { color: theme.text }]}>
          {incentive.body}
        </Text>
        <Text style={[styles.goalLine, { color: theme.textSecondary }]}>
          {goalLabel}
        </Text>
      </View>

      {daysLabel || percentLabel ? (
        <View style={styles.challengeMetrics}>
          {daysLabel ? (
            <View
              style={[
                styles.challengeMetric,
                { backgroundColor: `${theme.textSecondary}12` },
              ]}
            >
              <SymbolView
                name={sym("calendar", "calendar_today")}
                size={14}
                weight="semibold"
                tintColor={accent}
              />
              <Text style={[styles.challengeMetricText, { color: theme.text }]}>
                {daysLabel}
              </Text>
            </View>
          ) : null}
          {percentLabel ? (
            <View
              style={[
                styles.challengeMetric,
                { backgroundColor: `${theme.textSecondary}12` },
              ]}
            >
              <SymbolView
                name={sym("chart.bar.fill", "bar_chart")}
                size={14}
                weight="semibold"
                tintColor={accent}
              />
              <Text style={[styles.challengeMetricText, { color: theme.text }]}>
                {percentLabel}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {isAccepted && incentive.progress ? (
        <View
          style={[
            styles.progressBlock,
            { backgroundColor: `${theme.textSecondary}0D` },
          ]}
        >
          <View style={styles.progressHeader}>
            <View style={styles.progressTitle}>
              <SymbolView
                name={sym("gift.fill", "card_giftcard")}
                size={14}
                weight="semibold"
                tintColor={accent}
              />
              <Text style={[styles.progressLabel, { color: theme.text }]}>
                Progress
              </Text>
            </View>
            <Text style={[styles.progressDays, { color: theme.textSecondary }]}>
              {incentive.progress.qualifyingDays}/
              {incentive.progress.requiredDays} days
            </Text>
          </View>
          <ProgressBar percent={incentive.progress.percent} color={accent} />
        </View>
      ) : null}

      <View style={[styles.metadataRow, { borderTopColor: theme.tabBorder }]}>
        <Pressable
          accessibilityLabel={`Nudge ${friend.friendName}`}
          disabled={nudging}
          onPress={onNudge}
          style={({ pressed }) => [
            styles.nudgeMetaButton,
            pressed && styles.pressed,
          ]}
        >
          {nudging ? (
            <ActivityIndicator color={accent} size="small" />
          ) : (
            <SymbolView
              name={sym("hand.tap.fill", "touch_app")}
              size={14}
              weight="semibold"
              tintColor={accent}
            />
          )}
          <Text style={[styles.metadataText, { color: accent }]}>Nudge</Text>
        </Pressable>
      </View>

      {isReceived && !isAccepted ? (
        <Pressable
          onPress={onAccept}
          disabled={accepting}
          style={({ pressed }) => [
            styles.acceptBtn,
            {
              backgroundColor: accepting ? theme.backgroundElement : accent,
            },
            pressed && styles.pressed,
          ]}
        >
          {accepting ? (
            <ActivityIndicator color={theme.textSecondary} size="small" />
          ) : (
            <Text style={[styles.acceptBtnText, { color: accentForeground }]}>
              Accept
            </Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

// ─── CreateIncentiveModal ─────────────────────────────────────────────────────

function CreateIncentiveModal({
  friends,
  onClose,
  onSend,
}: {
  friends: FriendRow[];
  onClose: () => void;
  onSend: (
    friendshipId: string,
    payload: SendIncentivePayload,
  ) => Promise<void>;
}) {
  const theme = useTheme();
  const accent = theme.primary;
  const accentForeground = theme.primaryForeground;
  const insets = useSafeAreaInsets();
  const pressLocksRef = useRef(new Set<string>());

  const [step, setStep] = useState<1 | 2>(1);
  const [selectedFriend, setSelectedFriend] = useState<FriendRow | null>(null);
  const [body, setBody] = useState("");
  const [scope, setScope] = useState<StreakGoalScope>("all");
  const [goalId, setGoalId] = useState<string>("");
  const [days, setDays] = useState("7");
  const [percent, setPercent] = useState("80");
  const [sending, setSending] = useState(false);

  const daysNum = Number.parseInt(days, 10);
  const percentNum = Number.parseInt(percent, 10);
  const selectedGoal = selectedFriend?.goalOptions.find(
    (goal) => goal.id === goalId,
  );
  const canSend =
    body.trim().length > 0 &&
    Number.isFinite(daysNum) &&
    daysNum >= 1 &&
    Number.isFinite(percentNum) &&
    percentNum >= 1 &&
    percentNum <= 100 &&
    (scope !== "single" || goalId.length > 0);

  const selectScope = (nextScope: StreakGoalScope) => {
    setScope(nextScope);
    if (nextScope === "single" && !goalId && selectedFriend?.goalOptions[0]) {
      setGoalId(selectedFriend.goalOptions[0].id);
    }
  };

  const runPressAction = (key: string, action: () => void) => {
    runLockedPress(pressLocksRef, key, action);
  };

  async function handleSend() {
    if (!selectedFriend || !canSend) return;
    setSending(true);
    try {
      await onSend(selectedFriend.id, {
        type: "incentive",
        body: body.trim(),
        streakDays: daysNum,
        streakPercent: percentNum,
        goalScope: scope,
        ...(scope === "single" ? { goalId } : {}),
      });
    } finally {
      setSending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: theme.background,
            paddingBottom: insets.bottom + 16,
          },
        ]}
      >
        {/* Handle */}
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
          <View style={{ width: 60 }}>
            {step === 2 && (
              <Pressable
                onPress={() => runPressAction("back", () => setStep(1))}
                hitSlop={12}
              >
                <View style={styles.headerTextButton}>
                  <SymbolView
                    name={sym("chevron.left", "chevron_left")}
                    size={16}
                    weight="semibold"
                    tintColor={accent}
                  />
                  <Text style={[styles.backBtn, { color: accent }]}>Back</Text>
                </View>
              </Pressable>
            )}
          </View>
          <Text style={[styles.sheetTitle, { color: theme.text }]}>
            New Incentive
          </Text>
          <View style={{ width: 60, alignItems: "flex-end" }}>
            <Pressable
              onPress={() => runPressAction("close", onClose)}
              hitSlop={12}
            >
              <SymbolView
                name={sym("xmark", "close")}
                size={16}
                weight="semibold"
                tintColor={accent}
              />
            </Pressable>
          </View>
        </View>

        <ScrollView
          canCancelContentTouches
          style={{ flex: 1 }}
          contentContainerStyle={styles.sheetContent}
          directionalLockEnabled
          keyboardShouldPersistTaps="handled"
        >
          {/* Step 1: Pick a friend */}
          {step === 1 && (
            <View>
              <Text style={[styles.stepHeading, { color: theme.text }]}>
                Who are you incentivizing?
              </Text>
              {friends.length === 0 ? (
                <Text
                  style={[styles.emptyHint, { color: theme.textSecondary }]}
                >
                  Add friends first to send incentives.
                </Text>
              ) : (
                friends.map((f) => (
                  <Pressable
                    key={f.id}
                    onPress={() =>
                      runPressAction(`friend-${f.id}`, () => {
                        setSelectedFriend(f);
                        setGoalId(f.goalOptions[0]?.id ?? "");
                        setStep(2);
                      })
                    }
                    style={[
                      styles.friendOption,
                      { borderBottomColor: theme.tabBorder },
                    ]}
                  >
                    <Avatar name={f.friendName} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.friendOptionName, { color: theme.text }]}
                      >
                        {f.friendName}
                      </Text>
                    </View>
                    <SymbolView
                      name={sym("chevron.right", "chevron_right")}
                      size={14}
                      weight="semibold"
                      tintColor={theme.textSecondary}
                    />
                  </Pressable>
                ))
              )}
            </View>
          )}

          {/* Step 2: Incentive details */}
          {step === 2 && selectedFriend && (
            <View style={styles.detailsStep}>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>
                Incentive
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
                placeholder="Lunch on me when you hit it"
                placeholderTextColor={theme.textSecondary}
                value={body}
                onChangeText={setBody}
                autoFocus
                returnKeyType="next"
              />

              {/* Earn this when... */}
              <View
                style={[
                  styles.earnBox,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                  },
                ]}
              >
                <Text
                  style={[styles.earnBoxTitle, { color: theme.textSecondary }]}
                >
                  EARN THIS WHEN…
                </Text>

                <Text style={[styles.fieldLabel, { color: theme.text }]}>
                  Apply to
                </Text>
                <View style={styles.scopeRow}>
                  {SCOPE_OPTIONS.map((opt) => (
                    <Pressable
                      key={opt.value}
                      onPress={() =>
                        runPressAction(`scope-${opt.value}`, () =>
                          selectScope(opt.value),
                        )
                      }
                      style={[
                        styles.scopeChip,
                        {
                          backgroundColor:
                            scope === opt.value ? accent : theme.background,
                          borderColor:
                            scope === opt.value ? accent : theme.tabBorder,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.scopeChipText,
                          {
                            color:
                              scope === opt.value
                                ? accentForeground
                                : theme.textSecondary,
                          },
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                {scope === "single" && (
                  <>
                    <Text
                      style={[
                        styles.fieldLabel,
                        { color: theme.text, marginTop: 12 },
                      ]}
                    >
                      Goal
                    </Text>
                    {selectedFriend.goalOptions.length === 0 ? (
                      <Text
                        style={[
                          styles.emptyHint,
                          { color: theme.textSecondary },
                        ]}
                      >
                        No goals available
                      </Text>
                    ) : (
                      <GoalDropdown
                        goals={selectedFriend.goalOptions}
                        selectedGoalId={goalId}
                        selectedGoalName={selectedGoal?.name}
                        onSelect={setGoalId}
                      />
                    )}
                  </>
                )}

                <View style={styles.streakRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: theme.text }]}>
                      Streak length
                    </Text>
                    <TextInput
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: theme.background,
                          color: theme.text,
                          borderColor: theme.tabBorder,
                        },
                      ]}
                      placeholder="7"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="number-pad"
                      value={days}
                      onChangeText={setDays}
                    />
                    <Text
                      style={[
                        styles.inputSuffix,
                        { color: theme.textSecondary },
                      ]}
                    >
                      days
                    </Text>
                  </View>
                  <View style={{ width: 12 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.fieldLabel, { color: theme.text }]}>
                      Completion threshold
                    </Text>
                    <TextInput
                      style={[
                        styles.textInput,
                        {
                          backgroundColor: theme.background,
                          color: theme.text,
                          borderColor: theme.tabBorder,
                        },
                      ]}
                      placeholder="80"
                      placeholderTextColor={theme.textSecondary}
                      keyboardType="number-pad"
                      value={percent}
                      onChangeText={setPercent}
                    />
                    <Text
                      style={[
                        styles.inputSuffix,
                        { color: theme.textSecondary },
                      ]}
                    >
                      %
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Footer (only on step 2) */}
        {step === 2 && (
          <View
            style={[styles.sheetFooter, { borderTopColor: theme.tabBorder }]}
          >
            <Pressable
              onPress={() => runPressAction("send", handleSend)}
              disabled={!canSend || sending}
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    canSend && !sending ? accent : theme.backgroundElement,
                },
              ]}
            >
              {sending ? (
                <ActivityIndicator color={accentForeground} size="small" />
              ) : (
                <Text
                  style={[
                    styles.sendBtnText,
                    {
                      color:
                        canSend && !sending
                          ? accentForeground
                          : theme.textSecondary,
                    },
                  ]}
                >
                  Send Incentive
                </Text>
              )}
            </Pressable>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

// ─── Main Screen ──────────────────────────────────────────────────────────────

export function IncentivesScreen() {
  const theme = useTheme();
  const accent = theme.primary;
  const accentForeground = theme.primaryForeground;
  const insets = useSafeAreaInsets();
  const pressLocksRef = useRef(new Set<string>());

  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"received" | "sent">("received");
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [nudgingFriendshipId, setNudgingFriendshipId] = useState<string | null>(
    null,
  );
  const [showCreate, setShowCreate] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchFriends();
      setFriends(data.filter((f) => f.status === "accepted"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleAccept(
    friend: FriendRow,
    incentive: FriendIncentiveRow,
  ) {
    setAcceptingId(incentive.id);
    try {
      await acceptFriendIncentive(friend.id, incentive.id);
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof Error ? e.message : "Failed.");
    } finally {
      setAcceptingId(null);
    }
  }

  async function handleSend(
    friendshipId: string,
    payload: SendIncentivePayload,
  ) {
    await sendFriendIncentive(friendshipId, payload);
    setShowCreate(false);
    await load();
  }

  async function handleNudge(friend: FriendRow, incentive: FriendIncentiveRow) {
    if (nudgingFriendshipId) return;
    setNudgingFriendshipId(friend.id);
    try {
      const goalLabel = getGoalLabel(friend, incentive);
      await sendFriendNudge(
        friend.id,
        `Quick nudge for ${goalLabel.toLowerCase()}.`,
      );
      playSuccessHaptic();
      Alert.alert("Nudge sent", `${friend.friendName} got a quick nudge.`);
    } catch (nudgeError) {
      Alert.alert(
        "Could not send nudge",
        nudgeError instanceof Error ? nudgeError.message : "Please try again.",
      );
    } finally {
      setNudgingFriendshipId(null);
    }
  }

  // Build flat list of incentive items
  type IncentiveItem = { friend: FriendRow; incentive: FriendIncentiveRow };
  const allItems: IncentiveItem[] = friends.flatMap((f) =>
    (f.incentives ?? []).map((incentive) => ({ friend: f, incentive })),
  );
  const receivedItems = allItems.filter(
    ({ friend, incentive }) => incentive.senderId === friend.friendId,
  );
  const sentItems = allItems.filter(
    ({ friend, incentive }) => incentive.senderId !== friend.friendId,
  );
  const visibleItems = tab === "received" ? receivedItems : sentItems;

  const acceptedFriends = friends.filter((f) => f.status === "accepted");
  const runPressAction = (key: string, action: () => void) => {
    runLockedPress(pressLocksRef, key, action);
  };

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
          <CollabSectionHeaderTabs currentSection="incentives" />
        </View>
        <View style={styles.headerActions}>
          <Pressable
            accessibilityLabel="New incentive"
            onPress={() =>
              runPressAction("new-incentive", () => setShowCreate(true))
            }
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

      {/* Received / Sent tab switcher */}
      {!loading && !error && (
        <View
          style={[
            styles.tabSwitcher,
            {
              backgroundColor: theme.backgroundElement,
              marginHorizontal: 16,
              marginTop: 12,
              marginBottom: 4,
            },
          ]}
        >
          {(["received", "sent"] as const).map((t) => {
            const count =
              t === "received" ? receivedItems.length : sentItems.length;
            return (
              <Pressable
                key={t}
                onPress={() => runPressAction(`tab-${t}`, () => setTab(t))}
                style={[
                  styles.tabSwitcherBtn,
                  tab === t && {
                    backgroundColor: theme.tabBar,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.tabSwitcherText,
                    {
                      color: tab === t ? theme.text : theme.textSecondary,
                    },
                  ]}
                >
                  {t === "received" ? "Received" : "Sent"}
                </Text>
                {count > 0 && (
                  <Text
                    style={[
                      styles.tabCount,
                      {
                        color: tab === t ? accent : theme.textSecondary,
                      },
                    ]}
                  >
                    {count}
                  </Text>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

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
            onPress={() => runPressAction("retry", load)}
            style={[styles.retryBtn, { borderColor: accent }]}
          >
            <Text style={[styles.retryText, { color: accent }]}>Retry</Text>
          </Pressable>
        </View>
      ) : visibleItems.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            {tab === "received"
              ? "No incentives received"
              : "No incentives sent"}
          </Text>
          <Text style={[styles.emptyDesc, { color: theme.textSecondary }]}>
            {tab === "received"
              ? "Friends can send you incentives to keep you motivated."
              : "Send a friend an incentive to cheer them on."}
          </Text>
          {tab === "sent" && (
            <Pressable
              onPress={() =>
                runPressAction("empty-create", () => setShowCreate(true))
              }
              style={[styles.emptyCreateBtn, { backgroundColor: accent }]}
            >
              <Text
                style={[styles.emptyCreateBtnText, { color: accentForeground }]}
              >
                Send Incentive
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <ScrollView
          canCancelContentTouches
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 16 },
          ]}
          directionalLockEnabled
          showsVerticalScrollIndicator={false}
        >
          {visibleItems.map(({ friend, incentive }) => (
            <IncentiveCard
              key={incentive.id}
              friend={friend}
              incentive={incentive}
              direction={tab === "received" ? "received" : "sent"}
              accepting={acceptingId === incentive.id}
              nudging={nudgingFriendshipId === friend.id}
              onAccept={() => handleAccept(friend, incentive)}
              onNudge={() => void handleNudge(friend, incentive)}
            />
          ))}
        </ScrollView>
      )}

      {/* Create modal */}
      {showCreate && (
        <View style={[StyleSheet.absoluteFill, styles.modalOverlay]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() =>
              runPressAction("dismiss-create", () => setShowCreate(false))
            }
          />
          <View style={styles.modalSheet}>
            <CreateIncentiveModal
              friends={acceptedFriends}
              onClose={() => setShowCreate(false)}
              onSend={handleSend}
            />
          </View>
        </View>
      )}
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { flex: 1, minWidth: 0 },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  addButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  tabSwitcher: {
    flexDirection: "row",
    borderRadius: 8,
    padding: 2,
    gap: 2,
  },
  tabSwitcherBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 32,
    borderRadius: 7,
    gap: 5,
  },
  tabSwitcherText: { fontSize: 13, fontWeight: "600" },
  tabCount: { fontSize: 12, fontWeight: "600" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  errorText: { fontSize: 15, textAlign: "center", marginBottom: 16 },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
  },
  retryText: { fontSize: 15, fontWeight: "600" },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyDesc: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyCreateBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyCreateBtnText: { fontSize: 15, fontWeight: "600" },
  list: { paddingTop: 10, paddingHorizontal: 16, gap: 10 },
  // Card
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: 14,
    gap: 12,
  },
  cardTopRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  challengeTypePill: {
    minHeight: 26,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
  },
  challengeTypeText: { fontSize: 12, fontWeight: "600" },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  cardHeaderText: { flex: 1 },
  cardHeaderName: { fontSize: 17, fontWeight: "700" },
  cardHeaderDate: { fontSize: 13, fontWeight: "500", marginTop: 1 },
  acceptedStatus: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  acceptedStatusText: { fontSize: 12, fontWeight: "600" },
  challengeBody: { gap: 4 },
  body: { fontSize: 18, lineHeight: 24, fontWeight: "700", letterSpacing: 0 },
  goalLine: { fontSize: 13, fontWeight: "500" },
  challengeMetrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  challengeMetric: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 10,
  },
  challengeMetricText: { fontSize: 13, fontWeight: "600" },
  progressBlock: {
    gap: 8,
    borderRadius: 10,
    padding: 12,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressTitle: { flexDirection: "row", alignItems: "center", gap: 6 },
  progressLabel: { fontSize: 13, fontWeight: "600" },
  progressDays: { fontSize: 13, fontWeight: "500" },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: 4, borderRadius: 2 },
  metadataRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
  },
  nudgeMetaButton: { flexDirection: "row", alignItems: "center", gap: 5 },
  metadataText: { fontSize: 14, fontWeight: "600" },
  acceptBtn: {
    minHeight: 42,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  acceptBtnText: { fontSize: 15, fontWeight: "600" },
  pressed: { opacity: 0.6 },
  // Modal
  modalOverlay: {
    zIndex: 200,
    elevation: 200,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.4)",
  },
  modalSheet: {
    height: "88%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  // Sheet
  sheet: { flex: 1 },
  sheetHandle: { alignItems: "center", paddingTop: 12, paddingBottom: 4 },
  sheetHandleBar: { width: 36, height: 4, borderRadius: 2 },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  sheetTitle: { fontSize: 18, fontWeight: "700" },
  headerTextButton: { flexDirection: "row", alignItems: "center", gap: 2 },
  backBtn: { fontSize: 16, fontWeight: "500" },
  sheetContent: { padding: 20, paddingBottom: 8 },
  sheetFooter: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // Create form
  stepHeading: { fontSize: 17, fontWeight: "700", marginBottom: 16 },
  emptyHint: { fontSize: 14, lineHeight: 20, marginTop: 4 },
  friendOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 12,
  },
  friendOptionName: { fontSize: 15, fontWeight: "600" },
  friendOptionEmail: { fontSize: 12, marginTop: 2 },
  detailsStep: { gap: 4 },
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
  earnBox: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    marginTop: 12,
    gap: 8,
  },
  earnBoxTitle: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 4,
  },
  scopeRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  scopeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  scopeChipText: { fontSize: 13, fontWeight: "600" },
  goalDropdownMenu: {
    width: "100%",
  },
  goalDropdown: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 14,
  },
  goalDropdownText: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    fontWeight: "600",
  },
  streakRow: { flexDirection: "row", marginTop: 4 },
  inputSuffix: { fontSize: 12, marginTop: 4 },
  sendBtn: {
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnText: { fontSize: 16, fontWeight: "700" },
});
