import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { type MenuAction, MenuView } from "@expo/ui/community/menu";
import { useQueryClient } from "@tanstack/react-query";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
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
  fetchMyPostsPage,
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
  toDateKey,
} from "@/lib/habit-logs-client";
import type { HabitVisibility } from "@/lib/habits-client";
import { playSelectionHaptic, playSuccessHaptic } from "@/lib/haptics";
import {
  appendMyPostsPage,
  flattenMyPosts,
  getMyPostsNextCursor,
  myPostsQueryOptions,
  myProfileQueryOptions,
} from "@/lib/my-profile-query";
import { richTextToPlainText } from "@/lib/rich-text";
import {
  type WeeklyPlanNote,
  fetchWeeklyPlanNotes,
} from "@/lib/weekly-plan-notes-client";

type SymbolName = SymbolViewProps["name"];
type ProfileBodySection = "posts" | "notes" | "daily" | "periodic";
type ProfileNoteFilter = "weekly" | "daily" | "monthly";
type ProfilePostFilter =
  | "all"
  | "private"
  | "select_friends"
  | "all_friends"
  | "reflections"
  | `goal:${string}`;
type ActiveHabitDay = { dateKey: string; habit: FriendProfileHabit };

const PROFILE_BODY_SECTIONS: Array<{
  key: ProfileBodySection;
  label: string;
}> = [
  { key: "posts", label: "Posts" },
  { key: "notes", label: "Notes" },
  { key: "daily", label: "Daily" },
  { key: "periodic", label: "Periodic" },
];

const PROFILE_NOTE_FILTERS: Array<{ key: ProfileNoteFilter; label: string }> = [
  { key: "weekly", label: "Weekly" },
  { key: "daily", label: "Daily" },
  { key: "monthly", label: "Monthly" },
];
const NOTE_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const NOTE_MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
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
      createdAt: null,
      lastOpenedAt: null,
    },
    stats: {
      daysUntilBirthday: 0,
      friendCount: 0,
      goalCompletions: 0,
      habitCompletions: 0,
      incentivesEarned: 0,
      incentivesGiven: 0,
      longestStreak: 0,
      taskCompletions: 0,
    },
    dateKeys: [],
    categories: [],
    periodicHabits: [],
    logsByHabitDate: {},
  };
}

function startOfWeek(date: Date) {
  const weekStart = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
  );
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  return weekStart;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatProfileWeekRange(weekStartDate: string) {
  const start = dateFromProfileKey(weekStartDate);
  const end = addDays(start, 6);
  const month = new Intl.DateTimeFormat("en-US", { month: "short" });
  if (start.getMonth() === end.getMonth()) {
    return `${month.format(start)} ${start.getDate()}-${end.getDate()}`;
  }
  return `${month.format(start)} ${start.getDate()}-${month.format(end)} ${end.getDate()}`;
}

function getProfileMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function dateFromProfileMonthKey(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  return new Date(year ?? new Date().getFullYear(), (month ?? 1) - 1, 1);
}

function formatProfileMonthLabel(monthKey: string) {
  const date = dateFromProfileMonthKey(monthKey);
  return `${NOTE_MONTH_LABELS[date.getMonth()]} ${date.getFullYear()}`;
}

type ProfileNoteMonthFilter = number | "all";
type ProfileNoteYearFilter = number | "all";

