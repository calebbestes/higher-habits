import { mobileApiFetch } from "@/lib/mobile-api";

export type StreakGoalScope = "all" | "shared" | "single" | "high";

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
  goalId: string | null;
  goalName: string | null;
  accepted: boolean | null;
  progress: {
    qualifyingDays: number;
    requiredDays: number;
    percent: number;
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
  isIncomingRequest: boolean;
  lastOpenedAt: string | null;
  performance7Day: {
    earnedPoints: number;
    possiblePoints: number;
    percent: number;
  } | null;
  goalOptions: Array<{ id: string; name: string }>;
  incentives: FriendIncentiveRow[];
};

export type FriendProfileHabit = {
  id: string;
  name: string;
  iconKey: string;
  priority: "high" | "low";
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
    name: string;
    email: string;
    image: string | null;
    lastOpenedAt: string | null;
  };
  dateKeys: string[];
  categories: FriendProfileCategory[];
  logsByHabitDate: Record<string, "complete" | "planned">;
};

function isFriendProfile(value: unknown): value is FriendProfile {
  return (
    typeof value === "object" &&
    value !== null &&
    "friend" in value &&
    Array.isArray((value as FriendProfile).dateKeys) &&
    Array.isArray((value as FriendProfile).categories) &&
    typeof (value as FriendProfile).logsByHabitDate === "object" &&
    (value as FriendProfile).logsByHabitDate !== null
  );
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
  replies: FriendFeedComment[];
};

export type FriendFeedEntry = {
  id: string;
  kind: "habit" | "goal_checkpoint";
  friend: {
    id: string;
    name: string;
    image: string | null;
  };
  goal: {
    id: string;
    name: string;
    icon: string;
  };
  dateKey: string;
  notes: string;
  updatedAt: string;
  props: {
    count: number;
    hasPropped: boolean;
  };
  comments: FriendFeedComment[];
  photos: FriendFeedPhoto[];
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new Error(
      body?.error ??
        body?.message ??
        `Request failed (${response.status}).`,
    );
  }
  return response.json() as Promise<T>;
}

export const fetchFriends = (): Promise<FriendRow[]> =>
  mobileApiFetch("/api/friends").then((r) => parseResponse<FriendRow[]>(r));

export const fetchFriendProfile = (
  friendshipId: string,
): Promise<FriendProfile> => fetchFriendProfileWithFallback(friendshipId);

async function fetchFriendProfileWithFallback(
  friendshipId: string,
): Promise<FriendProfile> {
  const encodedFriendshipId = encodeURIComponent(friendshipId);
  const paths = [
    `/api/friends?profileFriendshipId=${encodedFriendshipId}`,
    `/api/friends/${encodedFriendshipId}/profile`,
  ];
  let lastError: Error | null = null;

  for (const path of paths) {
    try {
      const profile = await mobileApiFetch(path).then((r) =>
        parseResponse<unknown>(r),
      );

      if (isFriendProfile(profile)) {
        return profile;
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("Request failed.");
    }
  }

  try {
    return await fetchFriendProfileFromExistingData(friendshipId);
  } catch (fallbackError) {
    throw (
      lastError ??
      (fallbackError instanceof Error
        ? fallbackError
        : new Error("Profile data is unavailable."))
    );
  }
}

async function fetchFriendProfileFromExistingData(
  friendshipId: string,
): Promise<FriendProfile> {
  const [friends, feed] = await Promise.all([fetchFriends(), fetchFriendsFeed()]);
  const friend = friends.find(
    (row) => row.id === friendshipId && row.status === "accepted",
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
    });
    logsByHabitDate[`${entry.goal.id}_${entry.dateKey}`] = "complete";
  }

  const habits = [...habitsById.values()];

  return {
    friend: {
      id: friend.friendId,
      name: friend.friendName,
      email: friend.friendEmail,
      image: friend.friendImage,
      lastOpenedAt: friend.lastOpenedAt,
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
    logsByHabitDate,
  };
}

export const addFriend = (email: string): Promise<FriendRow> =>
  mobileApiFetch("/api/friends", {
    method: "POST",
    body: JSON.stringify({ email }),
  }).then((r) => parseResponse<FriendRow>(r));

export type ContactMatch = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
};

export const matchContacts = (
  emails: string[],
  phones: string[],
): Promise<ContactMatch[]> =>
  mobileApiFetch("/api/friends/match", {
    method: "POST",
    body: JSON.stringify({ emails, phones }),
  }).then((r) => parseResponse<ContactMatch[]>(r));

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
  targetType: "feed_post" | "feed_comment" | "user" | "general";
  targetId?: string;
  reason: string;
  context?: Record<string, unknown>;
}) =>
  mobileApiFetch("/api/moderation/report", {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => parseResponse<{ ok: true }>(r));

export const fetchFriendsFeed = () =>
  mobileApiFetch("/api/friends/feed").then((r) =>
    parseResponse<FriendFeedEntry[]>(r),
  );

export const toggleFeedProp = (goalLogId: string) =>
  mobileApiFetch(`/api/friends/feed/${goalLogId}`, {
    method: "POST",
    body: JSON.stringify({ type: "toggleProp" }),
  }).then((r) => parseResponse<Record<string, unknown>>(r));

export const addFeedComment = (
  goalLogId: string,
  body: string,
  parentCommentId?: string | null,
) =>
  mobileApiFetch(`/api/friends/feed/${goalLogId}`, {
    method: "POST",
    body: JSON.stringify({ type: "addComment", body, parentCommentId }),
  }).then((r) => parseResponse<Record<string, unknown>>(r));

export const deleteFeedComment = (goalLogId: string, commentId: string) =>
  mobileApiFetch(`/api/friends/feed/${goalLogId}`, {
    method: "POST",
    body: JSON.stringify({ type: "deleteComment", commentId }),
  }).then((r) => parseResponse<Record<string, unknown>>(r));

export type SendIncentivePayload = {
  type: "incentive";
  body: string;
  streakDays: number;
  streakPercent: number;
  goalScope: StreakGoalScope;
  goalId?: string;
};

export const sendFriendIncentive = (
  friendshipId: string,
  payload: SendIncentivePayload,
) =>
  mobileApiFetch(`/api/friends/${friendshipId}/messages`, {
    method: "POST",
    body: JSON.stringify(payload),
  }).then((r) => parseResponse<{ id: string }>(r));

export const acceptFriendIncentive = (
  friendshipId: string,
  messageId: string,
) =>
  mobileApiFetch(`/api/friends/${friendshipId}/messages`, {
    method: "PATCH",
    body: JSON.stringify({ messageId }),
  }).then((r) => parseResponse<{ id: string; accepted: boolean | null }>(r));
