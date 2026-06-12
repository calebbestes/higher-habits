import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CollabHeaderMenu } from "@/components/collab-header-menu";
import { MaxContentWidth } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { type FriendRow, addFriend, fetchFriends } from "@/lib/friends-client";

type SymbolName = SymbolViewProps["name"];

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

export function FriendsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);

  const load = useCallback(async (refresh = false) => {
    refresh ? setIsRefreshing(true) : setIsLoading(true);
    try {
      setFriends(await fetchFriends());
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load friends.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const acceptedFriends = useMemo(
    () => friends.filter((friend) => friend.status === "accepted"),
    [friends],
  );
  const pendingFriends = useMemo(
    () => friends.filter((friend) => friend.status === "requested"),
    [friends],
  );
  const visibleFriends = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return acceptedFriends;
    return acceptedFriends.filter(
      (friend) =>
        friend.friendName.toLowerCase().includes(query) ||
        friend.friendEmail.toLowerCase().includes(query),
    );
  }, [acceptedFriends, search]);
  const averagePerformance =
    acceptedFriends.length > 0
      ? Math.round(
          acceptedFriends.reduce(
            (total, friend) => total + (friend.performance7Day?.percent ?? 0),
            0,
          ) / acceptedFriends.length,
        )
      : 0;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              tintColor={theme.primary}
              onRefresh={() => void load(true)}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pageHeader}>
            <View style={styles.pageHeaderLeft}>
              <View style={styles.pageHeaderText}>
                <CollabHeaderMenu currentSection="friends" />
                <Text
                  style={[styles.pageSubtitle, { color: theme.textSecondary }]}
                >
                  Your accountability circle
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.toolbar}>
            <View
              style={[
                styles.searchBox,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.tabBorder,
                },
              ]}
            >
              <SymbolView
                name={sym("magnifyingglass", "search")}
                size={17}
                weight="semibold"
                tintColor={theme.textSecondary}
              />
              <TextInput
                accessibilityLabel="Search friends"
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={setSearch}
                placeholder="Search friends"
                placeholderTextColor={theme.textSecondary}
                style={[styles.searchInput, { color: theme.text }]}
                value={search}
              />
              {search ? (
                <Pressable
                  accessibilityLabel="Clear search"
                  hitSlop={10}
                  onPress={() => setSearch("")}
                >
                  <SymbolView
                    name={sym("xmark.circle.fill", "cancel")}
                    size={17}
                    tintColor={theme.textSecondary}
                  />
                </Pressable>
              ) : null}
            </View>
            <Pressable
              accessibilityLabel="Add friend"
              onPress={() => setIsAddOpen(true)}
              style={({ pressed }) => [
                styles.addButton,
                { backgroundColor: theme.primary },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("person.badge.plus", "person_add")}
                size={17}
                weight="semibold"
                tintColor={theme.primaryForeground}
              />
              <Text
                style={[
                  styles.addButtonText,
                  { color: theme.primaryForeground },
                ]}
              >
                Add
              </Text>
            </Pressable>
          </View>

          <View style={styles.summaryRow}>
            <SummaryCard
              label="Friends"
              value={String(acceptedFriends.length)}
              icon={sym("person.2.fill", "groups")}
            />
            <SummaryCard
              label="7-day average"
              value={`${averagePerformance}%`}
              icon={sym("chart.line.uptrend.xyaxis", "trending_up")}
            />
            <SummaryCard
              label="Pending"
              value={String(pendingFriends.length)}
              icon={sym("clock.fill", "schedule")}
            />
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => void load()}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator color={theme.primary} size="large" />
            </View>
          ) : (
            <>
              {pendingFriends.length > 0 ? (
                <View style={styles.section}>
                  <SectionHeader
                    title="Pending requests"
                    count={pendingFriends.length}
                  />
                  <View style={styles.pendingList}>
                    {pendingFriends.map((friend) => (
                      <PendingFriendRow key={friend.id} friend={friend} />
                    ))}
                  </View>
                </View>
              ) : null}

              <View style={styles.section}>
                <SectionHeader
                  title={search ? "Search results" : "My friends"}
                  count={visibleFriends.length}
                />
                {visibleFriends.length > 0 ? (
                  <View style={styles.friendGrid}>
                    {visibleFriends.map((friend) => (
                      <FriendCard
                        key={friend.id}
                        friend={friend}
                        onIncentivize={() =>
                          router.navigate("/?section=incentives")
                        }
                        onMessage={() => router.navigate("/?section=messages")}
                      />
                    ))}
                  </View>
                ) : (
                  <EmptyFriendsState
                    hasSearch={Boolean(search)}
                    onAdd={() => setIsAddOpen(true)}
                  />
                )}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>

      <AddFriendModal
        visible={isAddOpen}
        onClose={() => setIsAddOpen(false)}
        onAdded={async () => {
          setIsAddOpen(false);
          await load();
        }}
      />
    </View>
  );
}

function SummaryCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: SymbolName;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.summaryCard,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.tabBorder,
        },
      ]}
    >
      <SymbolView
        name={icon}
        size={17}
        weight="semibold"
        tintColor={theme.primary}
      />
      <Text style={[styles.summaryValue, { color: theme.text }]}>{value}</Text>
      <Text
        numberOfLines={2}
        style={[styles.summaryLabel, { color: theme.textSecondary }]}
      >
        {label}
      </Text>
    </View>
  );
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  const theme = useTheme();

  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: theme.text }]}>{title}</Text>
      <View
        style={[
          styles.countBadge,
          { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <Text style={[styles.countText, { color: theme.textSecondary }]}>
          {count}
        </Text>
      </View>
    </View>
  );
}

function FriendCard({
  friend,
  onMessage,
  onIncentivize,
}: {
  friend: FriendRow;
  onMessage: () => void;
  onIncentivize: () => void;
}) {
  const theme = useTheme();
  const performance = friend.performance7Day;
  const hasTrackedGoals = Boolean(
    performance && performance.possiblePoints > 0,
  );

  return (
    <View
      style={[
        styles.friendCard,
        {
          backgroundColor: theme.background,
          borderColor: theme.tabBorder,
        },
      ]}
    >
      <View style={styles.friendCardHeader}>
        <FriendAvatar friend={friend} size={52} />
        <View style={styles.friendIdentity}>
          <Text
            numberOfLines={1}
            style={[styles.friendName, { color: theme.text }]}
          >
            {friend.friendName}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.friendEmail, { color: theme.textSecondary }]}
          >
            {friend.friendEmail}
          </Text>
        </View>
        <PerformanceBadge percent={performance?.percent ?? 0} />
      </View>

      <View
        style={[
          styles.friendDetails,
          { backgroundColor: theme.backgroundElement },
        ]}
      >
        <DetailItem label="Last active" value={formatLastActive(friend)} />
        <View
          style={[styles.detailDivider, { backgroundColor: theme.tabBorder }]}
        />
        <DetailItem
          label="Last 7 days"
          value={
            hasTrackedGoals
              ? `${performance?.earnedPoints}/${performance?.possiblePoints} pts`
              : "No goals tracked"
          }
        />
      </View>

      <View style={styles.cardActions}>
        <FriendAction
          icon={sym("message.fill", "message")}
          label="Message"
          onPress={onMessage}
        />
        <FriendAction
          icon={sym("gift.fill", "card_giftcard")}
          label="Incentivize"
          onPress={onIncentivize}
        />
      </View>
    </View>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  const theme = useTheme();

  return (
    <View style={styles.detailItem}>
      <Text style={[styles.detailLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={[styles.detailValue, { color: theme.text }]}
      >
        {value}
      </Text>
    </View>
  );
}

function FriendAction({
  icon,
  label,
  onPress,
}: {
  icon: SymbolName;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.friendAction,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.tabBorder,
        },
        pressed && styles.pressed,
      ]}
    >
      <SymbolView
        name={icon}
        size={16}
        weight="semibold"
        tintColor={theme.primary}
      />
      <Text style={[styles.friendActionText, { color: theme.primary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

function PendingFriendRow({ friend }: { friend: FriendRow }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.pendingRow,
        {
          backgroundColor: theme.background,
          borderColor: theme.tabBorder,
        },
      ]}
    >
      <FriendAvatar friend={friend} size={42} />
      <View style={styles.friendIdentity}>
        <Text
          numberOfLines={1}
          style={[styles.pendingName, { color: theme.text }]}
        >
          {friend.friendName}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.friendEmail, { color: theme.textSecondary }]}
        >
          {friend.friendEmail}
        </Text>
      </View>
      <View
        style={[
          styles.pendingBadge,
          { backgroundColor: theme.backgroundSelected },
        ]}
      >
        <Text style={[styles.pendingBadgeText, { color: theme.textSecondary }]}>
          Pending
        </Text>
      </View>
    </View>
  );
}

