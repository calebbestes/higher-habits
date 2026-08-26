import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { type MenuAction, MenuView } from "@expo/ui/community/menu";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BrandedEmptyState } from "@/components/branded-empty-state";
import { GoalActionsModal } from "@/components/daily-goals/goal-actions-modal";
import type { ActionGoal } from "@/components/daily-goals/shared";
import { GoalIcon } from "@/components/goal-icon";
import { GoalNoteEditorModal } from "@/components/goal-note-editor-modal";
import { Fonts, MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import {
  type FriendFeedEntry,
  type FriendProfile,
  type FriendProfileHabit,
  type FriendProfilePeriodicHabit,
  type FriendRow,
  fetchFriendProfile,
  fetchFriendProfileByFriendId,
  fetchFriendProfilePosts,
  fetchFriends,
  fetchMyPosts,
  fetchMyProfile,
  sendFriendNudge,
} from "@/lib/friends-client";
import { type GoalPhotoSource, pickGoalPhoto } from "@/lib/goal-photo-picker";
import { uploadGoalPhoto } from "@/lib/goal-photos-client";
import { getLocalTimeZone } from "@/lib/google-calendar-client";
import {
  type HabitLogStatus,
  setHabitLog,
  setHabitLogNote,
  setHabitLogVisibility,
} from "@/lib/habit-logs-client";
import type { HabitVisibility } from "@/lib/habits-client";
import { playSelectionHaptic, playSuccessHaptic } from "@/lib/haptics";
import { richTextToPlainText } from "@/lib/rich-text";

type SymbolName = SymbolViewProps["name"];
type ProfileBodySection = "posts" | "daily" | "periodic";
type ProfilePostFilter = "all" | "reflections" | `goal:${string}`;
type ActiveHabitDay = { dateKey: string; habit: FriendProfileHabit };

const PROFILE_BODY_SECTIONS: Array<{
  key: ProfileBodySection;
  label: string;
}> = [
  { key: "posts", label: "Posts" },
  { key: "daily", label: "Daily habits" },
  { key: "periodic", label: "Periodic habits" },
];

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function hasProfileGridContent(post: FriendFeedEntry) {
  return (
    post.photos.length > 0 || richTextToPlainText(post.notes).trim().length > 0
  );
}

function createPrivateProfilePreview({
  friendId,
  initialImage,
  initialName,
}: {
  friendId?: string;
  initialImage?: string;
  initialName?: string;
}): FriendProfile {
  return {
    friend: {
      id: friendId ?? "private-profile",
      friendshipId: null,
      name: initialName ?? "float user",
      email: "",
      image: initialImage ?? null,
      lastOpenedAt: null,
    },
    stats: {
      friendCount: 0,
      goalCompletions: 0,
      habitCompletions: 0,
      incentivesEarned: 0,
      taskCompletions: 0,
    },
    dateKeys: [],
    categories: [],
    periodicHabits: [],
    logsByHabitDate: {},
  };
}

export function FriendProfileScreen({
  friendId,
  friendshipId,
  initialImage,
  initialName,
  privateProfile = false,
  self = false,
  showHistoryHeader = false,
  onBack,
}: {
  friendId?: string;
  friendshipId?: string;
  initialImage?: string;
  initialName?: string;
  privateProfile?: boolean;
  self?: boolean;
  showHistoryHeader?: boolean;
  onBack?: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const tabBarHeight = useTabBarHeight();
  const { width } = useWindowDimensions();
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [posts, setPosts] = useState<FriendFeedEntry[]>([]);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [isFriendsSheetOpen, setIsFriendsSheetOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [arePostsLoading, setArePostsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNudging, setIsNudging] = useState(false);
  const [activeBodySection, setActiveBodySection] =
    useState<ProfileBodySection>("posts");
  const [postFilter, setPostFilter] = useState<ProfilePostFilter>("all");
  const [activeHabitDay, setActiveHabitDay] = useState<ActiveHabitDay | null>(
    null,
  );
  const [noteHabitDay, setNoteHabitDay] = useState<ActiveHabitDay | null>(null);
  const [updatingHabitDayKey, setUpdatingHabitDayKey] = useState<string | null>(
    null,
  );
  const [uploadingPhotoSource, setUploadingPhotoSource] =
    useState<GoalPhotoSource | null>(null);

  const tileSize = Math.floor((Math.min(width, MaxContentWidth) - 4) / 3);
  const nudgeFriendshipId = profile?.friend.friendshipId ?? friendshipId;
  const habits = useMemo(
    () => profile?.categories.flatMap((category) => category.habits) ?? [],
    [profile],
  );
  const streak = useMemo(
    () => (profile ? getCurrentProfileStreak(profile) : 0),
    [profile],
  );
  const reflectionCount = useMemo(
    () => posts.filter((post) => post.kind === "reflection").length,
    [posts],
  );

  const load = useCallback(
    async (refresh = false) => {
      if (privateProfile) {
        setProfile(
          createPrivateProfilePreview({ friendId, initialImage, initialName }),
        );
        setPosts([]);
        setFriends([]);
        setIsLoading(false);
        setArePostsLoading(false);
        setIsRefreshing(false);
        setError(null);
        return;
      }

      if (!self && !friendshipId && !friendId) {
        setError("Profile data is unavailable.");
        setIsLoading(false);
        setArePostsLoading(false);
        return;
      }

      const requestId = ++loadRequestIdRef.current;
      refresh ? setIsRefreshing(true) : setIsLoading(true);
      setArePostsLoading(true);
      setError(null);
      try {
        if (self) {
          const nextProfile = await fetchMyProfile();

          if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
            return;
          }

          setProfile(nextProfile);
          setIsLoading(false);

          const [myPosts, nextFriends] = await Promise.all([
            fetchMyPosts().catch(() => []),
            fetchFriends().catch(() => []),
          ]);

          if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
            return;
          }

          setFriends(
            nextFriends
              .filter((friend) => friend.status === "accepted")
              .sort((left, right) =>
                left.friendName.localeCompare(right.friendName),
              ),
          );
          setPosts(
            myPosts
              .filter(hasProfileGridContent)
              .sort((left, right) => right.dateKey.localeCompare(left.dateKey)),
          );
          setArePostsLoading(false);
        } else {
          const nextProfile = friendId
            ? await fetchFriendProfileByFriendId(friendId)
            : await fetchFriendProfile(friendshipId as string);

          if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
            return;
          }

          setProfile(nextProfile);
          setFriends([]);
          setIsLoading(false);

          const feedPage = nextProfile.friend.friendshipId
            ? await fetchFriendProfilePosts(nextProfile.friend.friendshipId, {
                limit: 20,
              }).catch(() => ({
                items: [],
                nextCursor: null,
              }))
            : { items: [], nextCursor: null };

          if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
            return;
          }

          setPosts(
            feedPage.items
              .filter((entry) => entry.friend.id === nextProfile.friend.id)
              .filter(hasProfileGridContent)
              .sort((left, right) => right.dateKey.localeCompare(left.dateKey)),
          );
          setArePostsLoading(false);
        }
      } catch (loadError) {
        if (isMountedRef.current && requestId === loadRequestIdRef.current) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load profile.",
          );
          setProfile(null);
          setPosts([]);
          setArePostsLoading(false);
        }
      } finally {
        if (isMountedRef.current && requestId === loadRequestIdRef.current) {
          setIsLoading(false);
          setArePostsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [friendId, friendshipId, initialImage, initialName, privateProfile, self],
  );

  const refreshOwnProfile = useCallback(async () => {
    if (!self) return;
    const nextProfile = await fetchMyProfile();
    if (isMountedRef.current) setProfile(nextProfile);
  }, [self]);

  const activeHabitAction = activeHabitDay
    ? toProfileActionGoal(activeHabitDay.habit)
    : null;
  const activeHabitDayKey = activeHabitDay
    ? `${activeHabitDay.habit.id}_${activeHabitDay.dateKey}`
    : null;
  const activeHabitStatus = activeHabitDayKey
    ? profile?.logsByHabitDate[activeHabitDayKey]
    : undefined;
  const activeHabitModalStatus =
    activeHabitStatus ??
    (activeHabitDay?.habit.defaultComplete ? "complete" : undefined);
  const activeHabitDate = activeHabitDay
    ? dateFromProfileKey(activeHabitDay.dateKey)
    : null;

  const setActiveHabitStatus = async (
    status: HabitLogStatus,
    options?: {
      completedCount?: number;
      endTime?: string | null;
      repeatPlan?: boolean;
      startTime?: string | null;
      timeZone?: string | null;
    },
  ) => {
    if (!activeHabitDay) return;

    const key = `${activeHabitDay.habit.id}_${activeHabitDay.dateKey}`;
    const wasComplete = activeHabitModalStatus === "complete";
    setUpdatingHabitDayKey(key);
    try {
      await setHabitLog(
        activeHabitDay.habit.id,
        activeHabitDay.dateKey,
        status,
        options,
      );
      if (status === "complete" && !wasComplete) {
        playSuccessHaptic();
      } else {
        playSelectionHaptic();
      }
      await refreshOwnProfile();
    } catch (updateError) {
      Alert.alert(
        "Could not update habit",
        updateError instanceof Error
          ? updateError.message
          : "The habit could not be updated.",
      );
    } finally {
      if (isMountedRef.current) setUpdatingHabitDayKey(null);
    }
  };

  const setActiveHabitVisibility = async (visibility: HabitVisibility) => {
    if (!activeHabitDay) return;

    const key = `${activeHabitDay.habit.id}_${activeHabitDay.dateKey}`;
    setUpdatingHabitDayKey(key);
    try {
      await setHabitLogVisibility(
        activeHabitDay.habit.id,
        activeHabitDay.dateKey,
        visibility,
      );
      await refreshOwnProfile();
    } catch (updateError) {
      Alert.alert(
        "Could not update visibility",
        updateError instanceof Error
          ? updateError.message
          : "The post visibility could not be changed.",
      );
    } finally {
      if (isMountedRef.current) setUpdatingHabitDayKey(null);
    }
  };

  const addActiveHabitPhoto = async (source: GoalPhotoSource) => {
    if (!activeHabitDay || uploadingPhotoSource) return;

    setUploadingPhotoSource(source);
    try {
      const photo = await pickGoalPhoto(source);
      if (!photo) return;

      await uploadGoalPhoto(
        activeHabitDay.habit.id,
        activeHabitDay.dateKey,
        photo,
      );
      await refreshOwnProfile();
    } catch (photoError) {
      Alert.alert(
        "Could not add photo",
        photoError instanceof Error
          ? photoError.message
          : "The photo could not be uploaded.",
      );
    } finally {
      if (isMountedRef.current) setUploadingPhotoSource(null);
    }
  };

  const saveHabitNote = async (target: ActiveHabitDay, notes: string) => {
    await setHabitLogNote(target.habit.id, target.dateKey, notes);
    await refreshOwnProfile();
    setActiveHabitDay(target);
  };

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

  const handleNudge = async () => {
    if (!nudgeFriendshipId || !profile || isNudging) return;
    setIsNudging(true);
    try {
      await sendFriendNudge(nudgeFriendshipId, "Keep going. You got this.");
      playSuccessHaptic();
      Alert.alert("Nudge sent", `${profile.friend.name} got a quick nudge.`);
    } catch (nudgeError) {
      Alert.alert(
        "Could not send nudge",
        nudgeError instanceof Error ? nudgeError.message : "Please try again.",
      );
    } finally {
      setIsNudging(false);
    }
  };

  const openFriendsSheet = useCallback(() => {
    if (!self || friends.length === 0) return;
    playSelectionHaptic();
    setIsFriendsSheetOpen(true);
  }, [friends.length, self]);

  const openFriendProfile = useCallback(
    (friend: FriendRow) => {
      playSelectionHaptic();
      setIsFriendsSheetOpen(false);
      router.push({
        pathname: "/friend-profile",
        params: {
          friendId: friend.friendId,
          initialName: friend.friendName,
        },
      });
    },
    [router],
  );

  const openSettings = useCallback(() => {
    playSelectionHaptic();
    router.push("/settings");
  }, [router]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <View style={[styles.header, { borderBottomColor: theme.tabBorder }]}>
          {showHistoryHeader ? (
            <View style={styles.headerMenuWrap}>
              <Text style={[styles.headerSectionTitle, { color: theme.text }]}>
                Profile
              </Text>
            </View>
          ) : onBack ? (
            <Pressable
              accessibilityLabel="Go back"
              hitSlop={12}
              onPress={onBack}
              style={({ pressed }) => [
                styles.backButton,
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("chevron.left", "arrow_back")}
                size={22}
                weight="semibold"
                tintColor={theme.text}
              />
            </Pressable>
          ) : (
            <View style={styles.headerSpacer} />
          )}
          {!showHistoryHeader ? (
            <Text
              numberOfLines={1}
              style={[styles.headerTitle, { color: theme.text }]}
            >
              {profile?.friend.name ??
                initialName ??
                (self ? "You" : "Profile")}
            </Text>
          ) : null}
          {showHistoryHeader && self ? (
            <Pressable
              accessibilityLabel="Open settings"
              hitSlop={12}
              onPress={openSettings}
              style={({ pressed }) => [
                styles.headerIconButton,
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("gearshape.fill", "settings")}
                size={22}
                weight="semibold"
                tintColor={theme.text}
              />
            </Pressable>
          ) : !showHistoryHeader ? (
            <View style={styles.headerSpacer} />
          ) : null}
        </View>

        <ScrollView
          canCancelContentTouches
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarHeight + 18 },
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
          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: "#FFF0F0" }]}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => void load()}>
                <Text style={[styles.retryText, { color: theme.primary }]}>
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : null}

          {isLoading ? (
            <View style={styles.centerState}>
              <FloatingLogoLoader />
            </View>
          ) : profile ? (
            <>
              <View style={styles.profileSummary}>
                <View style={styles.profileIdentity}>
                  <ProfileAvatar
                    image={profile.friend.image}
                    name={profile.friend.name}
                    size={78}
                  />
                  <Text
                    numberOfLines={2}
                    style={[styles.profileName, { color: theme.text }]}
                  >
                    {profile.friend.name}
                  </Text>
                </View>
                <View style={styles.statsRow}>
                  <ProfileStat
                    label="friends"
                    value={profile.stats.friendCount}
                    onPress={self ? openFriendsSheet : undefined}
                  />
                  <ProfileStat label="streak" value={streak} />
                  <ProfileStat
                    label="incentives earned"
                    value={profile.stats.incentivesEarned}
                  />
                  <ProfileStat label="reflections" value={reflectionCount} />
                </View>
              </View>
              {!self && nudgeFriendshipId ? (
                <View style={styles.profileActions}>
                  <Pressable
                    accessibilityLabel={`Nudge ${profile.friend.name}`}
                    disabled={isNudging}
                    onPress={() => void handleNudge()}
                    style={({ pressed }) => [
                      styles.nudgeButton,
                      { backgroundColor: theme.backgroundElement },
                      pressed && styles.pressed,
                    ]}
                  >
                    {isNudging ? (
                      <ActivityIndicator color={theme.primary} size="small" />
                    ) : (
                      <SymbolView
                        name={sym("hand.tap.fill", "touch_app")}
                        size={17}
                        weight="semibold"
                        tintColor={theme.primary}
                      />
                    )}
                    <Text
                      style={[styles.nudgeButtonText, { color: theme.primary }]}
                    >
                      Nudge
                    </Text>
                  </Pressable>
                </View>
              ) : null}

              <ProfileBodyTabs
                activeSection={activeBodySection}
                locked={privateProfile}
                onChange={setActiveBodySection}
              />

              {privateProfile ? (
                <PrivateProfileSection section={activeBodySection} />
              ) : activeBodySection === "posts" ? (
                <ProfilePostsGrid
                  arePostsLoading={arePostsLoading}
                  filter={postFilter}
                  posts={posts}
                  self={self}
                  tileSize={tileSize}
                  onChangeFilter={setPostFilter}
                  onOpenPost={(post) =>
                    router.push({
                      pathname: "/post",
                      params: {
                        postId: post.id,
                        source: self ? "self" : "feed",
                      },
                    })
                  }
                />
              ) : activeBodySection === "daily" ? (
                <ProfileDailyHabits
                  dateKeys={profile.dateKeys}
                  habits={habits}
                  logsByHabitDate={profile.logsByHabitDate}
                  profile={profile}
                  onPressHabitDay={
                    self
                      ? (habit, dateKey) => {
                          playSelectionHaptic();
                          setActiveHabitDay({ dateKey, habit });
                        }
                      : undefined
                  }
                />
              ) : (
                <ProfilePeriodicHabits
                  dateKeys={profile.dateKeys}
                  habits={profile.periodicHabits}
                  logsByHabitDate={profile.logsByHabitDate}
                />
              )}
            </>
          ) : null}
        </ScrollView>
        <GoalActionsModal
          canPlan={Boolean(
            activeHabitDate && isTodayOrFutureDate(activeHabitDate),
          )}
          completedCount={undefined}
          goal={activeHabitAction}
          hasNote={false}
          hasPhoto={false}
          isFutureDate={Boolean(
            activeHabitDate && isFutureDate(activeHabitDate),
          )}
          isUpdating={Boolean(
            activeHabitDayKey && updatingHabitDayKey === activeHabitDayKey,
          )}
          isUpdatingVisibility={Boolean(
            activeHabitDayKey && updatingHabitDayKey === activeHabitDayKey,
          )}
          noteText={null}
          plannedTime={undefined}
          status={activeHabitModalStatus}
          uploadingPhotoSource={uploadingPhotoSource}
          visibility={activeHabitDay?.habit.visibility ?? "only_me"}
          visible={Boolean(activeHabitDay)}
          onAddPhoto={(source) => void addActiveHabitPhoto(source)}
          onDismiss={() => setActiveHabitDay(null)}
          onOpenNote={() => {
            if (!activeHabitDay) return;
            setNoteHabitDay(activeHabitDay);
            setActiveHabitDay(null);
          }}
          onSetStatus={(status, options) =>
            void setActiveHabitStatus(status, {
              ...options,
              timeZone: options?.timeZone ?? getLocalTimeZone(),
            })
          }
          onSetVisibility={(visibility) =>
            void setActiveHabitVisibility(visibility)
          }
          onShown={() => undefined}
        />
        {noteHabitDay ? (
          <GoalNoteEditorModal
            dateKey={noteHabitDay.dateKey}
            goalName={noteHabitDay.habit.name}
            initialValue={null}
            onClose={() => setNoteHabitDay(null)}
            onSave={async (notes) => {
              await saveHabitNote(noteHabitDay, notes);
            }}
          />
        ) : null}
      </SafeAreaView>
      <FriendsListSheet
        friends={friends}
        isOpen={isFriendsSheetOpen}
        onClose={() => setIsFriendsSheetOpen(false)}
        onOpenFriend={openFriendProfile}
      />
    </View>
  );
}

