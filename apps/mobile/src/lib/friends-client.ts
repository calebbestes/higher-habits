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
  defaultComplete: boolean;
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
  stats: {
    friendCount: number;
    habitCompletions: number;
  };
  dateKeys: string[];
  categories: FriendProfileCategory[];
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
    defaultComplete: booleanOrFallback(value.defaultComplete),
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
      name: stringOrFallback(value.friend.name, "Friend"),
      email: stringOrFallback(value.friend.email),
      image: nullableString(value.friend.image),
      lastOpenedAt: nullableString(value.friend.lastOpenedAt),
    },
    stats: isRecord(value.stats)
      ? {
          friendCount: numberOrFallback(value.stats.friendCount),
          habitCompletions: numberOrFallback(value.stats.habitCompletions),
        }
      : { friendCount: 0, habitCompletions: 0 },
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
    logsByHabitDate: normalizeLogsByHabitDate(value.logsByHabitDate),
  };
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
    replies: Array.isArray(value.replies)
      ? value.replies.flatMap((reply) => {
          const normalized = normalizeFeedComment(reply);
          return normalized ? [normalized] : [];
        })
      : [],
  };
}

function normalizeFeedEntry(value: unknown): FriendFeedEntry | null {
  if (!isRecord(value) || typeof value.id !== "string") return null;

  return {
    id: value.id,
    kind: value.kind === "goal_checkpoint" ? "goal_checkpoint" : "habit",
    friend: isRecord(value.friend)
      ? {
          id: stringOrFallback(value.friend.id),
          name: stringOrFallback(value.friend.name, "Friend"),
          image: nullableString(value.friend.image),
        }
      : { id: "", name: "Friend", image: null },
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
    updatedAt: stringOrFallback(value.updatedAt),
    canDeletePhotos: booleanOrFallback(value.canDeletePhotos),
    props: isRecord(value.props)
      ? {
          count: numberOrFallback(value.props.count),
          hasPropped: booleanOrFallback(value.props.hasPropped),
        }
      : { count: 0, hasPropped: false },
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
  category: {
    id: string;
    name: string;
    icon: string;
  } | null;
  dateKey: string;
  notes: string;
  updatedAt: string;
  canDeletePhotos: boolean;
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
      body?.error ?? body?.message ?? `Request failed (${response.status}).`,
    );
  }
  return response.json() as Promise<T>;
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

export const fetchFriendProfile = (
  friendshipId: string,
): Promise<FriendProfile> => fetchFriendProfileWithFallback(friendshipId);

export async function fetchMyProfile(): Promise<FriendProfile> {
  const profile = await mobileApiFetch("/api/users/profile").then((r) =>
    parseResponse<unknown>(r),
  );
  const normalized = normalizeFriendProfile(profile);
  if (!normalized) {
    throw new Error("Profile data is unavailable.");
  }
  return normalized;
}

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

      const normalizedProfile = normalizeFriendProfile(profile);
      if (normalizedProfile) {
        return normalizedProfile;
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
  const [friends, feed] = await Promise.all([
    fetchFriends(),
    fetchFriendsFeed(),
  ]);
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
      defaultComplete: false,
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
      defaultComplete: habitsById.get(entry.goal.id)?.defaultComplete ?? false,
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
    stats: {
      friendCount: 0,
      habitCompletions: feed.filter(
        (entry) => entry.friend.id === friend.friendId,
      ).length,
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
  mobileApiFetch("/api/friends/feed")
    .then((r) => parseResponse<unknown>(r))
    .then(normalizeFeed);

export const fetchMyPosts = () =>
  mobileApiFetch("/api/users/posts")
    .then((r) => parseResponse<unknown>(r))
    .then(normalizeFeed);

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
