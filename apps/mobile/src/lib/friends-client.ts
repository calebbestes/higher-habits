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

export type FriendFeedPhoto = {
  id: string;
  url: string;
  contentType: string;
  createdAt: string;
};

export type FriendFeedComment = {
  id: string;
  userId: string;
  authorName: string;
  authorImage: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  canDelete: boolean;
};

export type FriendFeedEntry = {
  id: string;
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
    throw new Error(body?.error ?? body?.message ?? "Request failed.");
  }
  return response.json() as Promise<T>;
}

export const fetchFriends = (): Promise<FriendRow[]> =>
  mobileApiFetch("/api/friends").then((r) => parseResponse<FriendRow[]>(r));

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

export const fetchFriendsFeed = () =>
  mobileApiFetch("/api/friends/feed").then((r) =>
    parseResponse<FriendFeedEntry[]>(r),
  );

export const toggleFeedProp = (goalLogId: string) =>
  mobileApiFetch(`/api/friends/feed/${goalLogId}`, {
    method: "POST",
    body: JSON.stringify({ type: "toggleProp" }),
  }).then((r) => parseResponse<Record<string, unknown>>(r));

export const addFeedComment = (goalLogId: string, body: string) =>
  mobileApiFetch(`/api/friends/feed/${goalLogId}`, {
    method: "POST",
    body: JSON.stringify({ type: "addComment", body }),
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