function ProfileBodyTabs({
  activeSection,
  locked = false,
  onChange,
}: {
  activeSection: ProfileBodySection;
  locked?: boolean;
  onChange: (section: ProfileBodySection) => void;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.profileBodyTabs, { borderColor: theme.tabBorder }]}>
      {PROFILE_BODY_SECTIONS.map((section) => {
        const isActive = section.key === activeSection;
        return (
          <Pressable
            key={section.key}
            accessibilityRole="button"
            accessibilityState={{ selected: isActive }}
            onPress={() => onChange(section.key)}
            style={({ pressed }) => [
              styles.profileBodyTab,
              pressed && styles.pressed,
            ]}
          >
            <View style={styles.profileBodyTabLabel}>
              {locked ? (
                <SymbolView
                  name={sym("lock.fill", "lock")}
                  size={11}
                  weight="bold"
                  tintColor={isActive ? theme.text : theme.textSecondary}
                />
              ) : null}
              <Text
                style={[
                  styles.profileBodyTabText,
                  { color: isActive ? theme.text : theme.textSecondary },
                ]}
              >
                {section.label}
              </Text>
            </View>
            <View
              style={[
                styles.profileBodyTabIndicator,
                { backgroundColor: isActive ? theme.primary : "transparent" },
              ]}
            />
          </Pressable>
        );
      })}
    </View>
  );
}

