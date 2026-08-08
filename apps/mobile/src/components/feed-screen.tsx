import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { Image, type ImageLoadEventData } from "expo-image";
import { useRouter } from "expo-router";
import * as SecureStore from "expo-secure-store";
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
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  Image as RNImage,
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
import {
  type ImageNaturalSize,
  PhotoBackdropHitTargets,
  getContainedImageFrame,
} from "@/components/photo-backdrop-hit-targets";
import {
  CollabSectionHeaderTabs,
  PageHeaderTitle,
} from "@/components/section-header-tabs";
import {
  CreateGoalModal,
  type CreateSharedGoalInitialValues,
} from "@/components/shared-goals-screen";
import { Fonts, MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import { deleteCheckpointPhoto } from "@/lib/checkpoint-photos-client";
import {
  DAILY_REFLECTION_PROMPTS,
  type DailyReflectionPrompt,
  getDailyReflectionDateKey,
  getDailyReflectionPrompt,
} from "@/lib/daily-reflection-prompts";
import {
  type FriendFeedComment,
  type FriendFeedEntry,
  type FriendFeedPhoto,
  type FriendGroupRow,
  type FriendRow,
  addFeedComment,
  addReflectionComment,
  archiveFriend,
  createDailyReflection,
  deleteFeedComment,
  deleteReflectionComment,
  fetchDailyReflectionPromptStats,
  fetchFriendGroups,
  fetchFriends,
  fetchFriendsFeed,
  fetchMyPosts,
  reportContent,
  sendFriendIncentive,
  toggleFeedProp,
  toggleReflectionProp,
  uploadDailyReflectionPhoto,
} from "@/lib/friends-client";
import { type GoalPhotoSource, pickGoalPhoto } from "@/lib/goal-photo-picker";
import {
  type GoalPhotoUpload,
  deleteGoalPhoto,
} from "@/lib/goal-photos-client";
import { type Goal, fetchGoals } from "@/lib/goals-client";
import { toDateKey } from "@/lib/habit-logs-client";
import {
  playSelectionHaptic,
  playSuccessHaptic,
  playWarningHaptic,
} from "@/lib/haptics";
import {
  type LoadedNativeFeedAd,
  isNativeFeedAdsEnabled,
  loadNativeFeedAd,
} from "@/lib/mobile-ads";
import { richTextToPlainText } from "@/lib/rich-text";
import {
  type CreateSharedGoalInput,
  type SharedGoalSnapshot,
  createSharedGoal,
  fetchSharedGoals,
} from "@/lib/shared-goals-client";

type SymbolName = SymbolViewProps["name"];
type ActiveFeedPhoto = {
  entry: FriendFeedEntry;
  photo: FriendFeedPhoto;
};

const HIDDEN_FEED_GOALS_KEY = "hidden-feed-goals";
const HIDDEN_FEED_ADS_KEY = "hidden-feed-ads";
const FEED_FILTER_PREFERENCES_KEY = "feed-filter-preferences";
const DAILY_REFLECTION_PROMPT_KEY = "daily-reflection-prompt";
const DAILY_REFLECTION_FAVORITES_KEY = "daily-reflection-favorites";
const FEED_AD_INTERVAL = 3;
const POST_DOUBLE_TAP_DELAY_MS = 260;

type FeedFilters = {
  groupIds: string[];
  categoryIds: string[];
};

type FeedRenderItem =
  | { type: "entry"; entry: FriendFeedEntry }
  | {
      type: "ad";
      id: string;
      slotIndex: number;
      afterEntryId: string;
    };

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function normalizeSmsRecipient(value: string) {
  return value.trim().replace(/[^\d+.-]/g, "");
}

function buildSmsUrl(recipient: string) {
  const normalizedRecipient = normalizeSmsRecipient(recipient);
  if (Platform.OS === "ios") {
    return `sms:${encodeURIComponent(normalizedRecipient)}`;
  }
  return `sms:${encodeURIComponent(normalizedRecipient)}`;
}

function feedGoalKey(entry: Pick<FriendFeedEntry, "goal" | "kind">): string {
  return `${entry.kind}:${entry.goal.id}`;
}

function hasJoinedSharedGoal(
  entry: FriendFeedEntry,
  sharedGoals: SharedGoalSnapshot[],
) {
  if (entry.kind !== "habit") return false;

  const entryGoalName = entry.goal.name.trim().toLowerCase();
  return sharedGoals.some((goal) => {
    if (goal.status !== "active") return false;
    const hasCurrentUser =
      goal.currentUserParticipant?.status === "accepted" ||
      goal.currentUserParticipant?.status === "invited";
    if (!hasCurrentUser) return false;

    const hasFriend = goal.participants.some(
      (participant) =>
        participant.userId === entry.friend.id &&
        participant.status !== "declined" &&
        participant.status !== "left" &&
        (participant.personalGoalId === entry.goal.id ||
          goal.name.trim().toLowerCase() === entryGoalName),
    );

    return hasFriend;
  });
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

function getCommentPreview(comments: FriendFeedComment[]) {
  return [...comments]
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
    .slice(0, 2);
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

async function getStoredHiddenFeedAds(): Promise<Set<string>> {
  const stored =
    Platform.OS === "web"
      ? globalThis.localStorage?.getItem(HIDDEN_FEED_ADS_KEY)
      : await SecureStore.getItemAsync(HIDDEN_FEED_ADS_KEY);

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

async function setStoredHiddenFeedAds(keys: Set<string>) {
  const value = JSON.stringify([...keys]);
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(HIDDEN_FEED_ADS_KEY, value);
    return;
  }

  await SecureStore.setItemAsync(HIDDEN_FEED_ADS_KEY, value);
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

async function getStoredDailyReflectionPrompt(
  dateKey: string,
): Promise<DailyReflectionPrompt | null> {
  const stored =
    Platform.OS === "web"
      ? globalThis.localStorage?.getItem(DAILY_REFLECTION_PROMPT_KEY)
      : await SecureStore.getItemAsync(DAILY_REFLECTION_PROMPT_KEY);

  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as {
      dateKey?: unknown;
      promptId?: unknown;
    };
    if (parsed.dateKey !== dateKey || typeof parsed.promptId !== "string") {
      return null;
    }

    return (
      DAILY_REFLECTION_PROMPTS.find(
        (prompt) => prompt.id === parsed.promptId,
      ) ?? null
    );
  } catch {
    return null;
  }
}

async function setStoredDailyReflectionPrompt(
  dateKey: string,
  prompt: DailyReflectionPrompt,
) {
  const value = JSON.stringify({ dateKey, promptId: prompt.id });
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(DAILY_REFLECTION_PROMPT_KEY, value);
    return;
  }

  await SecureStore.setItemAsync(DAILY_REFLECTION_PROMPT_KEY, value);
}

async function getStoredReflectionFavorites(): Promise<Set<string>> {
  const stored =
    Platform.OS === "web"
      ? globalThis.localStorage?.getItem(DAILY_REFLECTION_FAVORITES_KEY)
      : await SecureStore.getItemAsync(DAILY_REFLECTION_FAVORITES_KEY);

  if (!stored) return new Set();

  try {
    const parsed = JSON.parse(stored) as unknown;
    return new Set(
      Array.isArray(parsed)
        ? parsed.filter((id): id is string => typeof id === "string")
        : [],
    );
  } catch {
    return new Set();
  }
}

async function setStoredReflectionFavorites(ids: Set<string>) {
  const value = JSON.stringify([...ids]);
  if (Platform.OS === "web") {
    globalThis.localStorage?.setItem(DAILY_REFLECTION_FAVORITES_KEY, value);
    return;
  }

  await SecureStore.setItemAsync(DAILY_REFLECTION_FAVORITES_KEY, value);
}

function buildFeedRenderItems(
  entries: FriendFeedEntry[],
  hiddenAdKeys: Set<string>,
): FeedRenderItem[] {
  if (!isNativeFeedAdsEnabled()) {
    return entries.map((entry) => ({ type: "entry", entry }));
  }

  return entries.flatMap((entry, index) => {
    const items: FeedRenderItem[] = [{ type: "entry", entry }];
    const postNumber = index + 1;
    const shouldInsertAd =
      postNumber % FEED_AD_INTERVAL === 0 && index < entries.length - 1;

    if (shouldInsertAd) {
      const slotIndex = postNumber / FEED_AD_INTERVAL;
      const id = `feed-native-ad-${slotIndex}-after-${entry.id}`;
      if (!hiddenAdKeys.has(id)) {
        items.push({
          type: "ad",
          id,
          slotIndex,
          afterEntryId: entry.id,
        });
      }
    }

    return items;
  });
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
  const [myDailyReflectionEntry, setMyDailyReflectionEntry] =
    useState<FriendFeedEntry | null>(null);
  const [friends, setFriends] = useState<FriendRow[]>([]);
  const [friendGroups, setFriendGroups] = useState<FriendGroupRow[]>([]);
  const [personalGoals, setPersonalGoals] = useState<Goal[]>([]);
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
  const [hiddenFeedAdKeys, setHiddenFeedAdKeys] = useState<Set<string>>(
    new Set(),
  );
  const [reportingFeedAdKey, setReportingFeedAdKey] = useState<string | null>(
    null,
  );
  const [activeCommentsEntryId, setActiveCommentsEntryId] = useState<
    string | null
  >(null);
  const [activeIncentiveEntry, setActiveIncentiveEntry] =
    useState<FriendFeedEntry | null>(null);
  const [incentiveBody, setIncentiveBody] = useState("");
  const [incentiveDays, setIncentiveDays] = useState("7");
  const [incentivePercent, setIncentivePercent] = useState("80");
  const [isSendingIncentive, setIsSendingIncentive] = useState(false);
  const [activeJoinGoalEntry, setActiveJoinGoalEntry] =
    useState<FriendFeedEntry | null>(null);
  const [joinedGoalKeys, setJoinedGoalKeys] = useState<Set<string>>(new Set());
  const [isPreparingJoinGoal, setIsPreparingJoinGoal] = useState(false);
  const [reflectionFavorites, setReflectionFavorites] = useState<Set<string>>(
    new Set(),
  );
  const [reflectionPromptAnswerCounts, setReflectionPromptAnswerCounts] =
    useState<Record<string, number>>({});
  const [isReflectionPickerOpen, setIsReflectionPickerOpen] = useState(false);
  const [selectedReflectionPrompt, setSelectedReflectionPrompt] =
    useState<DailyReflectionPrompt | null>(null);
  const [reflectionDraft, setReflectionDraft] = useState("");
  const [reflectionVisibility, setReflectionVisibility] = useState<
    "only_me" | "goal_friends" | "all_friends"
  >("all_friends");
  const [reflectionAudienceFriendIds, setReflectionAudienceFriendIds] =
    useState<string[]>([]);
  const [reflectionAudienceGroupIds, setReflectionAudienceGroupIds] = useState<
    string[]
  >([]);
  const [isReflectionAudienceOpen, setIsReflectionAudienceOpen] =
    useState(false);
  const [reflectionPhotos, setReflectionPhotos] = useState<GoalPhotoUpload[]>(
    [],
  );
  const [isSubmittingReflection, setIsSubmittingReflection] = useState(false);
  const [dailyReflectionPrompt, setDailyReflectionPrompt] =
    useState<DailyReflectionPrompt>(() => getDailyReflectionPrompt());
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
      const [
        data,
        groups,
        nextFriends,
        nextPersonalGoals,
        sharedGoals,
        myPosts,
      ] = await Promise.all([
        fetchFriendsFeed(),
        fetchFriendGroups().catch(() => []),
        fetchFriends().catch(() => []),
        fetchGoals().catch(() => []),
        fetchSharedGoals().catch(() => []),
        fetchMyPosts().catch(() => []),
      ]);
      if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
        return;
      }
      const todayKey = toDateKey(new Date());
      setEntries(data);
      setMyDailyReflectionEntry(
        myPosts.find(
          (post) => post.kind === "reflection" && post.dateKey === todayKey,
        ) ?? null,
      );
      setFriendGroups(groups);
      setFriends(nextFriends);
      setPersonalGoals(nextPersonalGoals);
      setJoinedGoalKeys(
        new Set(
          data
            .filter((entry) => hasJoinedSharedGoal(entry, sharedGoals))
            .map(feedGoalKey),
        ),
      );
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

  useEffect(() => {
    void getStoredHiddenFeedAds().then((keys) => {
      if (isMountedRef.current) setHiddenFeedAdKeys(keys);
    });
  }, []);

  useEffect(() => {
    const dateKey = getDailyReflectionDateKey();
    void getStoredDailyReflectionPrompt(dateKey).then((storedPrompt) => {
      if (!isMountedRef.current) return;

      const prompt = storedPrompt ?? getDailyReflectionPrompt();
      setDailyReflectionPrompt(prompt);
      if (!storedPrompt) {
        void setStoredDailyReflectionPrompt(dateKey, prompt).catch(
          () => undefined,
        );
      }
    });
  }, []);

  useEffect(() => {
    void getStoredReflectionFavorites().then((favorites) => {
      if (isMountedRef.current) setReflectionFavorites(favorites);
    });
  }, []);

  useEffect(() => {
    if (!isReflectionPickerOpen) return;

    void fetchDailyReflectionPromptStats()
      .then((stats) => {
        if (!isMountedRef.current) return;
        setReflectionPromptAnswerCounts(
          Object.fromEntries(
            stats.map((stat) => [stat.prompt, stat.answerCount]),
          ),
        );
      })
      .catch(() => undefined);
  }, [isReflectionPickerOpen]);

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  const updateFeedEntry = useCallback(
    (entryId: string, updater: (entry: FriendFeedEntry) => FriendFeedEntry) => {
      setEntries((prev) =>
        prev.map((entry) => (entry.id === entryId ? updater(entry) : entry)),
      );
      setMyDailyReflectionEntry((entry) =>
        entry?.id === entryId ? updater(entry) : entry,
      );
    },
    [],
  );

  const handleToggleProp = useCallback(
    async (entry: FriendFeedEntry) => {
      const entryId = entry.id;
      if (!entry?.props.hasPropped) {
        playSuccessHaptic();
      } else {
        playSelectionHaptic();
      }
      updateFeedEntry(entryId, (e) => ({
        ...e,
        props: {
          count: e.props.hasPropped
            ? Math.max(e.props.count - 1, 0)
            : e.props.count + 1,
          hasPropped: !e.props.hasPropped,
        },
      }));
      try {
        if (entry.kind === "reflection") {
          await toggleReflectionProp(entryId);
        } else {
          await toggleFeedProp(entryId);
        }
      } catch (err) {
        updateFeedEntry(entryId, (e) => ({
          ...e,
          props: {
            count: e.props.hasPropped
              ? Math.max(e.props.count - 1, 0)
              : e.props.count + 1,
            hasPropped: !e.props.hasPropped,
          },
        }));
        Alert.alert(
          "Could not update props",
          err instanceof Error ? err.message : undefined,
        );
      }
    },
    [updateFeedEntry],
  );

  const handleAddComment = useCallback(
    async (entryId: string) => {
      const body = (commentDrafts[entryId] ?? "").trim();
      if (!body || submittingComment) return;

      const replyTarget = replyTargets[entryId] ?? null;
      const entry =
        entries.find((item) => item.id === entryId) ??
        (myDailyReflectionEntry?.id === entryId
          ? myDailyReflectionEntry
          : null);
      setSubmittingComment(entryId);
      try {
        if (entry?.kind === "reflection") {
          await addReflectionComment(entryId, body, replyTarget?.id ?? null);
        } else {
          await addFeedComment(entryId, body, replyTarget?.id ?? null);
        }
        playSuccessHaptic();
        if (!isMountedRef.current) return;
        setCommentDrafts((prev) => ({ ...prev, [entryId]: "" }));
        setReplyTargets((prev) => ({ ...prev, [entryId]: null }));
        await load(true);
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
    [
      commentDrafts,
      entries,
      load,
      myDailyReflectionEntry,
      replyTargets,
      submittingComment,
    ],
  );

  const handleDeleteComment = useCallback(
    async (entryId: string, commentId: string) => {
      try {
        const entry =
          entries.find((item) => item.id === entryId) ??
          (myDailyReflectionEntry?.id === entryId
            ? myDailyReflectionEntry
            : null);
        if (entry?.kind === "reflection") {
          await deleteReflectionComment(entryId, commentId);
        } else {
          await deleteFeedComment(entryId, commentId);
        }
        playWarningHaptic();
        if (!isMountedRef.current) return;
        updateFeedEntry(entryId, (e) => ({
          ...e,
          comments: removeCommentById(e.comments, commentId),
        }));
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
    [entries, myDailyReflectionEntry, updateFeedEntry],
  );

  const openReflectionComposer = useCallback(
    (prompt: DailyReflectionPrompt) => {
      playSelectionHaptic();
      setSelectedReflectionPrompt(prompt);
      setReflectionDraft("");
      setReflectionVisibility("all_friends");
      setReflectionAudienceFriendIds([]);
      setReflectionAudienceGroupIds([]);
      setReflectionPhotos([]);
      setIsReflectionPickerOpen(false);
    },
    [],
  );

  const addReflectionPhoto = useCallback(async (source: GoalPhotoSource) => {
    try {
      const photo = await pickGoalPhoto(source);
      if (!photo) return;
      playSelectionHaptic();
      setReflectionPhotos((current) => [...current, photo]);
    } catch (err) {
      Alert.alert(
        "Could not add photo",
        err instanceof Error ? err.message : undefined,
      );
    }
  }, []);

  const toggleReflectionFavorite = useCallback((promptId: string) => {
    setReflectionFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(promptId)) {
        next.delete(promptId);
      } else {
        next.add(promptId);
      }
      void setStoredReflectionFavorites(next).catch(() => undefined);
      return next;
    });
    playSelectionHaptic();
  }, []);

  const submitReflection = useCallback(async () => {
    const prompt = selectedReflectionPrompt;
    const body = reflectionDraft.trim();
    if (!prompt || !body || isSubmittingReflection) return;

    setIsSubmittingReflection(true);
    try {
      await createDailyReflection({
        audienceFriendIds: reflectionAudienceFriendIds,
        audienceGroupIds: reflectionAudienceGroupIds,
        prompt: prompt.text,
        body,
        date: toDateKey(new Date()),
        visibility: reflectionVisibility,
      }).then(async (post) => {
        for (const photo of reflectionPhotos) {
          await uploadDailyReflectionPhoto(post.id, photo);
        }
      });
      playSuccessHaptic();
      if (!isMountedRef.current) return;
      setSelectedReflectionPrompt(null);
      setReflectionDraft("");
      setReflectionPhotos([]);
      await load();
    } catch (err) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Could not post reflection",
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      if (isMountedRef.current) setIsSubmittingReflection(false);
    }
  }, [
    isSubmittingReflection,
    load,
    reflectionAudienceFriendIds,
    reflectionAudienceGroupIds,
    reflectionDraft,
    reflectionPhotos,
    reflectionVisibility,
    selectedReflectionPrompt,
  ]);

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
                    const postType =
                      !richTextToPlainText(entry.notes).trim() && !photos.length
                        ? "completion"
                        : entry.postType;

                    return [{ ...entry, photos, postType }];
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

  const hideFeedAd = useCallback(
    (item: Extract<FeedRenderItem, { type: "ad" }>) => {
      playSelectionHaptic();
      const next = new Set(hiddenFeedAdKeys);
      next.add(item.id);
      setHiddenFeedAdKeys(next);
      void setStoredHiddenFeedAds(next).catch(() => undefined);
    },
    [hiddenFeedAdKeys],
  );

  const reportFeedAd = useCallback(
    async (item: Extract<FeedRenderItem, { type: "ad" }>) => {
      if (reportingFeedAdKey) return;

      setReportingFeedAdKey(item.id);
      try {
        await reportContent({
          targetType: "ad",
          targetId: item.id,
          reason: "Reported from feed ad card.",
          context: {
            adNetwork: "google_mobile_ads",
            adUnit: "native_feed",
            afterEntryId: item.afterEntryId,
            slotIndex: item.slotIndex,
          },
        });
        if (!isMountedRef.current) return;
        Alert.alert("Report sent", "Thanks. We'll review this ad.");
      } catch (err) {
        if (!isMountedRef.current) return;
        Alert.alert(
          "Could not send report",
          err instanceof Error ? err.message : undefined,
        );
      } finally {
        if (isMountedRef.current) setReportingFeedAdKey(null);
      }
    },
    [reportingFeedAdKey],
  );

  const openPostIncentive = useCallback((entry: FriendFeedEntry) => {
    if (entry.kind !== "habit") return;
    playSelectionHaptic();
    setActiveIncentiveEntry(entry);
    setIncentiveBody("");
    setIncentiveDays("7");
    setIncentivePercent("80");
  }, []);

  const closePostIncentive = useCallback(() => {
    if (isSendingIncentive) return;
    setActiveIncentiveEntry(null);
  }, [isSendingIncentive]);

  const sendPostIncentive = useCallback(async () => {
    if (!activeIncentiveEntry || isSendingIncentive) return;

    const days = Number.parseInt(incentiveDays, 10);
    const percent = Number.parseInt(incentivePercent, 10);
    if (!incentiveBody.trim()) {
      Alert.alert("Add an incentive", "Write what they can earn.");
      return;
    }
    if (
      !Number.isFinite(days) ||
      days < 1 ||
      !Number.isFinite(percent) ||
      percent < 1 ||
      percent > 100
    ) {
      Alert.alert("Check the goal", "Use at least 1 day and 1-100%.");
      return;
    }

    setIsSendingIncentive(true);
    try {
      const friends = await fetchFriends();
      const friendship = friends.find(
        (friend) =>
          friend.friendId === activeIncentiveEntry.friend.id &&
          friend.status === "accepted",
      );

      if (!friendship) {
        throw new Error("Friendship not found.");
      }

      await sendFriendIncentive(friendship.id, {
        type: "incentive",
        body: incentiveBody.trim(),
        streakDays: days,
        streakPercent: percent,
        goalScope: "single",
        goalId: activeIncentiveEntry.goal.id,
      });
      if (!isMountedRef.current) return;
      playSuccessHaptic();
      setActiveIncentiveEntry(null);
      Alert.alert(
        "Incentive sent",
        `${activeIncentiveEntry.friend.name} can accept it from Incentives.`,
      );
    } catch (err) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Could not send incentive",
        err instanceof Error ? err.message : undefined,
      );
    } finally {
      if (isMountedRef.current) setIsSendingIncentive(false);
    }
  }, [
    activeIncentiveEntry,
    incentiveBody,
    incentiveDays,
    incentivePercent,
    isSendingIncentive,
  ]);

  const openJoinGoal = useCallback(
    async (entry: FriendFeedEntry) => {
      if (entry.kind !== "habit" || joinedGoalKeys.has(feedGoalKey(entry))) {
        return;
      }

      playSelectionHaptic();
      setIsPreparingJoinGoal(true);
      try {
        const [nextFriends, nextPersonalGoals] = await Promise.all([
          friends.length ? Promise.resolve(friends) : fetchFriends(),
          personalGoals.length ? Promise.resolve(personalGoals) : fetchGoals(),
        ]);
        if (!isMountedRef.current) return;
        setFriends(nextFriends);
        setPersonalGoals(nextPersonalGoals);
        setActiveJoinGoalEntry(entry);
      } catch (err) {
        if (!isMountedRef.current) return;
        Alert.alert(
          "Could not start shared goal",
          err instanceof Error ? err.message : undefined,
        );
      } finally {
        if (isMountedRef.current) setIsPreparingJoinGoal(false);
      }
    },
    [friends, joinedGoalKeys, personalGoals],
  );

  const joinGoalInitialValues =
    activeJoinGoalEntry === null
      ? undefined
      : ({
          name: activeJoinGoalEntry.goal.name,
          invitedUserIds: [activeJoinGoalEntry.friend.id],
        } satisfies CreateSharedGoalInitialValues);

  const handleCreateJoinedGoal = useCallback(
    async (input: CreateSharedGoalInput) => {
      const entry = activeJoinGoalEntry;
      await createSharedGoal(input);
      playSuccessHaptic();
      if (!isMountedRef.current) return;
      if (entry) {
        setJoinedGoalKeys((current) => {
          const next = new Set(current);
          next.add(feedGoalKey(entry));
          return next;
        });
      }
      setActiveJoinGoalEntry(null);
    },
    [activeJoinGoalEntry],
  );

  const openPostSafetyActions = useCallback(
    (entry: FriendFeedEntry) => {
      const goalLabel = entry.kind === "habit" ? "habit" : "goal";
      const isCompletionOnly =
        entry.postType === "completion" &&
        entry.photos.length === 0 &&
        !richTextToPlainText(entry.notes).trim();
      const canUsePostGoalActions = entry.kind === "habit";
      const goalActionButtons =
        isCompletionOnly && canUsePostGoalActions
          ? [
              {
                text: "Incentivize",
                onPress: () => openPostIncentive(entry),
              },
              ...(joinedGoalKeys.has(feedGoalKey(entry))
                ? [{ text: "Joined goal" }]
                : [
                    {
                      text: "Join goal",
                      onPress: () => void openJoinGoal(entry),
                    },
                  ]),
            ]
          : [];

      Alert.alert(entry.friend.name, "Choose an action.", [
        ...goalActionButtons,
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
    [
      blockFriend,
      joinedGoalKeys,
      openJoinGoal,
      openPostIncentive,
      reportPost,
      unfollowFeedGoal,
      unfollowFriend,
    ],
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
  const messageBirthdayFriend = useCallback((entry: FriendFeedEntry) => {
    const phone = entry.friend.phoneNumber?.trim();
    if (!phone) {
      Alert.alert(
        "No phone number",
        `${entry.friend.name} hasn't added a phone number yet.`,
      );
      return;
    }

    playSelectionHaptic();
    Linking.openURL(buildSmsUrl(phone)).catch(() => {
      Alert.alert("Could not open", "No messaging app is available.");
    });
  }, []);

  const activeCommentsEntry = activeCommentsEntryId
    ? (entries.find((entry) => entry.id === activeCommentsEntryId) ??
      (myDailyReflectionEntry?.id === activeCommentsEntryId
        ? myDailyReflectionEntry
        : null))
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
        if (entry.id === myDailyReflectionEntry?.id) return false;
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
      myDailyReflectionEntry?.id,
    ],
  );
  const saveFeedFilters = useCallback((filters: FeedFilters) => {
    setFeedFilters(filters);
    void setStoredFeedFilters(filters).catch(() => undefined);
  }, []);
  const activeFilterCount = activeGroupIds.length + activeCategoryIds.length;
  const feedItems = useMemo(
    () => buildFeedRenderItems(visibleEntries, hiddenFeedAdKeys),
    [hiddenFeedAdKeys, visibleEntries],
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <ScrollView
            canCancelContentTouches
            contentContainerStyle={[
              styles.content,
              { paddingBottom: tabBarHeight + 16 },
            ]}
            directionalLockEnabled
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
                <PageHeaderTitle title="Collab" />
                <CollabSectionHeaderTabs currentSection="feed" />
              </View>
              <Pressable
                accessibilityLabel="Filter feed"
                accessibilityRole="button"
                hitSlop={8}
                onPress={() => {
                  playSelectionHaptic();
                  setIsFilterOpen(true);
                }}
                style={({ pressed }) => [
                  styles.filterButton,
                  {
                    backgroundColor:
                      activeFilterCount > 0
                        ? `${theme.primary}18`
                        : "transparent",
                    borderColor:
                      activeFilterCount > 0 ? theme.primary : theme.tabBorder,
                  },
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
                      {
                        backgroundColor: theme.primary,
                        borderColor: theme.background,
                      },
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

            {myDailyReflectionEntry ? null : (
              <DailyReflectionCard
                prompt={dailyReflectionPrompt}
                onChoosePrompt={() => {
                  playSelectionHaptic();
                  setIsReflectionPickerOpen(true);
                }}
                onUsePrompt={() =>
                  openReflectionComposer(dailyReflectionPrompt)
                }
              />
            )}

            {myDailyReflectionEntry ? (
              <View style={styles.pinnedReflection}>
                <FeedCard
                  entry={myDailyReflectionEntry}
                  onToggleProp={() =>
                    void handleToggleProp(myDailyReflectionEntry)
                  }
                  onPhotoPress={(photo) => {
                    playSelectionHaptic();
                    setActivePhoto({ entry: myDailyReflectionEntry, photo });
                  }}
                  onOpenComments={() => {
                    playSelectionHaptic();
                    setActiveCommentsEntryId(myDailyReflectionEntry.id);
                  }}
                  onOpenProfile={() =>
                    void openFriendProfile(myDailyReflectionEntry)
                  }
                  onOpenSafetyActions={() =>
                    openPostSafetyActions(myDailyReflectionEntry)
                  }
                  joinGoalStatus="idle"
                />
              </View>
            ) : null}

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
                {feedItems.map((item) =>
                  item.type === "entry" ? (
                    <FeedCard
                      key={item.entry.id}
                      entry={item.entry}
                      onToggleProp={() => void handleToggleProp(item.entry)}
                      onPhotoPress={(photo) => {
                        playSelectionHaptic();
                        setActivePhoto({ entry: item.entry, photo });
                      }}
                      onOpenComments={() => {
                        playSelectionHaptic();
                        setActiveCommentsEntryId(item.entry.id);
                      }}
                      onOpenProfile={() => void openFriendProfile(item.entry)}
                      onOpenSafetyActions={() =>
                        openPostSafetyActions(item.entry)
                      }
                      onOpenBirthdayMessage={
                        item.entry.kind === "birthday"
                          ? () => messageBirthdayFriend(item.entry)
                          : undefined
                      }
                      onOpenIncentive={
                        item.entry.kind !== "habit"
                          ? undefined
                          : () => openPostIncentive(item.entry)
                      }
                      joinGoalStatus={
                        joinedGoalKeys.has(feedGoalKey(item.entry))
                          ? "joined"
                          : isPreparingJoinGoal
                            ? "loading"
                            : "idle"
                      }
                      onOpenJoinGoal={
                        item.entry.kind !== "habit"
                          ? undefined
                          : () => void openJoinGoal(item.entry)
                      }
                    />
                  ) : (
                    <FeedAdCard
                      key={item.id}
                      disabled={reportingFeedAdKey === item.id}
                      item={item}
                      onHide={() => hideFeedAd(item)}
                      onReport={() => void reportFeedAd(item)}
                    />
                  ),
                )}
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
      <PostIncentiveModal
        body={incentiveBody}
        days={incentiveDays}
        entry={activeIncentiveEntry}
        isSending={isSendingIncentive}
        percent={incentivePercent}
        onBodyChange={setIncentiveBody}
        onClose={closePostIncentive}
        onDaysChange={setIncentiveDays}
        onPercentChange={setIncentivePercent}
        onSend={() => void sendPostIncentive()}
      />
      <Modal
        animationType="slide"
        onRequestClose={() => setActiveJoinGoalEntry(null)}
        presentationStyle="pageSheet"
        visible={activeJoinGoalEntry !== null}
      >
        {activeJoinGoalEntry ? (
          <CreateGoalModal
            friends={friends}
            friendGroups={friendGroups}
            initialValues={joinGoalInitialValues}
            personalGoals={personalGoals}
            onClose={() => setActiveJoinGoalEntry(null)}
            onCreate={handleCreateJoinedGoal}
          />
        ) : null}
      </Modal>
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
      <ReflectionPromptPickerModal
        dailyPrompt={dailyReflectionPrompt}
        answerCounts={reflectionPromptAnswerCounts}
        favoriteIds={reflectionFavorites}
        visible={isReflectionPickerOpen}
        onClose={() => setIsReflectionPickerOpen(false)}
        onSelectPrompt={openReflectionComposer}
        onToggleFavorite={toggleReflectionFavorite}
      />
      <ReflectionComposerModal
        audienceCount={
          reflectionAudienceFriendIds.length + reflectionAudienceGroupIds.length
        }
        body={reflectionDraft}
        isSubmitting={isSubmittingReflection}
        photos={reflectionPhotos}
        prompt={selectedReflectionPrompt}
        visibility={reflectionVisibility}
        onAddPhoto={addReflectionPhoto}
        onBodyChange={setReflectionDraft}
        onClose={() => setSelectedReflectionPrompt(null)}
        onOpenAudience={() => setIsReflectionAudienceOpen(true)}
        onRemovePhoto={(index) =>
          setReflectionPhotos((current) =>
            current.filter((_, photoIndex) => photoIndex !== index),
          )
        }
        onSubmit={() => void submitReflection()}
        onVisibilityChange={setReflectionVisibility}
      />
      <ReflectionAudiencePickerModal
        friends={friends.filter((friend) => friend.status === "accepted")}
        groups={friendGroups}
        selectedFriendIds={reflectionAudienceFriendIds}
        selectedGroupIds={reflectionAudienceGroupIds}
        visible={isReflectionAudienceOpen}
        onClose={() => setIsReflectionAudienceOpen(false)}
        onSave={({ friendIds, groupIds }) => {
          setReflectionAudienceFriendIds(friendIds);
          setReflectionAudienceGroupIds(groupIds);
          setReflectionVisibility("goal_friends");
          setIsReflectionAudienceOpen(false);
        }}
      />
    </View>
  );
}

function DailyReflectionCard({
  onChoosePrompt,
  onUsePrompt,
  prompt,
}: {
  onChoosePrompt: () => void;
  onUsePrompt: () => void;
  prompt: DailyReflectionPrompt;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.reflectionCard,
        {
          backgroundColor: theme.tabBar,
          borderColor: `${theme.tabBorder}8C`,
        },
      ]}
    >
      <View style={styles.reflectionCardCopy}>
        <Text
          style={[styles.reflectionCardEyebrow, { color: theme.textSecondary }]}
        >
          Daily reflection
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={onUsePrompt}
          style={({ pressed }) => [
            styles.reflectionPromptPressable,
            pressed && styles.pressed,
          ]}
        >
          <Text
            numberOfLines={2}
            style={[styles.reflectionCardPromptText, { color: theme.text }]}
          >
            {prompt.text}
          </Text>
        </Pressable>
        <View style={styles.reflectionActionRow}>
          <Pressable
            accessibilityRole="button"
            onPress={onUsePrompt}
            style={({ pressed }) => [
              styles.reflectionTextAction,
              styles.reflectionPrimaryAction,
              pressed && styles.pressed,
            ]}
          >
            <Text
              style={[
                styles.reflectionTextActionPrimary,
                { color: theme.primary },
              ]}
            >
              Answer
            </Text>
            <SymbolView
              name={sym("arrow.right", "arrow_forward")}
              size={13}
              weight="bold"
              tintColor={theme.primary}
            />
          </Pressable>
          <Pressable
            accessibilityLabel="Change reflection prompt"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onChoosePrompt}
            style={({ pressed }) => [
              styles.reflectionIconAction,
              { backgroundColor: theme.backgroundElement },
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={sym("arrow.triangle.2.circlepath", "refresh")}
              size={15}
              weight="semibold"
              tintColor={theme.textSecondary}
            />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function ReflectionPromptPickerModal({
  answerCounts,
  dailyPrompt,
  favoriteIds,
  onClose,
  onSelectPrompt,
  onToggleFavorite,
  visible,
}: {
  answerCounts: Record<string, number>;
  dailyPrompt: DailyReflectionPrompt;
  favoriteIds: Set<string>;
  onClose: () => void;
  onSelectPrompt: (prompt: DailyReflectionPrompt) => void;
  onToggleFavorite: (promptId: string) => void;
  visible: boolean;
}) {
  const theme = useTheme();
  const [query, setQuery] = useState("");
  const promptOrder = useMemo(
    () =>
      new Map(
        DAILY_REFLECTION_PROMPTS.map((prompt, index) => [prompt.id, index]),
      ),
    [],
  );
  const sortPrompts = useCallback(
    (prompts: DailyReflectionPrompt[]) =>
      [...prompts].sort((left, right) => {
        const leftCount = answerCounts[left.text] ?? 0;
        const rightCount = answerCounts[right.text] ?? 0;
        if (leftCount !== rightCount) return rightCount - leftCount;
        return (
          (promptOrder.get(left.id) ?? 0) - (promptOrder.get(right.id) ?? 0)
        );
      }),
    [answerCounts, promptOrder],
  );
  const favoritePrompts = sortPrompts(
    DAILY_REFLECTION_PROMPTS.filter((prompt) => favoriteIds.has(prompt.id)),
  );
  const filteredPrompts = sortPrompts(
    DAILY_REFLECTION_PROMPTS.filter((prompt) =>
      prompt.text.toLowerCase().includes(query.trim().toLowerCase()),
    ),
  );

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <View
        style={[
          styles.reflectionPickerScreen,
          { backgroundColor: theme.background },
        ]}
      >
        <SafeAreaView style={styles.reflectionPickerSafeArea}>
          <View
            style={[
              styles.filterModalHeader,
              { borderBottomColor: theme.tabBorder },
            ]}
          >
            <Pressable hitSlop={12} onPress={onClose}>
              <Text
                style={[styles.filterModalAction, { color: theme.primary }]}
              >
                Done
              </Text>
            </Pressable>
            <Text style={[styles.filterModalTitle, { color: theme.text }]}>
              Daily reflection
            </Text>
            <View style={styles.reflectionHeaderSpacer} />
          </View>

          <ScrollView
            canCancelContentTouches
            contentContainerStyle={styles.reflectionPickerContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <PromptSection
              favoriteIds={favoriteIds}
              prompts={[dailyPrompt]}
              title="Today"
              onSelectPrompt={onSelectPrompt}
              onToggleFavorite={onToggleFavorite}
            />
            <PromptSection
              emptyText="Star prompts you want to reuse."
              favoriteIds={favoriteIds}
              prompts={favoritePrompts}
              title="Favorites"
              onSelectPrompt={onSelectPrompt}
              onToggleFavorite={onToggleFavorite}
            />

            <View style={styles.promptSection}>
              <Text style={[styles.promptSectionTitle, { color: theme.text }]}>
                Other
              </Text>
              <View
                style={[
                  styles.promptSearch,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                  },
                ]}
              >
                <SymbolView
                  name={sym("magnifyingglass", "search")}
                  size={18}
                  tintColor={theme.textSecondary}
                />
                <TextInput
                  onChangeText={setQuery}
                  placeholder="Search prompts"
                  placeholderTextColor={theme.textSecondary}
                  selectionColor={theme.primary}
                  style={[styles.promptSearchInput, { color: theme.text }]}
                  value={query}
                />
              </View>
              <View style={styles.promptList}>
                {filteredPrompts.map((prompt) => (
                  <PromptRow
                    key={prompt.id}
                    favorite={favoriteIds.has(prompt.id)}
                    prompt={prompt}
                    onSelect={() => onSelectPrompt(prompt)}
                    onToggleFavorite={() => onToggleFavorite(prompt.id)}
                  />
                ))}
              </View>
            </View>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function PromptSection({
  emptyText,
  favoriteIds,
  onSelectPrompt,
  onToggleFavorite,
  prompts,
  title,
}: {
  emptyText?: string;
  favoriteIds: Set<string>;
  onSelectPrompt: (prompt: DailyReflectionPrompt) => void;
  onToggleFavorite: (promptId: string) => void;
  prompts: DailyReflectionPrompt[];
  title: string;
}) {
  const theme = useTheme();

  return (
    <View style={styles.promptSection}>
      <Text style={[styles.promptSectionTitle, { color: theme.text }]}>
        {title}
      </Text>
      {prompts.length > 0 ? (
        <View style={styles.promptList}>
          {prompts.map((prompt) => (
            <PromptRow
              key={prompt.id}
              favorite={favoriteIds.has(prompt.id)}
              prompt={prompt}
              onSelect={() => onSelectPrompt(prompt)}
              onToggleFavorite={() => onToggleFavorite(prompt.id)}
            />
          ))}
        </View>
      ) : (
        <Text style={[styles.promptEmptyText, { color: theme.textSecondary }]}>
          {emptyText}
        </Text>
      )}
    </View>
  );
}

function PromptRow({
  favorite,
  onSelect,
  onToggleFavorite,
  prompt,
}: {
  favorite: boolean;
  onSelect: () => void;
  onToggleFavorite: () => void;
  prompt: DailyReflectionPrompt;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onSelect}
      style={({ pressed }) => [
        styles.promptRow,
        {
          backgroundColor: theme.tabBar,
          borderColor: `${theme.tabBorder}8C`,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.promptRowText, { color: theme.text }]}>
        {prompt.text}
      </Text>
      <Pressable
        accessibilityLabel={favorite ? "Unfavorite prompt" : "Favorite prompt"}
        hitSlop={10}
        onPress={(event) => {
          event.stopPropagation();
          onToggleFavorite();
        }}
        style={({ pressed }) => [
          styles.promptStarButton,
          pressed && styles.pressed,
        ]}
      >
        <SymbolView
          name={sym(favorite ? "star.fill" : "star", "star")}
          size={18}
          weight="semibold"
          tintColor={favorite ? theme.primary : theme.textSecondary}
        />
      </Pressable>
    </Pressable>
  );
}

function ReflectionComposerModal({
  audienceCount,
  body,
  isSubmitting,
  onAddPhoto,
  onBodyChange,
  onClose,
  onOpenAudience,
  onRemovePhoto,
  onSubmit,
  onVisibilityChange,
  photos,
  prompt,
  visibility,
}: {
  audienceCount: number;
  body: string;
  isSubmitting: boolean;
  onAddPhoto: (source: GoalPhotoSource) => void;
  onBodyChange: (value: string) => void;
  onClose: () => void;
  onOpenAudience: () => void;
  onRemovePhoto: (index: number) => void;
  onSubmit: () => void;
  onVisibilityChange: (
    value: "only_me" | "goal_friends" | "all_friends",
  ) => void;
  photos: GoalPhotoUpload[];
  prompt: DailyReflectionPrompt | null;
  visibility: "only_me" | "goal_friends" | "all_friends";
}) {
  const theme = useTheme();
  const canPost =
    body.trim().length > 0 &&
    !isSubmitting &&
    (visibility !== "goal_friends" || audienceCount > 0);

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={prompt !== null}
    >
      <View
        style={[
          styles.reflectionPickerScreen,
          { backgroundColor: theme.background },
        ]}
      >
        <SafeAreaView style={styles.reflectionPickerSafeArea}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.keyboardView}
          >
            <View
              style={[
                styles.filterModalHeader,
                { borderBottomColor: theme.tabBorder },
              ]}
            >
              <Pressable hitSlop={12} onPress={onClose}>
                <Text
                  style={[styles.filterModalAction, { color: theme.primary }]}
                >
                  Cancel
                </Text>
              </Pressable>
              <Text style={[styles.filterModalTitle, { color: theme.text }]}>
                Daily reflection
              </Text>
              <Pressable disabled={!canPost} hitSlop={12} onPress={onSubmit}>
                <Text
                  style={[
                    styles.filterModalAction,
                    { color: canPost ? theme.primary : theme.textSecondary },
                  ]}
                >
                  Post
                </Text>
              </Pressable>
            </View>

            <ScrollView
              canCancelContentTouches
              contentContainerStyle={styles.reflectionComposerContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View
                style={[
                  styles.reflectionPromptBox,
                  {
                    backgroundColor: theme.tabBar,
                    borderColor: `${theme.tabBorder}8C`,
                  },
                ]}
              >
                <Text
                  style={[styles.reflectionEyebrow, { color: theme.primary }]}
                >
                  Prompt
                </Text>
                <Text
                  style={[styles.reflectionPromptText, { color: theme.text }]}
                >
                  {prompt?.text}
                </Text>
              </View>

              <TextInput
                autoFocus
                multiline
                onChangeText={onBodyChange}
                placeholder="Write a real little piece of your day..."
                placeholderTextColor={theme.textSecondary}
                selectionColor={theme.primary}
                style={[
                  styles.reflectionInput,
                  {
                    backgroundColor: theme.tabBar,
                    borderColor: `${theme.tabBorder}8C`,
                    color: theme.text,
                  },
                ]}
                textAlignVertical="top"
                value={body}
              />

              {photos.length > 0 ? (
                <ScrollView
                  horizontal
                  contentContainerStyle={styles.reflectionPhotoList}
                  showsHorizontalScrollIndicator={false}
                >
                  {photos.map((photo, index) => (
                    <View
                      key={`${photo.uri}-${index}`}
                      style={styles.reflectionPhotoPreviewWrap}
                    >
                      <Image
                        contentFit="cover"
                        source={{ uri: photo.uri }}
                        style={styles.reflectionPhotoPreview}
                      />
                      <Pressable
                        accessibilityLabel="Remove photo"
                        hitSlop={8}
                        onPress={() => onRemovePhoto(index)}
                        style={({ pressed }) => [
                          styles.reflectionRemovePhoto,
                          pressed && styles.pressed,
                        ]}
                      >
                        <SymbolView
                          name={sym("xmark", "close")}
                          size={13}
                          weight="bold"
                          tintColor="#FFFFFF"
                        />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              ) : null}

              <View style={styles.reflectionPhotoActions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onAddPhoto("camera")}
                  style={({ pressed }) => [
                    styles.reflectionPhotoButton,
                    {
                      backgroundColor: theme.tabBar,
                      borderColor: `${theme.tabBorder}8C`,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={sym("camera.fill", "photo_camera")}
                    size={17}
                    tintColor={theme.primary}
                  />
                  <Text
                    style={[
                      styles.reflectionPhotoButtonText,
                      { color: theme.text },
                    ]}
                  >
                    Take photo
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onAddPhoto("library")}
                  style={({ pressed }) => [
                    styles.reflectionPhotoButton,
                    {
                      backgroundColor: theme.tabBar,
                      borderColor: `${theme.tabBorder}8C`,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={sym("photo.fill", "image")}
                    size={17}
                    tintColor={theme.primary}
                  />
                  <Text
                    style={[
                      styles.reflectionPhotoButtonText,
                      { color: theme.text },
                    ]}
                  >
                    Add photo
                  </Text>
                </Pressable>
              </View>

              <View style={styles.reflectionVisibilityRow}>
                <VisibilityChip
                  active={visibility === "all_friends"}
                  label="All friends"
                  onPress={() => onVisibilityChange("all_friends")}
                />
                <VisibilityChip
                  active={visibility === "goal_friends"}
                  label={
                    audienceCount > 0
                      ? `Select friends (${audienceCount})`
                      : "Select friends"
                  }
                  onPress={onOpenAudience}
                />
                <VisibilityChip
                  active={visibility === "only_me"}
                  label="Only me"
                  onPress={() => onVisibilityChange("only_me")}
                />
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function VisibilityChip({
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
        styles.reflectionVisibilityChip,
        {
          backgroundColor: active ? theme.primary : theme.backgroundElement,
          borderColor: active ? theme.primary : theme.tabBorder,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.reflectionVisibilityText,
          { color: active ? theme.primaryForeground : theme.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ReflectionAudiencePickerModal({
  friends,
  groups,
  onClose,
  onSave,
  selectedFriendIds,
  selectedGroupIds,
  visible,
}: {
  friends: FriendRow[];
  groups: FriendGroupRow[];
  onClose: () => void;
  onSave: (selection: { friendIds: string[]; groupIds: string[] }) => void;
  selectedFriendIds: string[];
  selectedGroupIds: string[];
  visible: boolean;
}) {
  const theme = useTheme();
  const [friendIds, setFriendIds] = useState<string[]>(selectedFriendIds);
  const [groupIds, setGroupIds] = useState<string[]>(selectedGroupIds);

  useEffect(() => {
    if (!visible) return;
    setFriendIds(selectedFriendIds);
    setGroupIds(selectedGroupIds);
  }, [selectedFriendIds, selectedGroupIds, visible]);

  const toggle = (ids: string[], id: string) =>
    ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}
    >
      <View
        style={[
          styles.reflectionPickerScreen,
          { backgroundColor: theme.background },
        ]}
      >
        <SafeAreaView style={styles.reflectionPickerSafeArea}>
          <View
            style={[
              styles.filterModalHeader,
              { borderBottomColor: theme.tabBorder },
            ]}
          >
            <Pressable hitSlop={12} onPress={onClose}>
              <Text
                style={[styles.filterModalAction, { color: theme.primary }]}
              >
                Cancel
              </Text>
            </Pressable>
            <Text style={[styles.filterModalTitle, { color: theme.text }]}>
              Select friends
            </Text>
            <Pressable
              hitSlop={12}
              onPress={() => onSave({ friendIds, groupIds })}
            >
              <Text
                style={[styles.filterModalAction, { color: theme.primary }]}
              >
                Done
              </Text>
            </Pressable>
          </View>
          <ScrollView
            contentContainerStyle={styles.reflectionPickerContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <AudienceSection title="Groups">
              {groups.length > 0 ? (
                groups.map((group) => (
                  <AudienceRow
                    key={group.id}
                    detail={`${group.members.length} friend${
                      group.members.length === 1 ? "" : "s"
                    }`}
                    icon={sym("person.3", "groups")}
                    selected={groupIds.includes(group.id)}
                    title={group.name}
                    onPress={() =>
                      setGroupIds((current) => toggle(current, group.id))
                    }
                  />
                ))
              ) : (
                <Text
                  style={[
                    styles.promptEmptyText,
                    { color: theme.textSecondary },
                  ]}
                >
                  No groups yet.
                </Text>
              )}
            </AudienceSection>
            <AudienceSection title="Friends">
              {friends.length > 0 ? (
                friends.map((friend) => (
                  <AudienceRow
                    key={friend.friendId}
                    detail={friend.friendEmail || "Friend"}
                    icon={sym("person", "person")}
                    selected={friendIds.includes(friend.friendId)}
                    title={friend.friendName}
                    onPress={() =>
                      setFriendIds((current) =>
                        toggle(current, friend.friendId),
                      )
                    }
                  />
                ))
              ) : (
                <Text
                  style={[
                    styles.promptEmptyText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Add friends before selecting an audience.
                </Text>
              )}
            </AudienceSection>
          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

function AudienceSection({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.promptSection}>
      <Text style={[styles.promptSectionTitle, { color: theme.text }]}>
        {title}
      </Text>
      <View style={styles.promptList}>{children}</View>
    </View>
  );
}

function AudienceRow({
  detail,
  icon,
  onPress,
  selected,
  title,
}: {
  detail: string;
  icon: SymbolName;
  onPress: () => void;
  selected: boolean;
  title: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      onPress={() => {
        playSelectionHaptic();
        onPress();
      }}
      style={({ pressed }) => [
        styles.audienceSelectRow,
        {
          backgroundColor: theme.tabBar,
          borderColor: `${theme.tabBorder}8C`,
        },
        pressed && styles.pressed,
      ]}
    >
      <SymbolView
        name={icon}
        size={18}
        tintColor={selected ? theme.primary : theme.textSecondary}
      />
      <View style={styles.audienceSelectCopy}>
        <Text
          numberOfLines={1}
          style={[styles.audienceSelectTitle, { color: theme.text }]}
        >
          {title}
        </Text>
        <Text
          numberOfLines={1}
          style={[styles.audienceSelectDetail, { color: theme.textSecondary }]}
        >
          {detail}
        </Text>
      </View>
      {selected ? (
        <SymbolView
          name={sym("checkmark.circle.fill", "check_circle")}
          size={20}
          tintColor={theme.primary}
        />
      ) : null}
    </Pressable>
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
            canCancelContentTouches
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

function PostIncentiveModal({
  body,
  days,
  entry,
  isSending,
  onBodyChange,
  onClose,
  onDaysChange,
  onPercentChange,
  onSend,
  percent,
}: {
  body: string;
  days: string;
  entry: FriendFeedEntry | null;
  isSending: boolean;
  onBodyChange: (value: string) => void;
  onClose: () => void;
  onDaysChange: (value: string) => void;
  onPercentChange: (value: string) => void;
  onSend: () => void;
  percent: string;
}) {
  const theme = useTheme();
  const daysValue = Number.parseInt(days, 10);
  const percentValue = Number.parseInt(percent, 10);
  const canSend =
    body.trim().length > 0 &&
    Number.isFinite(daysValue) &&
    daysValue >= 1 &&
    Number.isFinite(percentValue) &&
    percentValue >= 1 &&
    percentValue <= 100 &&
    !isSending;

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      transparent
      visible={entry !== null}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.incentiveModalOverlay}
      >
        <Pressable style={styles.incentiveModalBackdrop} onPress={onClose} />
        <SafeAreaView
          edges={["bottom"]}
          style={[styles.incentiveSheet, { backgroundColor: theme.background }]}
        >
          <View
            style={[
              styles.incentiveHeader,
              { borderBottomColor: theme.tabBorder },
            ]}
          >
            <View style={styles.incentiveHeaderCopy}>
              <Text style={[styles.incentiveTitle, { color: theme.text }]}>
                Incentivize
              </Text>
              <Text
                numberOfLines={1}
                style={[
                  styles.incentiveSubtitle,
                  { color: theme.textSecondary },
                ]}
              >
                {entry
                  ? `${entry.friend.name} · ${entry.goal.name}`
                  : "Friend habit"}
              </Text>
            </View>
            <Pressable
              accessibilityLabel="Close incentive"
              hitSlop={10}
              onPress={onClose}
              style={({ pressed }) => [
                styles.incentiveClose,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("xmark", "close")}
                size={15}
                weight="bold"
                tintColor={theme.textSecondary}
              />
            </Pressable>
          </View>

          <View style={styles.incentiveContent}>
            <View style={styles.incentiveField}>
              <Text style={[styles.incentiveLabel, { color: theme.text }]}>
                Reward
              </Text>
              <TextInput
                autoFocus
                onChangeText={onBodyChange}
                placeholder="Lunch on me when you hit it"
                placeholderTextColor={theme.textSecondary}
                selectionColor={theme.primary}
                style={[
                  styles.incentiveInput,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                    color: theme.text,
                  },
                ]}
                value={body}
              />
            </View>

            <View
              style={[
                styles.incentiveGoalBox,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.tabBorder,
                },
              ]}
            >
              <Text
                style={[
                  styles.incentiveGoalKicker,
                  { color: theme.textSecondary },
                ]}
              >
                EARN THIS WHEN
              </Text>
              <Text style={[styles.incentiveGoalText, { color: theme.text }]}>
                {entry?.goal.name ?? "This habit"} reaches
              </Text>
              <View style={styles.incentiveNumberRow}>
                <View style={styles.incentiveNumberField}>
                  <Text
                    style={[
                      styles.incentiveSmallLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Days
                  </Text>
                  <TextInput
                    keyboardType="number-pad"
                    onChangeText={onDaysChange}
                    placeholder="7"
                    placeholderTextColor={theme.textSecondary}
                    selectionColor={theme.primary}
                    style={[
                      styles.incentiveSmallInput,
                      {
                        backgroundColor: theme.background,
                        borderColor: theme.tabBorder,
                        color: theme.text,
                      },
                    ]}
                    value={days}
                  />
                </View>
                <View style={styles.incentiveNumberField}>
                  <Text
                    style={[
                      styles.incentiveSmallLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Completion %
                  </Text>
                  <TextInput
                    keyboardType="number-pad"
                    onChangeText={onPercentChange}
                    placeholder="80"
                    placeholderTextColor={theme.textSecondary}
                    selectionColor={theme.primary}
                    style={[
                      styles.incentiveSmallInput,
                      {
                        backgroundColor: theme.background,
                        borderColor: theme.tabBorder,
                        color: theme.text,
                      },
                    ]}
                    value={percent}
                  />
                </View>
              </View>
            </View>

            <Pressable
              accessibilityRole="button"
              disabled={!canSend}
              onPress={onSend}
              style={({ pressed }) => [
                styles.incentiveSendButton,
                {
                  backgroundColor: canSend
                    ? theme.primary
                    : theme.backgroundElement,
                },
                pressed && styles.pressed,
              ]}
            >
              {isSending ? (
                <ActivityIndicator color={theme.primaryForeground} />
              ) : (
                <Text
                  style={[
                    styles.incentiveSendText,
                    {
                      color: canSend
                        ? theme.primaryForeground
                        : theme.textSecondary,
                    },
                  ]}
                >
                  Send incentive
                </Text>
              )}
            </Pressable>
          </View>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function PostHeaderContent({
  entry,
  iconColor,
  nameColor,
  onOpenProfile,
  onOpenSafetyActions,
  secondaryColor,
}: {
  entry: FriendFeedEntry;
  iconColor: string;
  nameColor: string;
  onOpenProfile: () => void;
  onOpenSafetyActions?: () => void;
  secondaryColor: string;
}) {
  return (
    <>
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
              style={[styles.friendName, { color: nameColor }]}
            >
              {entry.friend.name}
            </Text>
          </Pressable>
          <Text
            numberOfLines={1}
            style={[styles.dateText, { color: secondaryColor }]}
          >
            {formatFeedDate(entry.dateKey)}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          style={[styles.goalText, { color: secondaryColor }]}
        >
          {entry.goal.name}
        </Text>
      </View>
      {onOpenSafetyActions ? (
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
            tintColor={iconColor}
          />
        </Pressable>
      ) : null}
    </>
  );
}

export function FeedCard({
  entry,
  joinGoalStatus = "idle",
  onOpenIncentive,
  onOpenJoinGoal,
  onToggleProp,
  onPhotoPress,
  onOpenComments,
  onOpenBirthdayMessage,
  onOpenProfile,
  onOpenSafetyActions,
}: {
  entry: FriendFeedEntry;
  joinGoalStatus?: "idle" | "joined" | "loading";
  onOpenIncentive?: () => void;
  onOpenJoinGoal?: () => void;
  onToggleProp: () => void;
  onPhotoPress: (photo: FriendFeedPhoto) => void;
  onOpenComments: () => void;
  onOpenBirthdayMessage?: () => void;
  onOpenProfile: () => void;
  onOpenSafetyActions: () => void;
}) {
  const theme = useTheme();
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const lastContentTapAtRef = useRef(0);
  const singleTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const plainNotes = richTextToPlainText(entry.notes);
  const commentCount = countComments(entry.comments);
  const commentPreview = getCommentPreview(entry.comments);
  const isCompletionOnly =
    entry.postType === "completion" &&
    entry.photos.length === 0 &&
    !plainNotes.trim();
  const hasPhotos = entry.photos.length > 0;
  const propIsActive = entry.props.hasPropped || entry.props.count > 0;
  const canUseSocialActions =
    entry.kind === "habit" || entry.kind === "reflection";
  const canUseGoalActions = entry.kind === "habit";
  const isBirthdayPost = entry.kind === "birthday";
  const isDarkMode = theme.background === "#000000";
  const cardBackground = isDarkMode ? "#1C1C1E" : theme.tabBar;
  const cardBorder = isDarkMode ? "#38383A" : `${theme.tabBorder}8C`;
  const selectedPropBackground = isDarkMode
    ? `${theme.primary}24`
    : `${theme.primary}12`;
  const activePropColor = theme.primary;
  const headerTextColor = theme.text;
  const headerSecondaryColor = theme.textSecondary;
  const headerIconColor = theme.textSecondary;
  const clearSingleTapTimer = useCallback(() => {
    if (!singleTapTimerRef.current) return;
    clearTimeout(singleTapTimerRef.current);
    singleTapTimerRef.current = null;
  }, []);
  const handlePostContentTap = useCallback(
    (onSingleTap?: () => void) => {
      const now = Date.now();

      if (
        canUseSocialActions &&
        now - lastContentTapAtRef.current <= POST_DOUBLE_TAP_DELAY_MS
      ) {
        lastContentTapAtRef.current = 0;
        clearSingleTapTimer();
        if (!entry.props.hasPropped) {
          onToggleProp();
        } else {
          playSelectionHaptic();
        }
        return;
      }

      lastContentTapAtRef.current = now;
      clearSingleTapTimer();
      singleTapTimerRef.current = setTimeout(() => {
        lastContentTapAtRef.current = 0;
        singleTapTimerRef.current = null;
        onSingleTap?.();
      }, POST_DOUBLE_TAP_DELAY_MS);
    },
    [
      canUseSocialActions,
      clearSingleTapTimer,
      entry.props.hasPropped,
      onToggleProp,
    ],
  );

  useEffect(() => clearSingleTapTimer, [clearSingleTapTimer]);

  return (
    <View
      style={[
        styles.card,
        isCompletionOnly && styles.completionCard,
        hasPhotos && styles.photoCard,
        {
          backgroundColor: cardBackground,
          borderColor: cardBorder,
        },
      ]}
    >
      <View
        style={[
          styles.cardHeader,
          isCompletionOnly && styles.completionCardHeader,
        ]}
      >
        <PostHeaderContent
          entry={entry}
          iconColor={headerIconColor}
          nameColor={headerTextColor}
          onOpenProfile={onOpenProfile}
          onOpenSafetyActions={isBirthdayPost ? undefined : onOpenSafetyActions}
          secondaryColor={headerSecondaryColor}
        />
      </View>

      {/* Photos */}
      {hasPhotos ? (
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
              directionalLockEnabled
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
                  onPress={() =>
                    handlePostContentTap(() => onPhotoPress(photo))
                  }
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
        <Pressable
          onPress={() => handlePostContentTap()}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <RichFeedNote
            expanded={notesExpanded}
            html={entry.notes}
            onToggleExpanded={() => setNotesExpanded((x) => !x)}
          />
        </Pressable>
      ) : null}

      {entry.kind === "reflection" && entry.reflectionPrompt ? (
        <View
          style={[
            styles.reflectionPostPrompt,
            { borderTopColor: theme.tabBorder },
          ]}
        >
          <Text
            style={[
              styles.reflectionPromptLabel,
              { color: theme.textSecondary },
            ]}
          >
            Prompt
          </Text>
          <Text
            style={[
              styles.reflectionPostPromptText,
              { color: theme.textSecondary },
            ]}
          >
            {entry.reflectionPrompt}
          </Text>
        </View>
      ) : null}

      {isCompletionOnly ? (
        <Pressable
          onPress={() => handlePostContentTap()}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <CompletionPostBody entry={entry} />
        </Pressable>
      ) : null}

      {isBirthdayPost ? (
        <View style={styles.birthdayActionBlock}>
          <Pressable
            accessibilityLabel={`Message ${entry.friend.name}`}
            disabled={!onOpenBirthdayMessage}
            onPress={onOpenBirthdayMessage}
            style={({ pressed }) => [
              styles.birthdayMessageButton,
              { backgroundColor: theme.primary },
              !onOpenBirthdayMessage && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={sym("message.fill", "message")}
              size={17}
              weight="semibold"
              tintColor={theme.primaryForeground}
            />
            <Text
              style={[
                styles.birthdayMessageText,
                { color: theme.primaryForeground },
              ]}
            >
              Message {entry.friend.name.split(" ")[0] || "friend"}
            </Text>
          </Pressable>
        </View>
      ) : null}

      {canUseSocialActions ? (
        <View
          style={[styles.actionsBlock, { borderTopColor: theme.tabBorder }]}
        >
          <View
            style={[
              styles.actionsRow,
              isCompletionOnly && styles.completionActionsRow,
            ]}
          >
            <Pressable
              onPress={onToggleProp}
              style={({ pressed }) => [
                styles.propButton,
                propIsActive && {
                  backgroundColor: selectedPropBackground,
                },
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("hands.clap.fill", "volunteer_activism")}
                size={16}
                weight="semibold"
                tintColor={propIsActive ? activePropColor : theme.tabIcon}
              />
              <Text
                style={[
                  styles.propText,
                  {
                    color: propIsActive ? activePropColor : theme.tabIcon,
                  },
                ]}
              >
                {entry.props.count > 0
                  ? `${entry.props.count} ${entry.props.count === 1 ? "Prop" : "Props"}`
                  : "Prop"}
              </Text>
            </Pressable>

            {!isCompletionOnly && canUseGoalActions && onOpenIncentive ? (
              <Pressable
                accessibilityLabel="Incentivize post"
                onPress={onOpenIncentive}
                style={({ pressed }) => [
                  styles.incentiveButton,
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={sym("gift.fill", "card_giftcard")}
                  size={15}
                  weight="semibold"
                  tintColor={theme.textSecondary}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.feedActionText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Incentive
                </Text>
              </Pressable>
            ) : null}

            {!isCompletionOnly && canUseGoalActions && onOpenJoinGoal ? (
              <Pressable
                accessibilityLabel={
                  joinGoalStatus === "joined"
                    ? "Already joined goal"
                    : "Join goal"
                }
                disabled={joinGoalStatus !== "idle"}
                onPress={onOpenJoinGoal}
                style={({ pressed }) => [
                  styles.joinGoalButton,
                  joinGoalStatus === "joined" && {
                    backgroundColor: `${theme.primary}14`,
                  },
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={sym(
                    joinGoalStatus === "joined"
                      ? "checkmark.circle.fill"
                      : "person.badge.plus",
                    joinGoalStatus === "joined" ? "check_circle" : "group_add",
                  )}
                  size={15}
                  weight="semibold"
                  tintColor={
                    joinGoalStatus === "joined" ? theme.primary : theme.tabIcon
                  }
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.feedActionText,
                    {
                      color:
                        joinGoalStatus === "joined"
                          ? theme.primary
                          : theme.tabIcon,
                    },
                  ]}
                >
                  {joinGoalStatus === "joined"
                    ? "Joined"
                    : joinGoalStatus === "loading"
                      ? "Opening..."
                      : "Join"}
                </Text>
              </Pressable>
            ) : null}

            <Pressable
              accessibilityLabel={`${commentCount} ${commentCount === 1 ? "comment" : "comments"}`}
              onPress={onOpenComments}
              style={({ pressed }) => [
                styles.commentCountWrap,
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("bubble.left", "chat_bubble_outline")}
                size={15}
                weight="semibold"
                tintColor={theme.textSecondary}
              />
              <Text
                numberOfLines={1}
                style={[styles.feedActionText, { color: theme.textSecondary }]}
              >
                {commentCount}
              </Text>
            </Pressable>
          </View>

          {commentPreview.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              onPress={onOpenComments}
              style={({ pressed }) => [
                styles.commentPreviewBlock,
                pressed && styles.pressed,
              ]}
            >
              {commentPreview.map((comment) => (
                <Text
                  key={comment.id}
                  numberOfLines={1}
                  style={[styles.commentPreviewText, { color: theme.text }]}
                >
                  <Text style={styles.commentPreviewAuthor}>
                    {comment.authorName}
                  </Text>{" "}
                  <Text style={{ color: theme.textSecondary }}>
                    {comment.body}
                  </Text>
                </Text>
              ))}
              {commentCount > commentPreview.length ? (
                <Text
                  style={[
                    styles.viewAllCommentsText,
                    { color: theme.textSecondary },
                  ]}
                >
                  View all {commentCount} comments
                </Text>
              ) : null}
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

function CompletionPostBody({ entry }: { entry: FriendFeedEntry }) {
  const theme = useTheme();
  const highlightText = entry.highlights.join(" · ");

  return (
    <View style={styles.completionBody}>
      <View style={styles.completionTextStack}>
        <View style={styles.completionTitleRow}>
          <SymbolView
            name={sym("checkmark", "check")}
            size={14}
            weight="bold"
            tintColor={theme.primary}
          />
          <Text
            numberOfLines={2}
            style={[styles.completionTitle, { color: theme.text }]}
          >
            Completed {entry.goal.name}
          </Text>
        </View>
        {highlightText ? (
          <Text
            numberOfLines={1}
            style={[
              styles.completionHighlightText,
              { color: theme.textSecondary },
            ]}
          >
            {highlightText}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function FeedAdCard({
  disabled,
  item,
  onHide,
  onReport,
}: {
  disabled: boolean;
  item: Extract<FeedRenderItem, { type: "ad" }>;
  onHide: () => void;
  onReport: () => void;
}) {
  const theme = useTheme();
  const [loadedAd, setLoadedAd] = useState<LoadedNativeFeedAd | null>(null);

  useEffect(() => {
    let cancelled = false;
    let nativeAdToDestroy: LoadedNativeFeedAd["nativeAd"] | null = null;

    void loadNativeFeedAd().then((nextLoadedAd) => {
      if (!nextLoadedAd) return;

      if (cancelled) {
        nextLoadedAd.nativeAd.destroy();
        return;
      }

      nativeAdToDestroy = nextLoadedAd.nativeAd;
      setLoadedAd(nextLoadedAd);
    });

    return () => {
      cancelled = true;
      nativeAdToDestroy?.destroy();
    };
  }, []);

  const renderLabel = () => (
    <View style={styles.adLabelRow}>
      <View
        style={[
          styles.adBadge,
          { backgroundColor: `${theme.primary}22`, borderColor: theme.primary },
        ]}
      >
        <Text style={[styles.adBadgeText, { color: theme.primary }]}>Ad</Text>
      </View>
      <Text style={[styles.adSponsoredText, { color: theme.textSecondary }]}>
        Sponsored
      </Text>
    </View>
  );

  const renderActions = () => (
    <View style={styles.adActions}>
      <Pressable
        accessibilityLabel="Hide ad"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onHide}
        style={({ pressed }) => [
          styles.adActionButton,
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.adActionText, { color: theme.textSecondary }]}>
          Hide ad
        </Text>
      </Pressable>
      <Pressable
        accessibilityLabel="Report ad"
        accessibilityRole="button"
        disabled={disabled}
        hitSlop={8}
        onPress={onReport}
        style={({ pressed }) => [
          styles.adActionButton,
          disabled && styles.disabled,
          pressed && styles.pressed,
        ]}
      >
        <Text style={[styles.adActionText, { color: theme.textSecondary }]}>
          Report
        </Text>
      </Pressable>
    </View>
  );

  const nativeAd = loadedAd?.nativeAd;
  const adsModule = loadedAd?.adsModule;

  if (nativeAd && adsModule) {
    return (
      <adsModule.NativeAdView nativeAd={nativeAd} style={styles.nativeAdRoot}>
        <View style={styles.adOuter}>
          <View
            style={[styles.adDivider, { backgroundColor: theme.tabBorder }]}
          />
          <View style={styles.nativeAdHeader}>
            {renderLabel()}
            {renderActions()}
          </View>

          <View
            style={[
              styles.adCard,
              styles.nativeAdContent,
              {
                backgroundColor: theme.tabBar,
                borderColor: `${theme.tabBorder}99`,
              },
            ]}
          >
            <View style={styles.nativeAdTopRow}>
              {nativeAd.icon ? (
                <adsModule.NativeAsset
                  assetType={adsModule.NativeAssetType.ICON}
                >
                  <RNImage
                    resizeMode="cover"
                    source={{ uri: nativeAd.icon.url }}
                    style={styles.nativeAdIcon}
                  />
                </adsModule.NativeAsset>
              ) : null}
              <View style={styles.nativeAdCopy}>
                <adsModule.NativeAsset
                  assetType={adsModule.NativeAssetType.HEADLINE}
                >
                  <Text
                    numberOfLines={2}
                    style={[styles.nativeAdHeadline, { color: theme.text }]}
                  >
                    {nativeAd.headline}
                  </Text>
                </adsModule.NativeAsset>
                {nativeAd.advertiser ? (
                  <adsModule.NativeAsset
                    assetType={adsModule.NativeAssetType.ADVERTISER}
                  >
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.nativeAdAdvertiser,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {nativeAd.advertiser}
                    </Text>
                  </adsModule.NativeAsset>
                ) : null}
              </View>
            </View>

            {nativeAd.body ? (
              <adsModule.NativeAsset assetType={adsModule.NativeAssetType.BODY}>
                <Text
                  numberOfLines={3}
                  style={[styles.nativeAdBody, { color: theme.textSecondary }]}
                >
                  {nativeAd.body}
                </Text>
              </adsModule.NativeAsset>
            ) : null}

            {nativeAd.mediaContent ? (
              <View
                style={[
                  styles.nativeAdMediaFrame,
                  { backgroundColor: theme.backgroundElement },
                ]}
              >
                <adsModule.NativeMediaView
                  resizeMode="cover"
                  style={styles.nativeAdMedia}
                />
              </View>
            ) : null}

            {nativeAd.callToAction ? (
              <adsModule.NativeAsset
                assetType={adsModule.NativeAssetType.CALL_TO_ACTION}
              >
                <Text
                  style={[
                    styles.nativeAdCta,
                    styles.nativeAdCtaText,
                    {
                      backgroundColor: theme.primary,
                      color: theme.primaryForeground,
                    },
                  ]}
                >
                  {nativeAd.callToAction}
                </Text>
              </adsModule.NativeAsset>
            ) : null}
          </View>
        </View>
      </adsModule.NativeAdView>
    );
  }

  return null;
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
      fontSize: 17,
      fontWeight: "400" as const,
      lineHeight: 24,
    }),
    [theme.text],
  );
  const tagsStyles = useMemo<MixedStyleRecord>(
    () => ({
      p: { marginTop: 0, marginBottom: 6 },
      h1: {
        fontSize: 20,
        lineHeight: 26,
        fontWeight: "600",
        marginTop: 0,
        marginBottom: 6,
      },
      h2: {
        fontSize: 19,
        lineHeight: 25,
        fontWeight: "600",
        marginTop: 0,
        marginBottom: 6,
      },
      h3: {
        fontSize: 17,
        lineHeight: 23,
        fontWeight: "600",
        marginTop: 0,
        marginBottom: 6,
      },
      strong: { fontWeight: "600" },
      b: { fontWeight: "600" },
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

export function CommentsModal({
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
  const commentsScrollRef = useRef<ScrollView>(null);
  const commentCount = entry ? countComments(entry.comments) : 0;

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

  useEffect(() => {
    if (!entry || commentCount === 0) return;

    requestAnimationFrame(() => {
      commentsScrollRef.current?.scrollToEnd({ animated: false });
    });
  }, [commentCount, entry]);

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
            ref={commentsScrollRef}
            canCancelContentTouches
            contentContainerStyle={styles.modalCommentsContent}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              if (commentCount > 0) {
                commentsScrollRef.current?.scrollToEnd({ animated: false });
              }
            }}
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
    paddingTop: 10,
    paddingBottom: 40,
    gap: 13,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    zIndex: 5,
  },
  pageHeaderIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  pageHeaderText: { flex: 1, minWidth: 0, gap: 1 },
  filterButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    position: "relative",
  },
  filterBadge: {
    position: "absolute",
    top: -3,
    right: -3,
    minWidth: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderRadius: 8,
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
  feedList: { gap: 10 },
  pinnedReflection: {
    marginTop: 12,
  },
  reflectionCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: "hidden",
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  reflectionAccent: {
    position: "absolute",
    top: 14,
    bottom: 14,
    left: 0,
    width: 3,
    borderTopRightRadius: 3,
    borderBottomRightRadius: 3,
  },
  reflectionCardCopy: {
    gap: 5,
  },
  reflectionCardEyebrow: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
  reflectionEyebrow: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "800",
    letterSpacing: 0,
  },
  reflectionPromptPressable: {
    alignSelf: "stretch",
  },
  reflectionPromptText: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: "800",
  },
  reflectionCardPromptText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "700",
  },
  reflectionActionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  reflectionTextAction: {
    minHeight: 28,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 2,
  },
  reflectionPrimaryAction: {
    alignSelf: "flex-start",
  },
  reflectionIconAction: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  reflectionTextActionPrimary: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "900",
  },
  reflectionTextActionSecondary: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "800",
  },
  reflectionPickerScreen: {
    flex: 1,
  },
  reflectionPickerSafeArea: {
    flex: 1,
  },
  reflectionHeaderSpacer: {
    width: 48,
  },
  reflectionPickerContent: {
    gap: 20,
    padding: 18,
    paddingBottom: 36,
  },
  promptSection: {
    gap: 10,
  },
  promptSectionTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  promptList: {
    gap: 8,
  },
  promptRow: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingLeft: 14,
    paddingRight: 7,
    paddingVertical: 11,
  },
  promptRowText: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  promptStarButton: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
  },
  promptEmptyText: {
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "700",
  },
  promptSearch: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  promptSearchInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "700",
  },
  reflectionComposerContent: {
    gap: 14,
    padding: 18,
    paddingBottom: 36,
  },
  reflectionPromptBox: {
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
  },
  reflectionInput: {
    minHeight: 180,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    padding: 14,
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "700",
  },
  reflectionPhotoList: {
    gap: 9,
    paddingVertical: 2,
  },
  reflectionPhotoPreviewWrap: {
    position: "relative",
  },
  reflectionPhotoPreview: {
    width: 84,
    height: 84,
    borderRadius: 14,
  },
  reflectionRemovePhoto: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  reflectionPhotoActions: {
    flexDirection: "row",
    gap: 10,
  },
  reflectionPhotoButton: {
    minHeight: 48,
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingHorizontal: 12,
  },
  reflectionPhotoButtonText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
  reflectionVisibilityRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  reflectionVisibilityChip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 9,
  },
  reflectionVisibilityText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "900",
  },
  audienceSelectRow: {
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  audienceSelectCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  audienceSelectTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "800",
  },
  audienceSelectDetail: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  adOuter: {
    gap: 9,
    paddingVertical: 4,
  },
  adDivider: {
    alignSelf: "center",
    width: 44,
    height: StyleSheet.hairlineWidth,
    opacity: 0.75,
  },
  adCard: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    overflow: "hidden",
  },
  adHeader: {
    minHeight: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 4,
  },
  adLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  adBadge: {
    minWidth: 24,
    height: 19,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 6,
    paddingHorizontal: 6,
  },
  adBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
  },
  adSponsoredText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
  adActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  adActionButton: {
    minHeight: 30,
    justifyContent: "center",
    paddingHorizontal: 7,
  },
  adActionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  nativeAdRoot: {
    width: "100%",
  },
  nativeAdContent: {
    gap: 9,
    padding: 12,
  },
  nativeAdHeader: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  nativeAdTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  nativeAdIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
  },
  nativeAdPlaceholder: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
  },
  nativeAdPlaceholderIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  nativeAdCopy: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  nativeAdHeadline: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "900",
  },
  nativeAdAdvertiser: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  nativeAdBody: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  nativeAdMediaFrame: {
    minHeight: 160,
    overflow: "hidden",
    borderRadius: 8,
  },
  nativeAdMedia: {
    aspectRatio: 1.75,
    width: "100%",
  },
  nativeAdCta: {
    minHeight: 42,
    borderRadius: 13,
    paddingHorizontal: 14,
    paddingVertical: 11,
    textAlign: "center",
  },
  nativeAdCtaText: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "900",
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    overflow: "hidden",
  },
  photoCard: {
    borderRadius: 8,
  },
  completionCard: {
    borderRadius: 8,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  completionCardHeader: {
    paddingVertical: 10,
    paddingBottom: 4,
  },
  avatar: { flexShrink: 0 },
  avatarFallback: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: "600",
  },
  headerMeta: {
    flex: 1,
    minWidth: 0,
    gap: 0,
  },
  headerNameRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
  },
  friendNamePressable: {
    flex: 1,
    minWidth: 0,
  },
  friendName: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "600",
  },
  dateText: {
    maxWidth: 68,
    flexShrink: 0,
    textAlign: "right",
    fontSize: 14,
    lineHeight: 18,
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
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "500",
  },
  carouselWrap: {
    marginBottom: 0,
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
    fontWeight: "600",
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
    paddingTop: 11,
    paddingBottom: 10,
  },
  reflectionPostPrompt: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 3,
    gap: 3,
  },
  reflectionPromptLabel: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
    textTransform: "uppercase",
  },
  reflectionPostPromptText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "400",
  },
  completionBody: {
    paddingHorizontal: 13,
    paddingBottom: 7,
  },
  completionTextStack: {
    gap: 3,
  },
  completionTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  completionTitle: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
  },
  completionHighlightText: {
    paddingLeft: 21,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "400",
  },
  showMoreButton: {
    paddingTop: 2,
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: "500",
  },
  birthdayActionBlock: {
    paddingHorizontal: 14,
    paddingTop: 2,
    paddingBottom: 12,
  },
  birthdayMessageButton: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  birthdayMessageText: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "600",
  },
  actionsBlock: {
    borderTopWidth: 0,
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 11,
    paddingTop: 5,
    paddingBottom: 9,
  },
  completionActionsRow: {
    paddingTop: 4,
    paddingBottom: 8,
  },
  propButton: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 5,
    paddingHorizontal: 7,
    paddingVertical: 5,
    borderRadius: 8,
  },
  propText: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "500",
  },
  incentiveButton: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: 4,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 5,
    borderRadius: 8,
  },
  joinGoalButton: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: 4,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 5,
    borderRadius: 8,
  },
  commentCountWrap: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 0,
    gap: 4,
    paddingHorizontal: 4,
    paddingVertical: 5,
  },
  feedActionText: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "500",
  },
  commentPreviewBlock: {
    gap: 4,
    paddingHorizontal: 18,
    paddingBottom: 12,
  },
  commentPreviewText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "400",
  },
  commentPreviewAuthor: {
    fontWeight: "600",
  },
  viewAllCommentsText: {
    paddingTop: 2,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "400",
  },
  incentiveModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#00000066",
  },
  incentiveModalBackdrop: {
    ...StyleSheet.absoluteFill,
  },
  incentiveSheet: {
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: "hidden",
  },
  incentiveHeader: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  incentiveHeaderCopy: {
    flex: 1,
    gap: 2,
  },
  incentiveTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "800",
  },
  incentiveSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  incentiveClose: {
    width: 38,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
  },
  incentiveContent: {
    gap: 16,
    padding: 18,
    paddingBottom: 24,
  },
  incentiveField: {
    gap: 8,
  },
  incentiveLabel: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  incentiveInput: {
    minHeight: 52,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 17,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "700",
  },
  incentiveGoalBox: {
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 20,
    padding: 14,
  },
  incentiveGoalKicker: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  incentiveGoalText: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
  },
  incentiveNumberRow: {
    flexDirection: "row",
    gap: 12,
  },
  incentiveNumberField: {
    flex: 1,
    gap: 7,
  },
  incentiveSmallLabel: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  incentiveSmallInput: {
    minHeight: 48,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingHorizontal: 12,
    fontSize: 16,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  incentiveSendButton: {
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  incentiveSendText: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
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