function FriendAvatar({ friend, size }: { friend: FriendRow; size: number }) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.backgroundSelected,
        },
      ]}
    >
      {friend.friendImage ? (
        <Image
          contentFit="cover"
          source={{ uri: friend.friendImage }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <Text style={[styles.avatarText, { color: theme.primary }]}>
          {friend.friendName.slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

function PerformanceBadge({ percent }: { percent: number }) {
  const theme = useTheme();
  const clampedPercent = Math.max(0, Math.min(100, Math.round(percent)));

  return (
    <View
      accessible
      accessibilityLabel={`${clampedPercent}% performance over the last 7 days`}
      style={[
        styles.performanceBadge,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.primary,
        },
      ]}
    >
      <Text style={[styles.performanceValue, { color: theme.primary }]}>
        {clampedPercent}%
      </Text>
      <Text style={[styles.performanceLabel, { color: theme.textSecondary }]}>
        7 days
      </Text>
    </View>
  );
}

function EmptyFriendsState({
  hasSearch,
  onAdd,
}: {
  hasSearch: boolean;
  onAdd: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.emptyCard,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.tabBorder,
        },
      ]}
    >
      <SymbolView
        name={sym(
          hasSearch ? "magnifyingglass" : "person.2.fill",
          hasSearch ? "search" : "groups",
        )}
        size={28}
        weight="semibold"
        tintColor={theme.primary}
      />
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        {hasSearch ? "No matching friends" : "No friends yet"}
      </Text>
      <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
        {hasSearch
          ? "Try another name or email."
          : "Add someone by email to start encouraging each other."}
      </Text>
      {!hasSearch ? (
        <Pressable
          onPress={onAdd}
          style={({ pressed }) => [
            styles.emptyButton,
            { backgroundColor: theme.primary },
            pressed && styles.pressed,
          ]}
        >
          <Text
            style={[styles.emptyButtonText, { color: theme.primaryForeground }]}
          >
            Add Friend
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function AddFriendModal({
  visible,
  onClose,
  onAdded,
}: {
  visible: boolean;
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const theme = useTheme();
  const [email, setEmail] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const canSubmit = email.trim().length > 0 && !isSubmitting;

  const submit = async () => {
    if (!canSubmit) return;
    setIsSubmitting(true);
    try {
      await addFriend(email.trim());
      setEmail("");
      await onAdded();
      Alert.alert("Friend request sent");
    } catch (submitError) {
      Alert.alert(
        "Could not add friend",
        submitError instanceof Error ? submitError.message : "Try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <View style={[styles.modalScreen, { backgroundColor: theme.background }]}>
        <SafeAreaView style={styles.modalSafeArea}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.modalKeyboard}
          >
            <View
              style={[
                styles.modalHeader,
                { borderBottomColor: theme.tabBorder },
              ]}
            >
              <Pressable
                accessibilityLabel="Cancel"
                disabled={isSubmitting}
                hitSlop={12}
                onPress={onClose}
              >
                <Text style={[styles.modalCancel, { color: theme.primary }]}>
                  Cancel
                </Text>
              </Pressable>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                Add Friend
              </Text>
              <Pressable
                accessibilityLabel="Send friend request"
                disabled={!canSubmit}
                hitSlop={12}
                onPress={() => void submit()}
              >
                {isSubmitting ? (
                  <ActivityIndicator color={theme.primary} size="small" />
                ) : (
                  <Text
                    style={[
                      styles.modalAdd,
                      {
                        color: canSubmit ? theme.primary : theme.textSecondary,
                      },
                    ]}
                  >
                    Add
                  </Text>
                )}
              </Pressable>
            </View>
            <View style={styles.modalContent}>
              <Text style={[styles.modalLabel, { color: theme.textSecondary }]}>
                Email address
              </Text>
              <TextInput
                autoCapitalize="none"
                autoComplete="email"
                autoCorrect={false}
                autoFocus
                keyboardType="email-address"
                onChangeText={setEmail}
                onSubmitEditing={() => void submit()}
                placeholder="friend@example.com"
                placeholderTextColor={theme.textSecondary}
                returnKeyType="send"
                style={[
                  styles.emailInput,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                    color: theme.text,
                  },
                ]}
                value={email}
              />
              <Text style={[styles.modalHint, { color: theme.textSecondary }]}>
                They will appear as pending until the request is accepted.
              </Text>
            </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function formatLastActive(friend: FriendRow): string {
  if (!friend.lastActiveAt && !friend.lastActiveDate) return "No activity yet";
  const date = new Date(
    friend.lastActiveAt ?? `${friend.lastActiveDate}T12:00:00`,
  );
  if (Number.isNaN(date.getTime()))
    return friend.lastActiveDate ?? "No activity yet";

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 18,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  pageHeaderLeft: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  pageHeaderIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  pageHeaderText: { minWidth: 0, flex: 1, gap: 1 },
  pageTitle: {
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  pageSubtitle: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchBox: {
    height: 44,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 0, fontSize: 15, fontWeight: "500" },
  addButton: {
    height: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  addButtonText: { fontSize: 14, fontWeight: "800" },
  summaryRow: { flexDirection: "row", gap: 8 },
  summaryCard: {
    minWidth: 0,
    flex: 1,
    alignItems: "flex-start",
    gap: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 12,
  },
  summaryValue: { fontSize: 20, fontWeight: "800", letterSpacing: -0.4 },
  summaryLabel: {
    minHeight: 30,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "600",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: "#F3B7B933",
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  errorText: {
    flex: 1,
    color: "#9D474D",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  retryText: { color: "#9D474D", fontSize: 12, fontWeight: "800" },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  section: { gap: 10 },
  sectionHeader: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionTitle: { fontSize: 18, fontWeight: "800", letterSpacing: -0.2 },
  countBadge: {
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 7,
  },
  countText: { fontSize: 11, fontWeight: "800" },
  pendingList: { gap: 8 },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 12,
  },
  pendingName: { fontSize: 15, fontWeight: "700" },
  pendingBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  pendingBadgeText: { fontSize: 11, fontWeight: "700" },
  friendGrid: { gap: 12 },
  friendCard: {
    gap: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 14,
  },
  friendCardHeader: { flexDirection: "row", alignItems: "center", gap: 11 },
  friendIdentity: { minWidth: 0, flex: 1, gap: 2 },
  friendName: { fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  friendEmail: { fontSize: 12, fontWeight: "500" },
  avatar: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 18, fontWeight: "800" },
  performanceBadge: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 3,
    borderRadius: 29,
  },
  performanceValue: { fontSize: 14, fontWeight: "800" },
  performanceLabel: {
    fontSize: 8,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  friendDetails: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  detailItem: { minWidth: 0, flex: 1, gap: 3 },
  detailDivider: {
    width: StyleSheet.hairlineWidth,
    height: 32,
    marginHorizontal: 10,
  },
  detailLabel: {
    fontSize: 9,
    fontWeight: "800",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  },
  detailValue: { fontSize: 12, fontWeight: "700" },
  cardActions: { flexDirection: "row", gap: 8 },
  friendAction: {
    height: 40,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
  },
  friendActionText: { fontSize: 13, fontWeight: "700" },
  emptyCard: {
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  emptyTitle: { fontSize: 18, fontWeight: "800" },
  emptyText: {
    maxWidth: 280,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
  },
  emptyButton: {
    marginTop: 6,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  emptyButtonText: { fontSize: 13, fontWeight: "800" },
  pressed: { opacity: 0.65 },
  modalScreen: { flex: 1 },
  modalSafeArea: { flex: 1 },
  modalKeyboard: { flex: 1 },
  modalHeader: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
  },
  modalCancel: { fontSize: 16, fontWeight: "500" },
  modalTitle: { fontSize: 17, fontWeight: "800" },
  modalAdd: { fontSize: 16, fontWeight: "800" },
  modalContent: { gap: 8, paddingHorizontal: 18, paddingTop: 24 },
  modalLabel: { paddingHorizontal: 4, fontSize: 12, fontWeight: "700" },
  emailInput: {
    height: 50,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  modalHint: { paddingHorizontal: 4, fontSize: 12, lineHeight: 17 },
});