function PrivateProfileSection({ section }: { section: ProfileBodySection }) {
  const theme = useTheme();
  const label =
    section === "posts"
      ? "Posts"
      : section === "daily"
        ? "Daily habits"
        : "Periodic habits";

  return (
    <View style={styles.privateSection}>
      <View
        style={[
          styles.privateLockCircle,
          { backgroundColor: theme.backgroundElement },
        ]}
      >
        <SymbolView
          name={sym("lock.fill", "lock")}
          size={28}
          weight="bold"
          tintColor={theme.textSecondary}
        />
      </View>
      <Text style={[styles.privateTitle, { color: theme.text }]}>
        {label} are private
      </Text>
      <Text style={[styles.privateText, { color: theme.textSecondary }]}>
        Add them as a friend to see shared activity.
      </Text>
    </View>
  );
}

function ProfilePostsGrid({
  arePostsLoading,
  filter,
  onChangeFilter,
  onOpenPost,
  posts,
  self,
  tileSize,
}: {
  arePostsLoading: boolean;
  filter: ProfilePostFilter;
  onChangeFilter: (filter: ProfilePostFilter) => void;
  onOpenPost: (post: FriendFeedEntry) => void;
  posts: FriendFeedEntry[];
  self: boolean;
  tileSize: number;
}) {
  const theme = useTheme();
  const goalOptions = useMemo(() => {
    const byId = new Map<string, { id: string; name: string }>();
    for (const post of posts) {
      if (post.kind === "reflection") continue;
      byId.set(post.goal.id, { id: post.goal.id, name: post.goal.name });
    }
    return [...byId.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }, [posts]);
  const hasReflections = posts.some((post) => post.kind === "reflection");
  const filterActions = useMemo<MenuAction[]>(() => {
    const actions: MenuAction[] = [
      {
        id: "all",
        image: "square.grid.2x2",
        state: filter === "all" ? "on" : undefined,
        title: "All posts",
      },
    ];

    if (hasReflections) {
      actions.push({
        id: "reflections",
        image: "sparkles",
        state: filter === "reflections" ? "on" : undefined,
        title: "Daily reflections",
      });
    }

    if (goalOptions.length > 0) {
      actions.push({
        displayInline: true,
        subactions: goalOptions.map((goal) => ({
          id: `goal:${goal.id}`,
          state: filter === `goal:${goal.id}` ? "on" : undefined,
          title: goal.name,
        })),
        title: "Habits",
      });
    }

    return actions;
  }, [filter, goalOptions, hasReflections]);
  const selectedFilterLabel =
    filter === "all"
      ? "All posts"
      : filter === "reflections"
        ? "Daily reflections"
        : (goalOptions.find((goal) => filter === `goal:${goal.id}`)?.name ??
          "All posts");
  const filteredPosts = useMemo(() => {
    if (filter === "all") return posts;
    if (filter === "reflections") {
      return posts.filter((post) => post.kind === "reflection");
    }
    const goalId = filter.slice("goal:".length);
    return posts.filter(
      (post) => post.kind !== "reflection" && post.goal.id === goalId,
    );
  }, [filter, posts]);

  useEffect(() => {
    if (
      filter !== "all" &&
      filter !== "reflections" &&
      !goalOptions.some((goal) => filter === `goal:${goal.id}`)
    ) {
      onChangeFilter("all");
    }
    if (filter === "reflections" && !hasReflections) {
      onChangeFilter("all");
    }
  }, [filter, goalOptions, hasReflections, onChangeFilter]);

  if (posts.length > 0) {
    return (
      <View>
        <ProfilePostFilterButton
          actions={filterActions}
          value={selectedFilterLabel}
          onSelect={(event) => {
            if (event === "all" || event === "reflections") {
              onChangeFilter(event);
            } else if (event.startsWith("goal:")) {
              onChangeFilter(event as ProfilePostFilter);
            }
          }}
        />
        {filteredPosts.length > 0 ? (
          <View style={styles.postGrid}>
            {filteredPosts.map((post) => (
              <PostTile
                key={post.id}
                post={post}
                size={tileSize}
                onPress={() => onOpenPost(post)}
              />
            ))}
          </View>
        ) : (
          <View style={styles.emptyPosts}>
            <Text
              style={[styles.loadingPostsText, { color: theme.textSecondary }]}
            >
              No posts for this filter.
            </Text>
          </View>
        )}
      </View>
    );
  }

  if (arePostsLoading) {
    return (
      <View style={styles.emptyPosts}>
        <Text style={[styles.loadingPostsText, { color: theme.textSecondary }]}>
          Loading posts...
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.emptyPosts}>
      <BrandedEmptyState
        compact
        title={self ? "No posts yet" : "No visible posts yet"}
        description={
          self
            ? "Completed habits with a note or photo will show up here."
            : "Posts this friend shares with you will appear here."
        }
      />
    </View>
  );
}

function ProfilePostFilterButton({
  actions,
  onSelect,
  value,
}: {
  actions: MenuAction[];
  onSelect: (event: string) => void;
  value: string;
}) {
  const theme = useTheme();

  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => onSelect(nativeEvent.event)}
      style={styles.profilePostFilterMenu}
      title="Filter posts"
    >
      <View
        accessible
        accessibilityLabel={`Filter posts. Currently ${value}`}
        accessibilityRole="button"
        style={[
          styles.profilePostFilterButton,
          {
            backgroundColor: theme.background,
            borderColor: theme.tabBorder,
          },
        ]}
      >
        <SymbolView
          name={sym("line.3.horizontal.decrease", "filter_list")}
          size={16}
          tintColor={theme.primary}
        />
        <Text
          numberOfLines={1}
          style={[styles.profilePostFilterValue, { color: theme.text }]}
        >
          {value}
        </Text>
        <SymbolView
          name={sym("chevron.down", "expand_more")}
          size={13}
          tintColor={theme.textSecondary}
        />
      </View>
    </MenuView>
  );
}

