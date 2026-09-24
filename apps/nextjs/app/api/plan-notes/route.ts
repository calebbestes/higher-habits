import { getDb, planNotes } from "@habit/db";
import { and, desc, eq, gte, lt, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const periodSchema = z.enum(["daily", "monthly"]);
const monthSchema = z.coerce.number().int().min(1).max(12);
const yearSchema = z.coerce.number().int().min(2000).max(2100);
const bodySchema = z.object({
  dateKey: dateKeySchema,
  notes: z.string().max(100_000).default(""),
  period: periodSchema,
});

const getDatabase = () => getDb() ?? null;

function normalizeDateKey(period: "daily" | "monthly", dateKey: string) {
  return period === "monthly" ? `${dateKey.slice(0, 7)}-01` : dateKey;
}

function getMonthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const next = new Date(year, month, 1);
  const endExclusive = `${next.getFullYear()}-${String(
    next.getMonth() + 1,
  ).padStart(2, "0")}-01`;
  return { endExclusive, start };
}

function serialize(row: {
  date: string;
  notes: string;
  period: "daily" | "monthly";
  updatedAt: Date;
}) {
  return {
    dateKey: row.date,
    notes: row.notes,
    period: row.period,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDatabase();
    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const url = new URL(request.url);
    const periodParam = url.searchParams.get("period");
    const dateKeyParam = url.searchParams.get("dateKey");
    const monthParam = url.searchParams.get("month");
    const yearParam = url.searchParams.get("year");
    const period = periodParam ? periodSchema.parse(periodParam) : undefined;
    const dateKey = dateKeyParam
      ? normalizeDateKey(period ?? "daily", dateKeySchema.parse(dateKeyParam))
      : undefined;

    if (dateKey) {
      const conditions = [
        eq(planNotes.userId, user.id),
        eq(planNotes.date, dateKey),
        ...(period ? [eq(planNotes.period, period)] : []),
      ];
      const [row] = await db
        .select({
          date: planNotes.date,
          notes: planNotes.notes,
          period: planNotes.period,
          updatedAt: planNotes.updatedAt,
        })
        .from(planNotes)
        .where(and(...conditions))
        .limit(1);

      return NextResponse.json(
        row
          ? serialize(row)
          : {
              dateKey,
              notes: "",
              period: period ?? "daily",
              updatedAt: null,
            },
      );
    }

    const conditions = [
      eq(planNotes.userId, user.id),
      ne(planNotes.notes, ""),
      ...(period ? [eq(planNotes.period, period)] : []),
    ];

    if (yearParam) {
      const year = yearSchema.parse(yearParam);
      conditions.push(
        gte(planNotes.date, `${year}-01-01`),
        lt(planNotes.date, `${year + 1}-01-01`),
      );
    }
    if (monthParam) {
      const month = monthSchema.parse(monthParam);
      const year = yearParam
        ? yearSchema.parse(yearParam)
        : new Date().getFullYear();
      const range = getMonthRange(year, month);
      conditions.push(
        gte(planNotes.date, range.start),
        lt(planNotes.date, range.endExclusive),
      );
    }

    const rows = await db
      .select({
        date: planNotes.date,
        notes: planNotes.notes,
        period: planNotes.period,
        updatedAt: planNotes.updatedAt,
      })
      .from(planNotes)
      .where(and(...conditions))
      .orderBy(desc(planNotes.date));

    return NextResponse.json(rows.map(serialize));
  } catch (error) {
    console.error("[Plan Notes] GET failed", {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDatabase();
    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const data = bodySchema.parse(await request.json());
    const dateKey = normalizeDateKey(data.period, data.dateKey);
    console.log("[Plan Notes] Saving note", {
      dateKey,
      noteLength: data.notes.length,
      period: data.period,
      userIdSuffix: user.id.slice(-8),
    });
    const [row] = await db
      .insert(planNotes)
      .values({
        date: dateKey,
        notes: data.notes,
        period: data.period,
        userId: user.id,
      })
      .onConflictDoUpdate({
        target: [planNotes.userId, planNotes.period, planNotes.date],
        set: { notes: data.notes, updatedAt: new Date() },
      })
      .returning({
        date: planNotes.date,
        notes: planNotes.notes,
        period: planNotes.period,
        updatedAt: planNotes.updatedAt,
      });

    return NextResponse.json(serialize(row));
  } catch (error) {
    console.error("[Plan Notes] POST failed", {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    });
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
