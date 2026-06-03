"use client";

import {
  Button,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  type Selection,
  Spinner,
  Textarea,
  Tooltip,
  addToast,
  cn,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useState } from "react";

type FriendRow = {
  id: string;
  userId1: string;
  userId2: string;
  status: "requested" | "accepted" | "archived";
  friendId: string;
  friendName: string;
  friendEmail: string;
  friendImage: string | null;
  lastActiveAt: string | null;
  lastActiveDate: string | null;
  performance7Day: {
    earnedPoints: number;
    possiblePoints: number;
    percent: number;
  } | null;
  goalOptions: Array<{
    id: string;
    name: string;
  }>;
};

type NudgeMode = "message" | "incentive";
type StreakGoalScope = "all" | "shared" | "single" | "high";

type SendMessagePayload =
  | { type: "message"; body: string }
  | {
      type: "incentive";
      body: string;
      streakDays: number;
      streakPercent: number;
      goalScope: StreakGoalScope;
      goalId?: string;
    };

const FRIENDS_ENDPOINT = "/api/friends";

async function parseJsonResponse<T>(response: Response): Promise<T> {
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

async function fetchFriends() {
  const response = await fetch(FRIENDS_ENDPOINT);
  return parseJsonResponse<FriendRow[]>(response);
}

async function addFriend(email: string) {
  const response = await fetch(FRIENDS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  return parseJsonResponse<FriendRow>(response);
}

async function sendFriendMessage(
  friendshipId: string,
  payload: SendMessagePayload,
) {
  const response = await fetch(`/api/friends/${friendshipId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<{ id: string }>(response);
}

function firstSelection(keys: Selection) {
  if (keys === "all") {
    return null;
  }

  return Array.from(keys)[0]?.toString() ?? null;
}

function dateFromDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatLastActive(friend: FriendRow) {
  if (!friend.lastActiveAt && !friend.lastActiveDate) {
    return "No activity yet";
  }

  const date = friend.lastActiveAt
    ? new Date(friend.lastActiveAt)
    : dateFromDateKey(friend.lastActiveDate ?? "");

  if (Number.isNaN(date.getTime())) {
    return friend.lastActiveDate ?? "No activity yet";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function PerformanceRing({ percent }: { percent: number }) {
  const size = 74;
  const strokeWidth = 7;
  const center = size / 2;
  const radius = center - strokeWidth / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedPercent = Math.max(0, Math.min(100, percent));
  const dashOffset = circumference * (1 - clampedPercent / 100);

  return (
    <div className="relative h-[74px] w-[74px] shrink-0">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`${clampedPercent}% performance over the last 7 days`}
      >
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.16}
          strokeWidth={strokeWidth}
          className="text-primary"
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          strokeWidth={strokeWidth}
          className="text-primary transition-all"
          style={{
            transform: "rotate(-90deg)",
            transformOrigin: `${center}px ${center}px`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-bold tabular-nums">
          {clampedPercent}%
        </span>
      </div>
    </div>
  );
}

export function FriendsPageClient() {
  const queryClient = useQueryClient();
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [expandedFriendId, setExpandedFriendId] = useState<string | null>(null);
  const [nudgeFriend, setNudgeFriend] = useState<FriendRow | null>(null);
  const [nudgeMode, setNudgeMode] = useState<NudgeMode>("message");
  const [encouragingMessage, setEncouragingMessage] = useState("");
  const [streakGoalScope, setStreakGoalScope] =
    useState<StreakGoalScope>("all");
  const [selectedStreakGoalId, setSelectedStreakGoalId] = useState("");
  const [streakDays, setStreakDays] = useState("7");
  const [streakPercentRequired, setStreakPercentRequired] = useState("80");
  const [incentiveText, setIncentiveText] = useState("");
  const [email, setEmail] = useState("");

  const friendsQuery = useQuery({
    queryKey: ["friends"],
    queryFn: fetchFriends,
  });

  const sendMessageMutation = useMutation({
    mutationFn: ({
      friendshipId,
      payload,
    }: {
      friendshipId: string;
      payload: SendMessagePayload;
    }) => sendFriendMessage(friendshipId, payload),
    onSuccess: (_, { payload }) => {
      addToast({
        title: payload.type === "message" ? "Message sent" : "Incentive sent",
        description: nudgeFriend?.friendName,
        color: "success",
      });
      closeNudgeModal();
    },
    onError: (error) => {
      addToast({
        title: "Could not send",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      });
    },
  });

  const addFriendMutation = useMutation({
    mutationFn: addFriend,
    onSuccess: (friend) => {
      setEmail("");
      setIsAddModalOpen(false);
      void queryClient.invalidateQueries({ queryKey: ["friends"] });
      addToast({
        title: "Friend added",
        description: friend.friendEmail,
        color: "success",
      });
    },
    onError: (error) => {
      addToast({
        title: "Could not add friend",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      });
    },
  });

  const friends = friendsQuery.data ?? [];
  const acceptedFriends = friends.filter(
    (friend) => friend.status === "accepted",
  );
  const requestedFriends = friends.filter(
    (friend) => friend.status === "requested",
  );
  const visibleFriends = friends.filter(
    (friend) => friend.status !== "archived",
  );

  const handleAddFriend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addFriendMutation.mutate(email);
  };

  const openNudgeModal = (friend: FriendRow, mode: NudgeMode = "message") => {
    setNudgeFriend(friend);
    setNudgeMode(mode);
    setEncouragingMessage("");
    setStreakGoalScope("all");
    setSelectedStreakGoalId(friend.goalOptions[0]?.id ?? "");
    setStreakDays("7");
    setStreakPercentRequired("80");
    setIncentiveText("");
  };

  const closeNudgeModal = () => {
    setNudgeFriend(null);
    setEncouragingMessage("");
    setIncentiveText("");
    setStreakGoalScope("all");
    setSelectedStreakGoalId("");
    setStreakDays("7");
    setStreakPercentRequired("80");
  };

  const streakDaysNumber = Number(streakDays);
  const streakPercentRequiredNumber = Number(streakPercentRequired);
  const hasValidStreakFields =
    Number.isFinite(streakDaysNumber) &&
    streakDaysNumber >= 1 &&
    Number.isFinite(streakPercentRequiredNumber) &&
    streakPercentRequiredNumber >= 1 &&
    streakPercentRequiredNumber <= 100 &&
    (streakGoalScope !== "single" || selectedStreakGoalId.length > 0);
  const canSendNudge =
    nudgeMode === "message"
      ? encouragingMessage.trim().length > 0
      : incentiveText.trim().length > 0 && hasValidStreakFields;

  const handleSendNudge = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!nudgeFriend || !canSendNudge) {
      return;
    }

    const payload: SendMessagePayload =
      nudgeMode === "message"
        ? { type: "message", body: encouragingMessage }
        : {
            type: "incentive",
            body: incentiveText,
            streakDays: streakDaysNumber,
            streakPercent: streakPercentRequiredNumber,
            goalScope: streakGoalScope,
            goalId:
              streakGoalScope === "single" ? selectedStreakGoalId : undefined,
          };

    sendMessageMutation.mutate({ friendshipId: nudgeFriend.id, payload });
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-col gap-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-foreground-500">
            My Friends
          </p>
          <h1 className="text-3xl font-bold tracking-normal">Friends</h1>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-divider bg-content1 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-medium text-foreground-500">Friends</p>
              <Button
                isIconOnly
                size="sm"
                radius="full"
                color="primary"
                aria-label="Add friend"
                title="Add friend"
                onPress={() => setIsAddModalOpen(true)}
              >
                <Icon icon="fa7-solid:plus" className="h-3.5 w-3.5" />
              </Button>
            </div>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {acceptedFriends.length}
            </p>
          </div>

          <div className="rounded-2xl border border-divider bg-content1 px-4 py-3">
            <p className="text-sm font-medium text-foreground-500">Requests</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">
              {requestedFriends.length}
            </p>
          </div>

          <div className="rounded-2xl border border-divider bg-content1 px-4 py-3">
            <p className="text-sm font-medium text-foreground-500">
              Shared Goals
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums">0</p>
          </div>
        </div>

        <section className="flex min-h-64 flex-1 flex-col rounded-2xl border border-dashed border-divider px-6 py-8">
          {friendsQuery.isLoading ? (
            <div className="flex flex-1 items-center justify-center">
              <Spinner size="sm" />
            </div>
          ) : visibleFriends.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {visibleFriends.map((friend) => {
                const isAccepted = friend.status === "accepted";
                const isExpanded = expandedFriendId === friend.id;
                const performance = friend.performance7Day;

                return (
                  <div
                    key={friend.id}
                    className={cn(
                      "rounded-2xl border border-divider bg-content1 px-4 py-3 text-left transition-colors",
                      isAccepted
                        ? "hover:border-primary/50 hover:bg-primary/5"
                        : "",
                    )}
                  >
                    <button
                      type="button"
                      disabled={!isAccepted}
                      aria-expanded={isAccepted ? isExpanded : undefined}
                      onClick={() =>
                        setExpandedFriendId((current) =>
                          current === friend.id ? null : friend.id,
                        )
                      }
                      className={cn(
                        "flex w-full items-center gap-3 text-left",
                        isAccepted ? "cursor-pointer" : "cursor-default",
                      )}
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                        {friend.friendName.slice(0, 1).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">
                          {friend.friendName}
                        </p>
                        <p className="truncate text-xs text-foreground-500">
                          {friend.friendEmail}
                        </p>
                        <p className="mt-0.5 text-[11px] font-medium capitalize text-foreground-400">
                          {friend.status}
                        </p>
                      </div>
                      {isAccepted ? (
                        <Icon
                          icon="fa7-solid:chevron-down"
                          className={cn(
                            "h-3 w-3 shrink-0 text-foreground-400 transition-transform",
                            !isExpanded && "-rotate-90",
                          )}
                        />
                      ) : null}
                    </button>

                    {isExpanded ? (
                      <div className="mt-4 border-t border-divider pt-4">
                        <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
                          <div className="space-y-3">
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-foreground-400">
                                Last Active
                              </p>
                              <p className="mt-1 text-sm font-semibold">
                                {formatLastActive(friend)}
                              </p>
                            </div>
                            <div>
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-foreground-400">
                                Last 7 Days
                              </p>
                              <p className="mt-1 text-sm font-semibold">
                                {performance && performance.possiblePoints > 0
                                  ? `${performance.earnedPoints}/${performance.possiblePoints} pts`
                                  : "No daily goals tracked"}
                              </p>
                            </div>
                          </div>
                          <PerformanceRing
                            percent={performance?.percent ?? 0}
                          />
                        </div>

                        <div className="mt-4 flex gap-2">
                          <Tooltip content="Message" color="foreground">
                            <Button
                              isIconOnly
                              size="sm"
                              variant="flat"
                              aria-label="Message"
                              title="Message"
                              onPress={() => openNudgeModal(friend, "message")}
                            >
                              <Icon
                                icon="mdi:message-outline"
                                className="h-4 w-4"
                              />
                            </Button>
                          </Tooltip>
                          <Tooltip content="Incentivize" color="foreground">
                            <Button
                              isIconOnly
                              size="sm"
                              variant="flat"
                              aria-label="Incentivize"
                              title="Incentivize"
                              onPress={() =>
                                openNudgeModal(friend, "incentive")
                              }
                            >
                              <Icon
                                icon="mdi:gift-outline"
                                className="h-4 w-4"
                              />
                            </Button>
                          </Tooltip>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <h2 className="text-xl font-semibold">No friends yet</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-foreground-500">
                Friends you add will appear here with shared progress and recent
                activity.
              </p>
            </div>
          )}
        </section>
      </div>

      <Modal
        isOpen={isAddModalOpen}
        onOpenChange={(open) => {
          setIsAddModalOpen(open);
          if (!open) setEmail("");
        }}
      >
        <ModalContent>
          <form onSubmit={handleAddFriend}>
            <ModalHeader>Add Friend</ModalHeader>
            <ModalBody>
              <Input
                autoFocus
                isRequired
                type="email"
                label="Email"
                placeholder="friend@example.com"
                value={email}
                onValueChange={setEmail}
              />
            </ModalBody>
            <ModalFooter>
              <Button
                type="button"
                variant="flat"
                onPress={() => setIsAddModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                color="primary"
                isLoading={addFriendMutation.isPending}
              >
                Add Friend
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={nudgeFriend !== null}
        onOpenChange={(open) => !open && closeNudgeModal()}
      >
        <ModalContent>
          <form onSubmit={handleSendNudge}>
            <ModalHeader>
              {nudgeMode === "message" ? "Message" : "Incentivize"}{" "}
              {nudgeFriend?.friendName}
            </ModalHeader>
            <ModalBody className="gap-4">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant={nudgeMode === "message" ? "solid" : "flat"}
                  color={nudgeMode === "message" ? "primary" : "default"}
                  startContent={
                    <Icon
                      icon="mdi:message-heart-outline"
                      className="h-4 w-4"
                    />
                  }
                  onPress={() => setNudgeMode("message")}
                >
                  Message
                </Button>
                <Button
                  type="button"
                  variant={nudgeMode === "incentive" ? "solid" : "flat"}
                  color={nudgeMode === "incentive" ? "primary" : "default"}
                  startContent={
                    <Icon icon="mdi:gift-outline" className="h-4 w-4" />
                  }
                  onPress={() => setNudgeMode("incentive")}
                >
                  Incentive
                </Button>
              </div>

              {nudgeMode === "message" ? (
                <Textarea
                  isRequired
                  label="Encouraging message"
                  placeholder="You have got this."
                  value={encouragingMessage}
                  onValueChange={setEncouragingMessage}
                />
              ) : (
                <>
                  <Input
                    isRequired
                    label="Incentive"
                    placeholder="Coffee on me when you hit it"
                    value={incentiveText}
                    onValueChange={setIncentiveText}
                  />
                  <div className="grid gap-4 rounded-2xl border border-divider bg-content1/60 p-3">
                    <p className="text-xs font-semibold uppercase tracking-widest text-foreground-400">
                      Earn this when...
                    </p>
                    <Select
                      label="Apply to"
                      selectedKeys={new Set([streakGoalScope])}
                      onSelectionChange={(keys) => {
                        const nextScope = firstSelection(
                          keys,
                        ) as StreakGoalScope | null;

                        if (!nextScope) {
                          return;
                        }

                        setStreakGoalScope(nextScope);
                        if (nextScope === "single" && !selectedStreakGoalId) {
                          setSelectedStreakGoalId(
                            nudgeFriend?.goalOptions[0]?.id ?? "",
                          );
                        }
                      }}
                    >
                      <SelectItem key="all">All goals</SelectItem>
                      <SelectItem key="shared">Shared goal</SelectItem>
                      <SelectItem key="single">Single goal</SelectItem>
                      <SelectItem key="high">
                        Only high priority goals
                      </SelectItem>
                    </Select>

                    {streakGoalScope === "single" ? (
                      <Select
                        isRequired
                        label="Goal"
                        placeholder={
                          nudgeFriend?.goalOptions.length
                            ? "Choose a goal"
                            : "No shared goals available"
                        }
                        selectedKeys={
                          selectedStreakGoalId
                            ? new Set([selectedStreakGoalId])
                            : new Set()
                        }
                        isDisabled={!nudgeFriend?.goalOptions.length}
                        onSelectionChange={(keys) => {
                          const nextGoalId = firstSelection(keys);
                          if (nextGoalId) {
                            setSelectedStreakGoalId(nextGoalId);
                          }
                        }}
                      >
                        {(nudgeFriend?.goalOptions ?? []).map((goal) => (
                          <SelectItem key={goal.id}>{goal.name}</SelectItem>
                        ))}
                      </Select>
                    ) : null}

                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        isRequired
                        type="number"
                        min={1}
                        label="Streak length"
                        value={streakDays}
                        onValueChange={setStreakDays}
                      />
                      <Input
                        isRequired
                        type="number"
                        min={1}
                        max={100}
                        label="Completion threshold"
                        endContent={
                          <span className="text-sm text-foreground-400">%</span>
                        }
                        value={streakPercentRequired}
                        onValueChange={setStreakPercentRequired}
                      />
                    </div>
                  </div>
                </>
              )}
            </ModalBody>
            <ModalFooter>
              <Button type="button" variant="flat" onPress={closeNudgeModal}>
                Cancel
              </Button>
              <Button
                type="submit"
                color="primary"
                isDisabled={!canSendNudge}
                isLoading={sendMessageMutation.isPending}
              >
                Send
              </Button>
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>
    </>
  );
}
