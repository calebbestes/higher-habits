import * as Contacts from "expo-contacts";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { GoalIcon } from "@/components/goal-icon";
import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import {
  type ContactMatch,
  type FriendProfile,
  type FriendProfileCategory,
  type FriendProfileHabit,
  type FriendRow,
  acceptFriendRequest,
  addFriend,
  fetchFriendProfile,
  fetchFriends,
  matchContacts,
} from "@/lib/friends-client";

type SymbolName = SymbolViewProps["name"];

const INVITE_LINK = "https://higher-habits.vercel.app";

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

export function FriendsScreen() {
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [profileFriend, setProfileFriend] = useState<FriendRow | null>(null);
  const [acceptingFriendshipId, setAcceptingFriendshipId] = useState<
    string | null
  >(null);

  const load = useCallback(async (refresh = false) => {
    const requestId = ++loadRequestIdRef.current;
    refresh ? setIsRefreshing(true) : setIsLoading(true);
    try {
      const nextFriends = await fetchFriends();
      if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
        return;
      }
      setFriends(nextFriends);
      setError(null);
    } catch (loadError) {
      if (isMountedRef.current && requestId === loadRequestIdRef.current) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load friends.",
        );
      }
    } finally {
      if (isMountedRef.current && requestId === loadRequestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(
    () => () => {
      isMountedRef.current = false;
      loadRequestIdRef.current += 1;
    },
    [],
  );

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

  const messageFriend = (friend: FriendRow) => {
    const phone = friend.friendPhoneNumber?.trim();
    if (!phone) {
      Alert.alert(
        "No phone number",
        `${friend.friendName} hasn't added a phone number yet.`,
      );
      return;
    }
    Linking.openURL(`sms:${encodeURIComponent(phone)}`).catch(() => {
      Alert.alert("Could not open", "No messaging app is available.");
    });
  };

  const acceptRequest = async (friend: FriendRow) => {
    setAcceptingFriendshipId(friend.id);
    try {
      await acceptFriendRequest(friend.id);
      if (!isMountedRef.current) return;
      await load();
    } catch (acceptError) {
      if (isMountedRef.current) {
        Alert.alert(
          "Could not accept request",
          acceptError instanceof Error ? acceptError.message : "Try again.",
        );
      }
    } finally {
      if (isMountedRef.current) setAcceptingFriendshipId(null);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarHeight + 16 },
          ]}
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
                        onMessage={() => messageFriend(friend)}
                        onOpenProfile={() => setProfileFriend(friend)}
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
          if (!isMountedRef.current) return;
          await load();
        }}
      />
      <FriendProfileModal
        friend={profileFriend}
        onClose={() => setProfileFriend(null)}
      />
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
  onOpenProfile,
}: {
  friend: FriendRow;
  onMessage: () => void;
  onOpenProfile: () => void;
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
      <Pressable
        accessibilityLabel={`Open ${friend.friendName}'s profile`}
        accessibilityRole="button"
        hitSlop={8}
        onPress={onOpenProfile}
        style={({ pressed }) => pressed && styles.pressed}
      >
        <FriendAvatar friend={friend} size={48} />
      </Pressable>
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

export function FriendProfileModal({
  friend,
  onClose,
}: {
  friend: FriendRow | null;
  onClose: () => void;
}) {
  const theme = useTheme();
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!friend) return;

    const requestId = ++loadRequestIdRef.current;
    setIsLoading(true);
    setError(null);
    try {
      const nextProfile = await fetchFriendProfile(friend.id);
      if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
        return;
      }
      setProfile(nextProfile);
    } catch (loadError) {
      if (isMountedRef.current && requestId === loadRequestIdRef.current) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load profile.",
        );
        setProfile(null);
      }
    } finally {
      if (isMountedRef.current && requestId === loadRequestIdRef.current) {
        setIsLoading(false);
      }
    }
  }, [friend]);

  useEffect(
    () => () => {
      isMountedRef.current = false;
      loadRequestIdRef.current += 1;
    },
    [],
  );

  useEffect(() => {
    if (friend) {
      void load();
    } else {
      loadRequestIdRef.current += 1;
      setProfile(null);
      setError(null);
      setIsLoading(false);
    }
  }, [friend, load]);

  const completionSummary = useMemo(() => {
    if (!profile) return { completed: 0, total: 0 };
    const todayKey = profile.dateKeys[profile.dateKeys.length - 1];
    const habits = profile.categories.flatMap((category) => category.habits);
    if (!todayKey) return { completed: 0, total: habits.length };

    return {
      completed: habits.filter(
        (habit) =>
          getFriendHabitStatus(habit, todayKey, profile.logsByHabitDate) ===
          "complete",
      ).length,
      total: habits.length,
    };
  }, [profile]);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={friend !== null}
    >
      <View
        style={[
          styles.profileModalScreen,
          { backgroundColor: theme.background },
        ]}
      >
        <SafeAreaView style={styles.profileModalSafeArea}>
          <View
            style={[styles.modalHeader, { borderBottomColor: theme.tabBorder }]}
          >
            <Pressable
              accessibilityLabel="Close profile"
              hitSlop={12}
              onPress={onClose}
            >
              <Text style={[styles.modalCancel, { color: theme.primary }]}>
                Close
              </Text>
            </Pressable>
            <Text style={[styles.modalTitle, { color: theme.text }]}>
              Profile
            </Text>
            <View style={styles.modalHeaderSpacer} />
          </View>

          <ScrollView
            contentContainerStyle={styles.profileContent}
            showsVerticalScrollIndicator={false}
          >
            {friend ? (
              <View
                style={[
                  styles.profileHeaderCard,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                  },
                ]}
              >
                <FriendAvatar friend={friend} size={58} />
                <View style={styles.profileHeaderText}>
                  <Text
                    numberOfLines={1}
                    style={[styles.profileName, { color: theme.text }]}
                  >
                    {friend.friendName}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.profileSubtitle,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Active: {formatLastOpened(friend)}
                  </Text>
                </View>
              </View>
            ) : null}

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
            ) : profile ? (
              <View style={styles.profileSections}>
                <View
                  style={[
                    styles.profileSummaryCard,
                    {
                      backgroundColor: theme.tabBar,
                      borderColor: theme.tabBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.profileSummaryLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    TODAY
                  </Text>
                  <Text
                    style={[styles.profileSummaryValue, { color: theme.text }]}
                  >
                    {completionSummary.completed}/{completionSummary.total}
                  </Text>
                  <Text
                    style={[
                      styles.profileSummaryHint,
                      { color: theme.textSecondary },
                    ]}
                  >
                    visible daily habits complete
                  </Text>
                </View>

                <View
                  style={[
                    styles.profileDashboardCard,
                    {
                      backgroundColor: theme.tabBar,
                      borderColor: theme.tabBorder,
                    },
                  ]}
                >
                  {profile.categories.length > 0 ? (
                    <>
                      <FriendHeatmapDateHeader />
                      {profile.categories.map((category, index) => (
                        <FriendCategoryHeatmap
                          key={category.id}
                          category={category}
                          days={profile.dateKeys}
                          logsByHabitDate={profile.logsByHabitDate}
                          showDivider={index > 0}
                        />
                      ))}
                    </>
                  ) : (
                    <Text
                      style={[
                        styles.profileEmptyText,
                        { color: theme.textSecondary },
                      ]}
                    >
                      No shared daily habits yet.
                    </Text>
                  )}
                </View>
              </View>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function FriendHeatmapDateHeader() {
  const theme = useTheme();

  return (
    <View style={styles.profileHeatmapDateHeader}>
      <View style={styles.profileHeatmapIconSpacer} />
      <Text
        numberOfLines={1}
        style={[styles.profileHeatmapDateLabel, { color: theme.textSecondary }]}
      >
        Last 7 Days
      </Text>
    </View>
  );
}

function FriendCategoryHeatmap({
  category,
  days,
  logsByHabitDate,
  showDivider,
}: {
  category: FriendProfileCategory;
  days: string[];
  logsByHabitDate: FriendProfile["logsByHabitDate"];
  showDivider: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.profileCategoryHeatmap}>
      {showDivider ? (
        <View
          style={[
            styles.profileCategoryDivider,
            { backgroundColor: theme.tabBorder },
          ]}
        />
      ) : null}
      <Text
        style={[styles.profileCategoryLabel, { color: theme.textSecondary }]}
      >
        {category.name.toUpperCase()}
      </Text>
      {category.habits.map((habit) => (
        <FriendHabitHeatmapRow
          key={habit.id}
          days={days}
          habit={habit}
          logsByHabitDate={logsByHabitDate}
        />
      ))}
    </View>
  );
}

function FriendHabitHeatmapRow({
  days,
  habit,
  logsByHabitDate,
}: {
  days: string[];
  habit: FriendProfileHabit;
  logsByHabitDate: FriendProfile["logsByHabitDate"];
}) {
  const theme = useTheme();
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <View style={styles.profileHeatmapRow}>
      <Pressable
        accessibilityLabel={habit.name}
        accessibilityRole="button"
        hitSlop={8}
        onPress={() => setShowTooltip((current) => !current)}
        style={[
          styles.profileHeatmapIcon,
          { backgroundColor: theme.secondary },
        ]}
      >
        <GoalIcon
          iconKey={habit.iconKey}
          size={13}
          color={theme.secondaryForeground}
        />
        {showTooltip ? (
          <View
            pointerEvents="none"
            style={[
              styles.profileIconTooltip,
              {
                backgroundColor: theme.text,
                borderColor: theme.tabBorder,
              },
            ]}
          >
            <Text
              numberOfLines={2}
              style={[
                styles.profileIconTooltipText,
                { color: theme.background },
              ]}
            >
              {habit.name}
            </Text>
          </View>
        ) : null}
      </Pressable>
      <View style={styles.profileDayBlocks}>
        {days.map((day) => {
          const status = getFriendHabitStatus(habit, day, logsByHabitDate);
          return (
            <View
              key={day}
              style={[
                styles.profileDayBlock,
                {
                  backgroundColor:
                    status === "complete"
                      ? theme.primary
                      : status === "planned"
                        ? `${theme.primary}33`
                        : theme.backgroundElement,
                },
              ]}
            />
          );
        })}
      </View>
    </View>
  );
}

function getFriendHabitStatus(
  habit: FriendProfileHabit,
  dateKey: string,
  logsByHabitDate: FriendProfile["logsByHabitDate"],
) {
  const explicitStatus = logsByHabitDate[`${habit.id}_${dateKey}`];
  if (explicitStatus) return explicitStatus;
  return habit.defaultComplete ? "complete" : undefined;
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
  const isMountedRef = useRef(true);
  const [contactState, setContactState] = useState<
    "idle" | "loading" | "granted" | "denied"
  >("idle");
  const [matches, setMatches] = useState<ContactMatch[]>([]);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());
  const [addingIds, setAddingIds] = useState<Set<string>>(new Set());
  const [invite, setInvite] = useState("");

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  const confirmFindFromContacts = () => {
    Alert.alert(
      "Find friends from contacts?",
      "float will compare contact emails and phone numbers with existing float accounts. Contact identifiers are used only for this lookup and are not stored.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Continue", onPress: () => void findFromContacts() },
      ],
    );
  };

  const findFromContacts = async () => {
    setContactState("loading");
    try {
      const { status } = await Contacts.requestPermissionsAsync();
      if (!isMountedRef.current) return;
      if (status !== "granted") {
        setContactState("denied");
        return;
      }
      const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.Emails, Contacts.Fields.PhoneNumbers],
      });
      const emails: string[] = [];
      const phones: string[] = [];
      for (const contact of data) {
        for (const entry of contact.emails ?? []) {
          if (entry.email) emails.push(entry.email);
        }
        for (const entry of contact.phoneNumbers ?? []) {
          if (entry.number) phones.push(entry.number);
        }
      }
      const nextMatches = await matchContacts(emails, phones);
      if (!isMountedRef.current) return;
      setMatches(nextMatches);
      setContactState("granted");
    } catch {
      if (isMountedRef.current) {
        setContactState("granted");
        setMatches([]);
      }
    }
  };

  const addMatch = async (match: ContactMatch) => {
    if (addingIds.has(match.userId) || addedIds.has(match.userId)) return;
    setAddingIds((prev) => new Set(prev).add(match.userId));
    try {
      await addFriend(match.email);
      if (!isMountedRef.current) return;
      setAddedIds((prev) => new Set(prev).add(match.userId));
      await onAdded();
    } catch (addError) {
      if (isMountedRef.current) {
        Alert.alert(
          "Could not add friend",
          addError instanceof Error ? addError.message : "Try again.",
        );
      }
    } finally {
      if (isMountedRef.current) {
        setAddingIds((prev) => {
          const next = new Set(prev);
          next.delete(match.userId);
          return next;
        });
      }
    }
  };

  const inviteBy = (channel: "email" | "sms") => {
    const value = invite.trim();
    const body = `Hey! I'm using an app called float to build my habits. You should make a goal with me!`;
    let url: string;
    if (channel === "email") {
      const query = `subject=${encodeURIComponent(
        "Join me on float",
      )}&body=${encodeURIComponent(body)}`;
      url = `mailto:${encodeURIComponent(value)}?${query}`;
    } else {
      const separator = Platform.OS === "ios" ? "&" : "?";
      url = `sms:${encodeURIComponent(value)}${separator}body=${encodeURIComponent(body)}`;
    }
    Linking.openURL(url).catch(() => {
      Alert.alert("Could not open", "No app available to send the invite.");
    });
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
              <View style={styles.modalHeaderSpacer} />
            </View>

            <ScrollView
              contentContainerStyle={styles.addFriendContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {/* Section 1: contacts already on the app */}
              <Text style={[styles.addSectionTitle, { color: theme.text }]}>
                On float
              </Text>
              <Text style={[styles.modalHint, { color: theme.textSecondary }]}>
                Friends from your contacts who already use the app.
              </Text>

              {contactState === "idle" ? (
                <Pressable
                  onPress={confirmFindFromContacts}
                  style={({ pressed }) => [
                    styles.contactsButton,
                    { backgroundColor: theme.primary },
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={sym(
                      "person.crop.circle.badge.magnifyingglass",
                      "contacts",
                    )}
                    size={18}
                    weight="semibold"
                    tintColor={theme.primaryForeground}
                  />
                  <Text
                    style={[
                      styles.contactsButtonText,
                      { color: theme.primaryForeground },
                    ]}
                  >
                    Find friends from contacts
                  </Text>
                </Pressable>
              ) : null}

              {contactState === "loading" ? (
                <View style={styles.contactsLoading}>
                  <ActivityIndicator color={theme.primary} />
                </View>
              ) : null}

              {contactState === "denied" ? (
                <Text
                  style={[styles.modalHint, { color: theme.textSecondary }]}
                >
                  Contacts access is off. Enable it in Settings to find friends
                  who are already here.
                </Text>
              ) : null}

              {contactState === "granted" && matches.length === 0 ? (
                <Text
                  style={[styles.modalHint, { color: theme.textSecondary }]}
                >
                  None of your contacts are on float yet — invite them below.
                </Text>
              ) : null}

              {matches.map((match) => {
                const added = addedIds.has(match.userId);
                const adding = addingIds.has(match.userId);
                return (
                  <View key={match.userId} style={styles.matchRow}>
                    <View
                      style={[
                        styles.avatar,
                        {
                          width: 40,
                          height: 40,
                          borderRadius: 20,
                          backgroundColor: theme.backgroundSelected,
                        },
                      ]}
                    >
                      {match.image ? (
                        <Image
                          contentFit="cover"
                          source={{ uri: match.image }}
                          style={StyleSheet.absoluteFill}
                        />
                      ) : (
                        <Text
                          style={[styles.avatarText, { color: theme.primary }]}
                        >
                          {match.name.slice(0, 1).toUpperCase()}
                        </Text>
                      )}
                    </View>
                    <View style={styles.matchInfo}>
                      <Text
                        numberOfLines={1}
                        style={[styles.friendName, { color: theme.text }]}
                      >
                        {match.name}
                      </Text>
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.friendEmail,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {match.email}
                      </Text>
                    </View>
                    <Pressable
                      disabled={added || adding}
                      onPress={() => void addMatch(match)}
                      style={({ pressed }) => [
                        styles.matchAddButton,
                        {
                          backgroundColor: added
                            ? theme.backgroundElement
                            : theme.primary,
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      {adding ? (
                        <ActivityIndicator
                          color={theme.primaryForeground}
                          size="small"
                        />
                      ) : (
                        <Text
                          style={[
                            styles.matchAddText,
                            {
                              color: added
                                ? theme.textSecondary
                                : theme.primaryForeground,
                            },
                          ]}
                        >
                          {added ? "Requested" : "Add"}
                        </Text>
                      )}
                    </Pressable>
                  </View>
                );
              })}

              {/* Section 2: invite by email or phone */}
              <Text
                style={[
                  styles.addSectionTitle,
                  { color: theme.text, marginTop: 28 },
                ]}
              >
                Invite to float
              </Text>
              <Text style={[styles.modalHint, { color: theme.textSecondary }]}>
                Send a friend an email or text with a link to join.
              </Text>
              <TextInput
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                onChangeText={setInvite}
                placeholder="Email or phone number"
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.emailInput,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                    color: theme.text,
                  },
                ]}
                value={invite}
              />
              <View style={styles.inviteButtonRow}>
                <Pressable
                  onPress={() => inviteBy("email")}
                  style={({ pressed }) => [
                    styles.inviteButton,
                    { borderColor: theme.primary },
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={sym("envelope.fill", "mail")}
                    size={17}
                    weight="semibold"
                    tintColor={theme.primary}
                  />
                  <Text
                    style={[styles.inviteButtonText, { color: theme.primary }]}
                  >
                    Email
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => inviteBy("sms")}
                  style={({ pressed }) => [
                    styles.inviteButton,
                    { borderColor: theme.primary },
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={sym("message.fill", "sms")}
                    size={17}
                    weight="semibold"
                    tintColor={theme.primary}
                  />
                  <Text
                    style={[styles.inviteButtonText, { color: theme.primary }]}
                  >
                    Message
                  </Text>
                </Pressable>
              </View>
            </ScrollView>
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
  profileModalScreen: { flex: 1 },
  profileModalSafeArea: { flex: 1 },
  profileContent: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 34,
    gap: 14,
  },
  profileHeaderCard: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 12,
  },
  profileHeaderText: { flex: 1, minWidth: 0, gap: 2 },
  profileName: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  profileSubtitle: { fontSize: 13, fontWeight: "500" },
  profileSections: { gap: 12 },
  profileSummaryCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  profileSummaryLabel: {
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  profileSummaryValue: {
    marginTop: 2,
    fontSize: 30,
    lineHeight: 34,
    fontWeight: "900",
    letterSpacing: -0.5,
  },
  profileSummaryHint: { marginTop: 1, fontSize: 13, fontWeight: "500" },
  profileDashboardCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    overflow: "visible",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  profileEmptyText: {
    paddingVertical: 30,
    textAlign: "center",
    fontSize: 13,
    fontWeight: "500",
  },
  profileHeatmapDateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
    paddingTop: 2,
    paddingBottom: 3,
  },
  profileHeatmapIconSpacer: { width: 26 },
  profileHeatmapDateLabel: {
    flex: 1,
    minWidth: 0,
    textAlign: "center",
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "800",
  },
  profileCategoryHeatmap: {
    gap: 5,
    paddingHorizontal: 4,
    paddingVertical: 10,
  },
  profileCategoryDivider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  profileCategoryLabel: {
    marginBottom: 2,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  profileHeatmapRow: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    overflow: "visible",
  },
  profileHeatmapIcon: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    position: "relative",
    zIndex: 10,
    elevation: 10,
  },
  profileIconTooltip: {
    position: "absolute",
    left: 30,
    top: -6,
    zIndex: 20,
    elevation: 20,
    minWidth: 96,
    maxWidth: 160,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  profileIconTooltipText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
  profileDayBlocks: {
    flex: 1,
    flexDirection: "row",
    gap: 3,
    zIndex: 0,
  },
  profileDayBlock: {
    flex: 1,
    height: 28,
    borderRadius: 7,
  },
  emailInput: {
    height: 50,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    paddingHorizontal: 14,
    fontSize: 16,
  },
  modalHint: { paddingHorizontal: 4, fontSize: 12, lineHeight: 17 },
  modalHeaderSpacer: { width: 52 },
  addFriendContent: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 10,
  },
  addSectionTitle: {
    paddingHorizontal: 4,
    fontSize: 17,
    fontWeight: "800",
    letterSpacing: -0.2,
  },
  contactsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 48,
    borderRadius: 14,
    marginTop: 4,
  },
  contactsButtonText: { fontSize: 15, fontWeight: "700" },
  contactsLoading: { paddingVertical: 20, alignItems: "center" },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 8,
  },
  matchInfo: { flex: 1, gap: 2 },
  matchAddButton: {
    minWidth: 84,
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  matchAddText: { fontSize: 14, fontWeight: "800" },
  inviteButtonRow: { flexDirection: "row", gap: 10, marginTop: 4 },
  inviteButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  inviteButtonText: { fontSize: 15, fontWeight: "700" },
});
