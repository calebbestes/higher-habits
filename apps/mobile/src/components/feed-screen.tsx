import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { Image, type ImageLoadEventData } from "expo-image";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Keyboard,
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
  useWindowDimensions,
} from "react-native";
import RenderHTML, { type MixedStyleRecord } from "react-native-render-html";
import { SafeAreaView } from "react-native-safe-area-context";

import { BrandedEmptyState } from "@/components/branded-empty-state";
import { CollabHeaderMenu } from "@/components/collab-header-menu";
import {
  type ImageNaturalSize,
  PhotoBackdropHitTargets,
  getContainedImageFrame,
} from "@/components/photo-backdrop-hit-targets";
import { Fonts, MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import { deleteCheckpointPhoto } from "@/lib/checkpoint-photos-client";
import {
  type FriendFeedComment,
  type FriendFeedEntry,
  type FriendFeedPhoto,
  type FriendGroupRow,
  addFeedComment,
  archiveFriend,
  deleteFeedComment,
  fetchFriendGroups,
  fetchFriends,
  fetchFriendsFeed,
  reportContent,
  toggleFeedProp,
} from "@/lib/friends-client";
import { deleteGoalPhoto } from "@/lib/goal-photos-client";
import {
  playSelectionHaptic,
  playSuccessHaptic,
  playWarningHaptic,
} from "@/lib/haptics";
import { richTextToPlainText } from "@/lib/rich-text";

type SymbolName = SymbolViewProps["name"];
type ActiveFeedPhoto = {
  entry: FriendFeedEntry;
  photo: FriendFeedPhoto;
};

const HIDDEN_FEED_GOALS_KEY = "hidden-feed-goals";
const FEED_FILTER_PREFERENCES_KEY = "feed-filter-preferences";

type FeedFilters = {
  groupIds: string[];
  categoryIds: string[];
};

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function feedGoalKey(entry: Pick<FriendFeedEntry, "goal" | "kind">): string {
  return `${entry.kind}:${entry.goal.id}`;
}

function formatFeedDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y as number, (m as number) - 1, d as number);
  if (Number.isNaN(date.getTime())) return dateKey;

  const today = new Date();
  const todayAtNoon = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate(),
    12,
  );
  const postAtNoon = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    12,
  );
  const diffDays = Math.round(
    (todayAtNoon.getTime() - postAtNoon.getTime()) / 86_400_000,
  );

  if (diffDays >= 0 && diffDays < 7) {
    return `${new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date)}.`;
  }

  return new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    month: "numeric",
    year: "2-digit",
  }).format(date);
}

function formatCommentTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function countComments(comments: FriendFeedComment[]): number {
  return comments.reduce(
    (total, comment) => total + 1 + countComments(comment.replies),
    0,
  );
}

function removeCommentById(
  comments: FriendFeedComment[],
  commentId: string,
): FriendFeedComment[] {
  return comments
    .filter((comment) => comment.id !== commentId)
    .map((comment) => ({
      ...comment,
      replies: removeCommentById(comment.replies, commentId),
    }));
}

