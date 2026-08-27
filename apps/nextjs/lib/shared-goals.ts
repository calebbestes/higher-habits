import {
  type HabitDb,
  goalCheckpoints,
  goalLogs,
  goals,
  habits,
  sharedGoalParticipants,
  sharedGoals,
  users,
} from "@habit/db";
import { and, desc, eq, inArray } from "drizzle-orm";

export type SharedGoalSnapshot = {
  id: string;
  ownerId: string;
  name: string;
  mode: "collaborative" | "competitive";
  scoringType:
    | "shared_streak"
    | "combined_target"
    | "first_to_target"
    | "highest_total"
    | "longest_streak"
    | "one_time";
  target: number | null;
  startsOn: string | null;
  endsOn: string | null;
  openInvite: boolean;
  status: "active" | "completed" | "archived";
  stakeType: "none" | "carrot" | "stick";
  stakeDescription: string | null;
  createdAt: string;
  updatedAt: string;
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

export type SharedGoalParticipantSnapshot = {
  id: string;
  userId: string;
  userName: string;
  userImage: string | null;
  personalGoalId: string | null;
  personalGoalName: string | null;
  personalPlanGoalId: string | null;
  personalPlanGoalName: string | null;
  personalGoalAutoCreated: boolean;
  status: "invited" | "accepted" | "declined" | "left";
  joinedAt: string | null;
  leftAt: string | null;
  completedToday: boolean;
  completedCount: number;
  currentStreak: number;
  consistencyPercent: number;
};

const mountainDateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
};

const shiftDateKey = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
};

const daysInclusive = (start: string, end: string) => {
  if (end < start) return 0;
  const [startYear, startMonth, startDay] = start.split("-").map(Number);
  const [endYear, endMonth, endDay] = end.split("-").map(Number);
  const startTime = Date.UTC(startYear, startMonth - 1, startDay);
  const endTime = Date.UTC(endYear, endMonth - 1, endDay);
  return Math.floor((endTime - startTime) / 86_400_000) + 1;
};

const calculateStreak = (
  completedDateKeys: Set<string>,
  startDateKey: string,
  endDateKey: string,
) => {
  let streak = 0;
  let dateKey = endDateKey;

  while (dateKey >= startDateKey && completedDateKeys.has(dateKey)) {
    streak += 1;
    dateKey = shiftDateKey(dateKey, -1);
  }

  return streak;
};

const clampPercent = (value: number, target: number | null) =>
  target && target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;