function ProfileDailyHabits({
  dateKeys,
  habits,
  logsByHabitDate,
  onPressHabitDay,
  profile,
}: {
  dateKeys: string[];
  habits: FriendProfileHabit[];
  logsByHabitDate: FriendProfile["logsByHabitDate"];
  onPressHabitDay?: (habit: FriendProfileHabit, dateKey: string) => void;
  profile: FriendProfile;
}) {
  const theme = useTheme();

  if (habits.length === 0) {
    return (
      <View style={styles.compactDashboard}>
        <Text style={[styles.mutedText, { color: theme.textSecondary }]}>
          No visible habits yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.compactDashboard}>
      <Text style={[styles.profileGridCaption, { color: theme.textSecondary }]}>
        Last 7 Days
      </Text>
      {profile.categories.map((category) => {
        const categoryHabits = category.habits.filter((habit) =>
          habits.some((visibleHabit) => visibleHabit.id === habit.id),
        );
        if (categoryHabits.length === 0) return null;

        return (
          <View key={category.id} style={styles.profileHabitGroup}>
            <Text
              style={[
                styles.profileHabitGroupTitle,
                { color: theme.textSecondary },
              ]}
            >
              {category.name.toUpperCase()}
            </Text>
            {categoryHabits.map((habit) => (
              <CompactHabitRow
                key={habit.id}
                days={dateKeys}
                habit={habit}
                logsByHabitDate={logsByHabitDate}
                onPressDay={onPressHabitDay}
              />
            ))}
          </View>
        );
      })}
    </View>
  );
}

