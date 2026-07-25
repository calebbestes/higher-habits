import {
  type FloatCreditActionType,
  floatCreditProgress,
  floatCreditTransactions,
  type getDb,
} from "@habit/db";
import { and, desc, eq, isNull, sql, sum } from "drizzle-orm";
import { NextResponse } from "next/server";

type Database = NonNullable<ReturnType<typeof getDb>>;

export type FloatCreditAward = {
  actionType: FloatCreditActionType;
  amount: number;
  description: string;
};

type AwardCreditsInput = {
  actionDate: string;
  actionType: FloatCreditActionType;
  amount: number;
  description: string;
  metadata?: Record<string, unknown>;
  sourceId: string;
  sourceType: string;
  userId: string;
};

type ReverseCreditsInput = {
  actionDate?: string;
  actionType: FloatCreditActionType;
  sourceId: string;
  sourceType: string;
  userId: string;
};

const ACTION_AMOUNTS = {
  comment: 1,
  daily_plan: 1,
  goal_checkpoint_complete: 1,
  habit_complete: 1,
  incentive_create: 3,
  monthly_plan: 5,
  post: 3,
  shared_goal_create: 3,
  task_complete: 1,
} satisfies Record<FloatCreditActionType, number>;

const ACTION_DESCRIPTIONS = {
  comment: "Commented on a friend's post",
  daily_plan: "Planned 5 events in a day",
  goal_checkpoint_complete: "Completed a goal checkpoint",
  habit_complete: "Completed a habit",
  incentive_create: "Created an incentive",
  monthly_plan: "Planned 10 events in a month",
  post: "Added proof to a completed habit or goal",
  shared_goal_create: "Created a shared goal",
  task_complete: "Completed a task",
} satisfies Record<FloatCreditActionType, string>;

export const FLOAT_CREDIT_REWARDS = [
  {
    id: "theme-unlocks",
    title: "Theme Unlocks",
    description: "Unlock future app themes, icon styles, and chip looks.",
    creditCost: 20,
    status: "coming_soon",
  },
  {
    id: "monthly-reward-offer",
    title: "Monthly Reward Offer",
    description:
      "Redeem credits for eligible monthly app rewards and offers when available.",
    creditCost: 150,
    status: "coming_soon",
  },
  {
    id: "profile-flair",
    title: "Profile Flair",
    description:
      "Add a credit-earned profile badge when profile flair launches.",
    creditCost: 50,
    status: "coming_soon",
  },
] as const;

export const EMPTY_FLOAT_CREDIT_SUMMARY = {
  balance: 0,
  lifetimeEarned: 0,
  recent: [],
  rewards: FLOAT_CREDIT_REWARDS,
};

export function getLocalDateKeyFromRequest(
  request: Request,
  date = new Date(),
) {
  const timeZone =
    request.headers.get("x-client-time-zone") ||
    request.headers.get("x-time-zone") ||
    "America/Denver";

  try {
    return formatDateInTimeZone(date, timeZone);
  } catch {
    return formatDateInTimeZone(date, "America/Denver");
  }
}

export function getMonthKeyFromDateKey(dateKey: string) {
  return dateKey.slice(0, 7);
}

export async function awardFloatCredits(
  db: Database,
  input: AwardCreditsInput,
): Promise<FloatCreditAward | null> {
  const dailyAwardKey = `${input.actionType}:${input.actionDate}`;
  const [transaction] = await db
    .insert(floatCreditTransactions)
    .values({
      actionDate: input.actionDate,
      actionType: input.actionType,
      amount: input.amount,
      dailyAwardKey,
      description: input.description,
      metadata: input.metadata,
      sourceId: input.sourceId,
      sourceType: input.sourceType,
      userId: input.userId,
    })
    .onConflictDoNothing({
      target: [
        floatCreditTransactions.userId,
        floatCreditTransactions.dailyAwardKey,
      ],
    })
    .returning({
      actionType: floatCreditTransactions.actionType,
      amount: floatCreditTransactions.amount,
      description: floatCreditTransactions.description,
    });

  if (!transaction || transaction.amount <= 0) return null;

  return {
    actionType: transaction.actionType as FloatCreditActionType,
    amount: transaction.amount,
    description: transaction.description,
  };
}

export async function awardCreditAction(
  db: Database,
  input: Omit<AwardCreditsInput, "amount" | "description">,
) {
  return awardFloatCredits(db, {
    ...input,
    amount: ACTION_AMOUNTS[input.actionType],
    description: ACTION_DESCRIPTIONS[input.actionType],
  });
}

