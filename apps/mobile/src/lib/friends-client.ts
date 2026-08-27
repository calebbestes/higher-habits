import { fetchGoalLogsSnapshot, getMonthKey } from "@/lib/goal-logs-client";
import type { GoalPhotoUpload } from "@/lib/goal-photos-client";
import { recordReviewMilestone } from "@/lib/in-app-review";
import { mobileApiFetch } from "@/lib/mobile-api";
import type { SharedGoalScoringType } from "@/lib/shared-goals-client";

export type StreakGoalScope = "all" | "shared" | "single" | "high";
export type IncentiveTargetType = "habit" | "goal";

export type FriendMessageRow = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

export type FriendIncentiveRow = FriendMessageRow & {
  streakDays: number | null;
  streakPercent: number | null;
  goalScope: StreakGoalScope | null;
  targetType: IncentiveTargetType;
  goalId: string | null;
  goalName: string | null;
  planGoalId: string | null;
  planGoalName: string | null;
  accepted: boolean | null;
  progress: {
    qualifyingDays: number;
    requiredDays: number;
    percent: number;
    unit?: "days" | "checkpoints";
  } | null;
};

export type FriendRow = {
  id: string;
  userId1: string;
  userId2: string;
  status: "requested" | "accepted" | "archived";
  friendId: string;
  friendName: string;
  friendEmail: string;
  friendImage: string | null;
  friendPhoneNumber: string | null;
  friendBirthday: string | null;
  mutualFriendCount: number;
  isIncomingRequest: boolean;
  lastOpenedAt: string | null;
  performance7Day: {
    earnedPoints: number;
    possiblePoints: number;
    percent: number;
  } | null;
  goalOptions: Array<{ id: string; name: string }>;
  planGoalOptions: Array<{ id: string; name: string }>;
  incentives: FriendIncentiveRow[];
};

export type FriendGroupMember = {
  id: string;
  name: string;
  image: string | null;
  phoneNumber: string | null;
};

export type FriendGroupRow = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  members: FriendGroupMember[];
};

export type FriendProfileHabit = {
  id: string;
  name: string;
  iconKey: string;
  priority: "high" | "low";
  visibility: "only_me" | "goal_friends" | "all_friends";
  defaultComplete: boolean;
  requireEvidence: boolean;
};

export type FriendProfilePeriodicHabit = FriendProfileHabit & {
  categoryId: string;
  period: "weekly" | "monthly";
  frequencyGoal: number | null;
};

export type FriendProfileCategory = {
  id: string;
  name: string;
  icon: string;
  habits: FriendProfileHabit[];
};

export type FriendProfile = {
  friend: {
    id: string;
    friendshipId: string | null;
    name: string;
    email: string;
    image: string | null;
    lastOpenedAt: string | null;
  };
  stats: {
    friendCount: number;
    goalCompletions: number;
    habitCompletions: number;
    incentivesEarned: number;
    incentivesGiven: number;
    longestStreak: number;
    taskCompletions: number;
  };
  dateKeys: string[];
  categories: FriendProfileCategory[];
  periodicHabits: FriendProfilePeriodicHabit[];
  logsByHabitDate: Record<string, "complete" | "incomplete" | "planned">;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOrFallback(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function nullableDateKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^\d{4}-\d{2}-\d{2}/);
  return match?.[0] ?? null;
}

function numberOrFallback(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanOrFallback(value: unknown, fallback = false) {
  return typeof value === "boolean" ? value : fallback;
}

function normalizeStatus(value: unknown): FriendRow["status"] {
  return value === "accepted" || value === "archived" ? value : "requested";
}

function normalizeFriend(row: unknown): FriendRow | null {
  if (!isRecord(row) || typeof row.id !== "string") return null;

  const friendId = stringOrFallback(row.friendId);
  const friendName = stringOrFallback(row.friendName, "Friend");
  return {
    ...(row as Partial<FriendRow>),
    id: row.id,
    userId1: stringOrFallback(row.userId1),
    userId2: stringOrFallback(row.userId2),
    status: normalizeStatus(row.status),
    friendId,
    friendName,
    friendEmail: stringOrFallback(row.friendEmail),
    friendImage: nullableString(row.friendImage),
    friendPhoneNumber: nullableString(row.friendPhoneNumber),
    friendBirthday: nullableDateKey(row.friendBirthday),
    mutualFriendCount: numberOrFallback(row.mutualFriendCount),
    isIncomingRequest: booleanOrFallback(row.isIncomingRequest),
    lastOpenedAt: nullableString(row.lastOpenedAt),
    performance7Day: isRecord(row.performance7Day)
      ? {
          earnedPoints: numberOrFallback(row.performance7Day.earnedPoints),
          possiblePoints: numberOrFallback(row.performance7Day.possiblePoints),
          percent: numberOrFallback(row.performance7Day.percent),
        }
      : null,
    goalOptions: Array.isArray(row.goalOptions)
      ? row.goalOptions.flatMap((option) =>
          isRecord(option) && typeof option.id === "string"
            ? [{ id: option.id, name: stringOrFallback(option.name, "Habit") }]
            : [],
        )
      : [],
    planGoalOptions: Array.isArray(row.planGoalOptions)
      ? row.planGoalOptions.flatMap((option) =>
          isRecord(option) && typeof option.id === "string"
            ? [
                {
                  id: option.id,
                  name: stringOrFallback(option.name, "Personal goal"),
                },
              ]
            : [],
        )
      : [],
    incentives: Array.isArray(row.incentives)
      ? (row.incentives as FriendIncentiveRow[])
      : [],
  };
}

function normalizeFriends(value: unknown): FriendRow[] {
  return Array.isArray(value)
    ? value.flatMap((row) => {
        const normalized = normalizeFriend(row);
        return normalized ? [normalized] : [];
      })
    : [];
}

function normalizeFriendGroupMember(value: unknown): FriendGroupMember | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;

  return {
    id: value.id,
    name: stringOrFallback(value.name, "Friend"),
    image: nullableString(value.image),
    phoneNumber: nullableString(value.phoneNumber),
  };
}

