"use client";

import {
  Button,
  Card,
  CardBody,
  Chip,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  Input,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Select,
  SelectItem,
  Spinner,
  Switch,
  Tooltip,
  addToast,
  cn,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent, useEffect, useMemo, useState } from "react";

import { setGoalLog } from "@/lib/goal-logs-client";
import { fetchGoals } from "@/lib/goals-client";
import {
  type CreateSharedGoalInput,
  type SharedGoalSnapshot,
  createSharedGoal,
  fetchSharedGoals,
  inviteSharedGoalParticipants,
  respondToSharedGoal,
  updateSharedGoal,
} from "@/lib/shared-goals-client";

export type SharedGoalFriend = {
  friendId: string;
  friendName: string;
  friendEmail: string;
  friendImage: string | null;
};

type Props = {
  friends: SharedGoalFriend[];
  isCreateOpen: boolean;
  initialPersonalGoalId?: string | null;
  onCreateOpenChange: (open: boolean) => void;
};

type Mode = "collaborative" | "competitive";
type ScoringType = SharedGoalSnapshot["scoringType"];

const SCORING_OPTIONS: Record<
  Mode,
  Array<{ value: ScoringType; label: string; description: string }>
> = {
  collaborative: [
    {
      value: "everyone_completes",
      label: "Everyone completes",
      description:
        "Counts every day all participants complete the goal, adding up over time.",
    },
    {
      value: "combined_target",
      label: "Combined target",
      description: "Every completion moves the group toward one target.",
    },
  ],
  competitive: [
    {
      value: "first_to_target",
      label: "First to target",
      description: "The first participant to reach the target wins.",
    },
    {
      value: "highest_total",
      label: "Highest total",
      description: "The participant with the most completions leads.",
    },
  ],
};

const SCORING_LABELS: Record<ScoringType, string> = {
  everyone_completes: "Everyone completes",
  combined_target: "Combined target",
  first_to_target: "First to target",
  highest_total: "Highest total",
  longest_streak: "Longest streak",
};

const todayDateKey = () => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
};

const formatDate = (dateKey: string | null) =>
  dateKey
    ? new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${dateKey}T00:00:00Z`))
    : null;

const firstSelection = (keys: "all" | Set<React.Key>) =>
  keys === "all" ? null : String([...keys][0] ?? "");

function ParticipantAvatar({
  name,
  image,
  className,
}: {
  name: string;
  image: string | null;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-content1 bg-[#A0D5D5]/35 text-xs font-bold text-[#2C5352]",
        className,
      )}
      title={name}
    >
      {image ? (
        <img src={image} alt="" className="h-full w-full object-cover" />
      ) : (
        name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

function AvatarStack({
  participants,
}: {
  participants: SharedGoalSnapshot["participants"];
}) {
  const visible = participants
    .filter((participant) => participant.status === "accepted")
    .slice(0, 4);
  const remaining =
    participants.filter((participant) => participant.status === "accepted")
      .length - visible.length;

  return (
    <div className="flex -space-x-2">
      {visible.map((participant) => (
        <ParticipantAvatar
          key={participant.id}
          name={participant.userName}
          image={participant.userImage}
        />
      ))}
      {remaining > 0 ? (
        <span className="flex h-9 w-9 items-center justify-center rounded-full border-2 border-content1 bg-default-100 text-xs font-semibold text-foreground-500">
          +{remaining}
        </span>
      ) : null}
    </div>
  );
}

function GoalProgress({ goal }: { goal: SharedGoalSnapshot }) {
  const leader = goal.participants.find((participant) =>
    goal.progress.leaderUserIds.includes(participant.userId),
  );
  const label =
    goal.mode === "competitive" && leader
      ? `${leader.userName} leads with ${goal.progress.value}`
      : goal.progress.target
        ? `${goal.progress.value} of ${goal.progress.target}`
        : `${goal.progress.value} completions`;

  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3 text-xs">
        <span className="font-semibold text-foreground-600">{label}</span>
        {goal.progress.target ? (
          <span className="tabular-nums text-foreground-400">
            {goal.progress.percent}%
          </span>
        ) : null}
      </div>
      {goal.progress.target ? (
        <div className="h-2 overflow-hidden rounded-full bg-default-100">
          <div
            className={cn(
              "h-full rounded-full",
              goal.mode === "collaborative" ? "bg-[#2C5352]" : "bg-[#9D7474]",
            )}
            style={{ width: `${goal.progress.percent}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}

