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

type FriendMessageRow = {
  id: string;
  friendshipId: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

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
  messages: FriendMessageRow[];
};

type FriendsSection = "messages" | "incentives" | "shared-goals" | "friends";
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

const FRIENDS_SECTIONS: Array<{ key: FriendsSection; label: string }> = [
  { key: "messages", label: "Messages" },
  { key: "incentives", label: "Incentives" },
  { key: "shared-goals", label: "Shared Goals" },
  { key: "friends", label: "Friends" },
];

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

function formatMessageTime(timestamp: string) {
  const date = new Date(timestamp);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function getLatestMessage(friend: FriendRow) {
  return friend.messages[friend.messages.length - 1] ?? null;
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

function FriendAvatar({
  image,
  name,
  sizeClassName = "h-10 w-10",
}: {
  image: string | null;
  name: string;
  sizeClassName?: string;
}) {
  const initial = name.slice(0, 1).toUpperCase();

  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/15 text-sm font-semibold text-primary",
        sizeClassName,
      )}
    >
      {image ? (
        <img src={image} alt={name} className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}

function MessagesSection({
  isLoading,
  acceptedFriends,
  activeConversationId,
  conversationFriend,
  messageDraft,
  isSending,
  onSelectConversation,
  onMessageDraftChange,
  onSendConversationMessage,
  onIncentivize,
}: {
  isLoading: boolean;
  acceptedFriends: FriendRow[];
  activeConversationId: string | null;
  conversationFriend: FriendRow | null;
  messageDraft: string;
  isSending: boolean;
  onSelectConversation: (friendId: string) => void;
  onMessageDraftChange: (value: string) => void;
  onSendConversationMessage: (event: FormEvent<HTMLFormElement>) => void;
  onIncentivize: (friend: FriendRow) => void;
}) {
  return (
    <section className="grid min-h-[34rem] flex-1 overflow-hidden rounded-2xl border border-divider bg-content1 md:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="flex min-h-0 flex-col border-b border-divider md:border-b-0 md:border-r">
        <div className="flex h-14 shrink-0 items-center justify-between border-b border-divider px-4">
          <h2 className="text-sm font-semibold">Messages</h2>
          <span className="rounded-full bg-default-100 px-2 py-1 text-xs font-semibold tabular-nums text-foreground-500">
            {acceptedFriends.length}
          </span>
        </div>

        <div className="min-h-0 overflow-y-auto">
          {isLoading ? (
            <div className="flex h-36 items-center justify-center">
              <Spinner size="sm" />
            </div>
          ) : acceptedFriends.length > 0 ? (
            <div className="divide-y divide-divider">
              {acceptedFriends.map((friend) => {
                const isSelected = activeConversationId === friend.id;
                const latestMessage = getLatestMessage(friend);

                return (
                  <button
                    key={friend.id}
                    type="button"
                    onClick={() => onSelectConversation(friend.id)}
                    className={cn(
                      "flex w-full gap-3 px-4 py-3 text-left transition-colors",
                      isSelected ? "bg-primary/10" : "hover:bg-default-100/70",
                    )}
                  >
                    <FriendAvatar
                      image={friend.friendImage}
                      name={friend.friendName}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-semibold">
                          {friend.friendName}
                        </p>
                        {latestMessage ? (
                          <span className="shrink-0 text-[11px] text-foreground-400">
                            {formatMessageTime(latestMessage.createdAt)}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 truncate text-xs text-foreground-500">
                        {latestMessage?.body ?? "No messages yet"}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-36 items-center justify-center px-4 text-center text-sm text-foreground-500">
              No accepted friends yet
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-h-[28rem] min-w-0 flex-col">
        {conversationFriend ? (
          <>
            <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-divider px-4">
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">
                  {conversationFriend.friendName}
                </h2>
                <p className="truncate text-xs text-foreground-500">
                  {conversationFriend.friendEmail}
                </p>
              </div>
              <Button
                isIconOnly
                size="sm"
                variant="flat"
                aria-label="Incentivize"
                title="Incentivize"
                onPress={() => onIncentivize(conversationFriend)}
              >
                <Icon icon="mdi:gift-outline" className="h-4 w-4" />
              </Button>
            </header>

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-4">
              {conversationFriend.messages.length > 0 ? (
                conversationFriend.messages.map((message) => {
                  const isFromFriend =
                    message.senderId === conversationFriend.friendId;

                  return (
                    <div
                      key={message.id}
                      className={cn(
                        "flex",
                        isFromFriend ? "justify-start" : "justify-end",
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[82%] rounded-2xl px-3 py-2 text-sm leading-6 shadow-sm",
                          isFromFriend
                            ? "rounded-tl-md bg-default-100 text-foreground"
                            : "rounded-tr-md bg-primary text-primary-foreground",
                        )}
                      >
                        <p className="whitespace-pre-wrap break-words">
                          {message.body}
                        </p>
                        <p
                          className={cn(
                            "mt-1 text-[11px]",
                            isFromFriend
                              ? "text-foreground-400"
                              : "text-primary-foreground/75",
                          )}
                        >
                          {formatMessageTime(message.createdAt)}
                        </p>
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="flex flex-1 items-center justify-center text-center text-sm text-foreground-500">
                  No messages yet
                </div>
              )}
            </div>

            <form
              onSubmit={onSendConversationMessage}
              className="flex shrink-0 gap-2 border-t border-divider p-3"
            >
              <Input
                aria-label="Message"
                placeholder="Message"
                value={messageDraft}
                onValueChange={onMessageDraftChange}
              />
              <Button
                isIconOnly
                type="submit"
                color="primary"
                aria-label="Send message"
                isDisabled={messageDraft.trim().length === 0}
                isLoading={isSending}
              >
                <Icon icon="fa7-solid:paper-plane" className="h-4 w-4" />
              </Button>
            </form>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-center text-sm text-foreground-500">
            {isLoading ? <Spinner size="sm" /> : "No conversations"}
          </div>
        )}
      </div>
    </section>
  );
}

function IncentivesSection() {
  return (
    <section className="flex min-h-64 flex-1 items-center justify-center rounded-2xl border border-dashed border-divider bg-content1/40 p-8 text-center">
      <h2 className="text-xl font-semibold">Incentives</h2>
    </section>
  );
}

function SharedGoalsSection() {
  return (
    <section className="flex min-h-64 flex-1 items-center justify-center rounded-2xl border border-dashed border-divider bg-content1/40 p-8 text-center">
      <h2 className="text-xl font-semibold">Shared Goals</h2>
    </section>
  );
}

function FriendGridCard({
  friend,
  onMessage,
  onIncentivize,
}: {
  friend: FriendRow;
  onMessage: (friend: FriendRow) => void;
  onIncentivize: (friend: FriendRow) => void;
}) {
  const performance = friend.performance7Day;
  const hasTrackedGoals = Boolean(
    performance && performance.possiblePoints > 0,
  );

  return (
    <article className="grid gap-4 rounded-lg border border-divider bg-content1 p-4 shadow-sm transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <FriendAvatar
            image={friend.friendImage}
            name={friend.friendName}
            sizeClassName="h-14 w-14"
          />
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold">
              {friend.friendName}
            </h3>
            <p className="truncate text-sm text-foreground-500">
              {friend.friendEmail}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 gap-1">
          <Tooltip content="Message" color="foreground">
            <Button
              isIconOnly
              size="sm"
              variant="flat"
              aria-label="Message"
              title="Message"
              onPress={() => onMessage(friend)}
            >
              <Icon icon="mdi:message-outline" className="h-4 w-4" />
            </Button>
          </Tooltip>
          <Tooltip content="Incentivize" color="foreground">
            <Button
              isIconOnly
              size="sm"
              variant="flat"
              aria-label="Incentivize"
              title="Incentivize"
              onPress={() => onIncentivize(friend)}
            >
              <Icon icon="mdi:gift-outline" className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-center">
        <dl className="grid gap-3">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-widest text-foreground-400">
              Last Active
            </dt>
            <dd className="mt-1 text-sm font-semibold">
              {formatLastActive(friend)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-widest text-foreground-400">
              Last 7 Days
            </dt>
            <dd className="mt-1 text-sm font-semibold">
              {hasTrackedGoals
                ? `${performance?.earnedPoints}/${performance?.possiblePoints} pts`
                : "No daily goals tracked"}
            </dd>
          </div>
        </dl>
        <PerformanceRing percent={performance?.percent ?? 0} />
      </div>
    </article>
  );
}

function FriendsGridSection({
  isLoading,
  friends,
  onMessage,
  onIncentivize,
}: {
  isLoading: boolean;
  friends: FriendRow[];
  onMessage: (friend: FriendRow) => void;
  onIncentivize: (friend: FriendRow) => void;
}) {
  if (isLoading) {
    return (
      <section className="flex min-h-64 flex-1 items-center justify-center">
        <Spinner size="sm" />
      </section>
    );
  }

  if (friends.length === 0) {
    return (
      <section className="flex min-h-64 flex-1 items-center justify-center text-center">
        <h2 className="text-xl font-semibold">No friends yet</h2>
      </section>
    );
  }

  return (
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {friends.map((friend) => (
        <FriendGridCard
          key={friend.id}
          friend={friend}
          onMessage={onMessage}
          onIncentivize={onIncentivize}
        />
      ))}
    </section>
  );
}

export function FriendsPageClient() {
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] =
    useState<FriendsSection>("messages");
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
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
      void queryClient.invalidateQueries({ queryKey: ["friends"] });
      addToast({
        title: payload.type === "message" ? "Message sent" : "Incentive sent",
        description: nudgeFriend?.friendName,
        color: "success",
      });
      if (nudgeFriend) {
        closeNudgeModal();
      }
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
  const conversationFriend =
    acceptedFriends.find((friend) => friend.id === selectedConversationId) ??
    acceptedFriends[0] ??
    null;
  const activeConversationId = conversationFriend?.id ?? null;

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

  const handleSendConversationMessage = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const body = messageDraft.trim();

    if (!conversationFriend || body.length === 0) {
      return;
    }

    sendMessageMutation.mutate(
      {
        friendshipId: conversationFriend.id,
        payload: { type: "message", body },
      },
      {
        onSuccess: () => setMessageDraft(""),
      },
    );
  };

  return (
    <>
      <div className="flex min-h-0 flex-1 flex-col gap-6 p-4 sm:p-6">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-foreground-500">
              My Friends
            </p>
            <h1 className="text-3xl font-bold tracking-normal">Friends</h1>
          </div>
          <Button
            color="primary"
            startContent={
              <Icon icon="fa7-solid:plus" className="h-3.5 w-3.5" />
            }
            onPress={() => setIsAddModalOpen(true)}
          >
            Add Friend
          </Button>
        </header>

        <nav
          aria-label="Friends sections"
          className="flex gap-2 overflow-x-auto border-b border-divider"
        >
          {FRIENDS_SECTIONS.map((section) => {
            const isActive = activeSection === section.key;

            return (
              <button
                key={section.key}
                type="button"
                aria-current={isActive ? "page" : undefined}
                onClick={() => setActiveSection(section.key)}
                className={cn(
                  "relative shrink-0 px-1 pb-3 text-sm font-semibold transition-colors",
                  isActive
                    ? "text-foreground"
                    : "text-foreground-500 hover:text-foreground",
                )}
              >
                {section.label}
                {isActive ? (
                  <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-primary" />
                ) : null}
              </button>
            );
          })}
        </nav>

        {activeSection === "messages" ? (
          <MessagesSection
            isLoading={friendsQuery.isLoading}
            acceptedFriends={acceptedFriends}
            activeConversationId={activeConversationId}
            conversationFriend={conversationFriend}
            messageDraft={messageDraft}
            isSending={sendMessageMutation.isPending}
            onSelectConversation={setSelectedConversationId}
            onMessageDraftChange={setMessageDraft}
            onSendConversationMessage={handleSendConversationMessage}
            onIncentivize={(friend) => openNudgeModal(friend, "incentive")}
          />
        ) : null}

        {activeSection === "incentives" ? <IncentivesSection /> : null}

        {activeSection === "shared-goals" ? <SharedGoalsSection /> : null}

        {activeSection === "friends" ? (
          <FriendsGridSection
            isLoading={friendsQuery.isLoading}
            friends={acceptedFriends}
            onMessage={(friend) => {
              setSelectedConversationId(friend.id);
              setActiveSection("messages");
            }}
            onIncentivize={(friend) => openNudgeModal(friend, "incentive")}
          />
        ) : null}
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