function ProfilePeriodicHabits({
  dateKeys,
  habits,
  logsByHabitDate,
}: {
  dateKeys: string[];
  habits: FriendProfilePeriodicHabit[];
  logsByHabitDate: FriendProfile["logsByHabitDate"];
}) {
  const theme = useTheme();

  if (habits.length === 0) {
    return (
      <View style={styles.periodicList}>
        <Text style={[styles.mutedText, { color: theme.textSecondary }]}>
          No periodic habits yet.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.periodicList}>
      {habits.map((habit) => (
        <PeriodicHabitRow
          key={habit.id}
          dateKeys={dateKeys}
          habit={habit}
          logsByHabitDate={logsByHabitDate}
        />
      ))}
    </View>
  );
}

function PeriodicHabitRow({
  dateKeys,
  habit,
  logsByHabitDate,
}: {
  dateKeys: string[];
  habit: FriendProfilePeriodicHabit;
  logsByHabitDate: FriendProfile["logsByHabitDate"];
}) {
  const theme = useTheme();
  const completed = dateKeys.filter(
    (dateKey) => logsByHabitDate[`${habit.id}_${dateKey}`] === "complete",
  ).length;
  const target = Math.max(1, habit.frequencyGoal ?? 1);
  const progress = Math.min(1, completed / target);

  return (
    <View style={[styles.periodicRow, { borderBottomColor: theme.tabBorder }]}>
      <View style={[styles.periodicIcon, { backgroundColor: theme.secondary }]}>
        <GoalIcon
          iconKey={habit.iconKey}
          size={18}
          color={theme.secondaryForeground}
        />
      </View>
      <View style={styles.periodicProgressTrack}>
        <View
          style={[
            styles.periodicProgressFill,
            { width: `${progress * 100}%`, backgroundColor: theme.primary },
          ]}
        />
      </View>
      <Text style={[styles.periodicCount, { color: theme.textSecondary }]}>
        {completed}/{target}
      </Text>
    </View>
  );
}