function getProfileNotesFilterKey(
  month: ProfileNoteMonthFilter,
  year: ProfileNoteYearFilter,
) {
  return `${month}:${year}`;
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
  const queryClient = useQueryClient();
  const router = useRouter();
  const tabBarHeight = useTabBarHeight();
  const { width } = useWindowDimensions();
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [posts, setPosts] = useState<FriendFeedEntry[]>([]);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [weeklyPlanNotes, setWeeklyPlanNotes] = useState<WeeklyPlanNote[]>([]);
  const [isFriendsSheetOpen, setIsFriendsSheetOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [arePostsLoading, setArePostsLoading] = useState(true);
  const [postsCursor, setPostsCursor] = useState<string | null>(null);
  const [isLoadingMorePosts, setIsLoadingMorePosts] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isNudging, setIsNudging] = useState(false);
  const [profileImageViewerUrl, setProfileImageViewerUrl] = useState<
    string | null
  >(null);
  const [activeBodySection, setActiveBodySection] =
    useState<ProfileBodySection>("posts");
  const [postFilter, setPostFilter] = useState<ProfilePostFilter>("all");
  const [noteFilter, setNoteFilter] = useState<ProfileNoteFilter>("weekly");
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
  const visibleBodySections = useMemo(
    () =>
      self
        ? PROFILE_BODY_SECTIONS
        : PROFILE_BODY_SECTIONS.filter((section) => section.key !== "notes"),
    [self],
  );
  const visibleActiveBodySection =
    !self && activeBodySection === "notes" ? "posts" : activeBodySection;

  const load = useCallback(
    async (refresh = false) => {
      if (privateProfile) {
        setProfile(
          createPrivateProfilePreview({ friendId, initialImage, initialName }),
        );
        setPosts([]);
        setPostsCursor(null);
        setFriends([]);
        setWeeklyPlanNotes([]);
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
          const nextProfile = refresh
            ? await queryClient.fetchQuery({
                ...myProfileQueryOptions(),
                staleTime: 0,
              })
            : await queryClient.ensureQueryData(myProfileQueryOptions());

          if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
            return;
          }

          setProfile(nextProfile);
          setIsLoading(false);

          const currentMonth = new Date();
          const [myPostsData, nextFriends, nextWeeklyPlanNotes] =
            await Promise.all([
              (refresh
                ? queryClient.fetchInfiniteQuery({
                    ...myPostsQueryOptions(),
                    staleTime: 0,
                  })
                : queryClient.ensureInfiniteQueryData(myPostsQueryOptions())
              ).catch(() => null),
              fetchFriends().catch(() => []),
              fetchWeeklyPlanNotes({
                month: currentMonth.getMonth() + 1,
                year: currentMonth.getFullYear(),
              }).catch(() => []),
            ]);
          const myPosts = flattenMyPosts(myPostsData ?? undefined);

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
          setPostsCursor(
            myPostsData ? getMyPostsNextCursor(myPostsData) : null,
          );
          setWeeklyPlanNotes(nextWeeklyPlanNotes);
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
          setWeeklyPlanNotes([]);
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
          setPostsCursor(null);
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
          setPostsCursor(null);
          setWeeklyPlanNotes([]);
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
    [
      friendId,
      friendshipId,
      initialImage,
      initialName,
      privateProfile,
      queryClient,
      self,
    ],
  );

  const loadMorePosts = useCallback(async () => {
    if (!self || !postsCursor || isLoadingMorePosts) return;

    setIsLoadingMorePosts(true);
    try {
      const nextPage = await fetchMyPostsPage({
        cursor: postsCursor,
        limit: 21,
      });
      if (!isMountedRef.current) return;

      appendMyPostsPage(queryClient, postsCursor, nextPage);
      setPosts((currentPosts) => {
        const existingIds = new Set(currentPosts.map((post) => post.id));
        return [
          ...currentPosts,
          ...nextPage.items.filter(
            (post) => !existingIds.has(post.id) && hasProfileGridContent(post),
          ),
        ];
      });
      setPostsCursor(nextPage.nextCursor);
    } catch {
      // Keep the cursor so the next scroll can retry the request.
    } finally {
      if (isMountedRef.current) setIsLoadingMorePosts(false);
    }
  }, [isLoadingMorePosts, postsCursor, queryClient, self]);

  const handleProfileScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (!self || visibleActiveBodySection !== "posts") return;

      const { contentOffset, contentSize, layoutMeasurement } =
        event.nativeEvent;
      if (
        contentOffset.y + layoutMeasurement.height >=
        contentSize.height - 500
      ) {
        void loadMorePosts();
      }
    },
    [loadMorePosts, self, visibleActiveBodySection],
  );

  const refreshOwnProfile = useCallback(async () => {
    if (!self) return;
    const nextProfile = await queryClient.fetchQuery({
      ...myProfileQueryOptions(),
      staleTime: 0,
    });
    if (isMountedRef.current) setProfile(nextProfile);
  }, [queryClient, self]);

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
          onScroll={handleProfileScroll}
          scrollEventThrottle={200}
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
                    onPress={
                      profile.friend.image
                        ? () => setProfileImageViewerUrl(profile.friend.image)
                        : undefined
                    }
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
                  <ProfileStat
                    label="longest streak"
                    value={profile.stats.longestStreak}
                  />
                  <ProfileStat
                    label="days until birthday"
                    value={profile.stats.daysUntilBirthday}
                  />
                  {/*
                  <ProfileStat
                    label="incentives given"
                    value={profile.stats.incentivesGiven}
                  />
                  */}
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
                activeSection={visibleActiveBodySection}
                locked={privateProfile}
                sections={visibleBodySections}
                onChange={setActiveBodySection}
              />

              {privateProfile ? (
                <PrivateProfileSection section={visibleActiveBodySection} />
              ) : visibleActiveBodySection === "posts" ? (
                <ProfilePostsGrid
                  arePostsLoading={arePostsLoading}
                  filter={postFilter}
                  hasMorePosts={Boolean(self && postsCursor)}
                  isLoadingMorePosts={isLoadingMorePosts}
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
              ) : visibleActiveBodySection === "notes" ? (
                <ProfileNotesSection
                  activeFilter={noteFilter}
                  accountCreatedAt={profile.friend.createdAt}
                  self={self}
                  weeklyNotes={weeklyPlanNotes}
                  onChangeFilter={setNoteFilter}
                />
              ) : visibleActiveBodySection === "daily" ? (
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
      <Modal
        animationType="fade"
        onRequestClose={() => setProfileImageViewerUrl(null)}
        statusBarTranslucent
        transparent
        visible={Boolean(profileImageViewerUrl)}
      >
        <View style={styles.profileImageViewer}>
          <Pressable
            accessibilityLabel="Close profile photo"
            accessibilityRole="button"
            onPress={() => setProfileImageViewerUrl(null)}
            style={styles.profileImageViewerBackdrop}
          />
          {profileImageViewerUrl ? (
            <Image
              contentFit="contain"
              source={{ uri: profileImageViewerUrl }}
              style={styles.profileImageViewerImage}
            />
          ) : null}
          <Pressable
            accessibilityLabel="Close profile photo"
            accessibilityRole="button"
            onPress={() => setProfileImageViewerUrl(null)}
            style={({ pressed }) => [
              styles.profileImageViewerClose,
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={sym("xmark", "close")}
              size={22}
              weight="bold"
              tintColor="#FFFFFF"
            />
          </Pressable>
        </View>
      </Modal>
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
  sections,
  onChange,
}: {
  activeSection: ProfileBodySection;
  locked?: boolean;
  sections: Array<{ key: ProfileBodySection; label: string }>;
  onChange: (section: ProfileBodySection) => void;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.profileBodyTabs, { borderColor: theme.tabBorder }]}>
      {sections.map((section) => {
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
      : section === "notes"
        ? "Notes"
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

function ProfileNotesSection({
  activeFilter,
  accountCreatedAt,
  onChangeFilter,
  self,
  weeklyNotes,
}: {
  activeFilter: ProfileNoteFilter;
  accountCreatedAt: string | null;
  onChangeFilter: (filter: ProfileNoteFilter) => void;
  self: boolean;
  weeklyNotes: WeeklyPlanNote[];
}) {
  const theme = useTheme();
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth() + 1;
  const currentYear = currentDate.getFullYear();
  const [selectedMonth, setSelectedMonth] =
    useState<ProfileNoteMonthFilter>(currentMonth);
  const [selectedYear, setSelectedYear] =
    useState<ProfileNoteYearFilter>(currentYear);
  const [notesByFilterKey, setNotesByFilterKey] = useState<
    Record<string, WeeklyPlanNote[]>
  >({});
  const [loadingFilterKey, setLoadingFilterKey] = useState<string | null>(null);
  const yearOptions = useMemo(() => {
    const createdAt = accountCreatedAt ? new Date(accountCreatedAt) : null;
    const createdYear =
      createdAt && !Number.isNaN(createdAt.getTime())
        ? createdAt.getFullYear()
        : null;

    if (createdYear) {
      const startYear = Math.min(createdYear, currentYear);
      return Array.from(
        { length: currentYear - startYear + 1 },
        (_, index) => currentYear - index,
      );
    }

    const noteYears = new Set<number>();
    for (const note of [
      ...weeklyNotes,
      ...Object.values(notesByFilterKey).flat(),
    ]) {
      const year = dateFromProfileKey(note.weekStartDate).getFullYear();
      if (!Number.isNaN(year)) noteYears.add(year);
    }

    return noteYears.size > 0
      ? [...noteYears].sort((left, right) => right - left)
      : [currentYear];
  }, [accountCreatedAt, currentYear, notesByFilterKey, weeklyNotes]);
  const selectedFilterKey = getProfileNotesFilterKey(
    selectedMonth,
    selectedYear,
  );
  const selectedMonthNotes =
    notesByFilterKey[selectedFilterKey] ??
    (selectedMonth === currentMonth && selectedYear === currentYear
      ? weeklyNotes
      : []);
  const visibleWeeklyNotes = selectedMonthNotes
    .filter((note) => {
      const date = dateFromProfileKey(note.weekStartDate);
      return (
        (selectedMonth === "all" || date.getMonth() + 1 === selectedMonth) &&
        (selectedYear === "all" || date.getFullYear() === selectedYear)
      );
    })
    .map((note) => ({
      ...note,
      text: richTextToPlainText(note.notes).trim(),
    }))
    .filter((note) => note.text.length > 0);

  useEffect(() => {
    const currentFilterKey = getProfileNotesFilterKey(
      currentMonth,
      currentYear,
    );
    setNotesByFilterKey((current) => ({
      ...current,
      [currentFilterKey]: weeklyNotes,
    }));
  }, [currentMonth, currentYear, weeklyNotes]);

  const loadNotesForFilter = useCallback(
    async (month: ProfileNoteMonthFilter, year: ProfileNoteYearFilter) => {
      const filterKey = getProfileNotesFilterKey(month, year);
      if (notesByFilterKey[filterKey]) return;

      setLoadingFilterKey(filterKey);
      try {
        const notes = await fetchWeeklyPlanNotes({
          month: month === "all" ? undefined : month,
          year: year === "all" ? undefined : year,
        });
        setNotesByFilterKey((current) => ({ ...current, [filterKey]: notes }));
      } catch {
        setNotesByFilterKey((current) => ({ ...current, [filterKey]: [] }));
      } finally {
        setLoadingFilterKey((current) =>
          current === filterKey ? null : current,
        );
      }
    },
    [notesByFilterKey],
  );

  const selectNotesFilter = useCallback(
    (month: ProfileNoteMonthFilter, year: ProfileNoteYearFilter) => {
      setSelectedMonth(month);
      setSelectedYear(year);
      void loadNotesForFilter(month, year);
    },
    [loadNotesForFilter],
  );
  const monthActions = useMemo<MenuAction[]>(
    () => [
      {
        id: "all",
        state: selectedMonth === "all" ? "on" : undefined,
        title: "All months",
      },
      ...NOTE_MONTH_NAMES.map((name, index) => ({
        id: String(index + 1),
        state: selectedMonth === index + 1 ? ("on" as const) : undefined,
        title: name,
      })),
    ],
    [selectedMonth],
  );
  const yearActions = useMemo<MenuAction[]>(
    () => [
      {
        id: "all",
        state: selectedYear === "all" ? "on" : undefined,
        title: "All years",
      },
      ...yearOptions.map((year) => ({
        id: String(year),
        state: selectedYear === year ? ("on" as const) : undefined,
        title: String(year),
      })),
    ],
    [selectedYear, yearOptions],
  );
  const selectedMonthLabel =
    selectedMonth === "all" ? "All" : NOTE_MONTH_NAMES[selectedMonth - 1];
  const selectedYearLabel =
    selectedYear === "all" ? "All" : String(selectedYear);
  const selectedNotesLabel =
    selectedMonth === "all" && selectedYear === "all"
      ? "All notes"
      : selectedMonth === "all"
        ? String(selectedYear)
        : selectedYear === "all"
          ? selectedMonthLabel
          : formatProfileMonthLabel(
              `${selectedYear}-${String(selectedMonth).padStart(2, "0")}`,
            );

  return (
    <View style={styles.notesSection}>
      <View style={styles.notesFilterRow}>
        {PROFILE_NOTE_FILTERS.map((filter) => {
          const isActive = filter.key === activeFilter;
          return (
            <Pressable
              key={filter.key}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              onPress={() => onChangeFilter(filter.key)}
              style={({ pressed }) => [
                styles.notesFilterButton,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.notesFilterText,
                  { color: isActive ? theme.text : theme.textSecondary },
                ]}
              >
                {filter.label}
              </Text>
              <View
                style={[
                  styles.notesFilterIndicator,
                  {
                    backgroundColor: isActive ? theme.primary : "transparent",
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>

      {activeFilter === "weekly" ? (
        <>
          <View style={styles.noteMonthHeader}>
            <Text style={[styles.noteMonthTitle, { color: theme.text }]}>
              {selectedNotesLabel}
            </Text>
            {loadingFilterKey === selectedFilterKey ? (
              <Text
                style={[styles.noteMonthStatus, { color: theme.textSecondary }]}
              >
                Loading
              </Text>
            ) : null}
          </View>

          {visibleWeeklyNotes.length > 0 ? (
            <View style={styles.noteList}>
              {visibleWeeklyNotes.map((note) => (
                <View key={note.weekStartDate} style={styles.notePreviewBlock}>
                  <Text
                    style={[styles.noteDateLabel, { color: theme.primary }]}
                  >
                    {formatProfileWeekRange(note.weekStartDate)}
                  </Text>
                  <Text style={[styles.noteBody, { color: theme.text }]}>
                    {note.text}
                  </Text>
                </View>
              ))}
            </View>
          ) : (
            <View style={styles.notesEmptyState}>
              <Text style={[styles.notesEmptyTitle, { color: theme.text }]}>
                {self ? "No weekly notes here" : "No shared weekly notes"}
              </Text>
              <Text
                style={[styles.notesEmptyText, { color: theme.textSecondary }]}
              >
                {self
                  ? `${selectedNotesLabel} does not have saved weekly notes yet.`
                  : "Notes this friend shares will show up here."}
              </Text>
            </View>
          )}

          <View style={styles.noteFilterDropdownRow}>
            <ProfileNotesFilterMenu
              actions={monthActions}
              label="Month"
              value={selectedMonthLabel}
              onSelect={(event) => {
                const month = event === "all" ? "all" : Number(event);
                if (month === "all" || (month >= 1 && month <= 12)) {
                  selectNotesFilter(month, selectedYear);
                }
              }}
            />
            <ProfileNotesFilterMenu
              actions={yearActions}
              label="Year"
              value={selectedYearLabel}
              onSelect={(event) => {
                const year = event === "all" ? "all" : Number(event);
                if (year === "all" || yearOptions.includes(year)) {
                  selectNotesFilter(selectedMonth, year);
                }
              }}
            />
          </View>
        </>
      ) : (
        <View style={styles.notesEmptyState}>
          <Text style={[styles.notesEmptyTitle, { color: theme.text }]}>
            {activeFilter === "daily"
              ? "Daily notes are not set up yet"
              : "Monthly notes are not set up yet"}
          </Text>
          <Text style={[styles.notesEmptyText, { color: theme.textSecondary }]}>
            For now, profile notes come from Weekly notes.
          </Text>
        </View>
      )}
    </View>
  );
}

function ProfilePostsGrid({
  arePostsLoading,
  filter,
  hasMorePosts,
  isLoadingMorePosts,
  onChangeFilter,
  onOpenPost,
  posts,
  self,
  tileSize,
}: {
  arePostsLoading: boolean;
  filter: ProfilePostFilter;
  hasMorePosts: boolean;
  isLoadingMorePosts: boolean;
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

    if (self) {
      actions.push(
        {
          id: "private",
          image: "lock.fill",
          state: filter === "private" ? "on" : undefined,
          title: "Private posts",
        },
        {
          id: "select_friends",
          image: "person.2.fill",
          state: filter === "select_friends" ? "on" : undefined,
          title: "Select friends",
        },
        {
          id: "all_friends",
          image: "globe",
          state: filter === "all_friends" ? "on" : undefined,
          title: "All friends",
        },
      );
    }

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
  }, [filter, goalOptions, hasReflections, self]);
  const selectedFilterLabel =
    filter === "all"
      ? "All posts"
      : filter === "private"
        ? "Private posts"
        : filter === "select_friends"
          ? "Select friends"
          : filter === "all_friends"
            ? "All friends"
            : filter === "reflections"
              ? "Daily reflections"
              : (goalOptions.find((goal) => filter === `goal:${goal.id}`)
                  ?.name ?? "All posts");
  const filteredPosts = useMemo(() => {
    if (filter === "all") return posts;
    if (filter === "private") {
      return posts.filter((post) => post.visibility === "only_me");
    }
    if (filter === "select_friends") {
      return posts.filter((post) => post.visibility === "goal_friends");
    }
    if (filter === "all_friends") {
      return posts.filter((post) => post.visibility === "all_friends");
    }
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
      filter !== "private" &&
      filter !== "select_friends" &&
      filter !== "all_friends" &&
      filter !== "reflections" &&
      !goalOptions.some((goal) => filter === `goal:${goal.id}`)
    ) {
      onChangeFilter("all");
    }
    if (filter === "reflections" && !hasReflections) {
      onChangeFilter("all");
    }
    if (
      !self &&
      (filter === "private" ||
        filter === "select_friends" ||
        filter === "all_friends")
    ) {
      onChangeFilter("all");
    }
  }, [filter, goalOptions, hasReflections, onChangeFilter, self]);

  if (posts.length > 0) {
    return (
      <View>
        <ProfilePostFilterButton
          actions={filterActions}
          value={selectedFilterLabel}
          onSelect={(event) => {
            if (
              event === "all" ||
              event === "private" ||
              event === "select_friends" ||
              event === "all_friends" ||
              event === "reflections"
            ) {
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
        {hasMorePosts && isLoadingMorePosts ? (
          <View style={styles.profilePostsLoadMore}>
            <ActivityIndicator color={theme.primary} size="small" />
          </View>
        ) : null}
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

function ProfileNotesFilterMenu({
  actions,
  label,
  onSelect,
  value,
}: {
  actions: MenuAction[];
  label: string;
  onSelect: (event: string) => void;
  value: string;
}) {
  const theme = useTheme();

  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => onSelect(nativeEvent.event)}
      style={styles.noteFilterMenu}
      title={`Filter notes by ${label.toLowerCase()}`}
    >
      <View
        accessible
        accessibilityLabel={`${label} filter. Currently ${value}`}
        accessibilityRole="button"
        style={[
          styles.noteFilterButton,
          {
            backgroundColor: theme.background,
            borderColor: theme.tabBorder,
          },
        ]}
      >
        <Text style={[styles.noteFilterLabel, { color: theme.textSecondary }]}>
          {label}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.noteFilterValue, { color: theme.text }]}
        >
          {value}
        </Text>
        <SymbolView
          name={sym("chevron.down", "expand_more")}
          size={14}
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
  onPress,
  size,
}: {
  image: string | null;
  name: string;
  onPress?: () => void;
  size: number;
}) {
  const theme = useTheme();

  const avatar = (
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

  if (!onPress) return avatar;

  return (
    <Pressable
      accessibilityLabel="View profile photo"
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}
    >
      {avatar}
    </Pressable>
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
  const safeValue =
    typeof value === "number" && Number.isFinite(value) ? value : 0;

  const content = (
    <>
      <Text style={[styles.statValue, { color: theme.text }]}>
        {safeValue.toLocaleString()}
      </Text>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
    </>
  );

  if (onPress) {
    return (
      <Pressable
        accessibilityLabel={`${safeValue.toLocaleString()} ${label}`}
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
  profileImageViewer: {
    alignItems: "center",
    backgroundColor: "rgba(0, 0, 0, 0.94)",
    flex: 1,
    justifyContent: "center",
  },
  profileImageViewerBackdrop: StyleSheet.absoluteFill,
  profileImageViewerImage: {
    height: "80%",
    width: "100%",
  },
  profileImageViewerClose: {
    alignItems: "center",
    borderRadius: 22,
    height: 44,
    justifyContent: "center",
    position: "absolute",
    right: 16,
    top: 16,
    width: 44,
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
    width: "100%",
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
  notesSection: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 24,
  },
  notesFilterRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
    marginBottom: 22,
  },
  notesFilterButton: {
    minHeight: 34,
    justifyContent: "center",
  },
  notesFilterText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  notesFilterIndicator: {
    height: 2,
    marginTop: 5,
    borderRadius: 999,
  },
  noteMonthHeader: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },
  noteMonthTitle: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "900",
    letterSpacing: -0.4,
  },
  noteMonthStatus: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
  },
  noteList: {
    gap: 24,
  },
  notePreviewBlock: {
    gap: 9,
  },
  noteDateLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
  },
  noteBody: {
    fontSize: 16,
    lineHeight: 23,
    fontWeight: "500",
  },
  notesEmptyState: {
    alignItems: "flex-start",
    gap: 5,
    paddingTop: 8,
  },
  notesEmptyTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
  },
  notesEmptyText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "600",
  },
  noteFilterDropdownRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 22,
  },
  noteFilterMenu: {
    flex: 1,
  },
  noteFilterButton: {
    minHeight: 46,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
  },
  noteFilterLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
  noteFilterValue: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
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
  profilePostsLoadMore: {
    alignItems: "center",
    paddingVertical: 16,
  },
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