async function getStoredHiddenFeedGoals(): Promise<Set<string>> {
  const stored =
    Platform.OS === "web"
      ? globalThis.localStorage?.getItem(HIDDEN_FEED_GOALS_KEY)
      : await SecureStore.getItemAsync(HIDDEN_FEED_GOALS_KEY);

  if (!stored) return new Set();

  try {
    const parsed = JSON.parse(stored);
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((value): value is string => typeof value === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

async function setStoredHiddenFeedGoals(keys: Set<string>) {
  const value = JSON.stringify([...keys]);
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(HIDDEN_FEED_GOALS_KEY, value);
    return;
  }

  await SecureStore.setItemAsync(HIDDEN_FEED_GOALS_KEY, value);
}

function normalizeFilterIds(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return typeof value === "string" && value ? [value] : [];
}

async function getStoredFeedFilters(): Promise<FeedFilters> {
  const stored =
    Platform.OS === "web"
      ? globalThis.localStorage?.getItem(FEED_FILTER_PREFERENCES_KEY)
      : await SecureStore.getItemAsync(FEED_FILTER_PREFERENCES_KEY);

  if (!stored) return { groupIds: [], categoryIds: [] };

  try {
    const parsed = JSON.parse(stored);
    return {
      groupIds: normalizeFilterIds(parsed?.groupIds ?? parsed?.groupId),
      categoryIds: normalizeFilterIds(
        parsed?.categoryIds ?? parsed?.categoryId,
      ),
    };
  } catch {
    return { groupIds: [], categoryIds: [] };
  }
}

async function setStoredFeedFilters(filters: FeedFilters) {
  const value = JSON.stringify(filters);
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(FEED_FILTER_PREFERENCES_KEY, value);
    return;
  }

  await SecureStore.setItemAsync(FEED_FILTER_PREFERENCES_KEY, value);
}

export function FeedScreen() {
  const theme = useTheme();
  const router = useRouter();
  const tabBarHeight = useTabBarHeight();
  const { width: viewportWidth, height: viewportHeight } =
    useWindowDimensions();
  const lightboxViewportStyle = useMemo(
    () => ({ width: viewportWidth, height: viewportHeight }),
    [viewportHeight, viewportWidth],
  );
  const [entries, setEntries] = useState<FriendFeedEntry[]>([]);
  const [friendGroups, setFriendGroups] = useState<FriendGroupRow[]>([]);
  const [feedFilters, setFeedFilters] = useState<FeedFilters>({
    groupIds: [],
    categoryIds: [],
  });
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [replyTargets, setReplyTargets] = useState<
    Record<string, FriendFeedComment | null>
  >({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(
    null,
  );
  const [activePhoto, setActivePhoto] = useState<ActiveFeedPhoto | null>(null);
  const [lightboxPhotoSizes, setLightboxPhotoSizes] = useState<
    Record<string, ImageNaturalSize>
  >({});
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);
  const [hiddenFeedGoalKeys, setHiddenFeedGoalKeys] = useState<Set<string>>(
    new Set(),
  );
  const [activeCommentsEntryId, setActiveCommentsEntryId] = useState<
    string | null
  >(null);
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const lightboxPagerRef = useRef<ScrollView>(null);
  const lightboxPhotos = activePhoto?.entry.photos ?? [];
  const lightboxPhotoIndex = activePhoto
    ? Math.max(
        0,
        lightboxPhotos.findIndex((photo) => photo.id === activePhoto.photo.id),
      )
    : 0;

  useEffect(() => {
    if (!activePhoto || viewportWidth <= 0) return;
    requestAnimationFrame(() => {
      lightboxPagerRef.current?.scrollTo({
        x: lightboxPhotoIndex * viewportWidth,
        animated: false,
      });
    });
  }, [activePhoto, lightboxPhotoIndex, viewportWidth]);

  const closeActivePhoto = useCallback(() => setActivePhoto(null), []);

  const handleLightboxPhotoLoad = useCallback(
    (photoId: string, event: ImageLoadEventData) => {
      const { height, width } = event.source;
      if (width <= 0 || height <= 0) return;

      setLightboxPhotoSizes((prev) => {
        const existing = prev[photoId];
        if (existing?.width === width && existing.height === height) {
          return prev;
        }

        return { ...prev, [photoId]: { width, height } };
      });
    },
    [],
  );

  const load = useCallback(async (refresh = false) => {
    const requestId = loadRequestIdRef.current + 1;
    loadRequestIdRef.current = requestId;
    refresh ? setIsRefreshing(true) : setIsLoading(true);
    setError(null);
    try {
      const [data, groups] = await Promise.all([
        fetchFriendsFeed(),
        fetchFriendGroups().catch(() => []),
      ]);
      if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
        return;
      }
      setEntries(data);
      setFriendGroups(groups);
    } catch (err) {
      if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
        return;
      }
      setError(err instanceof Error ? err.message : "Could not load feed.");
    } finally {
      if (isMountedRef.current && requestId === loadRequestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void getStoredHiddenFeedGoals().then((keys) => {
      if (isMountedRef.current) setHiddenFeedGoalKeys(keys);
    });
  }, []);

  useEffect(() => {
    void getStoredFeedFilters().then((filters) => {
      if (isMountedRef.current) setFeedFilters(filters);
    });
  }, []);

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  const handleToggleProp = useCallback(
    async (entryId: string) => {
      const entry = entries.find((item) => item.id === entryId);
      if (!entry?.props.hasPropped) {
        playSuccessHaptic();
      } else {
        playSelectionHaptic();
      }
      setEntries((prev) =>
        prev.map((e) =>
          e.id !== entryId
            ? e
            : {
                ...e,
                props: {
                  count: e.props.hasPropped
                    ? Math.max(e.props.count - 1, 0)
                    : e.props.count + 1,
                  hasPropped: !e.props.hasPropped,
                },
              },
        ),
      );
      try {
        await toggleFeedProp(entryId);
      } catch (err) {
        setEntries((prev) =>
          prev.map((e) =>
            e.id !== entryId
              ? e
              : {
                  ...e,
                  props: {
                    count: e.props.hasPropped
                      ? Math.max(e.props.count - 1, 0)
                      : e.props.count + 1,
                    hasPropped: !e.props.hasPropped,
                  },
                },
          ),
        );
        Alert.alert(
          "Could not update props",
          err instanceof Error ? err.message : undefined,
        );
      }
    },
    [entries],
  );

  const handleAddComment = useCallback(
    async (entryId: string) => {
      const body = (commentDrafts[entryId] ?? "").trim();
      if (!body || submittingComment) return;

      const replyTarget = replyTargets[entryId] ?? null;
      setSubmittingComment(entryId);
      try {
        await addFeedComment(entryId, body, replyTarget?.id ?? null);
        playSuccessHaptic();
        if (!isMountedRef.current) return;
        setCommentDrafts((prev) => ({ ...prev, [entryId]: "" }));
        setReplyTargets((prev) => ({ ...prev, [entryId]: null }));
        const data = await fetchFriendsFeed();
        if (!isMountedRef.current) return;
        setEntries(data);
      } catch (err) {
        if (!isMountedRef.current) return;
        Alert.alert(
          "Could not add comment",
          err instanceof Error ? err.message : undefined,
        );
      } finally {
        if (isMountedRef.current) setSubmittingComment(null);
      }
    },
    [commentDrafts, replyTargets, submittingComment],
  );

  const handleDeleteComment = useCallback(
    async (entryId: string, commentId: string) => {
      try {
        await deleteFeedComment(entryId, commentId);
        playWarningHaptic();
        if (!isMountedRef.current) return;
        setEntries((prev) =>
          prev.map((e) =>
            e.id !== entryId
              ? e
              : {
                  ...e,
                  comments: removeCommentById(e.comments, commentId),
                },
          ),
        );
        setReplyTargets((prev) =>
          prev[entryId]?.id === commentId ? { ...prev, [entryId]: null } : prev,
        );
      } catch (err) {
        if (!isMountedRef.current) return;
        Alert.alert(
          "Could not delete comment",
          err instanceof Error ? err.message : undefined,
        );
      }
    },
    [],
  );

  const handleDeletePhoto = useCallback(
    (active: ActiveFeedPhoto) => {
      if (!active.entry.canDeletePhotos || deletingPhotoId) return;

      playWarningHaptic();
      Alert.alert("Delete photo?", "This permanently removes this photo.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setDeletingPhotoId(active.photo.id);
            const deletePhoto =
              active.entry.kind === "goal_checkpoint"
                ? deleteCheckpointPhoto(active.photo.id)
                : deleteGoalPhoto(active.photo.id);

            void deletePhoto
              .then(() => {
                if (!isMountedRef.current) return;
                setEntries((prev) =>
                  prev.flatMap((entry) => {
                    if (entry.id !== active.entry.id) return [entry];

                    const photos = entry.photos.filter(
                      (photo) => photo.id !== active.photo.id,
                    );
                    if (
                      !richTextToPlainText(entry.notes).trim() &&
                      !photos.length
                    ) {
                      return [];
                    }

                    return [{ ...entry, photos }];
                  }),
                );
                setActivePhoto(null);
              })
              .catch((err: unknown) => {
                if (!isMountedRef.current) return;
                Alert.alert(
                  "Could not delete photo",
                  err instanceof Error ? err.message : undefined,
                );
              })
              .finally(() => {
                if (isMountedRef.current) setDeletingPhotoId(null);
              });
          },
        },
      ]);
    },
    [deletingPhotoId],
  );

  const reportPost = useCallback(async (entry: FriendFeedEntry) => {
    try {
      await reportContent({
        targetType: "feed_post",
        targetId: entry.id,
        reason: "Reported from feed post actions.",
        context: {
          friendId: entry.friend.id,
          goalId: entry.goal.id,
          dateKey: entry.dateKey,
        },
      });
      if (!isMountedRef.current) return;
      Alert.alert("Report sent", "Thanks. We'll review this post.");
    } catch (err) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Could not send report",
        err instanceof Error ? err.message : undefined,
      );
    }
  }, []);

  const reportComment = useCallback(
    async (entry: FriendFeedEntry, comment: FriendFeedComment) => {
      try {
        await reportContent({
          targetType: "feed_comment",
          targetId: comment.id,
          reason: "Reported from feed comment actions.",
          context: {
            feedPostId: entry.id,
            authorId: comment.userId,
            parentCommentId: comment.parentCommentId,
          },
        });
        if (!isMountedRef.current) return;
        Alert.alert("Report sent", "Thanks. We'll review this comment.");
      } catch (err) {
        if (!isMountedRef.current) return;
        Alert.alert(
          "Could not send report",
          err instanceof Error ? err.message : undefined,
        );
      }
    },
    [],
  );

  const blockFriend = useCallback(async (entry: FriendFeedEntry) => {
    try {
      await reportContent({
        targetType: "user",
        targetId: entry.friend.id,
        reason: "Blocked from feed post actions.",
        context: { feedPostId: entry.id },
      }).catch(() => undefined);

      const friends = await fetchFriends();
      const friendship = friends.find(
        (friend) =>
          friend.friendId === entry.friend.id && friend.status === "accepted",
      );

      if (!friendship) {
        throw new Error("Friendship not found.");
      }

      await archiveFriend(friendship.id);
      if (!isMountedRef.current) return;
      setEntries((prev) =>
        prev.filter((item) => item.friend.id !== entry.friend.id),
      );
      setActiveCommentsEntryId((current) =>
        current === entry.id ? null : current,
      );
      Alert.alert("Blocked", `${entry.friend.name} was removed.`);
    } catch (err) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Could not block user",
        err instanceof Error ? err.message : undefined,
      );
    }
  }, []);

  const unfollowFriend = useCallback(async (entry: FriendFeedEntry) => {
    try {
      const friends = await fetchFriends();
      const friendship = friends.find(
        (friend) =>
          friend.friendId === entry.friend.id && friend.status === "accepted",
      );

      if (!friendship) {
        throw new Error("Friendship not found.");
      }

      await archiveFriend(friendship.id);
      if (!isMountedRef.current) return;
      setEntries((prev) =>
        prev.filter((item) => item.friend.id !== entry.friend.id),
      );
      setActiveCommentsEntryId((current) =>
        current === entry.id ? null : current,
      );
      Alert.alert("Unfollowed", `${entry.friend.name} was removed.`);
    } catch (err) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Could not unfollow user",
        err instanceof Error ? err.message : undefined,
      );
    }
  }, []);

  const unfollowFeedGoal = useCallback(
    async (entry: FriendFeedEntry) => {
      const key = feedGoalKey(entry);
      const next = new Set(hiddenFeedGoalKeys);
      next.add(key);
      setHiddenFeedGoalKeys(next);
      setEntries((prev) => prev.filter((item) => feedGoalKey(item) !== key));
      setActiveCommentsEntryId((current) =>
        current === entry.id ? null : current,
      );

      try {
        await setStoredHiddenFeedGoals(next);
        Alert.alert(
          "Unfollowed",
          `${entry.goal.name} will no longer show in your feed.`,
        );
      } catch (err) {
        if (!isMountedRef.current) return;
        setHiddenFeedGoalKeys(hiddenFeedGoalKeys);
        Alert.alert(
          "Could not unfollow",
          err instanceof Error ? err.message : undefined,
        );
      }
    },
    [hiddenFeedGoalKeys],
  );

  const openPostSafetyActions = useCallback(
    (entry: FriendFeedEntry) => {
      const goalLabel = entry.kind === "habit" ? "habit" : "goal";
      Alert.alert(entry.friend.name, "Choose an action.", [
        {
          text: `Unfollow ${entry.friend.name}`,
          onPress: () => void unfollowFriend(entry),
        },
        {
          text: `Unfollow this ${goalLabel}`,
          onPress: () => void unfollowFeedGoal(entry),
        },
        { text: "Report Post", onPress: () => void reportPost(entry) },
        {
          text: "Block User",
          style: "destructive",
          onPress: () => void blockFriend(entry),
        },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [blockFriend, reportPost, unfollowFeedGoal, unfollowFriend],
  );

  const openFriendProfile = useCallback(
    (entry: FriendFeedEntry) => {
      router.push({
        pathname: "/friend-profile",
        params: {
          friendId: entry.friend.id,
          initialName: entry.friend.name,
        },
      });
    },
    [router],
  );

  const activeCommentsEntry = activeCommentsEntryId
    ? (entries.find((entry) => entry.id === activeCommentsEntryId) ?? null)
    : null;
  const categoryOptions = useMemo(() => {
    const categoriesById = new Map<
      string,
      NonNullable<FriendFeedEntry["category"]>
    >();

    for (const entry of entries) {
      if (entry.category) {
        const nameKey = entry.category.name.trim().toLowerCase();
        if (nameKey && !categoriesById.has(nameKey)) {
          categoriesById.set(nameKey, entry.category);
        }
      }
    }

    return [...categoriesById.values()].sort((left, right) =>
      left.name.localeCompare(right.name),
    );
  }, [entries]);
  const activeGroupIds = useMemo(
    () =>
      feedFilters.groupIds.filter((groupId) =>
        friendGroups.some((group) => group.id === groupId),
      ),
    [feedFilters.groupIds, friendGroups],
  );
  const activeGroupIdSet = useMemo(
    () => new Set(activeGroupIds),
    [activeGroupIds],
  );
  const activeCategoryIds = useMemo(
    () =>
      feedFilters.categoryIds.filter((categoryId) =>
        categoryOptions.some((category) => category.id === categoryId),
      ),
    [categoryOptions, feedFilters.categoryIds],
  );
  const activeCategoryIdSet = useMemo(
    () => new Set(activeCategoryIds),
    [activeCategoryIds],
  );
  const activeCategoryNameSet = useMemo(() => {
    const names = new Set<string>();
    for (const category of categoryOptions) {
      if (activeCategoryIdSet.has(category.id)) {
        names.add(category.name.trim().toLowerCase());
      }
    }
    return names;
  }, [activeCategoryIdSet, categoryOptions]);
  const activeGroupMemberIds = useMemo(() => {
    const memberIds = new Set<string>();
    for (const group of friendGroups) {
      if (activeGroupIdSet.has(group.id)) {
        for (const member of group.members) memberIds.add(member.id);
      }
    }
    return memberIds;
  }, [activeGroupIdSet, friendGroups]);
  const visibleEntries = useMemo(
    () =>
      entries.filter((entry) => {
        if (hiddenFeedGoalKeys.has(feedGoalKey(entry))) return false;
        if (
          activeGroupIds.length &&
          !activeGroupMemberIds.has(entry.friend.id)
        ) {
          return false;
        }
        if (
          activeCategoryNameSet.size &&
          !activeCategoryNameSet.has(
            entry.category?.name.trim().toLowerCase() ?? "",
          )
        ) {
          return false;
        }
        return true;
      }),
    [
      activeCategoryNameSet,
      activeGroupIds.length,
      activeGroupMemberIds,
      entries,
      hiddenFeedGoalKeys,
    ],
  );
  const saveFeedFilters = useCallback((filters: FeedFilters) => {
    setFeedFilters(filters);
    void setStoredFeedFilters(filters).catch(() => undefined);
  }, []);
  const activeFilterCount = activeGroupIds.length + activeCategoryIds.length;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <ScrollView
            canCancelContentTouches={false}
            contentContainerStyle={[
              styles.content,
              { paddingBottom: tabBarHeight + 16 },
            ]}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                tintColor={theme.primary}
                onRefresh={() => void load(true)}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            {/* Page header */}
            <View style={styles.pageHeader}>
              <View style={styles.pageHeaderText}>
                <CollabHeaderMenu currentSection="feed" />
              </View>
              <Pressable
                accessibilityLabel="Filter feed"
                accessibilityRole="button"
                onPress={() => setIsFilterOpen(true)}
                style={({ pressed }) => [
                  styles.filterButton,
                  { backgroundColor: theme.backgroundElement },
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={sym("line.3.horizontal.decrease.circle", "tune")}
                  size={22}
                  weight="semibold"
                  tintColor={theme.primary}
                />
                {activeFilterCount > 0 ? (
                  <View
                    style={[
                      styles.filterBadge,
                      { backgroundColor: theme.primary },
                    ]}
                  >
                    <Text
                      style={[
                        styles.filterBadgeText,
                        { color: theme.primaryForeground },
                      ]}
                    >
                      {activeFilterCount}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            </View>

            {error ? (
              <View style={styles.errorBanner}>
                <SymbolView
                  name={sym("exclamationmark.circle.fill", "error")}
                  size={18}
                  tintColor="#9D474D"
                />
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
            ) : visibleEntries.length === 0 && !error ? (
              <View style={styles.centerState}>
                <BrandedEmptyState
                  title="No activity yet"
                  description="Friends' journal entries with photos will appear here."
                />
              </View>
            ) : (
              <View style={styles.feedList}>
                {visibleEntries.map((entry) => (
                  <FeedCard
                    key={entry.id}
                    entry={entry}
                    onToggleProp={() => void handleToggleProp(entry.id)}
                    onPhotoPress={(photo) => {
                      playSelectionHaptic();
                      setActivePhoto({ entry, photo });
                    }}
                    onOpenComments={() => {
                      playSelectionHaptic();
                      setActiveCommentsEntryId(entry.id);
                    }}
                    onOpenProfile={() => void openFriendProfile(entry)}
                    onOpenSafetyActions={() => openPostSafetyActions(entry)}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal
        visible={activePhoto !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closeActivePhoto}
      >
        <View style={styles.lightboxOverlay}>
          <Pressable
            accessibilityLabel="Close photo"
            style={StyleSheet.absoluteFill}
            onPress={closeActivePhoto}
          />
          {activePhoto ? (
            <>
              <ScrollView
                key={activePhoto.entry.id}
                ref={lightboxPagerRef}
                bounces={false}
                horizontal
                pagingEnabled
                onMomentumScrollEnd={(event) => {
                  const nextIndex = Math.round(
                    event.nativeEvent.contentOffset.x /
                      Math.max(1, viewportWidth),
                  );
                  const nextPhoto = lightboxPhotos[nextIndex];
                  if (nextPhoto && nextPhoto.id !== activePhoto.photo.id) {
                    playSelectionHaptic();
                    setActivePhoto({
                      entry: activePhoto.entry,
                      photo: nextPhoto,
                    });
                  }
                }}
                showsHorizontalScrollIndicator={false}
                showsVerticalScrollIndicator={false}
                style={styles.lightboxPager}
              >
                {lightboxPhotos.map((photo) => {
                  const imageFrame = getContainedImageFrame(
                    lightboxPhotoSizes[photo.id],
                    viewportWidth,
                    viewportHeight,
                  );

                  return (
                    <View key={photo.id} style={lightboxViewportStyle}>
                      <ScrollView
                        bounces={false}
                        bouncesZoom
                        centerContent
                        contentContainerStyle={[
                          styles.lightboxZoomContent,
                          lightboxViewportStyle,
                        ]}
                        maximumZoomScale={4}
                        minimumZoomScale={1}
                        pinchGestureEnabled
                        showsHorizontalScrollIndicator={false}
                        showsVerticalScrollIndicator={false}
                        style={styles.lightboxZoomFrame}
                      >
                        <View style={lightboxViewportStyle}>
                          <Image
                            source={{ uri: photo.url }}
                            style={styles.lightboxImage}
                            contentFit="contain"
                            onLoad={(event) =>
                              handleLightboxPhotoLoad(photo.id, event)
                            }
                          />
                        </View>
                      </ScrollView>
                      <PhotoBackdropHitTargets
                        frame={imageFrame}
                        viewportWidth={viewportWidth}
                        viewportHeight={viewportHeight}
                        onPress={closeActivePhoto}
                      />
                    </View>
                  );
                })}
              </ScrollView>
              {lightboxPhotos.length > 1 ? (
                <View style={styles.lightboxCounter}>
                  <Text style={styles.lightboxCounterText}>
                    {lightboxPhotoIndex + 1}/{lightboxPhotos.length}
                  </Text>
                </View>
              ) : null}
              <Pressable
                accessibilityLabel="Close photo"
                hitSlop={10}
                onPress={closeActivePhoto}
                style={({ pressed }) => [
                  styles.lightboxCloseButton,
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={sym("xmark", "close")}
                  size={18}
                  weight="bold"
                  tintColor="#FFFFFF"
                />
              </Pressable>
              {activePhoto.entry.canDeletePhotos ? (
                <Pressable
                  accessibilityLabel="Delete photo"
                  disabled={deletingPhotoId === activePhoto.photo.id}
                  onPress={() => handleDeletePhoto(activePhoto)}
                  style={({ pressed }) => [
                    styles.lightboxDeleteButton,
                    deletingPhotoId === activePhoto.photo.id && styles.disabled,
                    pressed && styles.pressed,
                  ]}
                >
                  {deletingPhotoId === activePhoto.photo.id ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <SymbolView
                      name={sym("trash.fill", "delete")}
                      size={18}
                      weight="semibold"
                      tintColor="#FFFFFF"
                    />
                  )}
                </Pressable>
              ) : null}
            </>
          ) : null}
        </View>
      </Modal>

      <CommentsModal
        entry={activeCommentsEntry}
        commentDraft={
          activeCommentsEntry
            ? (commentDrafts[activeCommentsEntry.id] ?? "")
            : ""
        }
        isSubmittingComment={
          activeCommentsEntry
            ? submittingComment === activeCommentsEntry.id
            : false
        }
        replyTarget={
          activeCommentsEntry
            ? (replyTargets[activeCommentsEntry.id] ?? null)
            : null
        }
        onClose={() => setActiveCommentsEntryId(null)}
        onCommentDraftChange={(val) => {
          if (!activeCommentsEntry) return;
          setCommentDrafts((prev) => ({
            ...prev,
            [activeCommentsEntry.id]: val,
          }));
        }}
        onAddComment={() => {
          if (!activeCommentsEntry) return;
          void handleAddComment(activeCommentsEntry.id);
        }}
        onCancelReply={() => {
          if (!activeCommentsEntry) return;
          setReplyTargets((prev) => ({
            ...prev,
            [activeCommentsEntry.id]: null,
          }));
        }}
        onDeleteComment={(commentId) => {
          if (!activeCommentsEntry) return;
          void handleDeleteComment(activeCommentsEntry.id, commentId);
        }}
        onReportComment={(comment) => {
          if (!activeCommentsEntry) return;
          void reportComment(activeCommentsEntry, comment);
        }}
        onReplyToComment={(comment) => {
          if (!activeCommentsEntry) return;
          setReplyTargets((prev) => ({
            ...prev,
            [activeCommentsEntry.id]: comment,
          }));
        }}
      />
      <FeedFilterModal
        activeCategoryIds={activeCategoryIds}
        activeGroupIds={activeGroupIds}
        categories={categoryOptions}
        groups={friendGroups}
        visible={isFilterOpen}
        onCategoryChange={(categoryIds) =>
          saveFeedFilters({ ...feedFilters, categoryIds })
        }
        onClear={() => saveFeedFilters({ groupIds: [], categoryIds: [] })}
        onClose={() => setIsFilterOpen(false)}
        onGroupChange={(groupIds) =>
          saveFeedFilters({ ...feedFilters, groupIds })
        }
      />
    </View>
  );
}

function FeedFilterModal({
  activeCategoryIds,
  activeGroupIds,
  categories,
  groups,
  onCategoryChange,
  onClear,
  onClose,
  onGroupChange,
  visible,
}: {
  activeCategoryIds: string[];
  activeGroupIds: string[];
  categories: NonNullable<FriendFeedEntry["category"]>[];
  groups: FriendGroupRow[];
  onCategoryChange: (categoryIds: string[]) => void;
  onClear: () => void;
  onClose: () => void;
  onGroupChange: (groupIds: string[]) => void;
  visible: boolean;
}) {
  const theme = useTheme();
  const activeGroupIdSet = useMemo(
    () => new Set(activeGroupIds),
    [activeGroupIds],
  );
  const activeCategoryIdSet = useMemo(
    () => new Set(activeCategoryIds),
    [activeCategoryIds],
  );

  const toggleGroup = (groupId: string) => {
    const next = new Set(activeGroupIds);
    if (next.has(groupId)) {
      next.delete(groupId);
    } else {
      next.add(groupId);
    }
    onGroupChange([...next]);
  };

  const toggleCategory = (categoryId: string) => {
    const next = new Set(activeCategoryIds);
    if (next.has(categoryId)) {
      next.delete(categoryId);
    } else {
      next.add(categoryId);
    }
    onCategoryChange([...next]);
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <View
        style={[
          styles.filterModalScreen,
          { backgroundColor: theme.background },
        ]}
      >
        <SafeAreaView style={styles.filterModalSafeArea}>
          <View
            style={[
              styles.filterModalHeader,
              { borderBottomColor: theme.tabBorder },
            ]}
          >
            <Pressable
              accessibilityLabel="Close filters"
              hitSlop={12}
              onPress={onClose}
            >
              <Text
                style={[styles.filterModalAction, { color: theme.primary }]}
              >
                Done
              </Text>
            </Pressable>
            <Text style={[styles.filterModalTitle, { color: theme.text }]}>
              Filters
            </Text>
            <Pressable
              accessibilityRole="button"
              hitSlop={12}
              onPress={onClear}
            >
              <Text
                style={[
                  styles.filterModalAction,
                  { color: theme.textSecondary },
                ]}
              >
                Clear
              </Text>
            </Pressable>
          </View>

          <ScrollView
            canCancelContentTouches={false}
            contentContainerStyle={styles.filterModalContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.filterSection}>
              <Text style={[styles.filterSectionTitle, { color: theme.text }]}>
                Groups
              </Text>
              <View style={styles.filterChipGrid}>
                <FilterChip
                  active={activeGroupIds.length === 0}
                  label="All groups"
                  onPress={() => onGroupChange([])}
                />
                {groups.map((group) => (
                  <FilterChip
                    key={group.id}
                    active={activeGroupIdSet.has(group.id)}
                    label={group.name}
                    onPress={() => toggleGroup(group.id)}
                  />
                ))}
              </View>
              {groups.length === 0 ? (
                <Text
                  style={[
                    styles.filterEmptyText,
                    { color: theme.textSecondary },
                  ]}
                >
                  No groups yet.
                </Text>
              ) : null}
            </View>

            <View style={styles.filterSection}>
              <Text style={[styles.filterSectionTitle, { color: theme.text }]}>
                Habit categories
              </Text>
              <View style={styles.filterChipGrid}>
                <FilterChip
                  active={activeCategoryIds.length === 0}
                  label="All habits"
                  onPress={() => onCategoryChange([])}
                />
                {categories.map((category) => (
                  <FilterChip
                    key={category.id}
                    active={activeCategoryIdSet.has(category.id)}
                    label={category.name}
                    onPress={() => toggleCategory(category.id)}
                  />
                ))}
              </View>
              {categories.length === 0 ? (
                <Text
                  style={[
                    styles.filterEmptyText,
                    { color: theme.textSecondary },
                  ]}
                >
                  No habit categories yet.
                </Text>
              ) : null}
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function FilterChip({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterChip,
        {
          backgroundColor: active ? theme.primary : theme.backgroundElement,
          borderColor: active ? theme.primary : theme.tabBorder,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.filterChipText,
          { color: active ? theme.primaryForeground : theme.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export function FeedCard({
  entry,
  onToggleProp,
  onPhotoPress,
  onOpenComments,
  onOpenProfile,
  onOpenSafetyActions,
}: {
  entry: FriendFeedEntry;
  onToggleProp: () => void;
  onPhotoPress: (photo: FriendFeedPhoto) => void;
  onOpenComments: () => void;
  onOpenProfile: () => void;
  onOpenSafetyActions: () => void;
}) {
  const theme = useTheme();
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const plainNotes = richTextToPlainText(entry.notes);
  const commentCount = countComments(entry.comments);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
      ]}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <Pressable
          accessibilityLabel={`Open ${entry.friend.name}'s profile`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onOpenProfile}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <FriendAvatar image={entry.friend.image} name={entry.friend.name} />
        </Pressable>
        <View style={styles.headerMeta}>
          <View style={styles.headerNameRow}>
            <Pressable
              accessibilityLabel={`Open ${entry.friend.name}'s profile`}
              accessibilityRole="button"
              hitSlop={6}
              onPress={onOpenProfile}
              style={({ pressed }) => [
                styles.friendNamePressable,
                pressed && styles.pressed,
              ]}
            >
              <Text
                numberOfLines={1}
                style={[styles.friendName, { color: theme.text }]}
              >
                {entry.friend.name}
              </Text>
            </Pressable>
            <Text
              numberOfLines={1}
              style={[styles.dateText, { color: theme.textSecondary }]}
            >
              {formatFeedDate(entry.dateKey)}
            </Text>
          </View>
          <Text
            numberOfLines={1}
            style={[styles.goalText, { color: theme.textSecondary }]}
          >
            {entry.goal.name}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Post safety actions"
          hitSlop={8}
          onPress={onOpenSafetyActions}
          style={({ pressed }) => [
            styles.safetyButton,
            pressed && styles.pressed,
          ]}
        >
          <SymbolView
            name={sym("ellipsis", "more_horiz")}
            size={18}
            weight="semibold"
            tintColor={theme.textSecondary}
          />
        </Pressable>
      </View>

      {/* Photos */}
      {entry.photos.length > 0 ? (
        <View style={styles.carouselWrap}>
          <View
            onLayout={(event) => {
              setCarouselWidth(event.nativeEvent.layout.width);
            }}
            style={[
              styles.carouselFrame,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onMomentumScrollEnd={(event) => {
                if (!carouselWidth) return;
                setCarouselIndex(
                  Math.round(event.nativeEvent.contentOffset.x / carouselWidth),
                );
              }}
            >
              {entry.photos.map((photo) => (
                <Pressable
                  key={photo.id}
                  onPress={() => onPhotoPress(photo)}
                  style={({ pressed }) => [
                    styles.carouselSlide,
                    { width: carouselWidth || 1 },
                    pressed && styles.pressed,
                  ]}
                >
                  <Image
                    source={{ uri: photo.url }}
                    style={styles.photoImage}
                    contentFit="cover"
                  />
                </Pressable>
              ))}
            </ScrollView>
            {entry.photos.length > 1 ? (
              <View
                style={[
                  styles.carouselCounter,
                  { backgroundColor: "rgba(0,0,0,0.5)" },
                ]}
              >
                <Text style={styles.carouselCounterText}>
                  {carouselIndex + 1}/{entry.photos.length}
                </Text>
              </View>
            ) : null}
          </View>
          {entry.photos.length > 1 ? (
            <View style={styles.carouselDots}>
              {entry.photos.map((photo, index) => (
                <View
                  key={photo.id}
                  style={[
                    styles.carouselDot,
                    {
                      backgroundColor:
                        index === carouselIndex
                          ? theme.primary
                          : theme.backgroundSelected,
                    },
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Notes */}
      {plainNotes ? (
        <RichFeedNote
          expanded={notesExpanded}
          html={entry.notes}
          onToggleExpanded={() => setNotesExpanded((x) => !x)}
        />
      ) : null}

      {/* Actions row — props/comments are habit-only for now */}
      {entry.kind === "habit" ? (
        <View style={[styles.actionsRow, { borderTopColor: theme.tabBorder }]}>
          <Pressable
            onPress={onToggleProp}
            style={({ pressed }) => [
              styles.propButton,
              entry.props.hasPropped && {
                backgroundColor: `${theme.primary}18`,
              },
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={sym("hands.clap.fill", "volunteer_activism")}
              size={18}
              weight="semibold"
              tintColor={entry.props.hasPropped ? theme.primary : theme.tabIcon}
            />
            <Text
              style={[
                styles.propText,
                {
                  color: entry.props.hasPropped ? theme.primary : theme.tabIcon,
                },
              ]}
            >
              {entry.props.count > 0
                ? `${entry.props.count} ${entry.props.count === 1 ? "Prop" : "Props"}`
                : "Prop"}
            </Text>
          </Pressable>

          <Pressable
            onPress={onOpenComments}
            style={({ pressed }) => [
              styles.commentCountWrap,
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={sym("bubble.left", "chat_bubble_outline")}
              size={16}
              weight="semibold"
              tintColor={theme.textSecondary}
            />
            <Text
              style={[styles.commentCountText, { color: theme.textSecondary }]}
            >
              {commentCount} {commentCount === 1 ? "comment" : "comments"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const FEED_NOTE_COLLAPSE_HEIGHT = 112;
const HTML_IGNORED_TAGS = ["script", "style", "iframe", "img", "video"];
const HTML_DEFAULT_TEXT_PROPS = { selectable: true };

function RichFeedNote({
  expanded,
  html,
  onToggleExpanded,
}: {
  expanded: boolean;
  html: string;
  onToggleExpanded: () => void;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const contentWidth = Math.max(0, Math.min(width - 36, MaxContentWidth) - 28);
  const plainText = richTextToPlainText(html);
  const isLong = plainText.length > 320 || plainText.split("\n").length > 5;
  const source = useMemo(() => ({ html }), [html]);
  const baseStyle = useMemo(
    () => ({
      color: theme.text,
      fontSize: 14,
      fontWeight: "500" as const,
      lineHeight: 21,
    }),
    [theme.text],
  );
  const tagsStyles = useMemo<MixedStyleRecord>(
    () => ({
      p: { marginTop: 0, marginBottom: 6 },
      h1: {
        fontSize: 17,
        lineHeight: 23,
        fontWeight: "800",
        marginTop: 0,
        marginBottom: 6,
      },
      h2: {
        fontSize: 16,
        lineHeight: 22,
        fontWeight: "800",
        marginTop: 0,
        marginBottom: 6,
      },
      h3: {
        fontSize: 15,
        lineHeight: 21,
        fontWeight: "700",
        marginTop: 0,
        marginBottom: 6,
      },
      strong: { fontWeight: "800" },
      b: { fontWeight: "800" },
      em: { fontStyle: "italic" },
      i: { fontStyle: "italic" },
      u: { textDecorationLine: "underline" },
      s: { textDecorationLine: "line-through" },
      del: { textDecorationLine: "line-through" },
      ul: { marginTop: 0, marginBottom: 6, paddingLeft: 18 },
      ol: { marginTop: 0, marginBottom: 6, paddingLeft: 18 },
      li: { marginBottom: 3 },
      blockquote: {
        borderLeftWidth: 3,
        borderLeftColor: theme.tabBorder,
        color: theme.textSecondary,
        marginTop: 0,
        marginBottom: 6,
        marginLeft: 0,
        paddingLeft: 10,
      },
      a: {
        color: theme.primary,
        textDecorationLine: "underline",
      },
      code: {
        fontFamily: Fonts.mono,
        backgroundColor: theme.backgroundElement,
      },
      pre: {
        fontFamily: Fonts.mono,
        backgroundColor: theme.backgroundElement,
        borderRadius: 8,
        marginTop: 0,
        marginBottom: 6,
        padding: 10,
      },
    }),
    [
      theme.backgroundElement,
      theme.primary,
      theme.tabBorder,
      theme.textSecondary,
    ],
  );

  return (
    <View style={styles.richNote}>
      <View
        style={
          isLong && !expanded
            ? { maxHeight: FEED_NOTE_COLLAPSE_HEIGHT, overflow: "hidden" }
            : undefined
        }
      >
        <RenderHTML
          baseStyle={baseStyle}
          contentWidth={contentWidth}
          defaultTextProps={HTML_DEFAULT_TEXT_PROPS}
          enableCSSInlineProcessing={false}
          ignoredDomTags={HTML_IGNORED_TAGS}
          source={source}
          tagsStyles={tagsStyles}
        />
      </View>
      {isLong ? (
        <Pressable onPress={onToggleExpanded} style={styles.showMoreButton}>
          <Text style={[styles.showMoreText, { color: theme.primary }]}>
            {expanded ? "Show less" : "Show more"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function CommentsModal({
  commentDraft,
  entry,
  isSubmittingComment,
  onAddComment,
  onCancelReply,
  onClose,
  onCommentDraftChange,
  onDeleteComment,
  onReportComment,
  onReplyToComment,
  replyTarget,
}: {
  commentDraft: string;
  entry: FriendFeedEntry | null;
  isSubmittingComment: boolean;
  onAddComment: () => void;
  onCancelReply: () => void;
  onClose: () => void;
  onCommentDraftChange: (value: string) => void;
  onDeleteComment: (commentId: string) => void;
  onReportComment: (comment: FriendFeedComment) => void;
  onReplyToComment: (comment: FriendFeedComment) => void;
  replyTarget: FriendFeedComment | null;
}) {
  const theme = useTheme();
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showEvent =
      Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent =
      Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";
    const showSubscription = Keyboard.addListener(showEvent, () =>
      setIsKeyboardVisible(true),
    );
    const hideSubscription = Keyboard.addListener(hideEvent, () =>
      setIsKeyboardVisible(false),
    );

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  return (
    <Modal
      visible={entry !== null}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.commentsModalOverlay}
      >
        <Pressable style={styles.commentsModalBackdrop} onPress={onClose} />
        <SafeAreaView
          edges={["bottom"]}
          style={[
            styles.commentsSheet,
            isKeyboardVisible && styles.commentsSheetKeyboardOpen,
            {
              backgroundColor: theme.background,
              borderColor: theme.tabBorder,
            },
          ]}
        >
          <View
            style={[
              styles.commentsModalHeader,
              { borderBottomColor: theme.tabBorder },
            ]}
          >
            <View style={styles.commentsModalTitleBlock}>
              <Text style={[styles.commentsModalTitle, { color: theme.text }]}>
                Comments
              </Text>
              {entry ? (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.commentsModalSubtitle,
                    { color: theme.textSecondary },
                  ]}
                >
                  {entry.friend.name} · {entry.goal.name}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityLabel="Close comments"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [
                styles.commentsModalClose,
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
            canCancelContentTouches={false}
            contentContainerStyle={styles.modalCommentsContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={[
              styles.modalCommentsScroll,
              isKeyboardVisible && styles.modalCommentsScrollKeyboardOpen,
            ]}
          >
            {entry && entry.comments.length > 0 ? (
              entry.comments.map((comment) => (
                <CommentRow
                  key={comment.id}
                  comment={comment}
                  onDeleteComment={onDeleteComment}
                  onReportComment={onReportComment}
                  onReply={onReplyToComment}
                />
              ))
            ) : (
              <View style={styles.emptyComments}>
                <Text
                  style={[styles.emptyCommentsTitle, { color: theme.text }]}
                >
                  No comments yet
                </Text>
                <Text
                  style={[
                    styles.emptyCommentsText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Start the conversation.
                </Text>
              </View>
            )}
          </ScrollView>

          <View
            style={[
              styles.commentComposer,
              { borderTopColor: theme.tabBorder },
            ]}
          >
            {replyTarget ? (
              <View style={styles.replyingToRow}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.replyingToText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Replying to {replyTarget.authorName}
                </Text>
                <Pressable
                  accessibilityLabel="Cancel reply"
                  hitSlop={8}
                  onPress={onCancelReply}
                  style={({ pressed }) => pressed && styles.pressed}
                >
                  <SymbolView
                    name={sym("xmark", "close")}
                    size={13}
                    weight="bold"
                    tintColor={theme.textSecondary}
                  />
                </Pressable>
              </View>
            ) : null}
            <View style={styles.commentInputRow}>
              <TextInput
                style={[
                  styles.commentInput,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                  },
                ]}
                placeholder={
                  replyTarget
                    ? `Reply to ${replyTarget.authorName}...`
                    : "Write a comment..."
                }
                placeholderTextColor={theme.textSecondary}
                value={commentDraft}
                onChangeText={onCommentDraftChange}
                returnKeyType="send"
                onSubmitEditing={onAddComment}
                maxLength={2000}
                multiline={false}
              />
              <Pressable
                onPress={onAddComment}
                disabled={!commentDraft.trim() || isSubmittingComment}
                style={({ pressed }) => [
                  styles.sendButton,
                  { backgroundColor: theme.primary },
                  (!commentDraft.trim() || isSubmittingComment) &&
                    styles.sendButtonDisabled,
                  pressed && styles.pressed,
                ]}
              >
                {isSubmittingComment ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.primaryForeground}
                  />
                ) : (
                  <SymbolView
                    name={sym("paperplane.fill", "send")}
                    size={15}
                    weight="semibold"
                    tintColor={theme.primaryForeground}
                  />
                )}
              </Pressable>
            </View>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FriendAvatar({
  image,
  name,
  size = 40,
}: {
  image: string | null;
  name: string;
  size?: number;
}) {
  const theme = useTheme();
  const radius = size / 2;

  if (image) {
    return (
      <Image
        source={{ uri: image }}
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: radius },
        ]}
        contentFit="cover"
      />
    );
  }

  return (
    <View
      style={[
        styles.avatarFallback,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: `${theme.primary}22`,
        },
      ]}
    >
      <Text style={[styles.avatarInitial, { color: theme.primary }]}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

function CommentRow({
  comment,
  depth = 0,
  onDeleteComment,
  onReportComment,
  onReply,
}: {
  comment: FriendFeedComment;
  depth?: number;
  onDeleteComment: (commentId: string) => void;
  onReportComment: (comment: FriendFeedComment) => void;
  onReply: (comment: FriendFeedComment) => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[styles.commentThread, depth > 0 && styles.commentReplyThread]}
    >
      <View
        style={[
          styles.commentRow,
          depth > 0 && styles.commentReplyRow,
          { backgroundColor: theme.backgroundElement },
        ]}
      >
        <FriendAvatar
          image={comment.authorImage}
          name={comment.authorName}
          size={28}
        />
        <View style={styles.commentBody}>
          <View style={styles.commentMeta}>
            <Text
              numberOfLines={1}
              style={[styles.commentAuthor, { color: theme.text }]}
            >
              {comment.authorName}
            </Text>
            <Text style={[styles.commentTime, { color: theme.textSecondary }]}>
              {formatCommentTime(comment.createdAt)}
            </Text>
          </View>
          <Text style={[styles.commentText, { color: theme.text }]}>
            {comment.body}
          </Text>
          <View style={styles.commentActions}>
            <Pressable
              hitSlop={8}
              onPress={() => onReply(comment)}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text
                style={[styles.commentActionText, { color: theme.primary }]}
              >
                Reply
              </Text>
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => onReportComment(comment)}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={[styles.commentActionText, { color: "#9D474D" }]}>
                Report
              </Text>
            </Pressable>
          </View>
        </View>
        {comment.canDelete ? (
          <Pressable
            onPress={() => onDeleteComment(comment.id)}
            hitSlop={8}
            style={({ pressed }) => [
              styles.deleteCommentBtn,
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={sym("trash", "delete_outline")}
              size={14}
              weight="semibold"
              tintColor="#9D474D"
            />
          </Pressable>
        ) : null}
      </View>
      {comment.replies.length > 0 ? (
        <View style={styles.commentReplies}>
          {comment.replies.map((reply) => (
            <CommentRow
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              onDeleteComment={onDeleteComment}
              onReportComment={onReportComment}
              onReply={onReply}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
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
    gap: 11,
  },
  pageHeaderIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  pageHeaderText: { flex: 1, gap: 1 },
  filterButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
    position: "relative",
  },
  filterBadge: {
    position: "absolute",
    top: 5,
    right: 5,
    minWidth: 17,
    height: 17,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 9,
    paddingHorizontal: 4,
  },
  filterBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
  },
  pageTitle: {
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  pageSubtitle: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
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
    gap: 10,
    paddingVertical: 64,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    marginBottom: 3,
  },
  emptyTitle: { fontSize: 18, lineHeight: 23, fontWeight: "800" },
  emptyDescription: {
    maxWidth: 280,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
  },
  filterModalScreen: { flex: 1 },
  filterModalSafeArea: { flex: 1 },
  filterModalHeader: {
    height: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
  },
  filterModalAction: { fontSize: 16, fontWeight: "800" },
  filterModalTitle: { fontSize: 17, fontWeight: "900" },
  filterModalContent: {
    gap: 22,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 40,
  },
  filterSection: { gap: 10 },
  filterSectionTitle: {
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "900",
  },
  filterChipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterEmptyText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "700",
  },
  filterChip: {
    maxWidth: 180,
    minHeight: 34,
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 13,
  },
  filterChipText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "800",
  },
  feedList: { gap: 14 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  avatar: { flexShrink: 0 },
  avatarFallback: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: "700",
  },
  headerMeta: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  headerNameRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 8,
  },
  friendNamePressable: {
    flex: 1,
    minWidth: 0,
  },
  friendName: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  },
  dateText: {
    maxWidth: 68,
    flexShrink: 0,
    textAlign: "right",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  safetyButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  goalText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  carouselWrap: {
    marginBottom: 12,
  },
  carouselFrame: {
    position: "relative",
    aspectRatio: 1,
    overflow: "hidden",
    width: "100%",
  },
  carouselSlide: {
    aspectRatio: 1,
  },
  carouselCounter: {
    position: "absolute",
    top: 10,
    right: 10,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  carouselCounterText: {
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "800",
  },
  carouselDots: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingTop: 8,
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  photoImage: {
    width: "100%",
    height: "100%",
  },
  richNote: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  showMoreButton: {
    paddingTop: 2,
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: "500",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  propButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  propText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
  },
  commentCountWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  commentCountText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
  },
  commentThread: {
    gap: 6,
  },
  commentReplyThread: {
    marginLeft: 22,
  },
  commentReplies: {
    gap: 6,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  commentReplyRow: {
    borderTopLeftRadius: 4,
  },
  commentBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  commentMeta: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    flexWrap: "wrap",
  },
  commentAuthor: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  commentTime: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "400",
  },
  commentText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "400",
  },
  commentActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  commentActionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  deleteCommentBtn: {
    padding: 4,
    flexShrink: 0,
  },
  commentComposer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  replyingToRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  replyingToText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  commentInput: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    lineHeight: 19,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sendButtonDisabled: { opacity: 0.45 },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
  commentsModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  commentsModalBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  commentsSheet: {
    position: "relative",
    zIndex: 1,
    maxHeight: "84%",
    minHeight: "54%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    overflow: "hidden",
  },
  commentsSheetKeyboardOpen: {
    minHeight: 0,
    maxHeight: "58%",
  },
  commentsModalHeader: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  commentsModalTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  commentsModalTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
  },
  commentsModalSubtitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
  },
  commentsModalClose: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  modalCommentsScroll: {
    flex: 1,
  },
  modalCommentsScrollKeyboardOpen: {
    flexGrow: 0,
    flexShrink: 1,
    maxHeight: 220,
  },
  modalCommentsContent: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  emptyComments: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 44,
  },
  emptyCommentsTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
  },
  emptyCommentsText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxPager: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
  },
  lightboxZoomFrame: {
    flex: 1,
  },
  lightboxZoomContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxImage: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  lightboxCloseButton: {
    position: "absolute",
    top: 56,
    right: 18,
    zIndex: 2,
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  lightboxCounter: {
    position: "absolute",
    top: 62,
    alignSelf: "center",
    zIndex: 2,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  lightboxCounterText: {
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "800",
  },
  lightboxDeleteButton: {
    position: "absolute",
    right: 18,
    bottom: 46,
    zIndex: 2,
    width: 46,
    height: 46,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 23,
    backgroundColor: "rgba(200,72,80,0.9)",
  },
});
