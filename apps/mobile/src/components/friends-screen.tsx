import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { Image } from "expo-image";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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

import { BrandedEmptyState } from "@/components/branded-empty-state";
import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import {
  getCachedData,
  isCacheFresh,
  setCachedData,
} from "@/lib/app-data-cache";
import {
  type FriendGroupRow,
  type FriendRow,
  type FriendSearchResult,
  acceptFriendRequest,
  addFriend,
  archiveFriend,
  createFriendGroup,
  fetchFriendGroups,
  fetchFriends,
  searchFriendUsers,
  sendFriendNudge,
  updateFriendGroup,
} from "@/lib/friends-client";
import { playSelectionHaptic, playSuccessHaptic } from "@/lib/haptics";

type SymbolName = SymbolViewProps["name"];
type FriendsSection = "suggested" | "friends" | "groups";
type FriendsSortMode = "recent" | "mutual" | "birthday";
type FriendsScreenCache = {
  friendGroups: FriendGroupRow[];
  friends: FriendRow[];
};

const FRIENDS_SCREEN_CACHE_KEY = "screen:friends:v2";
const INVITE_LINK = "https://higher-habits.vercel.app";
const FRIENDS_SECTIONS: Array<{ key: FriendsSection; label: string }> = [
  { key: "friends", label: "My Friends" },
  { key: "suggested", label: "Suggested friends" },
  { key: "groups", label: "Groups" },
];
const FRIENDS_SORT_LABELS: Record<FriendsSortMode, string> = {
  recent: "Recent activity",
  mutual: "Mutual friends",
  birthday: "Birthday",
};

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function normalizeSmsRecipient(value: string) {
  return value.trim().replace(/[^\d+.-]/g, "");
}

function buildSmsUrl(recipients: string[]) {
  const normalizedRecipients = recipients
    .map(normalizeSmsRecipient)
    .filter(Boolean);
  const encodedRecipients = normalizedRecipients
    .map((recipient) => encodeURIComponent(recipient))
    .join(",");

  if (Platform.OS === "ios" && normalizedRecipients.length > 1) {
    return `sms://open?addresses=${encodedRecipients}`;
  }

  return `sms:${encodedRecipients}`;
}