function ProfileAvatar({
  image,
  name,
  size,
}: {
  image: string | null;
  name: string;
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
          backgroundColor: theme.backgroundElement,
        },
      ]}
    >
      {image ? (
        <Image
          contentFit="cover"
          source={{ uri: image }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <Text
          style={[
            styles.avatarText,
            { color: theme.primary, fontSize: Math.round(size * 0.34) },
          ]}
        >
          {name.slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

function ProfileStat({
  label,
  onPress,
  value,
}: {
  label: string;
  onPress?: () => void;
  value: number;
}) {
  const theme = useTheme();

  const content = (
    <>
      <Text style={[styles.statValue, { color: theme.text }]}>
        {value.toLocaleString()}
      </Text>
      <Text
        numberOfLines={2}
        style={[styles.statLabel, { color: theme.textSecondary }]}
      >
        {label}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityLabel={`${value.toLocaleString()} ${label}`}
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.stat,
          styles.pressableStat,
          pressed && styles.pressed,
        ]}
      >
        {content}
      </Pressable>
    );
  }

  return <View style={styles.stat}>{content}</View>;
}

function FriendsListSheet({
  friends,
  isOpen,
  onClose,
  onOpenFriend,
}: {
  friends: FriendRow[];
  isOpen: boolean;
  onClose: () => void;
  onOpenFriend: (friend: FriendRow) => void;
}) {
  const theme = useTheme();

  return (
    <Modal
      animationType="slide"
      transparent
      visible={isOpen}
      onRequestClose={onClose}
    >
      <View style={styles.friendsSheetOverlay}>
        <Pressable style={styles.friendsSheetBackdrop} onPress={onClose} />
        <SafeAreaView
          edges={["bottom"]}
          style={[
            styles.friendsSheet,
            {
              backgroundColor: theme.background,
              borderColor: theme.tabBorder,
            },
          ]}
        >
          <View
            style={[
              styles.friendsSheetHeader,
              { borderBottomColor: theme.tabBorder },
            ]}
          >
            <View>
              <Text style={[styles.friendsSheetTitle, { color: theme.text }]}>
                Friends
              </Text>
              <Text
                style={[
                  styles.friendsSheetSubtitle,
                  { color: theme.textSecondary },
                ]}
              >
                {friends.length.toLocaleString()} friends
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close friends list"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [
                styles.friendsSheetClose,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("xmark", "close")}
                size={14}
                weight="bold"
                tintColor={theme.textSecondary}
              />
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.friendsSheetList}
            showsVerticalScrollIndicator={false}
          >
            {friends.map((friend) => (
              <Pressable
                key={friend.id}
                accessibilityLabel={`Open ${friend.friendName}'s profile`}
                accessibilityRole="button"
                onPress={() => onOpenFriend(friend)}
                style={({ pressed }) => [
                  styles.friendRow,
                  pressed && styles.pressed,
                ]}
              >
                <ProfileAvatar
                  image={friend.friendImage}
                  name={friend.friendName}
                  size={42}
                />
                <View style={styles.friendRowText}>
                  <Text
                    numberOfLines={1}
                    style={[styles.friendRowName, { color: theme.text }]}
                  >
                    {friend.friendName}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.friendRowEmail,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {friend.friendEmail || "Friend"}
                  </Text>
                </View>
                <SymbolView
                  name={sym("chevron.right", "chevron_right")}
                  size={14}
                  weight="semibold"
                  tintColor={theme.textSecondary}
                />
              </Pressable>
            ))}
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function CompactHabitRow({
  days,
  habit,
  logsByHabitDate,
  onPressDay,
}: {
  days: string[];
  habit: FriendProfileHabit;
  logsByHabitDate: FriendProfile["logsByHabitDate"];
  onPressDay?: (habit: FriendProfileHabit, dateKey: string) => void;
}) {
  const theme = useTheme();
  const [showName, setShowName] = useState(false);

  return (
    <View style={styles.habitRow}>
      <Pressable
        accessibilityLabel={habit.name}
        hitSlop={8}
        onPress={() => setShowName((current) => !current)}
        style={[styles.habitIcon, { backgroundColor: theme.secondary }]}
      >
        <GoalIcon
          iconKey={habit.iconKey}
          size={14}
          color={theme.secondaryForeground}
        />
      </Pressable>
      <View style={styles.dayBlocks}>
        {days.map((day) => {
          const status = getFriendHabitStatus(habit, day, logsByHabitDate);
          const blockStyle = [
            styles.dayBlock,
            {
              backgroundColor:
                status === "complete"
                  ? theme.primary
                  : status === "planned"
                    ? `${theme.primary}33`
                    : theme.backgroundElement,
            },
          ];
          if (onPressDay) {
            return (
              <Pressable
                key={day}
                accessibilityLabel={`${habit.name} on ${day}`}
                accessibilityRole="button"
                onPress={() => onPressDay(habit, day)}
                style={({ pressed }) => [
                  ...blockStyle,
                  pressed && styles.pressed,
                ]}
              />
            );
          }
          return <View key={day} style={blockStyle} />;
        })}
      </View>
      {showName ? (
        <View
          pointerEvents="none"
          style={[
            styles.tooltip,
            { backgroundColor: theme.text, borderColor: theme.tabBorder },
          ]}
        >
          <Text
            numberOfLines={2}
            style={[styles.tooltipText, { color: theme.background }]}
          >
            {habit.name}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function PostTile({
  onPress,
  post,
  size,
}: {
  onPress: () => void;
  post: FriendFeedEntry;
  size: number;
}) {
  const theme = useTheme();
  const photo = post.photos[0];
  const text = richTextToPlainText(post.notes);

  return (
    <Pressable
      accessibilityLabel={`Open post for ${post.goal.name}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.postTile,
        {
          width: size,
          height: size,
          backgroundColor: theme.backgroundElement,
        },
        pressed && styles.pressed,
      ]}
    >
      {photo ? (
        <>
          <Image
            contentFit="cover"
            source={{ uri: photo.url }}
            style={StyleSheet.absoluteFill}
          />
          {post.photos.length > 1 ? (
            <View style={styles.multiPhotoBadge}>
              <SymbolView
                name={sym("square.on.square", "filter_none")}
                size={15}
                weight="semibold"
                tintColor="#FFFFFF"
              />
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.textTileContent}>
          <Text
            numberOfLines={1}
            style={[styles.tileGoal, { color: theme.text }]}
          >
            {post.goal.name}
          </Text>
          <Text
            numberOfLines={5}
            style={[styles.tileNote, { color: theme.textSecondary }]}
          >
            {text || "Completed"}
          </Text>
        </View>
      )}
    </Pressable>
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

function toProfileActionGoal(habit: FriendProfileHabit): ActionGoal {
  return {
    ...habit,
    audienceFriendIds: [],
    audienceGroupIds: [],
    categoryId: "",
    frequencyGoal: null,
    goalId: null,
    goalTitle: null,
    hidden: false,
    period: "daily",
    planOnCalendar: true,
    requireEvidence: habit.requireEvidence,
    reminderEnabled: false,
    reminderTime: null,
    repeatCadence: null,
    repeatDays: null,
    repeatInterval: null,
    repeatMonthlyType: null,
  };
}

function dateFromProfileKey(key: string) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year ?? 0, (month ?? 1) - 1, day ?? 1);
}

function getCurrentProfileStreak(profile: FriendProfile) {
  if (profile.dateKeys.length === 0) return 0;

  const profileHabits = [
    ...profile.categories.flatMap((category) => category.habits),
    ...profile.periodicHabits,
  ];
  const hasCompletedHabitOnDate = (dateKey: string) =>
    profileHabits.some(
      (habit) =>
        profile.logsByHabitDate[`${habit.id}_${dateKey}`] === "complete" ||
        (profile.logsByHabitDate[`${habit.id}_${dateKey}`] === undefined &&
          habit.defaultComplete),
    );

  let dateIndex = profile.dateKeys.length - 1;
  if (!hasCompletedHabitOnDate(profile.dateKeys[dateIndex] ?? "")) {
    dateIndex -= 1;
  }

  let streak = 0;
  while (dateIndex >= 0) {
    const dateKey = profile.dateKeys[dateIndex];
    if (!dateKey || !hasCompletedHabitOnDate(dateKey)) break;
    streak += 1;
    dateIndex -= 1;
  }

  return streak;
}

function startOfProfileDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function isFutureDate(date: Date) {
  return (
    startOfProfileDay(date).getTime() > startOfProfileDay(new Date()).getTime()
  );
}

function isTodayOrFutureDate(date: Date) {
  return (
    startOfProfileDay(date).getTime() >= startOfProfileDay(new Date()).getTime()
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    height: 48,
    maxWidth: MaxContentWidth,
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  headerIconButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 18,
    fontWeight: "700",
  },
  headerMenuWrap: {
    flex: 1,
    alignItems: "flex-start",
  },
  headerSectionTitle: {
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "700",
  },
  headerSpacer: { width: 42 },
  content: {
    maxWidth: MaxContentWidth,
    width: "100%",
    alignSelf: "center",
  },
  centerState: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBanner: {
    margin: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    padding: 14,
  },
  errorText: { color: "#9D474D", fontSize: 14, fontWeight: "700" },
  retryText: { fontSize: 14, fontWeight: "800" },
  profileSummary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 18,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  profileIdentity: {
    width: 104,
    flexShrink: 0,
  },
  profileActions: {
    alignItems: "stretch",
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  nudgeButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 8,
    paddingHorizontal: 14,
  },
  nudgeButtonText: { fontSize: 14, fontWeight: "600" },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarText: { fontWeight: "700" },
  statsRow: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 4,
  },
  stat: { flex: 1, minWidth: 0, alignItems: "center" },
  pressableStat: {
    borderRadius: 12,
  },
  statValue: {
    fontSize: 17,
    lineHeight: 21,
    fontWeight: "700",
  },
  statLabel: {
    maxWidth: "100%",
    marginTop: 2,
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "400",
    textAlign: "center",
  },
  profileName: {
    marginTop: 10,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "600",
  },
  profileBodyTabs: {
    flexDirection: "row",
    justifyContent: "space-around",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginTop: 18,
    paddingHorizontal: 8,
  },
  profileBodyTab: {
    minHeight: 43,
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 0,
    borderRadius: 0,
  },
  profileBodyTabLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  profileBodyTabText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
  },
  profileBodyTabIndicator: {
    position: "absolute",
    top: 0,
    height: 1.5,
    width: "100%",
    borderRadius: 0,
  },
  compactDashboard: {
    gap: 7,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
  },
  profileGridCaption: {
    alignSelf: "center",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
  },
  privateSection: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 32,
    paddingTop: 28,
  },
  privateLockCircle: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 36,
  },
  privateTitle: {
    marginTop: 4,
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "900",
    textAlign: "center",
  },
  privateText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
    textAlign: "center",
  },
  profileHabitGroup: {
    gap: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#2B3038",
    paddingTop: 14,
    marginTop: 8,
  },
  profileHabitGroupTitle: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "900",
    letterSpacing: 2,
  },
  mutedText: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  habitRow: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    position: "relative",
  },
  habitIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  dayBlocks: { flex: 1, flexDirection: "row", gap: 4 },
  dayBlock: { flex: 1, height: 28, borderRadius: 7 },
  periodicList: {
    gap: 0,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
  },
  periodicRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  periodicIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  periodicProgressTrack: {
    flex: 1,
    height: 9,
    overflow: "hidden",
    borderRadius: 999,
    backgroundColor: "#2B3038",
  },
  periodicProgressFill: {
    height: "100%",
    borderRadius: 999,
  },
  periodicCount: {
    width: 42,
    textAlign: "right",
    fontSize: 14,
    lineHeight: 17,
    fontWeight: "900",
  },
  profilePostFilterMenu: {
    alignSelf: "flex-start",
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 8,
  },
  profilePostFilterButton: {
    minHeight: 32,
    maxWidth: 260,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 0,
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  profilePostFilterValue: {
    flexShrink: 1,
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "600",
  },
  tooltip: {
    position: "absolute",
    left: 34,
    top: -7,
    zIndex: 20,
    elevation: 20,
    minWidth: 110,
    maxWidth: 180,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  tooltipText: { fontSize: 11, lineHeight: 14, fontWeight: "800" },
  postGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 1,
    paddingTop: 0,
  },
  postTile: { overflow: "hidden" },
  multiPhotoBadge: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  textTileContent: { flex: 1, justifyContent: "center", gap: 8, padding: 10 },
  tileGoal: { fontSize: 12, fontWeight: "700" },
  tileNote: { fontSize: 12, lineHeight: 15, fontWeight: "500" },
  emptyPosts: { paddingHorizontal: 20, paddingTop: 8 },
  loadingPostsText: {
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  friendsSheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  friendsSheetBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  friendsSheet: {
    maxHeight: "72%",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: "hidden",
  },
  friendsSheetHeader: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  friendsSheetTitle: {
    fontFamily: Fonts.rounded,
    fontSize: 24,
    lineHeight: 29,
    fontWeight: "900",
  },
  friendsSheetSubtitle: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "700",
  },
  friendsSheetClose: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
  },
  friendsSheetList: {
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  friendRow: {
    minHeight: 62,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 14,
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  friendRowText: { minWidth: 0, flex: 1, gap: 2 },
  friendRowName: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
  },
  friendRowEmail: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  pressed: { opacity: 0.72 },
});
