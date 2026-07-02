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
import parse, {
  type DOMNode,
  Element,
  type HTMLReactParserOptions,
  domToReact,
} from "html-react-parser";
import { useRouter, useSearchParams } from "next/navigation";
import { type FormEvent, createElement, useState } from "react";

import { SettingsLink } from "@/components/settings-link";
import { SharedGoalsSection } from "@/components/shared-goals-section";
import type { FriendsSection } from "@/lib/friends-navigation";

type FriendMessageRow = {
  id: string;
  friendshipId: string;
  senderId: string;
  recipientId: string;
  body: string;
  createdAt: string;
  readAt: string | null;
};

type StreakGoalScope = "all" | "shared" | "single" | "high";

type FriendIncentiveRow = FriendMessageRow & {
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

type FriendRow = {
  id: string;
  userId1: string;
  userId2: string;
  status: "requested" | "accepted" | "archived";
  friendId: string;
  friendName: string;
  friendEmail: string;
  friendImage: string | null;
  isIncomingRequest: boolean;
  lastOpenedAt: string | null;
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
  incentives: FriendIncentiveRow[];
};

type FriendFeedPhoto = {
  id: string;
  url: string;
  contentType: string;
  createdAt: string;
};

type FriendFeedComment = {
  id: string;
  userId: string;
  authorName: string;
  authorImage: string | null;
  body: string;
  createdAt: string;
  updatedAt: string;
  canDelete: boolean;
};

type FriendFeedEntry = {
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

type NudgeMode = "message" | "incentive";
type CollabPickerMode = "conversation" | "incentive";

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

type FeedInteractionPayload =
  | { type: "toggleProp" }
  | { type: "addComment"; body: string }
  | { type: "deleteComment"; commentId: string };

const FRIENDS_ENDPOINT = "/api/friends";
const SAFE_JOURNAL_NOTE_TAGS = new Set([
  "br",
  "em",
  "h1",
  "h2",
  "h3",
  "li",
  "ol",
  "p",
  "strong",
  "ul",
]);

const GOAL_SCOPE_LABELS: Record<StreakGoalScope, string> = {
  all: "All goals",
  shared: "Shared goal",
  single: "Single goal",
  high: "High priority goals",
};

const SECTION_HEADERS: Record<
  FriendsSection,
  {
    eyebrow: string;
    title: string;
    actionLabel?: string;
    actionIcon?: string;
  }
> = {
  feed: {
    eyebrow: "Collaboration",
    title: "Feed",
  },
  messages: {
    eyebrow: "Collaboration",
    title: "Messages",
    actionLabel: "New Conversation",
    actionIcon: "mdi:message-plus-outline",
  },
  incentives: {
    eyebrow: "Collaboration",
    title: "Incentives",
    actionLabel: "New Incentive",
    actionIcon: "mdi:gift-outline",
  },
  "shared-goals": {
    eyebrow: "Collaboration",
    title: "Shared Goals",
    actionLabel: "New Shared Goal",
    actionIcon: "mdi:account-multiple-plus-outline",
  },
  friends: {
    eyebrow: "My Friends",
    title: "Friends",
    actionLabel: "Add Friend",
    actionIcon: "fa7-solid:plus",
  },
};

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

async function fetchFriendsFeed() {
  const response = await fetch(`${FRIENDS_ENDPOINT}/feed`, {
    cache: "no-store",
  });
  return parseJsonResponse<FriendFeedEntry[]>(response);
}

async function updateFriendFeedPost(
  goalLogId: string,
  payload: FeedInteractionPayload,
) {
  const response = await fetch(`${FRIENDS_ENDPOINT}/feed/${goalLogId}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return parseJsonResponse<Record<string, unknown>>(response);
}

async function addFriend(email: string) {
  const response = await fetch(FRIENDS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });

  return parseJsonResponse<FriendRow>(response);
}

async function acceptFriendRequest(friendshipId: string) {
  const response = await fetch(FRIENDS_ENDPOINT, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ friendshipId, action: "accept" }),
  });

  return parseJsonResponse<{ id: string; status: "accepted" }>(response);
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

async function acceptFriendIncentive(friendshipId: string, messageId: string) {
  const response = await fetch(`/api/friends/${friendshipId}/messages`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messageId }),
  });

  return parseJsonResponse<{ id: string; accepted: boolean | null }>(response);
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

function lastOpenedTime(friend: FriendRow) {
  if (!friend.lastOpenedAt) return 0;
  const time = new Date(friend.lastOpenedAt).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function formatLastOpened(friend: FriendRow) {
  const time = lastOpenedTime(friend);
  if (!time) return "Not opened yet";

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const opened = new Date(time);
  opened.setHours(0, 0, 0, 0);
  const daysAgo = Math.max(
    0,
    Math.floor((today.getTime() - opened.getTime()) / 86_400_000),
  );

  if (daysAgo === 0) return "Today";
  if (daysAgo <= 6) return `${daysAgo} ${daysAgo === 1 ? "day" : "days"} ago`;
  if (daysAgo <= 30) return "Over a week ago";
  return "Over one month ago";
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

function formatFeedDate(dateKey: string) {
  const date = dateFromDateKey(dateKey);

  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }

  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function renderJournalNote(notes: string) {
  const options: HTMLReactParserOptions = {
    replace(domNode) {
      if (!(domNode instanceof Element)) {
        return;
      }

      if (domNode.name === "script" || domNode.name === "style") {
        return <></>;
      }

      const children = domToReact(domNode.children as DOMNode[], options);

      if (!SAFE_JOURNAL_NOTE_TAGS.has(domNode.name)) {
        return <>{children}</>;
      }

      return createElement(domNode.name, {}, children);
    },
  };

  return parse(notes, options);
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

function FeedSection({
  isLoading,
  errorMessage,
  entries,
}: {
  isLoading: boolean;
  errorMessage?: string;
  entries: FriendFeedEntry[];
}) {
  const queryClient = useQueryClient();
  const [activePhoto, setActivePhoto] = useState<FriendFeedPhoto | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const togglePropMutation = useMutation({
    mutationFn: (goalLogId: string) =>
      updateFriendFeedPost(goalLogId, { type: "toggleProp" }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["friends-feed"] });
    },
    onError: (error) => {
      addToast({
        title: "Could not update prop",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      });
    },
  });
  const addCommentMutation = useMutation({
    mutationFn: ({
      goalLogId,
      body,
    }: {
      goalLogId: string;
      body: string;
    }) => updateFriendFeedPost(goalLogId, { type: "addComment", body }),
    onSuccess: (_, { goalLogId }) => {
      setCommentDrafts((previous) => ({ ...previous, [goalLogId]: "" }));
      void queryClient.invalidateQueries({ queryKey: ["friends-feed"] });
    },
    onError: (error) => {
      addToast({
        title: "Could not add comment",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      });
    },
  });
  const deleteCommentMutation = useMutation({
    mutationFn: ({
      goalLogId,
      commentId,
    }: {
      goalLogId: string;
      commentId: string;
    }) => updateFriendFeedPost(goalLogId, { type: "deleteComment", commentId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["friends-feed"] });
    },
    onError: (error) => {
      addToast({
        title: "Could not delete comment",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      });
    },
  });

  const handleAddComment = (
    event: FormEvent<HTMLFormElement>,
    goalLogId: string,
  ) => {
    event.preventDefault();
    const body = commentDrafts[goalLogId]?.trim() ?? "";

    if (!body) return;
    addCommentMutation.mutate({ goalLogId, body });
  };

  if (isLoading) {
    return (
      <section className="flex min-h-64 flex-1 items-center justify-center">
        <Spinner size="sm" />
      </section>
    );
  }

  if (errorMessage) {
    return (
      <section className="flex min-h-64 flex-1 items-center justify-center rounded-2xl border border-dashed border-divider bg-content1/40 p-8 text-center">
        <div className="grid max-w-md justify-items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/20 text-secondary-700">
            <Icon icon="mdi:image-broken-variant" className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">Could not load the feed</h2>
            <p className="mt-1 text-sm text-foreground-500">{errorMessage}</p>
          </div>
        </div>
      </section>
    );
  }

  if (entries.length === 0) {
    return (
      <section className="flex min-h-64 flex-1 items-center justify-center rounded-2xl border border-dashed border-divider bg-content1/40 p-8 text-center">
        <div className="grid justify-items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Icon icon="mdi:view-stream-outline" className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-lg font-semibold">No activity yet</h2>
            <p className="mt-1 text-sm text-foreground-500">
              Friends&apos; journal entries with photos will appear here.
            </p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <>
      <section className="mx-auto grid w-full max-w-3xl content-start gap-4">
        {entries.map((entry) => (
          <article
            key={entry.id}
            className="grid gap-4 rounded-2xl border border-divider bg-content1 p-4 shadow-sm sm:p-5"
          >
            <header className="flex items-center gap-3">
              <FriendAvatar
                image={entry.friend.image}
                name={entry.friend.name}
              />
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold">
                  {entry.friend.name}
                </h2>
                <p className="truncate text-xs text-foreground-400">
                  {formatFeedDate(entry.dateKey)}
                </p>
              </div>
              <span className="inline-flex max-w-48 items-center gap-1.5 rounded-full bg-default-100 px-2.5 py-1.5 text-xs font-semibold text-foreground-600">
                <Icon icon={entry.goal.icon} className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">{entry.goal.name}</span>
              </span>
            </header>

            <div
              className={cn(
                "grid gap-2",
                entry.photos.length === 1 ? "grid-cols-1" : "grid-cols-2",
              )}
            >
              {entry.photos.map((photo) => (
                <button
                  key={photo.id}
                  type="button"
                  aria-label={`Open ${entry.goal.name} photo from ${entry.friend.name}`}
                  onClick={() => setActivePhoto(photo)}
                  className={cn(
                    "overflow-hidden rounded-xl bg-default-100",
                    entry.photos.length === 1
                      ? "aspect-[4/3]"
                      : "aspect-square",
                  )}
                >
                  <img
                    src={photo.url}
                    alt={`${entry.friend.name}'s ${entry.goal.name} journal entry`}
                    className="h-full w-full object-cover transition-transform duration-200 hover:scale-[1.02]"
                  />
                </button>
              ))}
            </div>

            {entry.notes.trim() ? (
              <div
                className={cn(
                  "text-sm leading-relaxed text-foreground-700",
                  "[&_h1]:mb-1 [&_h1]:text-base [&_h1]:font-bold",
                  "[&_h2]:mb-1 [&_h2]:text-sm [&_h2]:font-semibold",
                  "[&_h3]:mb-1 [&_h3]:text-sm [&_h3]:font-medium",
                  "[&_p]:mb-1 last:[&_p]:mb-0",
                  "[&_ul]:ml-4 [&_ul]:mb-1 [&_ul]:list-disc",
                  "[&_ol]:ml-4 [&_ol]:mb-1 [&_ol]:list-decimal",
                  "[&_li]:mb-0.5",
                  "[&_strong]:font-semibold",
                  "[&_em]:italic",
                )}
              >
                {renderJournalNote(entry.notes)}
              </div>
            ) : null}

            <div className="grid gap-3 border-t border-divider pt-3">
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  color={entry.props.hasPropped ? "primary" : "default"}
                  variant={entry.props.hasPropped ? "flat" : "light"}
                  startContent={
                    <Icon icon="mdi:hand-clap" className="h-4 w-4" />
                  }
                  isLoading={
                    togglePropMutation.isPending &&
                    togglePropMutation.variables === entry.id
                  }
                  onPress={() => togglePropMutation.mutate(entry.id)}
                >
                  {entry.props.count > 0
                    ? `${entry.props.count} ${entry.props.count === 1 ? "Prop" : "Props"}`
                    : "Prop"}
                </Button>
                <span className="inline-flex items-center gap-1.5 px-2 text-xs font-semibold text-foreground-500">
                  <Icon icon="mdi:comment-outline" className="h-4 w-4" />
                  {entry.comments.length}{" "}
                  {entry.comments.length === 1 ? "comment" : "comments"}
                </span>
              </div>

              {entry.comments.length > 0 ? (
                <div className="grid gap-2">
                  {entry.comments.map((comment) => (
                    <div
                      key={comment.id}
                      className="flex items-start gap-2 rounded-xl bg-default-50 px-3 py-2.5"
                    >
                      <FriendAvatar
                        image={comment.authorImage}
                        name={comment.authorName}
                        sizeClassName="h-7 w-7"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <p className="text-xs font-semibold">
                            {comment.authorName}
                          </p>
                          <span className="text-[11px] text-foreground-400">
                            {formatMessageTime(comment.createdAt)}
                          </span>
                        </div>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-5 text-foreground-700">
                          {comment.body}
                        </p>
                      </div>
                      {comment.canDelete ? (
                        <Tooltip content="Delete comment" color="foreground">
                          <Button
                            isIconOnly
                            size="sm"
                            variant="light"
                            color="danger"
                            aria-label="Delete comment"
                            isLoading={
                              deleteCommentMutation.isPending &&
                              deleteCommentMutation.variables?.commentId ===
                                comment.id
                            }
                            onPress={() =>
                              deleteCommentMutation.mutate({
                                goalLogId: entry.id,
                                commentId: comment.id,
                              })
                            }
                          >
                            <Icon
                              icon="mdi:trash-can-outline"
                              className="h-4 w-4"
                            />
                          </Button>
                        </Tooltip>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              <form
                className="flex items-center gap-2"
                onSubmit={(event) => handleAddComment(event, entry.id)}
              >
                <Input
                  size="sm"
                  variant="bordered"
                  aria-label={`Comment on ${entry.friend.name}'s post`}
                  placeholder="Write a comment..."
                  maxLength={2000}
                  value={commentDrafts[entry.id] ?? ""}
                  onValueChange={(value) =>
                    setCommentDrafts((previous) => ({
                      ...previous,
                      [entry.id]: value,
                    }))
                  }
                />
                <Button
                  isIconOnly
                  type="submit"
                  size="sm"
                  color="primary"
                  aria-label="Post comment"
                  isDisabled={!commentDrafts[entry.id]?.trim()}
                  isLoading={
                    addCommentMutation.isPending &&
                    addCommentMutation.variables?.goalLogId === entry.id
                  }
                >
                  <Icon icon="mdi:send" className="h-4 w-4" />
                </Button>
              </form>
            </div>
          </article>
        ))}
      </section>

      <Modal
        isOpen={activePhoto != null}
        onOpenChange={(open) => {
          if (!open) setActivePhoto(null);
        }}
        placement="center"
        size="3xl"
        classNames={{ base: "mx-3 overflow-hidden sm:mx-auto" }}
      >
        <ModalContent>
          <ModalBody className="p-0">
            {activePhoto ? (
              <img
                src={activePhoto.url}
                alt="Friend journal entry"
                className="max-h-[80dvh] w-full object-contain"
              />
            ) : null}
          </ModalBody>
        </ModalContent>
      </Modal>
    </>
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
    <section className="flex min-h-[28rem] flex-1 flex-col overflow-hidden rounded-xl border border-divider bg-content1 sm:rounded-2xl md:grid md:min-h-[34rem] md:grid-cols-[18rem_minmax(0,1fr)]">
      <aside className="shrink-0 border-b border-divider md:flex md:min-h-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex h-11 shrink-0 items-center justify-between border-b border-divider px-3 sm:h-14 sm:px-4">
          <h2 className="text-sm font-semibold">Messages</h2>
          <span className="rounded-full bg-default-100 px-2 py-1 text-xs font-semibold tabular-nums text-foreground-500">
            {acceptedFriends.length}
          </span>
        </div>

        <div className="overflow-x-auto md:min-h-0 md:overflow-y-auto">
          {isLoading ? (
            <div className="flex h-36 items-center justify-center">
              <Spinner size="sm" />
            </div>
          ) : acceptedFriends.length > 0 ? (
            <div className="flex gap-2 p-2 md:block md:divide-y md:divide-divider md:p-0">
              {acceptedFriends.map((friend) => {
                const isSelected = activeConversationId === friend.id;
                const latestMessage = getLatestMessage(friend);

                return (
                  <button
                    key={friend.id}
                    type="button"
                    onClick={() => onSelectConversation(friend.id)}
                    className={cn(
                      "flex w-40 shrink-0 gap-2 rounded-lg border border-divider px-2 py-2 text-left transition-colors md:w-full md:rounded-none md:border-0 md:px-4 md:py-3",
                      isSelected ? "bg-primary/10" : "hover:bg-default-100/70",
                    )}
                  >
                    <FriendAvatar
                      image={friend.friendImage}
                      name={friend.friendName}
                      sizeClassName="h-8 w-8 md:h-10 md:w-10"
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="truncate text-sm font-semibold">
                          {friend.friendName}
                        </p>
                        {latestMessage ? (
                          <span className="hidden shrink-0 text-[11px] text-foreground-400 md:inline">
                            {formatMessageTime(latestMessage.createdAt)}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-xs text-foreground-500 md:mt-1">
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

      <div className="flex min-h-[22rem] min-w-0 flex-1 flex-col sm:min-h-[28rem]">
        {conversationFriend ? (
          <>
            <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-divider px-3 sm:px-4">
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

            <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-3 py-4 sm:px-4">
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
                          "max-w-[88%] rounded-2xl px-3 py-2 text-sm leading-6 shadow-sm sm:max-w-[82%]",
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
              className="flex shrink-0 gap-2 border-t border-divider p-2 sm:p-3"
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

type IncentiveCardItem = {
  friend: FriendRow;
  incentive: FriendIncentiveRow;
};

function getIncentiveGoalLabel(
  friend: FriendRow,
  incentive: FriendIncentiveRow,
) {
  if (!incentive.goalScope) {
    return "Overall progress";
  }

  if (incentive.goalScope !== "single") {
    return GOAL_SCOPE_LABELS[incentive.goalScope];
  }

  const goalName =
    incentive.goalName ??
    friend.goalOptions.find((goal) => goal.id === incentive.goalId)?.name;

  return goalName ? `${goalName}` : GOAL_SCOPE_LABELS.single;
}

function IncentiveCard({
  item,
  direction,
  isAccepting,
  onAccept,
}: {
  item: IncentiveCardItem;
  direction: "sent" | "received";
  isAccepting: boolean;
  onAccept: (friendshipId: string, messageId: string) => void;
}) {
  const { friend, incentive } = item;
  const isReceived = direction === "received";
  const isAccepted = incentive.accepted === true;
  const goalLabel = getIncentiveGoalLabel(friend, incentive);

  return (
    <article className="grid gap-3 rounded-lg border border-divider bg-content1 p-3 shadow-sm sm:p-4">
      <p className="whitespace-pre-wrap break-words text-sm leading-6">
        {incentive.body}
      </p>

      {isAccepted && incentive.progress ? (
        <div className="grid gap-2 rounded-md bg-default-50 px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground-600">
            <Icon
              icon="mdi:gift-outline"
              className="h-4 w-4 text-success-600"
            />
            <span>Incentive progress</span>
            <span className="ml-auto tabular-nums text-foreground-500">
              {incentive.progress.qualifyingDays}/
              {incentive.progress.requiredDays} days
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={`${incentive.progress.qualifyingDays} of ${incentive.progress.requiredDays} incentive days complete`}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={incentive.progress.percent}
            tabIndex={0}
            className="h-1.5 overflow-hidden rounded-full bg-default-200"
          >
            <div
              className="h-full rounded-full bg-success-500 transition-[width] duration-500"
              style={{ width: `${incentive.progress.percent}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {incentive.streakDays ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-default-100 px-2 py-1 text-xs font-semibold text-foreground-600">
              <Icon icon="mdi:calendar-range-outline" className="h-3.5 w-3.5" />
              {incentive.streakDays} days
            </span>
          ) : null}
          {incentive.streakPercent ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-default-100 px-2 py-1 text-xs font-semibold text-foreground-600">
              <Icon icon="mdi:target-arrow" className="h-3.5 w-3.5" />
              {incentive.streakPercent}%
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1 rounded-full bg-default-100 px-2 py-1 text-xs font-semibold text-foreground-600">
            <Icon icon="mdi:bullseye-arrow" className="h-3.5 w-3.5" />
            {goalLabel}
          </span>
        </div>

        {isReceived ? (
          <Button
            size="sm"
            color={isAccepted ? "default" : "primary"}
            variant={isAccepted ? "flat" : "solid"}
            className="w-full sm:w-auto"
            isDisabled={isAccepted}
            isLoading={isAccepting}
            onPress={() => onAccept(friend.id, incentive.id)}
          >
            {isAccepted ? "Accepted" : "Accept?"}
          </Button>
        ) : null}
      </div>
    </article>
  );
}

function IncentiveColumn({
  title,
  items,
  direction,
  emptyLabel,
  acceptingIncentiveId,
  onAcceptIncentive,
}: {
  title: string;
  items: IncentiveCardItem[];
  direction: "sent" | "received";
  emptyLabel: string;
  acceptingIncentiveId: string | null;
  onAcceptIncentive: (friendshipId: string, messageId: string) => void;
}) {
  return (
    <section className="grid content-start gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <span className="rounded-full bg-default-100 px-2 py-1 text-xs font-semibold tabular-nums text-foreground-500">
          {items.length}
        </span>
      </div>

      {items.length > 0 ? (
        <div className="grid gap-3">
          {items.map((item) => (
            <IncentiveCard
              key={item.incentive.id}
              item={item}
              direction={direction}
              isAccepting={acceptingIncentiveId === item.incentive.id}
              onAccept={onAcceptIncentive}
            />
          ))}
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-divider bg-content1/40 p-4 text-sm text-foreground-500">
          {emptyLabel}
        </div>
      )}
    </section>
  );
}

function IncentivesSection({
  isLoading,
  friends,
  acceptingIncentiveId,
  onAcceptIncentive,
}: {
  isLoading: boolean;
  friends: FriendRow[];
  acceptingIncentiveId: string | null;
  onAcceptIncentive: (friendshipId: string, messageId: string) => void;
}) {
  if (isLoading) {
    return (
      <section className="flex min-h-64 flex-1 items-center justify-center">
        <Spinner size="sm" />
      </section>
    );
  }

  const incentiveItems = friends.flatMap((friend) =>
    (friend.incentives ?? []).map((incentive) => ({ friend, incentive })),
  );
  const sentIncentives = incentiveItems.filter(
    ({ friend, incentive }) => incentive.senderId !== friend.friendId,
  );
  const receivedIncentives = incentiveItems.filter(
    ({ friend, incentive }) => incentive.senderId === friend.friendId,
  );

  return (
    <section className="grid gap-5 lg:grid-cols-2">
      <IncentiveColumn
        title="Sent"
        items={sentIncentives}
        direction="sent"
        emptyLabel="No incentives sent yet"
        acceptingIncentiveId={acceptingIncentiveId}
        onAcceptIncentive={onAcceptIncentive}
      />
      <IncentiveColumn
        title="Received"
        items={receivedIncentives}
        direction="received"
        emptyLabel="No incentives received yet"
        acceptingIncentiveId={acceptingIncentiveId}
        onAcceptIncentive={onAcceptIncentive}
      />
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
    <article className="grid gap-4 rounded-lg border border-divider bg-content1 p-3 shadow-sm transition-colors hover:border-primary/40 sm:p-4">
      <div className="grid gap-3 sm:flex sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <FriendAvatar
            image={friend.friendImage}
            name={friend.friendName}
            sizeClassName="h-12 w-12 sm:h-14 sm:w-14"
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

        <div className="flex shrink-0 gap-1 sm:justify-end">
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
              Last Opened
            </dt>
            <dd className="mt-1 text-sm font-semibold">
              {formatLastOpened(friend)}
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
        <div className="justify-self-start sm:justify-self-auto">
          <PerformanceRing percent={performance?.percent ?? 0} />
        </div>
      </div>
    </article>
  );
}

function FriendsGridSection({
  isLoading,
  friends,
  pendingFriends,
  acceptingFriendshipId,
  onAcceptRequest,
  onMessage,
  onIncentivize,
}: {
  isLoading: boolean;
  friends: FriendRow[];
  pendingFriends: FriendRow[];
  acceptingFriendshipId: string | null;
  onAcceptRequest: (friend: FriendRow) => void;
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

  if (friends.length === 0 && pendingFriends.length === 0) {
    return (
      <section className="flex min-h-64 flex-1 items-center justify-center text-center">
        <h2 className="text-xl font-semibold">No friends yet</h2>
      </section>
    );
  }

  return (
    <div className="grid gap-6">
      {pendingFriends.length > 0 ? (
        <section className="grid gap-3">
          <h2 className="text-lg font-semibold">Pending requests</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {pendingFriends.map((friend) => (
              <article
                key={friend.id}
                className="flex items-center gap-3 rounded-xl border border-divider bg-content1 p-4"
              >
                <FriendAvatar
                  image={friend.friendImage}
                  name={friend.friendName}
                />
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold">
                    {friend.friendName}
                  </h3>
                  <p className="truncate text-xs text-foreground-500">
                    {friend.friendEmail}
                  </p>
                </div>
                {friend.isIncomingRequest ? (
                  <Button
                    color="primary"
                    size="sm"
                    isLoading={acceptingFriendshipId === friend.id}
                    onPress={() => onAcceptRequest(friend)}
                  >
                    Accept
                  </Button>
                ) : (
                  <span className="text-xs font-semibold text-foreground-500">
                    Sent
                  </span>
                )}
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {friends.length > 0 ? (
        <section className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
          {friends.map((friend) => (
            <FriendGridCard
              key={friend.id}
              friend={friend}
              onMessage={onMessage}
              onIncentivize={onIncentivize}
            />
          ))}
        </section>
      ) : null}
    </div>
  );
}

export function FriendsPageClient({
  activeSection,
}: {
  activeSection: FriendsSection;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [selectedConversationId, setSelectedConversationId] = useState<
    string | null
  >(null);
  const [messageDraft, setMessageDraft] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSharedGoalCreateOpen, setIsSharedGoalCreateOpen] = useState(
    Boolean(searchParams.get("goalId")),
  );
  const [collabPickerMode, setCollabPickerMode] =
    useState<CollabPickerMode | null>(null);
  const [nudgeFriend, setNudgeFriend] = useState<FriendRow | null>(null);
  const [nudgeMode, setNudgeMode] = useState<NudgeMode>("message");
  const [encouragingMessage, setEncouragingMessage] = useState("");
  const [streakGoalScope, setStreakGoalScope] =
    useState<StreakGoalScope>("all");
  const [selectedStreakGoalId, setSelectedStreakGoalId] = useState("");
  const [streakDays, setStreakDays] = useState("7");
  const [streakPercentRequired, setStreakPercentRequired] = useState("80");
  const [incentiveText, setIncentiveText] = useState("");
  const [acceptingIncentiveId, setAcceptingIncentiveId] = useState<
    string | null
  >(null);
  const [email, setEmail] = useState("");

  const friendsQuery = useQuery({
    queryKey: ["friends"],
    queryFn: fetchFriends,
  });
  const friendsFeedQuery = useQuery({
    queryKey: ["friends-feed"],
    queryFn: fetchFriendsFeed,
    enabled: activeSection === "feed",
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

  const acceptFriendRequestMutation = useMutation({
    mutationFn: acceptFriendRequest,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["friends"] });
      addToast({
        title: "Friend request accepted",
        color: "success",
      });
    },
    onError: (error) => {
      addToast({
        title: "Could not accept friend request",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      });
    },
  });

  const acceptIncentiveMutation = useMutation({
    mutationFn: ({
      friendshipId,
      messageId,
    }: {
      friendshipId: string;
      messageId: string;
    }) => acceptFriendIncentive(friendshipId, messageId),
    onMutate: ({ messageId }) => {
      setAcceptingIncentiveId(messageId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["friends"] });
      addToast({
        title: "Incentive accepted",
        color: "success",
      });
    },
    onError: (error) => {
      addToast({
        title: "Could not accept incentive",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      });
    },
    onSettled: () => {
      setAcceptingIncentiveId(null);
    },
  });

  const friends = friendsQuery.data ?? [];
  const acceptedFriends = friends
    .filter((friend) => friend.status === "accepted")
    .sort(
      (left, right) =>
        lastOpenedTime(right) - lastOpenedTime(left) ||
        left.friendName.localeCompare(right.friendName),
    );
  const pendingFriends = friends
    .filter((friend) => friend.status === "requested")
    .sort(
      (left, right) =>
        Number(right.isIncomingRequest) - Number(left.isIncomingRequest) ||
        left.friendName.localeCompare(right.friendName),
    );
  const conversationFriend =
    acceptedFriends.find((friend) => friend.id === selectedConversationId) ??
    acceptedFriends[0] ??
    null;
  const activeConversationId = conversationFriend?.id ?? null;
  const sectionHeader = SECTION_HEADERS[activeSection];

  const handleAddFriend = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    addFriendMutation.mutate(email);
  };

  const handleAcceptIncentive = (friendshipId: string, messageId: string) => {
    acceptIncentiveMutation.mutate({ friendshipId, messageId });
  };

  const handleSectionAction = () => {
    if (activeSection === "friends") {
      setIsAddModalOpen(true);
      return;
    }

    if (activeSection === "shared-goals") {
      setIsSharedGoalCreateOpen(true);
      return;
    }

    if (acceptedFriends.length === 0) {
      addToast({
        title: "Add a friend first",
        description: "You need an accepted friend to start collaborating.",
        color: "warning",
      });
      return;
    }

    setCollabPickerMode(
      activeSection === "messages" ? "conversation" : "incentive",
    );
  };

  const handleCollabFriendSelect = (friend: FriendRow) => {
    const mode = collabPickerMode;
    setCollabPickerMode(null);

    if (mode === "conversation") {
      setSelectedConversationId(friend.id);
      router.push("/friends?section=messages");
      return;
    }

    if (mode === "incentive") {
      openNudgeModal(friend, "incentive");
    }
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
      <div className="flex min-h-0 flex-1 flex-col gap-4 px-3 py-4 sm:gap-6 sm:p-6">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-4">
          <div className="flex flex-col gap-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-foreground-500">
              {sectionHeader.eyebrow}
            </p>
            <h1 className="text-3xl font-bold tracking-normal sm:text-4xl">
              {sectionHeader.title}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {sectionHeader.actionLabel && sectionHeader.actionIcon ? (
              <Button
                color="primary"
                aria-label={sectionHeader.actionLabel}
                className="min-w-10 px-0 sm:min-w-0 sm:px-4"
                startContent={
                  <Icon
                    icon={sectionHeader.actionIcon}
                    className="h-3.5 w-3.5"
                  />
                }
                onPress={handleSectionAction}
              >
                <span className="hidden sm:inline">
                  {sectionHeader.actionLabel}
                </span>
              </Button>
            ) : null}
            <SettingsLink />
          </div>
        </header>

        {activeSection === "feed" ? (
          <FeedSection
            isLoading={friendsFeedQuery.isLoading}
            errorMessage={
              friendsFeedQuery.error instanceof Error
                ? friendsFeedQuery.error.message
                : undefined
            }
            entries={friendsFeedQuery.data ?? []}
          />
        ) : null}

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

        {activeSection === "incentives" ? (
          <IncentivesSection
            isLoading={friendsQuery.isLoading}
            friends={acceptedFriends}
            acceptingIncentiveId={acceptingIncentiveId}
            onAcceptIncentive={handleAcceptIncentive}
          />
        ) : null}

        {activeSection === "shared-goals" ? (
          <SharedGoalsSection
            friends={acceptedFriends.map((friend) => ({
              friendId: friend.friendId,
              friendName: friend.friendName,
              friendEmail: friend.friendEmail,
              friendImage: friend.friendImage,
            }))}
            isCreateOpen={isSharedGoalCreateOpen}
            initialPersonalGoalId={searchParams.get("goalId")}
            onCreateOpenChange={setIsSharedGoalCreateOpen}
          />
        ) : null}

        {activeSection === "friends" ? (
          <FriendsGridSection
            isLoading={friendsQuery.isLoading}
            friends={acceptedFriends}
            pendingFriends={pendingFriends}
            acceptingFriendshipId={
              acceptFriendRequestMutation.isPending
                ? (acceptFriendRequestMutation.variables ?? null)
                : null
            }
            onAcceptRequest={(friend) =>
              acceptFriendRequestMutation.mutate(friend.id)
            }
            onMessage={(friend) => {
              setSelectedConversationId(friend.id);
              router.push("/friends?section=messages");
            }}
            onIncentivize={(friend) => openNudgeModal(friend, "incentive")}
          />
        ) : null}
      </div>

      <Modal
        isOpen={collabPickerMode !== null}
        onOpenChange={(open) => {
          if (!open) setCollabPickerMode(null);
        }}
        size="sm"
      >
        <ModalContent>
          <ModalHeader>
            {collabPickerMode === "conversation"
              ? "New Conversation"
              : "New Incentive"}
          </ModalHeader>
          <ModalBody className="gap-2 pb-5">
            <p className="pb-1 text-sm text-foreground-500">Choose a friend</p>
            {acceptedFriends.map((friend) => (
              <button
                key={friend.id}
                type="button"
                onClick={() => handleCollabFriendSelect(friend)}
                className="flex w-full items-center gap-3 rounded-lg border border-divider bg-content1 px-3 py-3 text-left transition-colors hover:bg-default-100"
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-default-100 text-sm font-semibold text-foreground-600">
                  {friend.friendName.charAt(0).toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {friend.friendName}
                  </span>
                  <span className="block truncate text-xs text-foreground-400">
                    {friend.friendEmail}
                  </span>
                </span>
              </button>
            ))}
          </ModalBody>
        </ModalContent>
      </Modal>

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
                    placeholder="Lunch on me when you hit it"
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
