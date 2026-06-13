import { useEffect, useState } from "react";
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

import { CollabHeaderMenu } from "@/components/collab-header-menu";
import { useTheme } from "@/hooks/use-theme";
import {
  type FriendIncentiveRow,
  type FriendRow,
  type SendIncentivePayload,
  type StreakGoalScope,
  acceptFriendIncentive,
  fetchFriends,
  sendFriendIncentive,
} from "@/lib/friends-client";

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

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0] ?? "")
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function hashColor(str: string) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${Math.abs(hash) % 360}, 45%, 52%)`;
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

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  name,
  userId,
  size = 36,
}: {
  name: string;
  userId: string;
  size?: number;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: hashColor(userId),
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: "#fff", fontSize: size * 0.34, fontWeight: "700" }}>
        {getInitials(name)}
      </Text>
    </View>
  );
}

// ─── ProgressBar ──────────────────────────────────────────────────────────────

function ProgressBar({ percent, color }: { percent: number; color: string }) {
  const pct = Math.min(100, Math.max(0, Math.round(percent)));
  return (
    <View style={styles.progressTrack}>
      <View
        style={[
          styles.progressFill,
          { width: `${pct}%` as `${number}%`, backgroundColor: color },
        ]}
      />
    </View>
  );
}

// ─── IncentiveCard ────────────────────────────────────────────────────────────

function IncentiveCard({
  friend,
  incentive,
  direction,
  accepting,
  onAccept,
}: {
  friend: FriendRow;
  incentive: FriendIncentiveRow;
  direction: "sent" | "received";
  accepting: boolean;
  onAccept: () => void;
}) {
  const theme = useTheme();
  const isReceived = direction === "received";
  const isAccepted = incentive.accepted === true;
  const goalLabel = getGoalLabel(friend, incentive);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.background, borderColor: theme.tabBorder },
      ]}
    >
      {/* From / To header */}
      <View style={styles.cardHeader}>
        <Avatar name={friend.friendName} userId={friend.friendId} size={30} />
        <View style={styles.cardHeaderText}>
          <Text style={[styles.cardHeaderName, { color: theme.text }]}>
            {isReceived
              ? `From ${friend.friendName}`
              : `To ${friend.friendName}`}
          </Text>
          <Text style={[styles.cardHeaderDate, { color: theme.textSecondary }]}>
            {formatDate(incentive.createdAt)}
          </Text>
        </View>
        {isAccepted && (
          <View style={[styles.acceptedBadge, { backgroundColor: "#D1FAE5" }]}>
            <Text style={[styles.acceptedBadgeText, { color: "#065F46" }]}>
              Accepted
            </Text>
          </View>
        )}
      </View>

      {/* Incentive body */}
      <Text style={[styles.body, { color: theme.text }]}>{incentive.body}</Text>

      {/* Progress block (only when accepted and has progress) */}
      {isAccepted && incentive.progress ? (
        <View
          style={[
            styles.progressBlock,
            { backgroundColor: theme.backgroundElement },
          ]}
        >
          <View style={styles.progressHeader}>
            <Text
              style={[styles.progressLabel, { color: theme.textSecondary }]}
            >
              🎁 Incentive progress
            </Text>
            <Text style={[styles.progressDays, { color: theme.textSecondary }]}>
              {incentive.progress.qualifyingDays}/
              {incentive.progress.requiredDays} days
            </Text>
          </View>
          <ProgressBar percent={incentive.progress.percent} color="#22C55E" />
        </View>
      ) : null}

      {/* Badges */}
      <View style={styles.badgesRow}>
        {incentive.streakDays ? (
          <View
            style={[styles.badge, { backgroundColor: theme.backgroundElement }]}
          >
            <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
              📅 {incentive.streakDays} days
            </Text>
          </View>
        ) : null}
        {incentive.streakPercent ? (
          <View
            style={[styles.badge, { backgroundColor: theme.backgroundElement }]}
          >
            <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
              🎯 {incentive.streakPercent}%
            </Text>
          </View>
        ) : null}
        <View
          style={[styles.badge, { backgroundColor: theme.backgroundElement }]}
        >
          <Text style={[styles.badgeText, { color: theme.textSecondary }]}>
            ◎ {goalLabel}
          </Text>
        </View>
      </View>

      {/* Accept button (received, not yet accepted) */}
      {isReceived && !isAccepted ? (
        <Pressable
          onPress={onAccept}
          disabled={accepting}
          style={[
            styles.acceptBtn,
            {
              backgroundColor: accepting
                ? theme.backgroundElement
                : theme.primary,
            },
          ]}
        >
          {accepting ? (
            <ActivityIndicator color={theme.primaryForeground} size="small" />
          ) : (
            <Text
              style={[styles.acceptBtnText, { color: theme.primaryForeground }]}
            >
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
  const insets = useSafeAreaInsets();

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
  const canSend =
    body.trim().length > 0 &&
    Number.isFinite(daysNum) &&
    daysNum >= 1 &&
    Number.isFinite(percentNum) &&
    percentNum >= 1 &&
    percentNum <= 100 &&
    (scope !== "single" || goalId.length > 0);

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
              <Pressable onPress={() => setStep(1)} hitSlop={12}>
                <Text style={[styles.backBtn, { color: theme.primary }]}>
                  ← Back
                </Text>
              </Pressable>
            )}
          </View>
          <Text style={[styles.sheetTitle, { color: theme.text }]}>
            New Incentive
          </Text>
          <View style={{ width: 60, alignItems: "flex-end" }}>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={[styles.closeBtn, { color: theme.textSecondary }]}>
                ✕
              </Text>
            </Pressable>
          </View>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.sheetContent}
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
                    onPress={() => {
                      setSelectedFriend(f);
                      if (f.goalOptions[0]) setGoalId(f.goalOptions[0].id);
                      setStep(2);
                    }}
                    style={[
                      styles.friendOption,
                      { borderBottomColor: theme.tabBorder },
                    ]}
                  >
                    <Avatar name={f.friendName} userId={f.friendId} size={40} />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[styles.friendOptionName, { color: theme.text }]}
                      >
                        {f.friendName}
                      </Text>
                      <Text
                        style={[
                          styles.friendOptionEmail,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {f.friendEmail}
                      </Text>
                    </View>
                    <Text style={{ color: theme.textSecondary, fontSize: 18 }}>
                      →
                    </Text>
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
                placeholder="Coffee on me when you hit it"
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
                      onPress={() => setScope(opt.value)}
                      style={[
                        styles.scopeChip,
                        {
                          backgroundColor:
                            scope === opt.value
                              ? theme.primary
                              : theme.background,
                          borderColor:
                            scope === opt.value
                              ? theme.primary
                              : theme.tabBorder,
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.scopeChipText,
                          {
                            color:
                              scope === opt.value
                                ? theme.primaryForeground
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
                        No shared goals available
                      </Text>
                    ) : (
                      <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={{ gap: 8 }}
                      >
                        {selectedFriend.goalOptions.map((g) => (
                          <Pressable
                            key={g.id}
                            onPress={() => setGoalId(g.id)}
                            style={[
                              styles.scopeChip,
                              {
                                backgroundColor:
                                  goalId === g.id
                                    ? theme.primary
                                    : theme.background,
                                borderColor:
                                  goalId === g.id
                                    ? theme.primary
                                    : theme.tabBorder,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.scopeChipText,
                                {
                                  color:
                                    goalId === g.id
                                      ? theme.primaryForeground
                                      : theme.textSecondary,
                                },
                              ]}
                            >
                              {g.name}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
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
              onPress={handleSend}
              disabled={!canSend || sending}
              style={[
                styles.sendBtn,
                {
                  backgroundColor:
                    canSend && !sending
                      ? theme.primary
                      : theme.backgroundElement,
                },
              ]}
            >
              {sending ? (
                <ActivityIndicator
                  color={theme.primaryForeground}
                  size="small"
                />
              ) : (
                <Text
                  style={[
                    styles.sendBtnText,
                    {
                      color:
                        canSend && !sending
                          ? theme.primaryForeground
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
  const insets = useSafeAreaInsets();

  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"received" | "sent">("received");
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  async function load() {
    try {
      const data = await fetchFriends();
      setFriends(data.filter((f) => f.status === "accepted"));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

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
        <CollabHeaderMenu currentSection="incentives" />
        <View style={styles.headerActions}>
          <Pressable
            onPress={() => setShowCreate(true)}
            style={[styles.newBtn, { backgroundColor: theme.primary }]}
          >
            <Text
              style={[styles.newBtnText, { color: theme.primaryForeground }]}
            >
              + New
            </Text>
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
                onPress={() => setTab(t)}
                style={[
                  styles.tabSwitcherBtn,
                  tab === t && {
                    backgroundColor: theme.background,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 1 },
                    shadowOpacity: 0.08,
                    shadowRadius: 2,
                    elevation: 2,
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
                  <View
                    style={[
                      styles.tabBadge,
                      {
                        backgroundColor:
                          tab === t ? theme.primary : theme.backgroundSelected,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.tabBadgeText,
                        {
                          color:
                            tab === t
                              ? theme.primaryForeground
                              : theme.textSecondary,
                        },
                      ]}
                    >
                      {count}
                    </Text>
                  </View>
                )}
              </Pressable>
            );
          })}
        </View>
      )}

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
            <Text style={[styles.retryText, { color: theme.primary }]}>
              Retry
            </Text>
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
              onPress={() => setShowCreate(true)}
              style={[
                styles.emptyCreateBtn,
                { backgroundColor: theme.primary },
              ]}
            >
              <Text
                style={[
                  styles.emptyCreateBtnText,
                  { color: theme.primaryForeground },
                ]}
              >
                Send Incentive
              </Text>
            </Pressable>
          )}
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 16 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {visibleItems.map(({ friend, incentive }) => (
            <IncentiveCard
              key={incentive.id}
              friend={friend}
              incentive={incentive}
              direction={tab === "received" ? "received" : "sent"}
              accepting={acceptingId === incentive.id}
              onAccept={() => handleAccept(friend, incentive)}
            />
          ))}
        </ScrollView>
      )}

      {/* Create modal */}
      {showCreate && (
        <View style={[StyleSheet.absoluteFill, styles.modalOverlay]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setShowCreate(false)}
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
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: { fontSize: 24, fontWeight: "800" },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 8 },
  newBtn: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  newBtnText: { fontSize: 14, fontWeight: "700" },
  tabSwitcher: {
    flexDirection: "row",
    borderRadius: 12,
    padding: 3,
    gap: 3,
  },
  tabSwitcherBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  tabSwitcherText: { fontSize: 14, fontWeight: "700" },
  tabBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5,
  },
  tabBadgeText: { fontSize: 11, fontWeight: "700" },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  errorText: { fontSize: 15, textAlign: "center", marginBottom: 16 },
  retryBtn: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  retryText: { fontSize: 14, fontWeight: "700" },
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
    borderRadius: 22,
  },
  emptyCreateBtnText: { fontSize: 15, fontWeight: "700" },
  list: { paddingTop: 12, paddingHorizontal: 16, gap: 12 },
  // Card
  card: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 10,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 10 },
  cardHeaderText: { flex: 1 },
  cardHeaderName: { fontSize: 13, fontWeight: "700" },
  cardHeaderDate: { fontSize: 12, marginTop: 1 },
  acceptedBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  acceptedBadgeText: { fontSize: 11, fontWeight: "700" },
  body: { fontSize: 15, lineHeight: 22 },
  progressBlock: {
    borderRadius: 10,
    padding: 12,
    gap: 8,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  progressLabel: { fontSize: 12, fontWeight: "600" },
  progressDays: { fontSize: 12, fontWeight: "600" },
  progressTrack: {
    height: 6,
    backgroundColor: "#D1D5DB",
    borderRadius: 3,
    overflow: "hidden",
  },
  progressFill: { height: 6, borderRadius: 3 },
  badgesRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20 },
  badgeText: { fontSize: 12, fontWeight: "600" },
  acceptBtn: {
    paddingVertical: 11,
    borderRadius: 22,
    alignItems: "center",
    marginTop: 2,
  },
  acceptBtnText: { fontSize: 14, fontWeight: "700" },
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
  backBtn: { fontSize: 14, fontWeight: "700" },
  closeBtn: { fontSize: 17, fontWeight: "600" },
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
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 6,
  },
  textInput: {
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  earnBox: {
    borderRadius: 16,
    borderWidth: 1,
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
    borderRadius: 20,
    borderWidth: 1,
  },
  scopeChipText: { fontSize: 13, fontWeight: "600" },
  streakRow: { flexDirection: "row", marginTop: 4 },
  inputSuffix: { fontSize: 12, marginTop: 4 },
  sendBtn: {
    paddingVertical: 14,
    borderRadius: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnText: { fontSize: 16, fontWeight: "700" },
});
