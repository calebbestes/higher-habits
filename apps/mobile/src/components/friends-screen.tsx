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
import {
  type FriendRow,
  acceptFriendRequest,
  addFriend,
  fetchFriends,
} from "@/lib/friends-client";

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
  const [acceptingFriendshipId, setAcceptingFriendshipId] = useState<
    string | null
  >(null);

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
    () =>
      friends
        .filter((friend) => friend.status === "accepted")
        .sort(
          (left, right) =>
            lastOpenedTime(right) - lastOpenedTime(left) ||
            left.friendName.localeCompare(right.friendName),
        ),
    [friends],
  );
  const pendingFriends = useMemo(
    () =>
      friends
        .filter((friend) => friend.status === "requested")
        .sort(
          (left, right) =>
            Number(right.isIncomingRequest) - Number(left.isIncomingRequest) ||
            left.friendName.localeCompare(right.friendName),
        ),
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

  const acceptRequest = async (friend: FriendRow) => {
    setAcceptingFriendshipId(friend.id);
    try {
      await acceptFriendRequest(friend.id);
      await load();
    } catch (acceptError) {
      Alert.alert(
        "Could not accept request",
        acceptError instanceof Error ? acceptError.message : "Try again.",
      );
    } finally {
      setAcceptingFriendshipId(null);
    }
  };

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
                      <PendingFriendRow
                        key={friend.id}
                        friend={friend}
                        isAccepting={acceptingFriendshipId === friend.id}
                        onAccept={() => void acceptRequest(friend)}
                      />
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
}: {
  friend: FriendRow;
  onMessage: () => void;
}) {
  const theme = useTheme();

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
      <FriendAvatar friend={friend} size={48} />
      <View style={styles.friendIdentity}>
        <Text
          numberOfLines={1}
          style={[styles.friendName, { color: theme.text }]}
        >
          {friend.friendName}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.friendActive, { color: theme.textSecondary }]}
        >
          Active: {formatLastOpened(friend)}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={`Message ${friend.friendName}`}
        hitSlop={8}
        onPress={onMessage}
        style={({ pressed }) => [
          styles.messageButton,
          { backgroundColor: theme.backgroundElement },
          pressed && styles.pressed,
        ]}
      >
        <SymbolView
          name={sym("message.fill", "message")}
          size={19}
          weight="semibold"
          tintColor={theme.primary}
        />
      </Pressable>
    </View>
  );
}

function PendingFriendRow({
  friend,
  isAccepting,
  onAccept,
}: {
  friend: FriendRow;
  isAccepting: boolean;
  onAccept: () => void;
}) {
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
      {friend.isIncomingRequest ? (
        <Pressable
          accessibilityLabel={`Accept ${friend.friendName}'s friend request`}
          disabled={isAccepting}
          onPress={onAccept}
          style={({ pressed }) => [
            styles.acceptButton,
            { backgroundColor: theme.primary },
            pressed && styles.pressed,
          ]}
        >
          {isAccepting ? (
            <ActivityIndicator color={theme.primaryForeground} size="small" />
          ) : (
            <Text
              style={[
                styles.acceptButtonText,
                { color: theme.primaryForeground },
              ]}
            >
              Accept
            </Text>
          )}
        </Pressable>
      ) : (
        <View
          style={[
            styles.pendingBadge,
            { backgroundColor: theme.backgroundSelected },
          ]}
        >
          <Text
            style={[styles.pendingBadgeText, { color: theme.textSecondary }]}
          >
            Sent
          </Text>
        </View>
      )}
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

function lastOpenedTime(friend: FriendRow): number {
  if (!friend.lastOpenedAt) return 0;
  const time = new Date(friend.lastOpenedAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatLastOpened(friend: FriendRow): string {
  const time = lastOpenedTime(friend);
  if (!time) return "Not opened yet";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const opened = new Date(time);
  opened.setHours(0, 0, 0, 0);
  const daysAgo = Math.max(
    0,
    Math.floor((today.getTime() - opened.getTime()) / 86_400_000),
  );

  if (daysAgo === 0) return "Today";
  if (daysAgo <= 6) return `${daysAgo} ${daysAgo === 1 ? "day" : "days"} ago`;
  if (daysAgo <= 30) return "Over a week ago";
  return "Over one month ago";
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
  acceptButton: {
    minWidth: 68,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  acceptButtonText: { fontSize: 13, fontWeight: "700" },
  friendGrid: { gap: 12 },
  friendCard: {
    minHeight: 74,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  friendIdentity: { minWidth: 0, flex: 1, gap: 2 },
  friendName: { fontSize: 17, fontWeight: "800", letterSpacing: -0.2 },
  friendEmail: { fontSize: 12, fontWeight: "500" },
  friendActive: { fontSize: 13, fontWeight: "500" },
  avatar: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 18, fontWeight: "800" },
  messageButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
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