export async function getSharedGoalSnapshots(
  db: HabitDb,
  userId: string,
  sharedGoalId?: string,
): Promise<SharedGoalSnapshot[]> {
  const memberships = await db
    .select({ sharedGoalId: sharedGoalParticipants.sharedGoalId })
    .from(sharedGoalParticipants)
    .where(eq(sharedGoalParticipants.userId, userId));
  const ownedGoals = await db
    .select({ sharedGoalId: sharedGoals.id })
    .from(sharedGoals)
    .where(eq(sharedGoals.ownerId, userId));
  const accessibleIds = [
    ...new Set([
      ...memberships.map((membership) => membership.sharedGoalId),
      ...ownedGoals.map((goal) => goal.sharedGoalId),
    ]),
  ].filter((id) => !sharedGoalId || id === sharedGoalId);

  if (accessibleIds.length === 0) {
    return [];
  }

  const [sharedGoalRows, participantRows] = await Promise.all([
    db.select().from(sharedGoals).where(inArray(sharedGoals.id, accessibleIds)),
    db
      .select({
        id: sharedGoalParticipants.id,
        sharedGoalId: sharedGoalParticipants.sharedGoalId,
        userId: sharedGoalParticipants.userId,
        userName: users.name,
        userImage: users.image,
        personalGoalId: sharedGoalParticipants.personalGoalId,
        personalGoalAutoCreated: sharedGoalParticipants.personalGoalAutoCreated,
        personalGoalName: habits.name,
        personalPlanGoalId: sharedGoalParticipants.personalPlanGoalId,
        personalPlanGoalName: goals.title,
        status: sharedGoalParticipants.status,
        joinedAt: sharedGoalParticipants.joinedAt,
        leftAt: sharedGoalParticipants.leftAt,
      })
      .from(sharedGoalParticipants)
      .innerJoin(users, eq(sharedGoalParticipants.userId, users.id))
      .leftJoin(habits, eq(sharedGoalParticipants.personalGoalId, habits.id))
      .leftJoin(goals, eq(sharedGoalParticipants.personalPlanGoalId, goals.id))
      .where(inArray(sharedGoalParticipants.sharedGoalId, accessibleIds)),
  ]);

  const personalGoalIds = [
    ...new Set(
      participantRows.flatMap((participant) =>
        participant.personalGoalId ? [participant.personalGoalId] : [],
      ),
    ),
  ];
  const personalPlanGoalIds = [
    ...new Set(
      participantRows.flatMap((participant) =>
        participant.personalPlanGoalId ? [participant.personalPlanGoalId] : [],
      ),
    ),
  ];
  const completedLogs =
    personalGoalIds.length > 0
      ? await db
          .select({
            goalId: goalLogs.goalId,
            userId: goalLogs.userId,
            date: goalLogs.date,
          })
          .from(goalLogs)
          .where(
            and(
              inArray(goalLogs.goalId, personalGoalIds),
              eq(goalLogs.status, "complete"),
            ),
          )
          .orderBy(desc(goalLogs.date))
      : [];
  const completedPlanCheckpoints =
    personalPlanGoalIds.length > 0
      ? await db
          .select({
            goalId: goalCheckpoints.goalId,
            completedAt: goalCheckpoints.completedAt,
          })
          .from(goalCheckpoints)
          .where(inArray(goalCheckpoints.goalId, personalPlanGoalIds))
      : [];
  const planGoalCheckpointStats = new Map<
    string,
    { total: number; completed: number; latestCompletedAt: Date | null }
  >();
  for (const checkpoint of completedPlanCheckpoints) {
    const stats = planGoalCheckpointStats.get(checkpoint.goalId) ?? {
      total: 0,
      completed: 0,
      latestCompletedAt: null,
    };
    stats.total += 1;
    if (checkpoint.completedAt) {
      stats.completed += 1;
      if (
        !stats.latestCompletedAt ||
        checkpoint.completedAt > stats.latestCompletedAt
      ) {
        stats.latestCompletedAt = checkpoint.completedAt;
      }
    }
    planGoalCheckpointStats.set(checkpoint.goalId, stats);
  }
  const planGoalCompletionDates = new Map<string, string>();
  for (const [goalId, stats] of planGoalCheckpointStats) {
    if (
      stats.total > 0 &&
      stats.total === stats.completed &&
      stats.latestCompletedAt
    ) {
      planGoalCompletionDates.set(
        goalId,
        mountainDateKey(stats.latestCompletedAt),
      );
    }
  }
  const todayKey = mountainDateKey();

  return sharedGoalRows
    .map((sharedGoal) => {
      const startDateKey =
        sharedGoal.startsOn ?? mountainDateKey(sharedGoal.createdAt);
      const endDateKey =
        sharedGoal.endsOn && sharedGoal.endsOn < todayKey
          ? sharedGoal.endsOn
          : todayKey;
      const possibleDays = daysInclusive(startDateKey, endDateKey);
      const rawParticipants = participantRows.filter(
        (participant) => participant.sharedGoalId === sharedGoal.id,
      );
      const isOneTimeGoal = sharedGoal.scoringType === "one_time";
      const participantHasLinkedGoal = (
        participant: (typeof rawParticipants)[number],
      ) =>
        Boolean(
          isOneTimeGoal
            ? participant.personalPlanGoalId
            : participant.personalGoalId,
        );
      const acceptedParticipants = rawParticipants.filter(
        (participant) =>
          participant.status === "accepted" &&
          participantHasLinkedGoal(participant),
      );

      const participants = rawParticipants.map((participant) => {
        const planGoalCompletionDate = participant.personalPlanGoalId
          ? (planGoalCompletionDates.get(participant.personalPlanGoalId) ??
            null)
          : null;
        const oneTimeCompleted = Boolean(
          isOneTimeGoal &&
            planGoalCompletionDate &&
            planGoalCompletionDate >= startDateKey &&
            planGoalCompletionDate <= endDateKey,
        );
        const dateKeys = new Set(
          isOneTimeGoal
            ? oneTimeCompleted && planGoalCompletionDate
              ? [planGoalCompletionDate]
              : []
            : completedLogs
                .filter(
                  (log) =>
                    log.goalId === participant.personalGoalId &&
                    log.userId === participant.userId &&
                    log.date >= startDateKey &&
                    log.date <= endDateKey,
                )
                .map((log) => log.date),
        );
        const completedCount = isOneTimeGoal
          ? oneTimeCompleted
            ? 1
            : 0
          : dateKeys.size;

        return {
          id: participant.id,
          userId: participant.userId,
          userName: participant.userName,
          userImage: participant.userImage,
          personalGoalId: participant.personalGoalId,
          personalGoalName: participant.personalGoalName,
          personalPlanGoalId: participant.personalPlanGoalId,
          personalPlanGoalName: participant.personalPlanGoalName,
          personalGoalAutoCreated: participant.personalGoalAutoCreated,
          status: participant.status,
          joinedAt: participant.joinedAt?.toISOString() ?? null,
          leftAt: participant.leftAt?.toISOString() ?? null,
          completedToday: isOneTimeGoal
            ? oneTimeCompleted
            : dateKeys.has(todayKey),
          completedCount,
          currentStreak: isOneTimeGoal
            ? completedCount
            : calculateStreak(dateKeys, startDateKey, endDateKey),
          consistencyPercent: isOneTimeGoal
            ? completedCount > 0
              ? 100
              : 0
            : possibleDays > 0
              ? Math.min(100, Math.round((dateKeys.size / possibleDays) * 100))
              : 0,
        } satisfies SharedGoalParticipantSnapshot;
      });
      const acceptedSnapshots = participants.filter(
        (participant) =>
          participant.status === "accepted" &&
          (isOneTimeGoal
            ? participant.personalPlanGoalId
            : participant.personalGoalId),
      );
      const completedToday = acceptedSnapshots.filter(
        (participant) => participant.completedToday,
      ).length;
      const totalCompletions = acceptedSnapshots.reduce(
        (total, participant) => total + participant.completedCount,
        0,
      );
      const maxCompletions = Math.max(
        0,
        ...acceptedSnapshots.map((participant) => participant.completedCount),
      );
      const maxStreak = Math.max(
        0,
        ...acceptedSnapshots.map((participant) => participant.currentStreak),
      );
      const sharedCompletedDates = new Set<string>();

      if (!isOneTimeGoal && acceptedParticipants.length > 0) {
        for (
          let dateKey = startDateKey;
          dateKey <= endDateKey;
          dateKey = shiftDateKey(dateKey, 1)
        ) {
          const everyoneCompleted = acceptedParticipants.every((participant) =>
            completedLogs.some(
              (log) =>
                log.goalId === participant.personalGoalId &&
                log.userId === participant.userId &&
                log.date === dateKey,
            ),
          );
          if (everyoneCompleted) sharedCompletedDates.add(dateKey);
        }
      }

      let progressValue = totalCompletions;
      let progressTarget: number | null = sharedGoal.target;
      let leaderMetric:
        | "completedCount"
        | "consistencyPercent"
        | "currentStreak" = "completedCount";

      if (sharedGoal.scoringType === "one_time") {
        const completedParticipantCount = acceptedSnapshots.filter(
          (participant) => participant.completedCount > 0,
        ).length;
        progressValue =
          sharedGoal.mode === "collaborative"
            ? completedParticipantCount
            : maxCompletions;
        progressTarget =
          sharedGoal.mode === "collaborative"
            ? acceptedSnapshots.length || null
            : 1;
      } else if (sharedGoal.scoringType === "shared_streak") {
        // A shared streak only continues while every accepted participant
        // completes the goal on consecutive days.
        progressValue = calculateStreak(
          sharedCompletedDates,
          startDateKey,
          endDateKey,
        );
        progressTarget = sharedGoal.target ?? 7;
      } else if (sharedGoal.scoringType === "first_to_target") {
        progressValue = maxCompletions;
        progressTarget = sharedGoal.target ?? 7;
      } else if (sharedGoal.scoringType === "highest_total") {
        progressValue = maxCompletions;
      } else if (sharedGoal.scoringType === "longest_streak") {
        progressValue = maxStreak;
        progressTarget = sharedGoal.target ?? 7;
        leaderMetric = "currentStreak";
      } else {
        progressTarget = sharedGoal.target ?? 30;
      }

      const leaderValue = Math.max(
        0,
        ...acceptedSnapshots.map((participant) => participant[leaderMetric]),
      );
      const leaderUserIds =
        sharedGoal.mode === "competitive" && leaderValue > 0
          ? acceptedSnapshots
              .filter(
                (participant) => participant[leaderMetric] === leaderValue,
              )
              .map((participant) => participant.userId)
          : [];
      const participantByGoalId = new Map(
        acceptedSnapshots.flatMap((participant) =>
          participant.personalGoalId
            ? [[participant.personalGoalId, participant] as const]
            : [],
        ),
      );
      const recentLogActivity = completedLogs
        .filter((log) => {
          const participant = participantByGoalId.get(log.goalId);
          return (
            participant &&
            participant.userId === log.userId &&
            log.date >= startDateKey &&
            log.date <= endDateKey
          );
        })
        .slice(0, 12)
        .map((log) => {
          const participant = participantByGoalId.get(log.goalId);
          return {
            userId: log.userId,
            userName: participant?.userName ?? "Participant",
            userImage: participant?.userImage ?? null,
            goalName: participant?.personalGoalName ?? sharedGoal.name,
            dateKey: log.date,
          };
        });
      const recentPlanGoalActivity = isOneTimeGoal
        ? acceptedSnapshots.flatMap((participant) => {
            const dateKey = participant.personalPlanGoalId
              ? planGoalCompletionDates.get(participant.personalPlanGoalId)
              : null;
            return participant.completedCount > 0 && dateKey
              ? [
                  {
                    userId: participant.userId,
                    userName: participant.userName,
                    userImage: participant.userImage,
                    goalName:
                      participant.personalPlanGoalName ?? sharedGoal.name,
                    dateKey,
                  },
                ]
              : [];
          })
        : [];
      const recentActivity = [...recentLogActivity, ...recentPlanGoalActivity]
        .sort((left, right) => right.dateKey.localeCompare(left.dateKey))
        .slice(0, 12);

      return {
        id: sharedGoal.id,
        ownerId: sharedGoal.ownerId,
        name: sharedGoal.name,
        mode: sharedGoal.mode,
        scoringType: sharedGoal.scoringType,
        target: sharedGoal.target,
        startsOn: sharedGoal.startsOn,
        endsOn: sharedGoal.endsOn,
        openInvite: sharedGoal.openInvite,
        status: sharedGoal.status,
        stakeType: sharedGoal.stakeType,
        stakeDescription: sharedGoal.stakeDescription,
        createdAt: sharedGoal.createdAt.toISOString(),
        updatedAt: sharedGoal.updatedAt.toISOString(),
        canManage: sharedGoal.ownerId === userId,
        currentUserParticipant:
          participants.find((participant) => participant.userId === userId) ??
          null,
        participants,
        progress: {
          value: progressValue,
          target: progressTarget,
          percent: clampPercent(progressValue, progressTarget),
          completedToday,
          acceptedParticipants: acceptedSnapshots.length,
          leaderUserIds,
        },
        recentActivity,
      } satisfies SharedGoalSnapshot;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