function normalizeFriendGroup(value: unknown): FriendGroupRow | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;

  return {
    id: value.id,
    name: stringOrFallback(value.name, "Group"),
    createdAt: stringOrFallback(value.createdAt),
    updatedAt: stringOrFallback(value.updatedAt),
    members: Array.isArray(value.members)
      ? value.members.flatMap((member) => {
          const normalized = normalizeFriendGroupMember(member);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

function normalizeFriendGroups(value: unknown): FriendGroupRow[] {
  return Array.isArray(value)
    ? value.flatMap((row) => {
        const normalized = normalizeFriendGroup(row);
        return normalized ? [normalized] : [];
      })
    : [];
}

function normalizeProfileHabit(value: unknown): FriendProfileHabit | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;

  return {
    id: value.id,
    name: stringOrFallback(value.name, "Habit"),
    iconKey: stringOrFallback(value.iconKey, "mdi:target"),
    priority: value.priority === "high" ? "high" : "low",
    visibility:
      value.visibility === "goal_friends" || value.visibility === "all_friends"
        ? value.visibility
        : "only_me",
    defaultComplete: booleanOrFallback(value.defaultComplete),
    requireEvidence: booleanOrFallback(value.requireEvidence, false),
  };
}

function normalizeProfilePeriodicHabit(
  value: unknown,
): FriendProfilePeriodicHabit | null {
  const habit = normalizeProfileHabit(value);
  if (!habit || !isRecord(value)) return null;
  const period = value.period === "monthly" ? "monthly" : "weekly";

  return {
    ...habit,
    categoryId: stringOrFallback(value.categoryId),
    period,
    frequencyGoal:
      typeof value.frequencyGoal === "number" &&
      Number.isFinite(value.frequencyGoal)
        ? value.frequencyGoal
        : null,
  };
}

function normalizeProfileCategory(
  value: unknown,
): FriendProfileCategory | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;

  return {
    id: value.id,
    name: stringOrFallback(value.name, "Habits"),
    icon: stringOrFallback(value.icon, "target"),
    habits: Array.isArray(value.habits)
      ? value.habits.flatMap((habit) => {
          const normalized = normalizeProfileHabit(habit);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

function normalizeLogsByHabitDate(
  value: unknown,
): FriendProfile["logsByHabitDate"] {
  if (!isRecord(value)) return {};

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, status]) =>
      status === "complete" || status === "planned" || status === "incomplete"
        ? [[key, status]]
        : [],
    ),
  );
}

function normalizeFriendProfile(value: unknown): FriendProfile | null {
  if (!isRecord(value) || !isRecord(value.friend)) return null;

  return {
    friend: {
      id: stringOrFallback(value.friend.id),
      friendshipId: nullableString(value.friend.friendshipId),
      name: stringOrFallback(value.friend.name, "Friend"),
      email: stringOrFallback(value.friend.email),
      image: nullableString(value.friend.image),
      lastOpenedAt: nullableString(value.friend.lastOpenedAt),
    },
    stats: isRecord(value.stats)
      ? {
          friendCount: numberOrFallback(value.stats.friendCount),
          goalCompletions: numberOrFallback(value.stats.goalCompletions),
          habitCompletions: numberOrFallback(value.stats.habitCompletions),
          incentivesEarned: numberOrFallback(value.stats.incentivesEarned),
          incentivesGiven: numberOrFallback(value.stats.incentivesGiven),
          longestStreak: numberOrFallback(value.stats.longestStreak),
          taskCompletions: numberOrFallback(value.stats.taskCompletions),
        }
      : {
          friendCount: 0,
          goalCompletions: 0,
          habitCompletions: 0,
          incentivesEarned: 0,
          incentivesGiven: 0,
          longestStreak: 0,
          taskCompletions: 0,
        },
    dateKeys: Array.isArray(value.dateKeys)
      ? value.dateKeys.filter(
          (dateKey): dateKey is string => typeof dateKey === "string",
        )
      : [],
    categories: Array.isArray(value.categories)
      ? value.categories.flatMap((category) => {
          const normalized = normalizeProfileCategory(category);
          return normalized ? [normalized] : [];
        })
      : [],
    periodicHabits: Array.isArray(value.periodicHabits)
      ? value.periodicHabits.flatMap((habit) => {
          const normalized = normalizeProfilePeriodicHabit(habit);
          return normalized ? [normalized] : [];
        })
      : [],
    logsByHabitDate: normalizeLogsByHabitDate(value.logsByHabitDate),
  };
}

function normalizeFeedMention(value: unknown): FeedMention | null {
  if (!isRecord(value) || typeof value.userId !== "string") return null;

  return {
    userId: value.userId,
    name: stringOrFallback(value.name, "Friend"),
  };
}

function normalizeFeedMentions(value: unknown): FeedMention[] {
  return Array.isArray(value)
    ? value.flatMap((mention) => {
        const normalized = normalizeFeedMention(mention);
        return normalized ? [normalized] : [];
      })
    : [];
}

function normalizeFeedComment(value: unknown): FriendFeedComment | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;

  return {
    id: value.id,
    userId: stringOrFallback(value.userId),
    parentCommentId: nullableString(value.parentCommentId),
    authorName: stringOrFallback(value.authorName, "Friend"),
    authorImage: nullableString(value.authorImage),
    body: stringOrFallback(value.body),
    createdAt: stringOrFallback(value.createdAt),
    updatedAt: stringOrFallback(value.updatedAt),
    canDelete: booleanOrFallback(value.canDelete),
    mentions: normalizeFeedMentions(value.mentions),
    replies: Array.isArray(value.replies)
      ? value.replies.flatMap((reply) => {
          const normalized = normalizeFeedComment(reply);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

function normalizeSharedGoalFeedDetails(
  value: unknown,
): FriendFeedEntry["sharedGoal"] {
  if (!isRecord(value) || typeof value.id !== "string") return undefined;

  const participants = Array.isArray(value.participants)
    ? value.participants.flatMap((participant) =>
        isRecord(participant) && typeof participant.id === "string"
          ? [
              {
                id: participant.id,
                userId: stringOrFallback(participant.userId),
                name: stringOrFallback(participant.userName, "Friend"),
                image: nullableString(participant.userImage),
                status:
                  participant.status === "accepted" ? "accepted" : "invited",
              } as const,
            ]
          : [],
      )
    : [];

  return {
    id: value.id,
    name: stringOrFallback(value.name, "Shared goal"),
    mode: value.mode === "competitive" ? "competitive" : "collaborative",
    scoringType:
      value.scoringType === "combined_target"
        ? "combined_target"
        : value.scoringType === "first_to_target"
          ? "first_to_target"
          : value.scoringType === "highest_total"
            ? "highest_total"
            : value.scoringType === "longest_streak"
              ? "longest_streak"
              : value.scoringType === "one_time"
                ? "one_time"
                : "shared_streak",
    target:
      typeof value.target === "number" && Number.isFinite(value.target)
        ? value.target
        : null,
    startsOn: nullableString(value.startsOn),
    endsOn: nullableString(value.endsOn),
    openInvite: booleanOrFallback(value.openInvite),
    status:
      value.status === "completed" || value.status === "archived"
        ? value.status
        : "active",
    currentUserStatus:
      value.currentUserStatus === "accepted" ? "accepted" : "invited",
    participants,
  };
}

function normalizeFeedEntry(value: unknown): FriendFeedEntry | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;

  return {
    id: value.id,
    kind:
      value.kind === "goal_checkpoint"
        ? "goal_checkpoint"
        : value.kind === "reflection"
          ? "reflection"
          : value.kind === "birthday"
            ? "birthday"
            : value.kind === "shared_goal"
              ? "shared_goal"
              : value.kind === "incentive"
                ? "incentive"
                : "habit",
    friend: isRecord(value.friend)
      ? {
          id: stringOrFallback(value.friend.id),
          name: stringOrFallback(value.friend.name, "Friend"),
          image: nullableString(value.friend.image),
          phoneNumber: nullableString(value.friend.phoneNumber),
        }
      : { id: "", name: "Friend", image: null, phoneNumber: null },
    goal: isRecord(value.goal)
      ? {
          id: stringOrFallback(value.goal.id),
          name: stringOrFallback(value.goal.name, "Habit"),
          icon: stringOrFallback(value.goal.icon, "mdi:target"),
        }
      : { id: "", name: "Habit", icon: "mdi:target" },
    category: isRecord(value.category)
      ? {
          id: stringOrFallback(value.category.id),
          name: stringOrFallback(value.category.name, "Habits"),
          icon: stringOrFallback(value.category.icon, "target"),
        }
      : null,
    dateKey: stringOrFallback(value.dateKey),
    notes: stringOrFallback(value.notes),
    reflectionPrompt: nullableString(value.reflectionPrompt),
    updatedAt: stringOrFallback(value.updatedAt),
    canDeletePhotos: booleanOrFallback(value.canDeletePhotos),
    postType: value.postType === "completion" ? "completion" : "journal",
    highlights: Array.isArray(value.highlights)
      ? value.highlights.filter(
          (highlight): highlight is string => typeof highlight === "string",
        )
      : [],
    props: isRecord(value.props)
      ? {
          count: numberOrFallback(value.props.count),
          hasPropped: booleanOrFallback(value.props.hasPropped),
        }
      : { count: 0, hasPropped: false },
    repost: isRecord(value.repost)
      ? {
          count: numberOrFallback(value.repost.count),
          hasReposted: booleanOrFallback(value.repost.hasReposted),
        }
      : { count: 0, hasReposted: false },
    sourceType:
      value.sourceType === "goal_log" ||
      value.sourceType === "goal_checkpoint" ||
      value.sourceType === "reflection_post" ||
      value.sourceType === "social_feed_post"
        ? value.sourceType
        : undefined,
    sourceId: typeof value.sourceId === "string" ? value.sourceId : undefined,
    sharedGoal: normalizeSharedGoalFeedDetails(value.sharedGoal),
    repostedBy: isRecord(value.repostedBy)
      ? {
          id: stringOrFallback(value.repostedBy.id),
          name: stringOrFallback(value.repostedBy.name, "Friend"),
          image: nullableString(value.repostedBy.image),
        }
      : undefined,
    mentions: normalizeFeedMentions(value.mentions),
    comments: Array.isArray(value.comments)
      ? value.comments.flatMap((comment) => {
          const normalized = normalizeFeedComment(comment);
          return normalized ? [normalized] : [];
        })
      : [],
    photos: Array.isArray(value.photos)
      ? value.photos.flatMap((photo) =>
          isRecord(photo) && typeof photo.id === "string"
            ? [
                {
                  id: photo.id,
                  url: stringOrFallback(photo.url),
                  contentType: stringOrFallback(photo.contentType),
                  createdAt: stringOrFallback(photo.createdAt),
                },
              ]
            : [],
        )
      : [],
  };
}

function normalizeFeed(value: unknown): FriendFeedEntry[] {
  return Array.isArray(value)
    ? value.flatMap((entry) => {
        const normalized = normalizeFeedEntry(entry);
        return normalized ? [normalized] : [];
      })
    : [];
}

export type FriendFeedPage = {
  items: FriendFeedEntry[];
  nextCursor: string | null;
};

function normalizeFeedPage(value: unknown): FriendFeedPage {
  if (Array.isArray(value)) {
    return { items: normalizeFeed(value), nextCursor: null };
  }

  if (!isRecord(value)) {
    return { items: [], nextCursor: null };
  }

  return {
    items: normalizeFeed(value.items),
    nextCursor: typeof value.nextCursor === "string" ? value.nextCursor : null,
  };
}

function toProfileDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getRecentProfileDateKeys(dayCount: number) {
  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (dayCount - 1 - index));
    return toProfileDateKey(date);
  });
}