function InvitationCard({
  goal,
  onAccept,
  onDecline,
  isPending,
}: {
  goal: SharedGoalSnapshot;
  onAccept: () => void;
  onDecline: () => void;
  isPending: boolean;
}) {
  return (
    <Card shadow="none" className="border border-[#F3B7B9] bg-[#F3B7B9]/18">
      <CardBody className="gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Chip
              size="sm"
              variant="flat"
              className="bg-[#9D7474]/15 text-[#9D7474]"
            >
              Invitation
            </Chip>
            <Chip size="sm" variant="flat">
              {goal.mode === "collaborative" ? "Collaborative" : "Competitive"}
            </Chip>
          </div>
          <h3 className="truncate text-base font-semibold">{goal.name}</h3>
          <p className="mt-1 text-sm text-foreground-500">
            {SCORING_LABELS[goal.scoringType]}
            {goal.endsOn ? ` · Ends ${formatDate(goal.endsOn)}` : ""}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button variant="flat" isDisabled={isPending} onPress={onDecline}>
            Decline
          </Button>
          <Button color="primary" isDisabled={isPending} onPress={onAccept}>
            Join
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}

function SharedGoalCard({
  goal,
  onOpen,
  onReport,
  onRelink,
  isReporting,
}: {
  goal: SharedGoalSnapshot;
  onOpen: () => void;
  onReport: () => void;
  onRelink: () => void;
  isReporting: boolean;
}) {
  const current = goal.currentUserParticipant;
  const canReport =
    current?.status === "accepted" && Boolean(current.personalGoalId);

  return (
    <Card shadow="sm" className="border border-divider bg-content1 text-left">
      <CardBody className="gap-5 p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-2 flex flex-wrap gap-2">
              <Chip
                size="sm"
                variant="flat"
                className={
                  goal.mode === "collaborative"
                    ? "bg-[#A0D5D5]/35 text-[#2C5352]"
                    : "bg-[#F3B7B9]/45 text-[#9D7474]"
                }
              >
                {goal.mode === "collaborative"
                  ? "Collaborative"
                  : "Competitive"}
              </Chip>
              <Chip
                size="sm"
                variant="flat"
                className="bg-[#516162]/10 text-[#516162]"
              >
                {SCORING_LABELS[goal.scoringType]}
              </Chip>
            </div>
            <h3 className="truncate text-lg font-semibold">{goal.name}</h3>
            <p className="mt-1 text-sm text-foreground-500">
              {goal.endsOn ? `Ends ${formatDate(goal.endsOn)}` : "No end date"}
            </p>
          </div>
          <AvatarStack participants={goal.participants} />
        </div>

        <GoalProgress goal={goal} />

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-foreground-500">
            {goal.progress.completedToday}/{goal.progress.acceptedParticipants}{" "}
            completed today
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="flat" onPress={onOpen}>
              Details
            </Button>
            {canReport ? (
              <Button
                size="sm"
                color={current.completedToday ? "default" : "primary"}
                variant={current.completedToday ? "flat" : "solid"}
                isDisabled={current.completedToday}
                isLoading={isReporting}
                startContent={
                  current.completedToday ? (
                    <Icon icon="mdi:check-circle" className="h-4 w-4" />
                  ) : undefined
                }
                onPress={() => onReport()}
              >
                {current.completedToday ? "Done today" : "Report today"}
              </Button>
            ) : (
              <Button
                size="sm"
                color="warning"
                variant="flat"
                onPress={onRelink}
              >
                Relink goal
              </Button>
            )}
          </div>
        </div>
      </CardBody>
    </Card>
  );
}

function GoalListSection({
  title,
  goals,
  onOpen,
  onReport,
  onRelink,
  reportingGoalId,
}: {
  title: string;
  goals: SharedGoalSnapshot[];
  onOpen: (goal: SharedGoalSnapshot) => void;
  onReport: (goal: SharedGoalSnapshot) => void;
  onRelink: (goal: SharedGoalSnapshot) => void;
  reportingGoalId: string | null;
}) {
  if (goals.length === 0) return null;

  return (
    <section className="grid gap-3">
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold">{title}</h2>
        <Chip size="sm" variant="flat">
          {goals.length}
        </Chip>
      </div>
      <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        {goals.map((goal) => (
          <SharedGoalCard
            key={goal.id}
            goal={goal}
            onOpen={() => onOpen(goal)}
            onReport={() => onReport(goal)}
            onRelink={() => onRelink(goal)}
            isReporting={reportingGoalId === goal.id}
          />
        ))}
      </div>
    </section>
  );
}

export function SharedGoalsSection({
  friends,
  isCreateOpen,
  initialPersonalGoalId,
  onCreateOpenChange,
}: Props) {
  const queryClient = useQueryClient();
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [acceptingGoal, setAcceptingGoal] = useState<SharedGoalSnapshot | null>(
    null,
  );
  const [acceptPersonalGoalId, setAcceptPersonalGoalId] = useState("");
  const [deletePreviousAutoCreated, setDeletePreviousAutoCreated] =
    useState(false);
  const [inviteGoal, setInviteGoal] = useState<SharedGoalSnapshot | null>(null);
  const [inviteUserIds, setInviteUserIds] = useState<string[]>([]);
  const [createStep, setCreateStep] = useState(1);
  const [name, setName] = useState("");
  const [mode, setMode] = useState<Mode>("collaborative");
  const [scoringType, setScoringType] =
    useState<ScoringType>("combined_target");
  const [target, setTarget] = useState("30");
  const [startsOn, setStartsOn] = useState(todayDateKey());
  const [endsOn, setEndsOn] = useState("");
  const [personalGoalId, setPersonalGoalId] = useState(
    initialPersonalGoalId ?? "",
  );
  const [selectedFriendIds, setSelectedFriendIds] = useState<string[]>([]);
  const [reportingGoalId, setReportingGoalId] = useState<string | null>(null);

  const sharedGoalsQuery = useQuery({
    queryKey: ["shared-goals"],
    queryFn: fetchSharedGoals,
  });
  const personalGoalsQuery = useQuery({
    queryKey: ["goals"],
    queryFn: fetchGoals,
  });
  const sharedGoals = sharedGoalsQuery.data ?? [];
  const personalGoals = personalGoalsQuery.data ?? [];
  const selectedGoal =
    sharedGoals.find((goal) => goal.id === selectedGoalId) ?? null;
  const invitations = sharedGoals.filter(
    (goal) =>
      goal.status === "active" &&
      goal.currentUserParticipant?.status === "invited",
  );
  const activeGoals = sharedGoals.filter(
    (goal) =>
      goal.status === "active" &&
      goal.currentUserParticipant?.status === "accepted",
  );
  const completedGoals = sharedGoals.filter(
    (goal) =>
      goal.status === "completed" &&
      goal.currentUserParticipant?.status === "accepted",
  );
  const visibleGoalCount =
    invitations.length + activeGoals.length + completedGoals.length;

  useEffect(() => {
    if (initialPersonalGoalId) setPersonalGoalId(initialPersonalGoalId);
  }, [initialPersonalGoalId]);

  const resetCreate = () => {
    setCreateStep(1);
    setName("");
    setMode("collaborative");
    setScoringType("combined_target");
    setTarget("30");
    setStartsOn(todayDateKey());
    setEndsOn("");
    setPersonalGoalId(initialPersonalGoalId ?? "");
    setSelectedFriendIds([]);
  };

  const invalidateSharedGoals = () =>
    queryClient.invalidateQueries({ queryKey: ["shared-goals"] });

  const createMutation = useMutation({
    mutationFn: (input: CreateSharedGoalInput) => createSharedGoal(input),
    onSuccess: (goal) => {
      void invalidateSharedGoals();
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      onCreateOpenChange(false);
      resetCreate();
      setSelectedGoalId(goal.id);
      addToast({ title: "Shared goal created", color: "success" });
    },
    onError: (error) =>
      addToast({
        title: "Could not create shared goal",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      }),
  });
  const participantMutation = useMutation({
    mutationFn: ({
      sharedGoalId,
      input,
    }: {
      sharedGoalId: string;
      input:
        | { action: "accept"; personalGoalId: string | null }
        | { action: "decline" }
        | {
            action: "relink";
            personalGoalId: string | null;
            deletePreviousAutoCreated?: boolean;
          };
    }) => respondToSharedGoal(sharedGoalId, input),
    onSuccess: () => {
      void invalidateSharedGoals();
      void queryClient.invalidateQueries({ queryKey: ["goals"] });
      void queryClient.invalidateQueries({ queryKey: ["categories"] });
      setAcceptingGoal(null);
      setAcceptPersonalGoalId("");
      setDeletePreviousAutoCreated(false);
      addToast({ title: "Shared goal updated", color: "success" });
    },
    onError: (error) =>
      addToast({
        title: "Could not update invitation",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      }),
  });
  const updateMutation = useMutation({
    mutationFn: ({
      sharedGoalId,
      input,
    }: {
      sharedGoalId: string;
      input:
        | {
            action: "setStatus";
            status: "active" | "completed" | "archived";
          }
        | { action: "leave" };
    }) => updateSharedGoal(sharedGoalId, input),
    onSuccess: () => {
      void invalidateSharedGoals();
      setSelectedGoalId(null);
      addToast({ title: "Shared goal updated", color: "success" });
    },
    onError: (error) =>
      addToast({
        title: "Could not update shared goal",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      }),
  });
  const inviteMutation = useMutation({
    mutationFn: ({
      sharedGoalId,
      userIds,
    }: {
      sharedGoalId: string;
      userIds: string[];
    }) => inviteSharedGoalParticipants(sharedGoalId, userIds),
    onSuccess: () => {
      void invalidateSharedGoals();
      setInviteGoal(null);
      setInviteUserIds([]);
      addToast({ title: "Invitations sent", color: "success" });
    },
    onError: (error) =>
      addToast({
        title: "Could not invite friends",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      }),
  });
  const reportMutation = useMutation({
    mutationFn: ({ goalId }: { sharedGoalId: string; goalId: string }) =>
      setGoalLog(goalId, todayDateKey(), "complete"),
    onMutate: ({ sharedGoalId }) => setReportingGoalId(sharedGoalId),
    onSuccess: () => {
      void invalidateSharedGoals();
      void queryClient.invalidateQueries({ queryKey: ["goal-logs"] });
      addToast({ title: "Reported for today", color: "success" });
    },
    onError: (error) =>
      addToast({
        title: "Could not report goal",
        description: error instanceof Error ? error.message : undefined,
        color: "danger",
      }),
    onSettled: () => setReportingGoalId(null),
  });

  const handleReport = (goal: SharedGoalSnapshot) => {
    const goalId = goal.currentUserParticipant?.personalGoalId;
    if (goalId) reportMutation.mutate({ sharedGoalId: goal.id, goalId });
  };
  const openPersonalGoalLink = (
    goal: SharedGoalSnapshot,
    selectedGoalId = "",
  ) => {
    setAcceptingGoal(goal);
    setAcceptPersonalGoalId(selectedGoalId);
    setDeletePreviousAutoCreated(false);
  };
  const handleCreate = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (createStep < 3) {
      setCreateStep(Math.min(3, createStep + 1));
      return;
    }

    const targetNumber = Number(target);

    createMutation.mutate({
      name,
      mode,
      scoringType,
      target:
        scoringType === "highest_total" || !Number.isFinite(targetNumber)
          ? null
          : targetNumber,
      startsOn: startsOn || null,
      endsOn: endsOn || null,
      personalGoalId: personalGoalId || null,
      invitedUserIds: selectedFriendIds,
    });
  };
  const selectableInviteFriends = useMemo(() => {
    if (!inviteGoal) return [];
    const participantIds = new Set(
      inviteGoal.participants.map((participant) => participant.userId),
    );
    return friends.filter((friend) => !participantIds.has(friend.friendId));
  }, [friends, inviteGoal]);
  const linkingParticipant = acceptingGoal?.currentUserParticipant ?? null;
  const isJoiningInvitation = linkingParticipant?.status === "invited";
  const canDeletePreviousAutoCreated = Boolean(
    !isJoiningInvitation &&
      linkingParticipant?.personalGoalAutoCreated &&
      linkingParticipant.personalGoalId &&
      linkingParticipant.personalGoalId !== acceptPersonalGoalId,
  );

  if (sharedGoalsQuery.isLoading) {
    return (
      <section className="flex min-h-64 flex-1 items-center justify-center">
        <Spinner size="sm" />
      </section>
    );
  }

  if (sharedGoalsQuery.error) {
    return (
      <section className="flex min-h-64 flex-1 items-center justify-center text-center">
        <div>
          <h2 className="text-lg font-semibold">Could not load shared goals</h2>
          <Button
            className="mt-4"
            variant="flat"
            onPress={() => sharedGoalsQuery.refetch()}
          >
            Try again
          </Button>
        </div>
      </section>
    );
  }

  return (
    <>
      <div className="grid gap-7">
        {invitations.length > 0 ? (
          <section className="grid gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold">Invitations</h2>
              <Chip size="sm" variant="flat" color="secondary">
                {invitations.length}
              </Chip>
            </div>
            <div className="grid gap-3">
              {invitations.map((goal) => (
                <InvitationCard
                  key={goal.id}
                  goal={goal}
                  isPending={participantMutation.isPending}
                  onAccept={() => {
                    openPersonalGoalLink(goal);
                  }}
                  onDecline={() =>
                    participantMutation.mutate({
                      sharedGoalId: goal.id,
                      input: { action: "decline" },
                    })
                  }
                />
              ))}
            </div>
          </section>
        ) : null}

        <GoalListSection
          title="Active Goals"
          goals={activeGoals}
          onOpen={(goal) => setSelectedGoalId(goal.id)}
          onReport={handleReport}
          onRelink={(goal) => {
            openPersonalGoalLink(goal);
          }}
          reportingGoalId={reportingGoalId}
        />
        <GoalListSection
          title="Completed Goals"
          goals={completedGoals}
          onOpen={(goal) => setSelectedGoalId(goal.id)}
          onReport={handleReport}
          onRelink={(goal) => {
            openPersonalGoalLink(goal);
          }}
          reportingGoalId={reportingGoalId}
        />

        {visibleGoalCount === 0 ? (
          <section className="flex min-h-72 items-center justify-center rounded-2xl border border-dashed border-divider bg-content1/40 p-8 text-center">
            <div className="max-w-sm">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-[#A0D5D5]/35 text-[#2C5352]">
                <Icon icon="mdi:account-group-outline" className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-xl font-semibold">
                Better goals, together
              </h2>
              <p className="mt-2 text-sm text-foreground-500">
                Collaborate toward one target or compete for the lead while
                keeping your personal reporting history.
              </p>
              <Button
                className="mt-5"
                color="primary"
                onPress={() => onCreateOpenChange(true)}
              >
                Create Shared Goal
              </Button>
            </div>
          </section>
        ) : null}
      </div>

      <Modal
        isOpen={isCreateOpen}
        size="lg"
        onOpenChange={(open) => {
          onCreateOpenChange(open);
          if (!open) resetCreate();
        }}
      >
        <ModalContent>
          <form onSubmit={handleCreate}>
            <ModalHeader className="flex flex-col gap-1">
              <span>New Shared Goal</span>
              <span className="text-xs font-normal text-foreground-500">
                Step {createStep} of 3
              </span>
            </ModalHeader>
            <ModalBody className="gap-4">
              {createStep === 1 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {(["collaborative", "competitive"] as const).map((option) => (
                    <button
                      key={option}
                      type="button"
                      onClick={() => {
                        setMode(option);
                        setScoringType(SCORING_OPTIONS[option][0].value);
                        setTarget(option === "collaborative" ? "30" : "7");
                      }}
                      className={cn(
                        "rounded-2xl border p-5 text-left",
                        mode === option
                          ? option === "collaborative"
                            ? "border-[#A0D5D5] bg-[#A0D5D5]/20"
                            : "border-[#F3B7B9] bg-[#F3B7B9]/25"
                          : "border-divider bg-content1 hover:bg-default-100",
                      )}
                    >
                      <Icon
                        icon={
                          option === "collaborative"
                            ? "mdi:account-group-outline"
                            : "mdi:trophy-outline"
                        }
                        className="h-6 w-6"
                      />
                      <span className="mt-4 block font-semibold capitalize">
                        {option}
                      </span>
                      <span className="mt-1 block text-sm text-foreground-500">
                        {option === "collaborative"
                          ? "Work together toward one result."
                          : "Compare progress and compete for the lead."}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}

              {createStep === 2 ? (
                <>
                  <Input
                    isRequired
                    label="Shared goal name"
                    placeholder="Read 100 chapters together"
                    value={name}
                    onValueChange={setName}
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    {SCORING_OPTIONS[mode].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setScoringType(option.value)}
                        className={cn(
                          "rounded-xl border p-3 text-left",
                          scoringType === option.value
                            ? "border-primary bg-primary/10"
                            : "border-divider bg-content1 hover:bg-default-100",
                        )}
                      >
                        <span className="block text-sm font-semibold">
                          {option.label}
                        </span>
                        <span className="mt-1 block text-xs text-foreground-500">
                          {option.description}
                        </span>
                      </button>
                    ))}
                  </div>
                  {scoringType !== "highest_total" &&
                  scoringType !== "everyone_completes" ? (
                    <Input
                      isRequired
                      type="number"
                      min={1}
                      label="Completion target"
                      value={target}
                      onValueChange={setTarget}
                    />
                  ) : null}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      type="date"
                      label="Start date"
                      value={startsOn}
                      onValueChange={setStartsOn}
                    />
                    <Input
                      type="date"
                      label="End date"
                      value={endsOn}
                      onValueChange={setEndsOn}
                    />
                  </div>
                </>
              ) : null}

              {createStep === 3 ? (
                <>
                  <Select
                    isClearable
                    label="Link an existing personal goal (optional)"
                    placeholder="Create a new personal goal"
                    description="Leave blank to create a daily personal goal with this shared goal's name."
                    selectedKeys={
                      personalGoalId ? new Set([personalGoalId]) : new Set()
                    }
                    onSelectionChange={(keys) =>
                      setPersonalGoalId(firstSelection(keys) ?? "")
                    }
                  >
                    {personalGoals.map((goal) => (
                      <SelectItem key={goal.id}>{goal.name}</SelectItem>
                    ))}
                  </Select>
                  <div>
                    <p className="mb-2 text-sm font-semibold">Invite friends</p>
                    <div className="grid max-h-56 gap-2 overflow-y-auto">
                      {friends.map((friend) => {
                        const selected = selectedFriendIds.includes(
                          friend.friendId,
                        );
                        return (
                          <button
                            key={friend.friendId}
                            type="button"
                            onClick={() =>
                              setSelectedFriendIds((current) =>
                                selected
                                  ? current.filter(
                                      (id) => id !== friend.friendId,
                                    )
                                  : [...current, friend.friendId],
                              )
                            }
                            className={cn(
                              "flex items-center gap-3 rounded-xl border px-3 py-2 text-left",
                              selected
                                ? "border-primary bg-primary/10"
                                : "border-divider hover:bg-default-100",
                            )}
                          >
                            <ParticipantAvatar
                              name={friend.friendName}
                              image={friend.friendImage}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold">
                                {friend.friendName}
                              </span>
                              <span className="block truncate text-xs text-foreground-500">
                                {friend.friendEmail}
                              </span>
                            </span>
                            {selected ? (
                              <Icon
                                icon="mdi:check-circle"
                                className="h-5 w-5 text-primary"
                              />
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              ) : null}
            </ModalBody>
            <ModalFooter>
              <Button
                type="button"
                variant="flat"
                onPress={() => {
                  if (createStep === 1) onCreateOpenChange(false);
                  else setCreateStep((step) => step - 1);
                }}
              >
                {createStep === 1 ? "Cancel" : "Back"}
              </Button>
              {createStep < 3 ? (
                <Button
                  type="submit"
                  color="primary"
                  isDisabled={createStep === 2 && name.trim().length === 0}
                >
                  Continue
                </Button>
              ) : (
                <Button
                  type="submit"
                  color="primary"
                  isLoading={createMutation.isPending}
                  isDisabled={name.trim().length === 0}
                >
                  Create Shared Goal
                </Button>
              )}
            </ModalFooter>
          </form>
        </ModalContent>
      </Modal>

      <Modal
        isOpen={acceptingGoal !== null}
        onOpenChange={(open) => {
          if (!open) {
            setAcceptingGoal(null);
            setAcceptPersonalGoalId("");
            setDeletePreviousAutoCreated(false);
          }
        }}
      >
        <ModalContent>
          <ModalHeader>
            {isJoiningInvitation ? "Join" : "Change linked goal for"}{" "}
            {acceptingGoal?.name}
          </ModalHeader>
          <ModalBody className="gap-4">
            {!isJoiningInvitation && linkingParticipant?.personalGoalName ? (
              <div className="rounded-xl bg-default-100 p-3">
                <p className="text-xs font-semibold text-foreground-500">
                  Currently linked
                </p>
                <p className="mt-1 text-sm font-semibold">
                  {linkingParticipant.personalGoalName}
                </p>
              </div>
            ) : null}
            <Select
              isClearable
              label={
                isJoiningInvitation
                  ? "Link an existing personal goal (optional)"
                  : "Link a different existing personal goal (optional)"
              }
              placeholder="Create a new personal goal"
              description="Leave blank to create and link a new daily personal goal."
              selectedKeys={
                acceptPersonalGoalId
                  ? new Set([acceptPersonalGoalId])
                  : new Set()
              }
              onSelectionChange={(keys) => {
                const nextGoalId = firstSelection(keys) ?? "";
                setAcceptPersonalGoalId(nextGoalId);
                if (nextGoalId === linkingParticipant?.personalGoalId) {
                  setDeletePreviousAutoCreated(false);
                }
              }}
            >
              {personalGoals.map((goal) => (
                <SelectItem key={goal.id}>{goal.name}</SelectItem>
              ))}
            </Select>
            {!isJoiningInvitation &&
            linkingParticipant?.personalGoalAutoCreated ? (
              <div className="rounded-xl border border-[#F3B7B9] bg-[#F3B7B9]/15 p-3">
                <Switch
                  color="danger"
                  isSelected={deletePreviousAutoCreated}
                  isDisabled={!canDeletePreviousAutoCreated}
                  onValueChange={setDeletePreviousAutoCreated}
                >
                  Delete the generated personal goal
                </Switch>
                <p className="mt-2 text-xs text-foreground-500">
                  This also deletes any reports, notes, and photos attached to{" "}
                  {linkingParticipant.personalGoalName}.
                </p>
              </div>
            ) : null}
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setAcceptingGoal(null)}>
              Cancel
            </Button>
            <Button
              color="primary"
              isLoading={participantMutation.isPending}
              onPress={() => {
                if (!acceptingGoal) return;
                participantMutation.mutate({
                  sharedGoalId: acceptingGoal.id,
                  input: {
                    action: isJoiningInvitation ? "accept" : "relink",
                    personalGoalId: acceptPersonalGoalId || null,
                    ...(!isJoiningInvitation
                      ? { deletePreviousAutoCreated }
                      : {}),
                  },
                });
              }}
            >
              {isJoiningInvitation ? "Join Goal" : "Change Linked Goal"}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>

      <Drawer
        isOpen={selectedGoal !== null}
        placement="right"
        size="lg"
        onOpenChange={(open) => !open && setSelectedGoalId(null)}
      >
        <DrawerContent>
          <DrawerHeader className="border-b border-divider">
            <div className="pr-10">
              <div className="mb-2 flex flex-wrap gap-2">
                <Chip size="sm" variant="flat">
                  {selectedGoal?.mode}
                </Chip>
                <Chip size="sm" variant="flat">
                  {selectedGoal ? SCORING_LABELS[selectedGoal.scoringType] : ""}
                </Chip>
              </div>
              <h2 className="text-xl font-semibold">{selectedGoal?.name}</h2>
            </div>
          </DrawerHeader>
          <DrawerBody className="gap-6 py-5">
            {selectedGoal ? (
              <>
                <Card shadow="none" className="border border-divider">
                  <CardBody className="gap-4 p-4">
                    <GoalProgress goal={selectedGoal} />
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="rounded-xl bg-default-100 p-3">
                        <p className="text-xs text-foreground-500">
                          Completed today
                        </p>
                        <p className="mt-1 font-semibold tabular-nums">
                          {selectedGoal.progress.completedToday}/
                          {selectedGoal.progress.acceptedParticipants}
                        </p>
                      </div>
                      <div className="rounded-xl bg-default-100 p-3">
                        <p className="text-xs text-foreground-500">End date</p>
                        <p className="mt-1 font-semibold">
                          {formatDate(selectedGoal.endsOn) ?? "Open-ended"}
                        </p>
                      </div>
                    </div>
                    {selectedGoal.currentUserParticipant?.personalGoalId ? (
                      <>
                        <Button
                          color="primary"
                          isDisabled={
                            selectedGoal.currentUserParticipant.completedToday
                          }
                          isLoading={reportingGoalId === selectedGoal.id}
                          onPress={() => handleReport(selectedGoal)}
                        >
                          {selectedGoal.currentUserParticipant.completedToday
                            ? "Completed today"
                            : "Report today"}
                        </Button>
                        <div className="flex items-center justify-between gap-3 rounded-xl bg-default-100 p-3">
                          <div className="min-w-0">
                            <p className="text-xs text-foreground-500">
                              Linked personal goal
                            </p>
                            <p className="truncate text-sm font-semibold">
                              {selectedGoal.currentUserParticipant
                                .personalGoalName ?? "Personal goal"}
                            </p>
                          </div>
                          <Button
                            size="sm"
                            variant="flat"
                            onPress={() =>
                              openPersonalGoalLink(
                                selectedGoal,
                                selectedGoal.currentUserParticipant
                                  ?.personalGoalId ?? "",
                              )
                            }
                          >
                            Change
                          </Button>
                        </div>
                      </>
                    ) : (
                      <Button
                        color="warning"
                        variant="flat"
                        onPress={() => openPersonalGoalLink(selectedGoal)}
                      >
                        Relink Personal Goal
                      </Button>
                    )}
                  </CardBody>
                </Card>

                <section>
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <h3 className="font-semibold">Participants</h3>
                    {selectedGoal.canManage ? (
                      <Button
                        size="sm"
                        variant="flat"
                        isDisabled={selectableInviteFriends.length === 0}
                        onPress={() => {
                          setInviteGoal(selectedGoal);
                          setInviteUserIds([]);
                        }}
                      >
                        Invite
                      </Button>
                    ) : null}
                  </div>
                  <div className="grid gap-2">
                    {selectedGoal.participants
                      .filter(
                        (participant) =>
                          participant.status === "accepted" ||
                          participant.status === "invited",
                      )
                      .map((participant) => (
                        <div
                          key={participant.id}
                          className="flex items-center gap-3 rounded-xl bg-default-100 p-3"
                        >
                          <ParticipantAvatar
                            name={participant.userName}
                            image={participant.userImage}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-semibold">
                              {participant.userName}
                            </p>
                            <p className="truncate text-xs text-foreground-500">
                              {participant.status === "invited"
                                ? "Invitation pending"
                                : `${participant.completedCount} completions · ${participant.currentStreak} day streak`}
                            </p>
                          </div>
                          {participant.completedToday ? (
                            <Tooltip content="Completed today">
                              <Icon
                                icon="mdi:check-circle"
                                className="h-5 w-5 text-[#2C5352]"
                              />
                            </Tooltip>
                          ) : null}
                        </div>
                      ))}
                  </div>
                </section>

                <section>
                  <h3 className="mb-3 font-semibold">Recent Activity</h3>
                  {selectedGoal.recentActivity.length > 0 ? (
                    <div className="grid gap-2">
                      {selectedGoal.recentActivity.map((activity, index) => (
                        <div
                          key={`${activity.userId}-${activity.dateKey}-${index}`}
                          className="flex items-center gap-3 rounded-xl bg-default-100 p-3"
                        >
                          <ParticipantAvatar
                            name={activity.userName}
                            image={activity.userImage}
                          />
                          <p className="min-w-0 flex-1 text-sm">
                            <strong>{activity.userName}</strong> completed{" "}
                            {activity.goalName}
                          </p>
                          <span className="shrink-0 text-xs text-foreground-400">
                            {formatDate(activity.dateKey)}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-foreground-500">
                      No completions yet.
                    </p>
                  )}
                </section>
              </>
            ) : null}
          </DrawerBody>
          <DrawerFooter className="border-t border-divider">
            {selectedGoal?.canManage ? (
              <>
                {selectedGoal.status === "active" ? (
                  <Button
                    variant="flat"
                    onPress={() =>
                      updateMutation.mutate({
                        sharedGoalId: selectedGoal.id,
                        input: {
                          action: "setStatus",
                          status: "completed",
                        },
                      })
                    }
                  >
                    Mark Complete
                  </Button>
                ) : null}
                <Button
                  color="danger"
                  variant="flat"
                  onPress={() =>
                    updateMutation.mutate({
                      sharedGoalId: selectedGoal.id,
                      input: { action: "setStatus", status: "archived" },
                    })
                  }
                >
                  Archive
                </Button>
              </>
            ) : selectedGoal ? (
              <Button
                color="danger"
                variant="flat"
                onPress={() =>
                  updateMutation.mutate({
                    sharedGoalId: selectedGoal.id,
                    input: { action: "leave" },
                  })
                }
              >
                Leave Shared Goal
              </Button>
            ) : null}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Modal
        isOpen={inviteGoal !== null}
        onOpenChange={(open) => !open && setInviteGoal(null)}
      >
        <ModalContent>
          <ModalHeader>Invite Friends</ModalHeader>
          <ModalBody>
            <div className="grid max-h-72 gap-2 overflow-y-auto">
              {selectableInviteFriends.map((friend) => {
                const selected = inviteUserIds.includes(friend.friendId);
                return (
                  <button
                    key={friend.friendId}
                    type="button"
                    onClick={() =>
                      setInviteUserIds((current) =>
                        selected
                          ? current.filter((id) => id !== friend.friendId)
                          : [...current, friend.friendId],
                      )
                    }
                    className={cn(
                      "flex items-center gap-3 rounded-xl border p-3 text-left",
                      selected
                        ? "border-primary bg-primary/10"
                        : "border-divider hover:bg-default-100",
                    )}
                  >
                    <ParticipantAvatar
                      name={friend.friendName}
                      image={friend.friendImage}
                    />
                    <span className="flex-1 text-sm font-semibold">
                      {friend.friendName}
                    </span>
                    {selected ? (
                      <Icon
                        icon="mdi:check-circle"
                        className="h-5 w-5 text-primary"
                      />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setInviteGoal(null)}>
              Cancel
            </Button>
            <Button
              color="primary"
              isDisabled={inviteUserIds.length === 0}
              isLoading={inviteMutation.isPending}
              onPress={() => {
                if (!inviteGoal) return;
                inviteMutation.mutate({
                  sharedGoalId: inviteGoal.id,
                  userIds: inviteUserIds,
                });
              }}
            >
              Send Invitations
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
}
