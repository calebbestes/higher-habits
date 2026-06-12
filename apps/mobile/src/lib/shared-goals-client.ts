import { mobileApiFetch } from "@/lib/mobile-api";

export type SharedGoalScoringType =
  | "everyone_completes"
  | "combined_target"
  | "shared_streak"
  | "first_to_target"
  | "highest_total"
  | "best_consistency"
  | "longest_streak";

export type SharedGoalParticipantSnapshot = {
  id: string;
  userId: string;
  userName: string;
  userImage: string | null;
  personalGoalId: string | null;
  personalGoalName: string | null;
  personalGoalAutoCreated: boolean;
  status: "invited" | "accepted" | "declined" | "left";
  completedToday: boolean;
  completedCount: number;
  currentStreak: number;
  consistencyPercent: number;
};

export type SharedGoalSnapshot = {
  id: string;
  ownerId: string;
  name: string;
  mode: "collaborative" | "competitive";
  scoringType: SharedGoalScoringType;
  target: number | null;
  startsOn: string | null;
  endsOn: string | null;
  status: "active" | "completed" | "archived";
  canManage: boolean;
  currentUserParticipant: SharedGoalParticipantSnapshot | null;
  participants: SharedGoalParticipantSnapshot[];
  progress: {
    value: number;
    target: number | null;
    percent: number;
    completedToday: number;
    acceptedParticipants: number;
    leaderUserIds: string[];
  };
  recentActivity: Array<{
    userId: string;
    userName: string;
    userImage: string | null;
    goalName: string;
    dateKey: string;
  }>;
};

export type CreateSharedGoalInput = {
  name: string;
  mode: "collaborative" | "competitive";
  scoringType: SharedGoalScoringType;
  target: number | null;
  startsOn: string | null;
  endsOn: string | null;
  personalGoalId: string | null;
  invitedUserIds: string[];
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

export const fetchSharedGoals = (): Promise<SharedGoalSnapshot[]> =>
  mobileApiFetch("/api/shared-goals").then((r) =>
    parseResponse<SharedGoalSnapshot[]>(r),
  );

export const createSharedGoal = (
  input: CreateSharedGoalInput,
): Promise<SharedGoalSnapshot> =>
  mobileApiFetch("/api/shared-goals", {
    method: "POST",
    body: JSON.stringify(input),
  }).then((r) => parseResponse<SharedGoalSnapshot>(r));

export const respondToSharedGoal = (
  sharedGoalId: string,
  input:
    | { action: "accept"; personalGoalId: string | null }
    | { action: "decline" }
    | {
        action: "relink";
        personalGoalId: string | null;
        deletePreviousAutoCreated?: boolean;
      },
): Promise<SharedGoalSnapshot> =>
  mobileApiFetch(`/api/shared-goals/${sharedGoalId}/participants`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }).then((r) => parseResponse<SharedGoalSnapshot>(r));

export const inviteSharedGoalParticipants = (
  sharedGoalId: string,
  userIds: string[],
): Promise<SharedGoalSnapshot> =>
  mobileApiFetch(`/api/shared-goals/${sharedGoalId}/participants`, {
    method: "POST",
    body: JSON.stringify({ userIds }),
  }).then((r) => parseResponse<SharedGoalSnapshot>(r));

export const updateSharedGoal = (
  sharedGoalId: string,
  input:
    | { action: "setStatus"; status: "active" | "completed" | "archived" }
    | { action: "leave" },
): Promise<SharedGoalSnapshot | { ok: true }> =>
  mobileApiFetch(`/api/shared-goals/${sharedGoalId}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  }).then((r) => parseResponse<SharedGoalSnapshot | { ok: true }>(r));