export type FriendFeedPhoto = {
  id: string;
  url: string;
  contentType: string;
  createdAt: string;
};

export type FeedRepostSourceType =
  | "goal_log"
  | "goal_checkpoint"
  | "reflection_post"
  | "social_feed_post";

export type FeedMention = {
  userId: string;
  name: string;
};

export type FriendFeedComment = {
  id: string;
  userId: string;
  parentCommentId: string | null;
  authorName: string;
  authorImage: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  canDelete: boolean;
  mentions: FeedMention[];
  replies: FriendFeedComment[];
};

export type FriendFeedEntry = {
  id: string;
  kind:
    | "habit"
    | "goal_checkpoint"
    | "reflection"
    | "birthday"
    | "shared_goal"
    | "incentive";
  friend: {
    id: string;
    name: string;
    image: string | null;
    phoneNumber: string | null;
  };
  goal: {
    id: string;
    name: string;
    icon: string;
  };
  category: {
    id: string;
    name: string;
    icon: string;
  } | null;
  dateKey: string;
  notes: string;
  reflectionPrompt: string | null;
  updatedAt: string;
  canDeletePhotos: boolean;
  postType: "completion" | "journal";
  highlights: string[];
  props: {
    count: number;
    hasPropped: boolean;
  };
  repost: {
    count: number;
    hasReposted: boolean;
  };
  sourceType?: FeedRepostSourceType;
  sourceId?: string;
  repostedBy?: {
    id: string;
    name: string;
    image: string | null;
  };
  sharedGoal?: {
    id: string;
    name: string;
    mode: "collaborative" | "competitive";
    scoringType: SharedGoalScoringType;
    target: number | null;
    startsOn: string | null;
    endsOn: string | null;
    openInvite: boolean;
    status: "active" | "completed" | "archived";
    currentUserStatus: "invited" | "accepted";
    participants: Array<{
      id: string;
      userId: string;
      name: string;
      image: string | null;
      status: "invited" | "accepted";
    }>;
  };
  mentions: FeedMention[];
  comments: FriendFeedComment[];
  photos: FriendFeedPhoto[];
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    const rawMessage = body?.error ?? body?.message;
    if (rawMessage) {
      const parsedMessage = parseApiErrorMessage(rawMessage);
      throw new Error(parsedMessage);
    }
    throw new Error(`Request failed (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

function parseApiErrorMessage(message: string): string {
  try {
    const issues = JSON.parse(message) as unknown;
    if (Array.isArray(issues)) {
      const firstIssue = issues[0] as
        | { message?: unknown; path?: unknown }
        | undefined;
      const issueMessage =
        typeof firstIssue?.message === "string" ? firstIssue.message : "";
      const path = Array.isArray(firstIssue?.path)
        ? firstIssue.path.join(".")
        : "";
      if (path === "email") {
        return issueMessage === "Required"
          ? "Email or phone number is required."
          : "Enter a valid email or phone number.";
      }
      if (issueMessage) return issueMessage;
    }
  } catch {
    // Fall through to the original server message.
  }
  return message;
}

export const fetchFriends = (): Promise<FriendRow[]> =>
  mobileApiFetch("/api/friends")
    .then((r) => parseResponse<unknown>(r))
    .then(normalizeFriends);

export const fetchFriendGroups = (): Promise<FriendGroupRow[]> =>
  mobileApiFetch("/api/friend-groups")
    .then((r) => parseResponse<unknown>(r))
    .then(normalizeFriendGroups);

export const createFriendGroup = (payload: {
  name: string;
  memberIds: string[];
}): Promise<FriendGroupRow> =>
  mobileApiFetch("/api/friend-groups", {
    method: "POST",
    body: JSON.stringify(payload),
  })
    .then((r) => parseResponse<unknown>(r))
    .then((value) => {
      const normalized = normalizeFriendGroup(value);
      if (!normalized) throw new Error("Could not create group.");
      return normalized;
    });

export const updateFriendGroup = (payload: {
  id: string;
  name: string;
  memberIds: string[];
}): Promise<FriendGroupRow> =>
  mobileApiFetch("/api/friend-groups", {
    method: "PATCH",
    body: JSON.stringify(payload),
  })
    .then((r) => parseResponse<unknown>(r))
    .then((value) => {
      const normalized = normalizeFriendGroup(value);
      if (!normalized) throw new Error("Could not update group.");
      return normalized;
    });

export const fetchFriendProfile = (
  friendshipId: string,
): Promise<FriendProfile> => fetchFriendProfileWithFallback({ friendshipId });

export const fetchFriendProfileByFriendId = (
  friendId: string,
): Promise<FriendProfile> => fetchFriendProfileWithFallback({ friendId });

export async function fetchMyProfile(): Promise<FriendProfile> {
  const profile = await mobileApiFetch("/api/users/profile").then((r) =>
    parseResponse<unknown>(r),
  );
  const normalized = normalizeFriendProfile(profile);
  if (!normalized) {
    throw new Error("Profile data is unavailable.");
  }
  if (normalized.periodicHabits.length === 0) {
    try {
      const snapshot = await fetchGoalLogsSnapshot(getMonthKey());
      return {
        ...normalized,
        periodicHabits: snapshot.periodicGoals.map((habit) => ({
          id: habit.id,
          name: habit.name,
          iconKey: habit.iconKey,
          categoryId: habit.categoryId,
          priority: habit.priority,
          visibility: habit.visibility,
          period: habit.period === "monthly" ? "monthly" : "weekly",
          frequencyGoal: habit.frequencyGoal,
          defaultComplete: habit.defaultComplete,
          requireEvidence: habit.requireEvidence,
        })),
        logsByHabitDate: {
          ...snapshot.logsByGoalDate,
          ...normalized.logsByHabitDate,
        },
      };
    } catch {
      // Older profile APIs do not include periodic habits. Keep the profile usable
      // if the goal-logs fallback is unavailable.
    }
  }
  return normalized;
}

async function fetchFriendProfileWithFallback(lookup: {
  friendshipId?: string;
  friendId?: string;
}): Promise<FriendProfile> {
  const encodedFriendshipId = lookup.friendshipId
    ? encodeURIComponent(lookup.friendshipId)
    : null;
  const encodedFriendId = lookup.friendId
    ? encodeURIComponent(lookup.friendId)
    : null;
  const paths = [
    encodedFriendshipId
      ? `/api/friends?profileFriendshipId=${encodedFriendshipId}`
      : null,
    encodedFriendId ? `/api/friends?profileFriendId=${encodedFriendId}` : null,
    encodedFriendshipId ? `/api/friends/${encodedFriendshipId}/profile` : null,
  ].filter((path): path is string => Boolean(path));
  let lastError: Error | null = null;

  for (const path of paths) {
    try {
      const profile = await mobileApiFetch(path).then((r) =>
        parseResponse<unknown>(r),
      );

      const normalizedProfile = normalizeFriendProfile(profile);
      if (normalizedProfile) {
        return normalizedProfile;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Request failed.");
    }
  }

  try {
    return await fetchFriendProfileFromExistingData(lookup);
  } catch (fallbackError) {
    throw (
      lastError ??
      (fallbackError instanceof Error
        ? fallbackError
        : new Error("Profile data is unavailable."))
    );
  }
}

async function fetchFriendProfileFromExistingData(lookup: {
  friendshipId?: string;
  friendId?: string;
}): Promise<FriendProfile> {
  const [friends, feedPage] = await Promise.all([
    fetchFriends(),
    fetchFriendsFeed(),
  ]);
  const feed = feedPage.items;
  const friend = friends.find(
    (row) =>
      row.status === "accepted" &&
      (lookup.friendshipId
        ? row.id === lookup.friendshipId
        : row.friendId === lookup.friendId),
  );

  if (!friend) {
    throw new Error("Friendship not found.");
  }

  const dateKeys = getRecentProfileDateKeys(7);
  const dateKeySet = new Set(dateKeys);
  const habitsById = new Map<string, FriendProfileHabit>();
  const logsByHabitDate: FriendProfile["logsByHabitDate"] = {};

  for (const option of friend.goalOptions) {
    habitsById.set(option.id, {
      id: option.id,
      name: option.name,
      iconKey: "mdi:target",
      priority: "low",
      visibility: "all_friends",
      defaultComplete: false,
      requireEvidence: false,
    });
  }

  for (const entry of feed) {
    if (entry.friend.id !== friend.friendId || !dateKeySet.has(entry.dateKey)) {
      continue;
    }

    habitsById.set(entry.goal.id, {
      id: entry.goal.id,
      name: entry.goal.name,
      iconKey: entry.goal.icon,
      priority: habitsById.get(entry.goal.id)?.priority ?? "low",
      visibility: habitsById.get(entry.goal.id)?.visibility ?? "all_friends",
      defaultComplete: habitsById.get(entry.goal.id)?.defaultComplete ?? false,
      requireEvidence: habitsById.get(entry.goal.id)?.requireEvidence ?? false,
    });
    logsByHabitDate[`${entry.goal.id}_${entry.dateKey}`] = "complete";
  }

  const habits = [...habitsById.values()];

  return {
    friend: {
      id: friend.friendId,
      friendshipId: friend.id,
      name: friend.friendName,
      email: friend.friendEmail,
      image: friend.friendImage,
      lastOpenedAt: friend.lastOpenedAt,
    },
    stats: {
      friendCount: 0,
      goalCompletions: feed.filter(
        (entry) =>
          entry.friend.id === friend.friendId &&
          entry.kind === "goal_checkpoint",
      ).length,
      habitCompletions: feed.filter(
        (entry) =>
          entry.friend.id === friend.friendId && entry.kind === "habit",
      ).length,
      incentivesEarned: 0,
      incentivesGiven: 0,
      longestStreak: 0,
      taskCompletions: 0,
    },
    dateKeys,
    categories:
      habits.length > 0
        ? [
            {
              id: "daily-habits",
              name: "Daily Habits",
              icon: "target",
              habits,
            },
          ]
        : [],
    periodicHabits: [],
    logsByHabitDate,
  };
}

export const addFriend = (identifier: string): Promise<FriendRow> =>
  mobileApiFetch("/api/friends", {
    method: "POST",
    body: JSON.stringify({
      identifier,
      ...(identifier.includes("@") ? { email: identifier } : {}),
    }),
  }).then((r) => parseResponse<FriendRow>(r));

export type FriendSearchResult = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  mutualFriendCount: number;
};

function normalizeFriendSearchResult(
  value: unknown,
): FriendSearchResult | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;

  return {
    id: value.id,
    name: stringOrFallback(value.name, "float user"),
    email: stringOrFallback(value.email),
    image: nullableString(value.image),
    mutualFriendCount: numberOrFallback(value.mutualFriendCount),
  };
}

export const searchFriendUsers = (
  query: string,
): Promise<FriendSearchResult[]> =>
  mobileApiFetch(`/api/friends/search?q=${encodeURIComponent(query)}`)
    .then((r) => parseResponse<unknown>(r))
    .then((value) =>
      Array.isArray(value)
        ? value.flatMap((item) => {
            const normalized = normalizeFriendSearchResult(item);
            return normalized ? [normalized] : [];
          })
        : [],
    );

export const acceptFriendRequest = (friendshipId: string) =>
  mobileApiFetch("/api/friends", {
    method: "PATCH",
    body: JSON.stringify({ friendshipId, action: "accept" }),
  }).then((r) => parseResponse<{ id: string; status: "accepted" }>(r));

export const archiveFriend = (friendshipId: string) =>
  mobileApiFetch("/api/friends", {
    method: "PATCH",
    body: JSON.stringify({ friendshipId, action: "archive" }),
  }).then((r) => parseResponse<{ id: string; status: "archived" }>(r));

export const reportContent = (payload: {
  targetType: "feed_post" | "feed_comment" | "user" | "ad" | "general";
  targetId?: string;
  reason: string;
  context?: Record<string, unknown>;
}) =>
  mobileApiFetch("/api/moderation/report", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => parseResponse<{ ok: true }>(r));

export const fetchFriendsFeed = (
  options: {
    cursor?: string | null;
    limit?: number;
  } = {},
): Promise<FriendFeedPage> => {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? 10));
  if (options.cursor) params.set("cursor", options.cursor);

  return mobileApiFetch(`/api/friends/feed?${params.toString()}`)
    .then((r) => parseResponse<unknown>(r))
    .then(normalizeFeedPage);
};

export const fetchFriendProfilePosts = (
  friendshipId: string,
  options: { cursor?: string | null; limit?: number } = {},
): Promise<FriendFeedPage> => {
  const params = new URLSearchParams();
  params.set("limit", String(options.limit ?? 10));
  if (options.cursor) params.set("cursor", options.cursor);

  return mobileApiFetch(
    `/api/friends/${encodeURIComponent(friendshipId)}/posts?${params.toString()}`,
  )
    .then((r) => parseResponse<unknown>(r))
    .then(normalizeFeedPage);
};

export const fetchDailyReflectionPromptStats = () =>
  mobileApiFetch("/api/daily-reflections/prompts")
    .then((r) => parseResponse<unknown>(r))
    .then((value) =>
      Array.isArray(value)
        ? value.flatMap((row) =>
            isRecord(row) && typeof row.prompt === "string"
              ? [
                  {
                    prompt: row.prompt,
                    answerCount: numberOrFallback(row.answerCount),
                  },
                ]
              : [],
          )
        : [],
    );

export const fetchMyPosts = () =>
  mobileApiFetch("/api/users/posts")
    .then((r) => parseResponse<unknown>(r))
    .then(normalizeFeed);

export const toggleFeedProp = (goalLogId: string) =>
  mobileApiFetch(`/api/friends/feed/${goalLogId}`, {
    method: "POST",
    body: JSON.stringify({ type: "toggleProp" }),
  }).then((r) => parseResponse<Record<string, unknown>>(r));

export const toggleReflectionProp = (postId: string) =>
  mobileApiFetch(`/api/daily-reflections/${postId}`, {
    method: "POST",
    body: JSON.stringify({ type: "toggleProp" }),
  }).then((r) => parseResponse<Record<string, unknown>>(r));

export const toggleSocialPostProp = (postId: string) =>
  mobileApiFetch(`/api/friends/feed/social/${postId}`, {
    method: "POST",
    body: JSON.stringify({ type: "toggleProp" }),
  }).then((r) => parseResponse<Record<string, unknown>>(r));

export const toggleFeedRepost = (
  sourceType: FeedRepostSourceType,
  sourceId: string,
) =>
  mobileApiFetch("/api/friends/feed/reposts", {
    method: "POST",
    body: JSON.stringify({ sourceType, sourceId }),
  }).then((r) =>
    parseResponse<{ reposted: boolean; repostId: string | null }>(r),
  );

export const setReflectionBody = (
  postId: string,
  body: string,
): Promise<{ ok: true }> =>
  mobileApiFetch(`/api/daily-reflections/${postId}`, {
    method: "POST",
    body: JSON.stringify({ type: "setBody", body }),
  }).then((r) => parseResponse<{ ok: true }>(r));

export const setReflectionVisibility = (
  postId: string,
  visibility: "only_me" | "goal_friends" | "all_friends",
): Promise<{ ok: true }> =>
  mobileApiFetch(`/api/daily-reflections/${postId}`, {
    method: "POST",
    body: JSON.stringify({ type: "setVisibility", visibility }),
  }).then((r) => parseResponse<{ ok: true }>(r));

export const deleteReflectionPost = (postId: string): Promise<{ ok: true }> =>
  mobileApiFetch(`/api/daily-reflections/${postId}`, {
    method: "POST",
    body: JSON.stringify({ type: "deletePost" }),
  }).then((r) => parseResponse<{ ok: true }>(r));

export const addFeedComment = (
  goalLogId: string,
  body: string,
  parentCommentId?: string | null,
) =>
  mobileApiFetch(`/api/friends/feed/${goalLogId}`, {
    method: "POST",
    body: JSON.stringify({ type: "addComment", body, parentCommentId }),
  }).then((r) => parseResponse<Record<string, unknown>>(r));

export const addReflectionComment = (
  postId: string,
  body: string,
  parentCommentId?: string | null,
) =>
  mobileApiFetch(`/api/daily-reflections/${postId}`, {
    method: "POST",
    body: JSON.stringify({ type: "addComment", body, parentCommentId }),
  }).then((r) => parseResponse<Record<string, unknown>>(r));

export const addSocialPostComment = (
  postId: string,
  body: string,
  parentCommentId?: string | null,
) =>
  mobileApiFetch(`/api/friends/feed/social/${postId}`, {
    method: "POST",
    body: JSON.stringify({ type: "addComment", body, parentCommentId }),
  }).then((r) => parseResponse<Record<string, unknown>>(r));

export const deleteFeedComment = (goalLogId: string, commentId: string) =>
  mobileApiFetch(`/api/friends/feed/${goalLogId}`, {
    method: "POST",
    body: JSON.stringify({ type: "deleteComment", commentId }),
  }).then((r) => parseResponse<Record<string, unknown>>(r));

export const deleteReflectionComment = (postId: string, commentId: string) =>
  mobileApiFetch(`/api/daily-reflections/${postId}`, {
    method: "POST",
    body: JSON.stringify({ type: "deleteComment", commentId }),
  }).then((r) => parseResponse<Record<string, unknown>>(r));

export const deleteSocialPostComment = (postId: string, commentId: string) =>
  mobileApiFetch(`/api/friends/feed/social/${postId}`, {
    method: "POST",
    body: JSON.stringify({ type: "deleteComment", commentId }),
  }).then((r) => parseResponse<Record<string, unknown>>(r));

export const createDailyReflection = (payload: {
  prompt: string;
  body: string;
  visibility: "only_me" | "goal_friends" | "all_friends";
  audienceFriendIds?: string[];
  audienceGroupIds?: string[];
  date?: string;
}) =>
  mobileApiFetch("/api/daily-reflections", {
    method: "POST",
    body: JSON.stringify(payload),
  })
    .then((r) => parseResponse<{ id: string }>(r))
    .then((post) => {
      void recordReviewMilestone("post");
      return post;
    });

function uriToBlob(uri: string): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.onload = () => resolve(xhr.response as Blob);
    xhr.onerror = reject;
    xhr.responseType = "blob";
    xhr.open("GET", uri);
    xhr.send();
  });
}

export async function uploadDailyReflectionPhoto(
  postId: string,
  photo: GoalPhotoUpload,
): Promise<FriendFeedPhoto> {
  const blob = photo.file ?? (await uriToBlob(photo.uri));
  const formData = new FormData();
  formData.append("file", blob, photo.name);

  return mobileApiFetch(`/api/daily-reflections/${postId}/photos`, {
    method: "POST",
    body: formData,
  }).then((r) => parseResponse<FriendFeedPhoto>(r));
}

export type SendIncentivePayload =
  | {
      type: "incentive";
      targetType: "habit";
      body: string;
      streakDays: number;
      streakPercent: number;
      goalScope: StreakGoalScope;
      goalId?: string;
    }
  | {
      type: "incentive";
      targetType: "goal";
      body: string;
      goalScope: "all" | "single";
      planGoalId?: string;
    };

export const sendFriendIncentive = (
  friendshipId: string,
  payload: SendIncentivePayload,
) =>
  mobileApiFetch(`/api/friends/${friendshipId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => parseResponse<{ id: string }>(r));

export const sendFriendNudge = (friendshipId: string, body: string) =>
  mobileApiFetch(`/api/friends/${friendshipId}/messages`, {
    method: "POST",
    body: JSON.stringify({ type: "message", body }),
  }).then((r) => parseResponse<{ id: string }>(r));

export const acceptFriendIncentive = (
  friendshipId: string,
  messageId: string,
) =>
  mobileApiFetch(`/api/friends/${friendshipId}/messages`, {
    method: "PATCH",
    body: JSON.stringify({ messageId }),
  }).then((r) => parseResponse<{ id: string; accepted: boolean | null }>(r));
