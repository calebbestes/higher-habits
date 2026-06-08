import type { SharedGoalSnapshot } from "@/lib/shared-goals";

const ENDPOINT = "/api/shared-goals";

export type { SharedGoalSnapshot };

export type CreateSharedGoalInput = {
  name: string;
  mode: "collaborative" | "competitive";
  scoringType: SharedGoalSnapshot["scoringType"];
  target: number | null;
  startsOn: string | null;
  endsOn: string | null;
  personalGoalId: string | null;
  invitedUserIds: string[];
};

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as unknown;
  if (!response.ok) {
    const message =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Request failed.";
    throw new Error(message);
  }

  return payload as T;
}

export const fetchSharedGoals = (): Promise<SharedGoalSnapshot[]> =>
  fetch(ENDPOINT, { cache: "no-store" }).then((response) =>
    parseResponse<SharedGoalSnapshot[]>(response),
  );

export const createSharedGoal = (
  input: CreateSharedGoalInput,
): Promise<SharedGoalSnapshot> =>
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then((response) => parseResponse<SharedGoalSnapshot>(response));

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
  fetch(`${ENDPOINT}/${sharedGoalId}/participants`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then((response) => parseResponse<SharedGoalSnapshot>(response));

export const inviteSharedGoalParticipants = (
  sharedGoalId: string,
  userIds: string[],
): Promise<SharedGoalSnapshot> =>
  fetch(`${ENDPOINT}/${sharedGoalId}/participants`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userIds }),
  }).then((response) => parseResponse<SharedGoalSnapshot>(response));

export const updateSharedGoal = (
  sharedGoalId: string,
  input:
    | { action: "setStatus"; status: "active" | "completed" | "archived" }
    | { action: "leave" },
): Promise<SharedGoalSnapshot | { ok: true }> =>
  fetch(`${ENDPOINT}/${sharedGoalId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  }).then((response) =>
    parseResponse<SharedGoalSnapshot | { ok: true }>(response),
  );