export function FriendsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const tabBarHeight = useTabBarHeight();
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const cachedScreen = getCachedData<FriendsScreenCache>(
    FRIENDS_SCREEN_CACHE_KEY,
  );
  const [friends, setFriends] = useState<FriendRow[]>(
    cachedScreen?.data.friends ?? [],
  );
  const [friendGroups, setFriendGroups] = useState<FriendGroupRow[]>(
    cachedScreen?.data.friendGroups ?? [],
  );
  const [search, setSearch] = useState("");
  const [activeSection, setActiveSection] = useState<FriendsSection>("friends");
  const [friendsSortMode, setFriendsSortMode] =
    useState<FriendsSortMode>("birthday");
  const [isLoading, setIsLoading] = useState(!cachedScreen);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isCreateGroupOpen, setIsCreateGroupOpen] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [acceptingFriendshipId, setAcceptingFriendshipId] = useState<
    string | null
  >(null);
  const [unsendingFriendshipId, setUnsendingFriendshipId] = useState<
    string | null
  >(null);
  const [nudgingFriendshipId, setNudgingFriendshipId] = useState<string | null>(
    null,
  );

  const load = useCallback(async (refresh = false) => {
    const requestId = ++loadRequestIdRef.current;
    const cached = getCachedData<FriendsScreenCache>(FRIENDS_SCREEN_CACHE_KEY);
    if (!refresh && cached) {
      setFriends(cached.data.friends);
      setFriendGroups(cached.data.friendGroups);
      setIsLoading(false);
      if (isCacheFresh(cached)) return;
    }
    refresh ? setIsRefreshing(true) : setIsLoading(!cached);
    try {
      const [nextFriends, nextFriendGroups] = await Promise.all([
        fetchFriends(),
        fetchFriendGroups().catch(() => []),
      ]);
      if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
        return;
      }
      setCachedData(FRIENDS_SCREEN_CACHE_KEY, {
        friendGroups: nextFriendGroups,
        friends: nextFriends,
      });
      setFriends(nextFriends);
      setFriendGroups(nextFriendGroups);
      setError(null);
    } catch (loadError) {
      if (isMountedRef.current && requestId === loadRequestIdRef.current) {
        if (!cached) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load friends.",
          );
        }
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
        .sort((left, right) => sortFriends(left, right, friendsSortMode)),
    [friends, friendsSortMode],
  );
  const editingGroup = useMemo(
    () =>
      editingGroupId
        ? (friendGroups.find((group) => group.id === editingGroupId) ?? null)
        : null,
    [editingGroupId, friendGroups],
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
    Linking.openURL(buildSmsUrl([phone])).catch(() => {
      Alert.alert("Could not open", "No messaging app is available.");
    });
  };

  const inviteBy = (channel: "email" | "sms") => {
    const body = `Join me on float so we can build habits together: ${INVITE_LINK}`;
    let url: string;
    if (channel === "email") {
      const query = `subject=${encodeURIComponent(
        "Join me on float",
      )}&body=${encodeURIComponent(body)}`;
      url = `mailto:?${query}`;
    } else {
      const separator = Platform.OS === "ios" ? "&" : "?";
      url = `sms:${separator}body=${encodeURIComponent(body)}`;
    }
    Linking.openURL(url).catch(() => {
      Alert.alert("Could not open", "No app available to send the invite.");
    });
  };

  const openInviteOptions = () => {
    playSelectionHaptic();
    Alert.alert("Invite to float", "Choose how you want to send the invite.", [
      { text: "Email", onPress: () => inviteBy("email") },
      { text: "Text", onPress: () => inviteBy("sms") },
      { text: "Cancel", style: "cancel" },
    ]);
  };
  const openSortOptions = () => {
    playSelectionHaptic();
    Alert.alert("Sort friends", "Choose how to order your friends.", [
      {
        text: FRIENDS_SORT_LABELS.recent,
        onPress: () => setFriendsSortMode("recent"),
      },
      {
        text: FRIENDS_SORT_LABELS.mutual,
        onPress: () => setFriendsSortMode("mutual"),
      },
      {
        text: "Days until birthday",
        onPress: () => setFriendsSortMode("birthday"),
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const nudgeFriend = async (friend: FriendRow) => {
    if (nudgingFriendshipId) return;
    setNudgingFriendshipId(friend.id);
    try {
      await sendFriendNudge(friend.id, "Keep going. You got this.");
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
  };

  const acceptRequest = async (friend: FriendRow) => {
    setAcceptingFriendshipId(friend.id);
    try {
      await acceptFriendRequest(friend.id);
      playSuccessHaptic();
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

  const unsendRequest = async (friend: FriendRow) => {
    setUnsendingFriendshipId(friend.id);
    try {
      await archiveFriend(friend.id);
      playSuccessHaptic();
      if (!isMountedRef.current) return;
      await load();
    } catch (unsendError) {
      if (isMountedRef.current) {
        Alert.alert(
          "Could not unsend request",
          unsendError instanceof Error ? unsendError.message : "Try again.",
        );
      }
    } finally {
      if (isMountedRef.current) setUnsendingFriendshipId(null);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView
          canCancelContentTouches
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarHeight + 16 },
          ]}
          directionalLockEnabled
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
                <Text style={[styles.pageTitle, { color: theme.text }]}>
                  Friends
                </Text>
                <FriendsSectionTabs
                  activeSection={activeSection}
                  onChange={(section) => {
                    playSelectionHaptic();
                    setActiveSection(section);
                  }}
                />
              </View>
            </View>
          </View>

          {activeSection === "friends" ? (
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
                accessibilityLabel={`Sort friends by ${FRIENDS_SORT_LABELS[friendsSortMode]}`}
                onPress={openSortOptions}
                style={({ pressed }) => [
                  styles.addButton,
                  { backgroundColor: theme.backgroundElement },
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={sym("arrow.up.arrow.down", "sort")}
                  size={17}
                  weight="semibold"
                  tintColor={theme.primary}
                />
                <Text style={[styles.addButtonText, { color: theme.primary }]}>
                  Sort
                </Text>
              </Pressable>
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
              <FloatingLogoLoader />
            </View>
          ) : activeSection === "suggested" ? (
            <View style={styles.section}>
              <FriendSearchInline
                action={
                  <SectionActionButton
                    icon={sym("square.and.arrow.up", "ios_share")}
                    label="Invite"
                    onPress={openInviteOptions}
                  />
                }
                onAdded={async () => {
                  if (!isMountedRef.current) return;
                  await load();
                }}
                onOpenProfile={(result) =>
                  router.push({
                    pathname: "/friend-profile",
                    params: {
                      friendId: result.id,
                      initialName: result.name,
                      ...(result.image ? { initialImage: result.image } : {}),
                      privateProfile: "true",
                    },
                  })
                }
              />
            </View>
          ) : activeSection === "groups" ? (
            <View style={styles.section}>
              <SectionHeader
                action={
                  <SectionActionButton
                    disabled={acceptedFriends.length === 0}
                    icon={sym("person.3.fill", "groups")}
                    label="Create Group"
                    onPress={() => {
                      setEditingGroupId(null);
                      setIsCreateGroupOpen(true);
                    }}
                  />
                }
                title="Groups"
                count={friendGroups.length}
              />
              {friendGroups.length > 0 ? (
                <View style={styles.groupList}>
                  {friendGroups.map((group) => (
                    <FriendGroupCard
                      key={group.id}
                      group={group}
                      onEdit={() => {
                        setEditingGroupId(group.id);
                        setIsCreateGroupOpen(true);
                      }}
                    />
                  ))}
                </View>
              ) : (
                <EmptyGroupsState
                  canCreate={acceptedFriends.length > 0}
                  onCreate={() => {
                    setEditingGroupId(null);
                    setIsCreateGroupOpen(true);
                  }}
                />
              )}
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
                        isUnsending={unsendingFriendshipId === friend.id}
                        onAccept={() => void acceptRequest(friend)}
                        onUnsend={() => void unsendRequest(friend)}
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
                        isNudging={nudgingFriendshipId === friend.id}
                        sortMode={friendsSortMode}
                        onMessage={() => messageFriend(friend)}
                        onNudge={() => void nudgeFriend(friend)}
                        onOpenProfile={() =>
                          router.push({
                            pathname: "/friend-profile",
                            params: { friendshipId: friend.id },
                          })
                        }
                      />
                    ))}
                  </View>
                ) : (
                  <EmptyFriendsState hasSearch={Boolean(search)} />
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
      <CreateGroupModal
        key={editingGroup?.id ?? "create-group"}
        group={editingGroup}
        friends={acceptedFriends}
        visible={isCreateGroupOpen}
        onClose={() => {
          setIsCreateGroupOpen(false);
          setEditingGroupId(null);
        }}
        onSaved={(group) => {
          setFriendGroups((prev) => {
            const exists = prev.some((item) => item.id === group.id);
            const nextFriendGroups = (
              exists
                ? prev.map((item) => (item.id === group.id ? group : item))
                : [...prev, group]
            ).sort((left, right) => left.name.localeCompare(right.name));
            setCachedData(FRIENDS_SCREEN_CACHE_KEY, {
              friendGroups: nextFriendGroups,
              friends,
            });
            return nextFriendGroups;
          });
          setIsCreateGroupOpen(false);
          setEditingGroupId(null);
        }}
      />
    </View>
  );
}

function SectionHeader({
  action,
  title,
  count,
}: {
  action?: ReactNode;
  title: string;
  count: number;
}) {
  const theme = useTheme();

  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionTitleRow}>
        <Text style={[styles.sectionTitle, { color: theme.text }]}>
          {title}
        </Text>
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
      {action}
    </View>
  );
}

function SectionActionButton({
  disabled = false,
  icon,
  label,
  onPress,
}: {
  disabled?: boolean;
  icon: SymbolName;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityLabel={label}
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.sectionActionButton,
        {
          backgroundColor: theme.backgroundElement,
        },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      <SymbolView
        name={icon}
        size={15}
        weight="bold"
        tintColor={disabled ? theme.textSecondary : theme.primary}
      />
      <Text
        style={[
          styles.sectionActionButtonText,
          {
            color: disabled ? theme.textSecondary : theme.primary,
          },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function FriendsSectionTabs({
  activeSection,
  onChange,
}: {
  activeSection: FriendsSection;
  onChange: (section: FriendsSection) => void;
}) {
  const theme = useTheme();

  return (
    <View style={styles.sectionTabs}>
      {FRIENDS_SECTIONS.map((section) => {
        const isActive = section.key === activeSection;

        return (
          <Pressable
            key={section.key}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(section.key)}
            style={({ pressed }) => [
              styles.sectionTab,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.sectionTabText,
                { color: isActive ? theme.text : theme.textSecondary },
              ]}
            >
              {section.label}
            </Text>
            <View
              style={[
                styles.sectionTabIndicator,
                { backgroundColor: isActive ? theme.primary : "transparent" },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

function FriendCard({
  friend,
  isNudging,
  sortMode,
  onMessage,
  onNudge,
  onOpenProfile,
}: {
  friend: FriendRow;
  isNudging: boolean;
  sortMode: FriendsSortMode;
  onMessage: () => void;
  onNudge: () => void;
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
        <Pressable
          accessibilityLabel={`Open ${friend.friendName}'s profile`}
          accessibilityRole="button"
          hitSlop={6}
          onPress={onOpenProfile}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Text
            numberOfLines={1}
            style={[styles.friendName, { color: theme.text }]}
          >
            {friend.friendName}
          </Text>
        </Pressable>
        <Text
          numberOfLines={1}
          style={[styles.friendActive, { color: theme.textSecondary }]}
        >
          {formatFriendMeta(friend, sortMode)}
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
      <Pressable
        accessibilityLabel={`Nudge ${friend.friendName}`}
        disabled={isNudging}
        hitSlop={8}
        onPress={onNudge}
        style={({ pressed }) => [
          styles.messageButton,
          { backgroundColor: theme.backgroundElement },
          pressed && styles.pressed,
        ]}
      >
        {isNudging ? (
          <ActivityIndicator color={theme.primary} size="small" />
        ) : (
          <SymbolView
            name={sym("hand.tap.fill", "touch_app")}
            size={18}
            weight="semibold"
            tintColor={theme.primary}
          />
        )}
      </Pressable>
    </View>
  );
}

function FriendGroupCard({
  group,
  onEdit,
}: {
  group: FriendGroupRow;
  onEdit: () => void;
}) {
  const theme = useTheme();

  const messageGroup = () => {
    const phones = group.members
      .map((member) => member.phoneNumber?.trim())
      .filter((phone): phone is string => Boolean(phone));

    if (phones.length === 0) {
      Alert.alert(
        "No phone numbers",
        "None of this group's members have phone numbers yet.",
      );
      return;
    }

    Linking.openURL(buildSmsUrl(phones)).catch(() => {
      Alert.alert("Could not open", "No messaging app is available.");
    });
  };

  return (
    <Pressable
      accessibilityLabel={`Edit ${group.name}`}
      accessibilityRole="button"
      onPress={onEdit}
      style={[
        styles.groupCard,
        { backgroundColor: theme.background, borderColor: theme.tabBorder },
      ]}
    >
      <View style={styles.groupAvatarStack}>
        {group.members.slice(0, 3).map((member, index) => (
          <View
            key={member.id}
            style={[styles.groupAvatarOffset, { left: index * 18 }]}
          >
            <GroupMemberAvatar member={member} size={34} />
          </View>
        ))}
      </View>
      <View style={styles.friendIdentity}>
        <Text
          numberOfLines={1}
          style={[styles.friendName, { color: theme.text }]}
        >
          {group.name}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.friendActive, { color: theme.textSecondary }]}
        >
          {group.members.length}{" "}
          {group.members.length === 1 ? "member" : "members"}
        </Text>
      </View>
      <Pressable
        accessibilityLabel={`Message ${group.name}`}
        hitSlop={8}
        onPress={(event) => {
          event.stopPropagation();
          messageGroup();
        }}
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
    </Pressable>
  );
}

function GroupMemberAvatar({
  member,
  size,
}: {
  member: FriendGroupRow["members"][number];
  size: number;
}) {
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
          borderColor: theme.background,
          borderWidth: 2,
        },
      ]}
    >
      {member.image ? (
        <Image
          contentFit="cover"
          source={{ uri: member.image }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <Text style={[styles.avatarText, { color: theme.primary }]}>
          {member.name.slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

function PendingFriendRow({
  friend,
  isAccepting,
  isUnsending,
  onAccept,
  onUnsend,
}: {
  friend: FriendRow;
  isAccepting: boolean;
  isUnsending: boolean;
  onAccept: () => void;
  onUnsend: () => void;
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
            { backgroundColor: theme.backgroundElement },
            pressed && styles.pressed,
          ]}
        >
          {isAccepting ? (
            <ActivityIndicator color={theme.primary} size="small" />
          ) : (
            <Text
              style={[
                styles.acceptButtonText,
                { color: theme.primary },
              ]}
            >
              Accept
            </Text>
          )}
        </Pressable>
      ) : (
        <Pressable
          accessibilityLabel={`Unsend friend request to ${friend.friendName}`}
          disabled={isUnsending}
          onPress={onUnsend}
          style={({ pressed }) => [
            styles.pendingBadge,
            { backgroundColor: theme.backgroundSelected },
            pressed && styles.pressed,
          ]}
        >
          {isUnsending ? (
            <ActivityIndicator color={theme.textSecondary} size="small" />
          ) : (
            <Text
              style={[styles.pendingBadgeText, { color: theme.textSecondary }]}
            >
              Unsend
            </Text>
          )}
        </Pressable>
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

function FriendSearchInline({
  action,
  onAdded,
  onOpenProfile,
}: {
  action?: ReactNode;
  onAdded: () => Promise<void>;
  onOpenProfile: (result: FriendSearchResult) => void;
}) {
  const theme = useTheme();
  const isMountedRef = useRef(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([]);
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [requestingIds, setRequestingIds] = useState<Set<string>>(new Set());

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    const query = searchQuery.trim();
    const shouldSearch = query.length === 0 || query.length >= 2;

    let active = true;
    setSearchError(null);
    if (!shouldSearch) {
      setSearchResults([]);
      setSearchState("ready");
      return;
    }

    setSearchState("loading");

    const timeout = setTimeout(() => {
      searchFriendUsers(query)
        .then((results) => {
          if (!active || !isMountedRef.current) return;
          setSearchResults(results);
          setSearchState("ready");
        })
        .catch((error) => {
          if (!active || !isMountedRef.current) return;
          setSearchResults([]);
          setSearchError(
            error instanceof Error ? error.message : "Could not search users.",
          );
          setSearchState("error");
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [searchQuery]);

  const addSearchResult = async (result: FriendSearchResult) => {
    if (requestingIds.has(result.id) || requestedIds.has(result.id)) return;
    setRequestingIds((prev) => new Set(prev).add(result.id));
    try {
      await addFriend(result.email);
      if (!isMountedRef.current) return;
      playSuccessHaptic();
      setRequestedIds((prev) => new Set(prev).add(result.id));
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
        setRequestingIds((prev) => {
          const next = new Set(prev);
          next.delete(result.id);
          return next;
        });
      }
    }
  };

  return (
    <View style={styles.addFriendSection}>
      <View style={styles.inlineSectionHeader}>
        <Text
          numberOfLines={1}
          style={[
            styles.addSectionTitle,
            styles.inlineTitle,
            { color: theme.text },
          ]}
        >
          Find friends
        </Text>
        {action}
      </View>

      <View
        style={[
          styles.friendSearchWrap,
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
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          onChangeText={setSearchQuery}
          placeholder="Search name or email"
          placeholderTextColor={theme.textSecondary}
          returnKeyType="search"
          style={[styles.friendSearchInput, { color: theme.text }]}
          value={searchQuery}
        />
        {searchState === "loading" ? (
          <ActivityIndicator color={theme.primary} size="small" />
        ) : null}
      </View>

      {searchQuery.trim().length > 0 && searchQuery.trim().length < 2 ? (
        <Text style={[styles.inlineHelpText, { color: theme.textSecondary }]}>
          Type at least 2 characters.
        </Text>
      ) : null}

      {searchState === "error" ? (
        <Text style={[styles.inlineHelpText, { color: "#C75055" }]}>
          {searchError ?? "Could not search users."}
        </Text>
      ) : null}

      {searchState === "ready" && searchResults.length === 0 ? (
        <Text style={[styles.inlineHelpText, { color: theme.textSecondary }]}>
          {searchQuery.trim()
            ? "No matching float users."
            : "No other float users yet."}
        </Text>
      ) : null}

      {searchResults.length > 0 ? (
        <Text
          style={[styles.suggestedUsersLabel, { color: theme.textSecondary }]}
        >
          {searchQuery.trim() ? "Search results" : "People on float"}
        </Text>
      ) : null}

      {searchResults.map((result) => {
        const requested = requestedIds.has(result.id);
        const requesting = requestingIds.has(result.id);
        return (
          <View key={result.id} style={styles.matchRow}>
            <Pressable
              accessibilityLabel={`Open ${result.name}'s profile`}
              accessibilityRole="button"
              onPress={() => onOpenProfile(result)}
              style={({ pressed }) => [
                styles.matchProfileButton,
                pressed && styles.pressed,
              ]}
            >
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
                {result.image ? (
                  <Image
                    contentFit="cover"
                    source={{ uri: result.image }}
                    style={StyleSheet.absoluteFill}
                  />
                ) : (
                  <Text style={[styles.avatarText, { color: theme.primary }]}>
                    {result.name.slice(0, 1).toUpperCase()}
                  </Text>
                )}
              </View>
              <View style={styles.matchInfo}>
                <Text
                  numberOfLines={1}
                  style={[styles.friendName, { color: theme.text }]}
                >
                  {result.name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.friendEmail, { color: theme.textSecondary }]}
                >
                  {formatMutualFriendCount(result.mutualFriendCount)}
                </Text>
              </View>
            </Pressable>
            <Pressable
              disabled={requested || requesting}
              onPress={() => void addSearchResult(result)}
              style={({ pressed }) => [
                styles.matchAddButton,
                {
                  backgroundColor: theme.backgroundElement,
                },
                pressed && styles.pressed,
              ]}
            >
              {requesting ? (
                <ActivityIndicator color={theme.primary} size="small" />
              ) : (
                <Text
                  style={[
                    styles.matchAddText,
                    {
                      color: requested ? theme.textSecondary : theme.primary,
                    },
                  ]}
                >
                  {requested ? "Requested" : "Add"}
                </Text>
              )}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

function EmptyGroupsState({
  canCreate,
  onCreate,
}: {
  canCreate: boolean;
  onCreate: () => void;
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
      <BrandedEmptyState
        compact
        title="No groups yet"
        description={
          canCreate
            ? "Create a group for the friends you check in with most."
            : "Add friends before creating a group."
        }
      />
      <Pressable
        disabled={!canCreate}
        onPress={onCreate}
        style={({ pressed }) => [
          styles.emptyButton,
          { backgroundColor: theme.backgroundElement },
          !canCreate && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <Text
          style={[
            styles.emptyButtonText,
            {
              color: canCreate ? theme.primary : theme.textSecondary,
            },
          ]}
        >
          Create Group
        </Text>
      </Pressable>
    </View>
  );
}

function EmptyFriendsState({
  hasSearch,
}: {
  hasSearch: boolean;
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
      {hasSearch ? (
        <>
          <SymbolView
            name={sym("magnifyingglass", "search")}
            size={28}
            weight="semibold"
            tintColor={theme.primary}
          />
          <Text style={[styles.emptyTitle, { color: theme.text }]}>
            No matching friends
          </Text>
          <Text style={[styles.emptyText, { color: theme.textSecondary }]}>
            Try another name or email.
          </Text>
        </>
      ) : (
        <BrandedEmptyState
          compact
          title="No friends yet"
          description="Suggested friends will help you find people on float."
        />
      )}
    </View>
  );
}

function CreateGroupModal({
  friends,
  group,
  visible,
  onClose,
  onSaved,
}: {
  friends: FriendRow[];
  group: FriendGroupRow | null;
  visible: boolean;
  onClose: () => void;
  onSaved: (group: FriendGroupRow) => void;
}) {
  const theme = useTheme();
  const [name, setName] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);
  const isEditing = Boolean(group);
  const canSave = name.trim().length > 0 && selectedIds.size > 0 && !isSaving;

  useEffect(() => {
    if (visible) {
      setName(group?.name ?? "");
      setSelectedIds(new Set(group?.members.map((member) => member.id) ?? []));
      setIsSaving(false);
      return;
    }

    if (!visible) {
      setName("");
      setSelectedIds(new Set());
      setIsSaving(false);
    }
  }, [group, visible]);

  const toggleFriend = (friendId: string) => {
    playSelectionHaptic();
    setSelectedIds((current) => {
      const next = new Set(current);
      next.has(friendId) ? next.delete(friendId) : next.add(friendId);
      return next;
    });
  };

  const saveGroup = async () => {
    if (!canSave) return;
    setIsSaving(true);
    try {
      const savedGroup = group
        ? await updateFriendGroup({
            id: group.id,
            name: name.trim(),
            memberIds: [...selectedIds],
          })
        : await createFriendGroup({
            name: name.trim(),
            memberIds: [...selectedIds],
          });
      playSuccessHaptic();
      onSaved(savedGroup);
    } catch (saveError) {
      Alert.alert(
        isEditing ? "Could not update group" : "Could not create group",
        saveError instanceof Error ? saveError.message : "Try again.",
      );
    } finally {
      setIsSaving(false);
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
                hitSlop={12}
                onPress={onClose}
              >
                <Text style={[styles.modalCancel, { color: theme.primary }]}>
                  Cancel
                </Text>
              </Pressable>
              <Text style={[styles.modalTitle, { color: theme.text }]}>
                {isEditing ? `Edit ${group?.name ?? "Group"}` : "Create Group"}
              </Text>
              <Pressable
                accessibilityLabel={isEditing ? "Save group" : "Create group"}
                disabled={!canSave}
                hitSlop={12}
                onPress={() => void saveGroup()}
              >
                <Text
                  style={[
                    styles.modalAdd,
                    { color: canSave ? theme.primary : theme.textSecondary },
                  ]}
                >
                  {isSaving ? "Saving" : isEditing ? "Save Changes" : "Create"}
                </Text>
              </Pressable>
            </View>

            <ScrollView
              canCancelContentTouches
              contentContainerStyle={styles.addFriendContent}
              directionalLockEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Text style={[styles.addSectionTitle, { color: theme.text }]}>
                Group name
              </Text>
              <TextInput
                accessibilityLabel="Group name"
                autoCapitalize="words"
                autoCorrect
                onChangeText={setName}
                placeholder="Family, study group, roommates..."
                placeholderTextColor={theme.textSecondary}
                style={[
                  styles.emailInput,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                    color: theme.text,
                  },
                ]}
                value={name}
              />

              <Text style={[styles.addSectionTitle, { color: theme.text }]}>
                Members
              </Text>
              <Text style={[styles.modalHint, { color: theme.textSecondary }]}>
                Pick friends for feed filters, group chats, and shared goal
                shortcuts.
              </Text>

              <View style={styles.selectionList}>
                {friends.map((friend) => {
                  const selected = selectedIds.has(friend.friendId);
                  return (
                    <Pressable
                      key={friend.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      onPress={() => toggleFriend(friend.friendId)}
                      style={({ pressed }) => [
                        styles.selectionRow,
                        {
                          backgroundColor: selected
                            ? `${theme.primary}18`
                            : theme.background,
                          borderColor: selected
                            ? theme.primary
                            : theme.tabBorder,
                        },
                        pressed && styles.pressed,
                      ]}
                    >
                      <FriendAvatar friend={friend} size={42} />
                      <View style={styles.friendIdentity}>
                        <Text
                          numberOfLines={1}
                          style={[styles.friendName, { color: theme.text }]}
                        >
                          {friend.friendName}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.friendEmail,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {friend.friendEmail}
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.checkCircle,
                          {
                            backgroundColor: selected
                              ? theme.primary
                              : theme.backgroundElement,
                          },
                        ]}
                      >
                        {selected ? (
                          <SymbolView
                            name={sym("checkmark", "check")}
                            size={15}
                            weight="bold"
                            tintColor={theme.primaryForeground}
                          />
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<FriendSearchResult[]>([]);
  const [searchState, setSearchState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [searchError, setSearchError] = useState<string | null>(null);
  const [requestedIds, setRequestedIds] = useState<Set<string>>(new Set());
  const [requestingIds, setRequestingIds] = useState<Set<string>>(new Set());

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  useEffect(() => {
    if (visible) return;
    setSearchQuery("");
    setSearchResults([]);
    setSearchState("idle");
    setSearchError(null);
    setRequestedIds(new Set());
    setRequestingIds(new Set());
  }, [visible]);

  useEffect(() => {
    if (!visible) return;

    const query = searchQuery.trim();
    const shouldSearch = query.length === 0 || query.length >= 2;

    let active = true;
    setSearchError(null);
    if (!shouldSearch) {
      setSearchResults([]);
      setSearchState("ready");
      return;
    }

    setSearchState("loading");

    const timeout = setTimeout(() => {
      searchFriendUsers(query)
        .then((results) => {
          if (!active || !isMountedRef.current) return;
          setSearchResults(results);
          setSearchState("ready");
        })
        .catch((error) => {
          if (!active || !isMountedRef.current) return;
          setSearchResults([]);
          setSearchError(
            error instanceof Error ? error.message : "Could not search users.",
          );
          setSearchState("error");
        });
    }, 250);

    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, [searchQuery, visible]);

  const addSearchResult = async (result: FriendSearchResult) => {
    if (requestingIds.has(result.id) || requestedIds.has(result.id)) return;
    setRequestingIds((prev) => new Set(prev).add(result.id));
    try {
      await addFriend(result.email);
      if (!isMountedRef.current) return;
      playSuccessHaptic();
      setRequestedIds((prev) => new Set(prev).add(result.id));
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
        setRequestingIds((prev) => {
          const next = new Set(prev);
          next.delete(result.id);
          return next;
        });
      }
    }
  };

  const inviteBy = (channel: "email" | "sms") => {
    const body = `Join me on float so we can build habits together: ${INVITE_LINK}`;
    let url: string;
    if (channel === "email") {
      const query = `subject=${encodeURIComponent(
        "Join me on float",
      )}&body=${encodeURIComponent(body)}`;
      url = `mailto:?${query}`;
    } else {
      const separator = Platform.OS === "ios" ? "&" : "?";
      url = `sms:${separator}body=${encodeURIComponent(body)}`;
    }
    Linking.openURL(url).catch(() => {
      Alert.alert("Could not open", "No app available to send the invite.");
    });
  };

  const openInviteOptions = () => {
    playSelectionHaptic();
    Alert.alert("Invite to float", "Choose how you want to send the invite.", [
      { text: "Email", onPress: () => inviteBy("email") },
      { text: "Text", onPress: () => inviteBy("sms") },
      { text: "Cancel", style: "cancel" },
    ]);
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
              <Pressable
                accessibilityLabel="Share invite"
                accessibilityRole="button"
                hitSlop={12}
                onPress={openInviteOptions}
                style={({ pressed }) => [
                  styles.modalIconButton,
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={sym("square.and.arrow.up", "ios_share")}
                  size={22}
                  weight="semibold"
                  tintColor={theme.primary}
                />
              </Pressable>
            </View>

            <ScrollView
              canCancelContentTouches
              contentContainerStyle={styles.addFriendContent}
              directionalLockEnabled
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.addFriendSection}>
                <Text style={[styles.addSectionTitle, { color: theme.text }]}>
                  Find friends
                </Text>

                <View
                  style={[
                    styles.friendSearchWrap,
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
                    autoCapitalize="none"
                    autoCorrect={false}
                    clearButtonMode="while-editing"
                    onChangeText={setSearchQuery}
                    placeholder="Search name or email"
                    placeholderTextColor={theme.textSecondary}
                    returnKeyType="search"
                    style={[styles.friendSearchInput, { color: theme.text }]}
                    value={searchQuery}
                  />
                  {searchState === "loading" ? (
                    <ActivityIndicator color={theme.primary} size="small" />
                  ) : null}
                </View>

                {searchQuery.trim().length > 0 &&
                searchQuery.trim().length < 2 ? (
                  <Text
                    style={[
                      styles.inlineHelpText,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Type at least 2 characters.
                  </Text>
                ) : null}

                {searchState === "error" ? (
                  <Text style={[styles.inlineHelpText, { color: "#C75055" }]}>
                    {searchError ?? "Could not search users."}
                  </Text>
                ) : null}

                {searchState === "ready" && searchResults.length === 0 ? (
                  <Text
                    style={[
                      styles.inlineHelpText,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {searchQuery.trim()
                      ? "No matching float users."
                      : "No other float users yet."}
                  </Text>
                ) : null}

                {searchResults.length > 0 ? (
                  <Text
                    style={[
                      styles.suggestedUsersLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {searchQuery.trim() ? "Search results" : "People on float"}
                  </Text>
                ) : null}

                {searchResults.map((result) => {
                  const requested = requestedIds.has(result.id);
                  const requesting = requestingIds.has(result.id);
                  return (
                    <View key={result.id} style={styles.matchRow}>
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
                        {result.image ? (
                          <Image
                            contentFit="cover"
                            source={{ uri: result.image }}
                            style={StyleSheet.absoluteFill}
                          />
                        ) : (
                          <Text
                            style={[
                              styles.avatarText,
                              { color: theme.primary },
                            ]}
                          >
                            {result.name.slice(0, 1).toUpperCase()}
                          </Text>
                        )}
                      </View>
                      <View style={styles.matchInfo}>
                        <Text
                          numberOfLines={1}
                          style={[styles.friendName, { color: theme.text }]}
                        >
                          {result.name}
                        </Text>
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.friendEmail,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {result.email}
                        </Text>
                        {result.mutualFriendCount > 0 ? (
                          <Text
                            numberOfLines={1}
                            style={[
                              styles.mutualFriendText,
                              { color: theme.primary },
                            ]}
                          >
                            {result.mutualFriendCount === 1
                              ? "1 mutual friend"
                              : `${result.mutualFriendCount} mutual friends`}
                          </Text>
                        ) : null}
                      </View>
                      <Pressable
                        disabled={requested || requesting}
                        onPress={() => void addSearchResult(result)}
                        style={({ pressed }) => [
                          styles.matchAddButton,
                          {
                            backgroundColor: theme.backgroundElement,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        {requesting ? (
                          <ActivityIndicator color={theme.primary} size="small" />
                        ) : (
                          <Text
                            style={[
                              styles.matchAddText,
                              {
                                color: requested
                                  ? theme.textSecondary
                                  : theme.primary,
                              },
                            ]}
                          >
                            {requested ? "Requested" : "Add"}
                          </Text>
                        )}
                      </Pressable>
                    </View>
                  );
                })}
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

function daysUntilBirthday(friend: FriendRow): number {
  if (!friend.friendBirthday) return Number.POSITIVE_INFINITY;
  const [, monthText, dayText] = friend.friendBirthday.split("-");
  const month = Number(monthText);
  const day = Number(dayText);
  if (!month || !day) return Number.POSITIVE_INFINITY;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const birthday = new Date(today.getFullYear(), month - 1, day);
  birthday.setHours(0, 0, 0, 0);
  if (birthday < today) {
    birthday.setFullYear(today.getFullYear() + 1);
  }

  return Math.round((birthday.getTime() - today.getTime()) / 86_400_000);
}

function sortFriends(
  left: FriendRow,
  right: FriendRow,
  sortMode: FriendsSortMode,
) {
  if (sortMode === "mutual") {
    return (
      right.mutualFriendCount - left.mutualFriendCount ||
      lastOpenedTime(right) - lastOpenedTime(left) ||
      left.friendName.localeCompare(right.friendName)
    );
  }

  if (sortMode === "birthday") {
    return (
      daysUntilBirthday(left) - daysUntilBirthday(right) ||
      left.friendName.localeCompare(right.friendName)
    );
  }

  return (
    lastOpenedTime(right) - lastOpenedTime(left) ||
    left.friendName.localeCompare(right.friendName)
  );
}

function formatMutualFriendCount(count: number): string {
  if (count === 1) return "1 mutual friend";
  return `${count} mutual friends`;
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

function formatBirthdayDistance(friend: FriendRow): string {
  const days = daysUntilBirthday(friend);
  if (!Number.isFinite(days)) return "Birthday not set";
  const [, monthText, dayText] = friend.friendBirthday?.split("-") ?? [];
  const month = Number(monthText);
  const day = Number(dayText);
  if (!month || !day) return "Birthday not set";

  const birthdayLabel = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "short",
  }).format(new Date(2000, month - 1, day));
  if (days === 0) return `Birthday ${birthdayLabel} (today)`;
  if (days === 1) return `Birthday ${birthdayLabel} (tomorrow)`;
  return `Birthday ${birthdayLabel} (in ${days} days)`;
}

function formatFriendMeta(friend: FriendRow, sortMode: FriendsSortMode) {
  if (sortMode === "mutual") {
    return formatMutualFriendCount(friend.mutualFriendCount);
  }
  if (sortMode === "birthday") {
    return formatBirthdayDistance(friend);
  }
  return `Active: ${formatLastOpened(friend)}`;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 40,
    gap: 16,
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
    fontSize: 34,
    lineHeight: 39,
    fontWeight: "700",
  },
  pageSubtitle: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  sectionTabs: {
    flexDirection: "row",
    gap: 22,
    paddingTop: 2,
  },
  sectionTab: {
    gap: 6,
    borderRadius: 8,
    paddingVertical: 3,
  },
  sectionTabText: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "600",
  },
  sectionTabIndicator: {
    height: 2.5,
    borderRadius: 999,
  },
  toolbar: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchBox: {
    height: 44,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 0, fontSize: 17, fontWeight: "400" },
  addButton: {
    height: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    borderRadius: 11,
    paddingHorizontal: 12,
  },
  addButtonText: { fontSize: 15, fontWeight: "600" },
  sectionActionButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  sectionActionButtonText: {
    fontSize: 15,
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
  section: { gap: 8 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  sectionTitleRow: {
    minWidth: 0,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  sectionTitle: { fontSize: 22, lineHeight: 27, fontWeight: "700" },
  countBadge: {
    minWidth: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 7,
  },
  countText: { fontSize: 13, fontWeight: "500" },
  pendingList: { gap: 0 },
  groupList: { gap: 0 },
  groupCard: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 0,
    paddingVertical: 10,
  },
  groupAvatarStack: {
    width: 72,
    height: 38,
    position: "relative",
  },
  groupAvatarOffset: {
    position: "absolute",
    top: 2,
  },
  pendingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 0,
    paddingVertical: 10,
  },
  pendingName: { fontSize: 17, fontWeight: "600" },
  pendingBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 6 },
  pendingBadgeText: { fontSize: 15, fontWeight: "500" },
  acceptButton: {
    minWidth: 64,
    minHeight: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  acceptButtonText: { fontSize: 15, fontWeight: "600" },
  friendGrid: { gap: 0 },
  friendCard: {
    minHeight: 68,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderRadius: 0,
    paddingVertical: 10,
  },
  friendIdentity: { minWidth: 0, flex: 1, gap: 2 },
  friendName: { fontSize: 17, fontWeight: "600" },
  friendEmail: { fontSize: 13, fontWeight: "400" },
  mutualFriendText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "400",
  },
  friendActive: { fontSize: 13, fontWeight: "400" },
  avatar: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 18, fontWeight: "600" },
  messageButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  emptyCard: {
    alignItems: "center",
    gap: 8,
    borderWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 24,
    paddingVertical: 36,
  },
  emptyTitle: { fontSize: 17, fontWeight: "600" },
  emptyText: {
    maxWidth: 280,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 18,
  },
  emptyButton: {
    marginTop: 6,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  emptyButtonText: { fontSize: 15, fontWeight: "600" },
  pressed: { opacity: 0.65 },
  disabled: { opacity: 0.45 },
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
  modalTitle: { fontSize: 17, fontWeight: "600" },
  modalAdd: { fontSize: 16, fontWeight: "600" },
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
  modalIconButton: {
    width: 52,
    height: 40,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  addFriendContent: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 10,
  },
  addFriendSection: { gap: 10 },
  inlineSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  addSectionTitle: {
    paddingHorizontal: 4,
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "700",
  },
  inlineTitle: { minWidth: 0, flex: 1 },
  friendSearchWrap: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 0,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  friendSearchInput: {
    flex: 1,
    paddingVertical: 0,
    fontSize: 17,
    fontWeight: "400",
  },
  inlineHelpText: {
    paddingHorizontal: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  suggestedUsersLabel: {
    paddingHorizontal: 4,
    paddingTop: 4,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  selectionList: { gap: 8, paddingTop: 2 },
  selectionRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  checkCircle: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  matchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 9,
  },
  matchProfileButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
  },
  matchInfo: { flex: 1, minWidth: 0, gap: 2 },
  matchAddButton: {
    minWidth: 64,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  matchAddText: { fontSize: 15, fontWeight: "600" },
});