export async function reverseFloatCredits(
  db: Database,
  input: ReverseCreditsInput,
): Promise<FloatCreditAward | null> {
  const [award] = await db
    .select({
      actionDate: floatCreditTransactions.actionDate,
      id: floatCreditTransactions.id,
      amount: floatCreditTransactions.amount,
      description: floatCreditTransactions.description,
    })
    .from(floatCreditTransactions)
    .where(
      and(
        eq(floatCreditTransactions.userId, input.userId),
        eq(floatCreditTransactions.actionType, input.actionType),
        input.actionDate
          ? eq(floatCreditTransactions.actionDate, input.actionDate)
          : undefined,
        eq(floatCreditTransactions.sourceType, input.sourceType),
        eq(floatCreditTransactions.sourceId, input.sourceId),
        isNull(floatCreditTransactions.reversesTransactionId),
      ),
    )
    .limit(1);

  if (!award || award.amount <= 0) return null;

  const [existingReversal] = await db
    .select({ id: floatCreditTransactions.id })
    .from(floatCreditTransactions)
    .where(eq(floatCreditTransactions.reversesTransactionId, award.id))
    .limit(1);
  if (existingReversal) return null;

  const balance = await getFloatCreditBalance(db, input.userId);
  const reversalAmount = Math.min(balance, award.amount);
  if (reversalAmount <= 0) return null;

  const [transaction] = await db
    .insert(floatCreditTransactions)
    .values({
      actionDate: award.actionDate,
      actionType: input.actionType,
      amount: -reversalAmount,
      description: `Reversed: ${award.description}`,
      reversesTransactionId: award.id,
      sourceId: input.sourceId,
      sourceType: input.sourceType,
      userId: input.userId,
    })
    .onConflictDoNothing({
      target: [floatCreditTransactions.reversesTransactionId],
    })
    .returning({
      actionType: floatCreditTransactions.actionType,
      amount: floatCreditTransactions.amount,
      description: floatCreditTransactions.description,
    });

  if (!transaction || transaction.amount >= 0) return null;

  return {
    actionType: transaction.actionType as FloatCreditActionType,
    amount: transaction.amount,
    description: transaction.description,
  };
}

export async function recordPlanCreditProgress(
  db: Database,
  {
    actionDate,
    amount,
    periodKey,
    threshold,
    type,
    userId,
  }: {
    actionDate: string;
    amount: 1 | -1;
    periodKey: string;
    threshold: number;
    type: "daily_plan" | "monthly_plan";
    userId: string;
  },
) {
  const [progress] = await db
    .insert(floatCreditProgress)
    .values({
      actionType: type,
      count: Math.max(0, amount),
      periodKey,
      userId,
    })
    .onConflictDoUpdate({
      target: [
        floatCreditProgress.userId,
        floatCreditProgress.actionType,
        floatCreditProgress.periodKey,
      ],
      set: {
        count: sql`greatest(0, ${floatCreditProgress.count} + ${amount})`,
        updatedAt: new Date(),
      },
    })
    .returning({ count: floatCreditProgress.count });

  const sourceType = "plan_threshold";
  const sourceId = `${type}:${periodKey}`;
  const awardActionDate =
    type === "monthly_plan" ? `${periodKey}-01` : actionDate;

  if ((progress?.count ?? 0) >= threshold) {
    return awardCreditAction(db, {
      actionDate: awardActionDate,
      actionType: type,
      metadata: { count: progress?.count ?? 0, threshold },
      sourceId,
      sourceType,
      userId,
    });
  }

  return reverseFloatCredits(db, {
    actionDate: awardActionDate,
    actionType: type,
    sourceId,
    sourceType,
    userId,
  });
}

export async function getFloatCreditSummary(db: Database, userId: string) {
  const [balanceRow] = await db
    .select({ total: sum(floatCreditTransactions.amount) })
    .from(floatCreditTransactions)
    .where(eq(floatCreditTransactions.userId, userId));

  const [earnedRow] = await db
    .select({ total: sum(floatCreditTransactions.amount) })
    .from(floatCreditTransactions)
    .where(
      and(
        eq(floatCreditTransactions.userId, userId),
        sql`${floatCreditTransactions.amount} > 0`,
      ),
    );

  const transactions = await db
    .select({
      id: floatCreditTransactions.id,
      actionType: floatCreditTransactions.actionType,
      actionDate: floatCreditTransactions.actionDate,
      amount: floatCreditTransactions.amount,
      description: floatCreditTransactions.description,
      createdAt: floatCreditTransactions.createdAt,
    })
    .from(floatCreditTransactions)
    .where(eq(floatCreditTransactions.userId, userId))
    .orderBy(desc(floatCreditTransactions.createdAt))
    .limit(40);

  return {
    balance: numberFromAggregate(balanceRow?.total),
    lifetimeEarned: numberFromAggregate(earnedRow?.total),
    recent: transactions.map((transaction) => ({
      id: transaction.id,
      actionType: transaction.actionType as FloatCreditActionType,
      actionDate: transaction.actionDate,
      amount: transaction.amount,
      description: transaction.description,
      createdAt: transaction.createdAt.toISOString(),
    })),
    rewards: FLOAT_CREDIT_REWARDS,
  };
}

export async function getFloatCreditBalance(db: Database, userId: string) {
  const [row] = await db
    .select({ total: sum(floatCreditTransactions.amount) })
    .from(floatCreditTransactions)
    .where(eq(floatCreditTransactions.userId, userId));

  return numberFromAggregate(row?.total);
}

export function jsonWithCreditHeaders<T>(
  body: T,
  creditEvents: Array<FloatCreditAward | null | undefined>,
  init?: ResponseInit,
) {
  const awarded = creditEvents
    .filter((event): event is FloatCreditAward => Boolean(event))
    .filter((event) => event.amount > 0);
  const headers = new Headers(init?.headers);
  const earnedAmount = awarded.reduce(
    (total, event) => total + event.amount,
    0,
  );

  if (earnedAmount > 0) {
    headers.set("X-Float-Credits-Awarded", String(earnedAmount));
    headers.set(
      "X-Float-Credits-Description",
      awarded.map((event) => event.description).join(", "),
    );
  }

  return NextResponse.json(body, { ...init, headers });
}

function formatDateInTimeZone(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

function numberFromAggregate(value: string | number | null | undefined) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  return 0;
}
