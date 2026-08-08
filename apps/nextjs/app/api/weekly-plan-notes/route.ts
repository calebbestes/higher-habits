import { getDb, weeklyPlanNoteHeaders, weeklyPlanNotes } from "@habit/db";
import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const bodySchema = z.object({
  weekStartDate: dateKeySchema,
  notes: z.string().max(100_000).default(""),
});

const getDatabase = () => getDb() ?? null;

function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function extractHeadingTexts(html: string): string[] {
  const headings = new Map<string, string>();
  const matches = html.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi);
  for (const match of matches) {
    const text = decodeHtml(
      match[1]
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " "),
    );
    if (!text) continue;
    const key = text.toLocaleLowerCase();
    if (!headings.has(key)) headings.set(key, text.slice(0, 160));
  }
  return [...headings.values()];
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
    const weekStartDate = dateKeySchema.parse(
      url.searchParams.get("weekStartDate"),
    );

    const [row] = await db
      .select({
        notes: weeklyPlanNotes.notes,
        weekStartDate: weeklyPlanNotes.weekStartDate,
      })
      .from(weeklyPlanNotes)
      .where(
        and(
          eq(weeklyPlanNotes.userId, user.id),
          eq(weeklyPlanNotes.weekStartDate, weekStartDate),
        ),
      )
      .limit(1);

    return NextResponse.json(row ?? { notes: "", weekStartDate });
  } catch (error) {
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
    const headingTexts = extractHeadingTexts(data.notes);
    const [row] = await db
      .insert(weeklyPlanNotes)
      .values({
        notes: data.notes,
        userId: user.id,
        weekStartDate: data.weekStartDate,
      })
      .onConflictDoUpdate({
        target: [weeklyPlanNotes.userId, weeklyPlanNotes.weekStartDate],
        set: {
          notes: data.notes,
          updatedAt: new Date(),
        },
      })
      .returning({
        notes: weeklyPlanNotes.notes,
        weekStartDate: weeklyPlanNotes.weekStartDate,
      });

    for (const text of headingTexts) {
      await db
        .insert(weeklyPlanNoteHeaders)
        .values({ text, userId: user.id })
        .onConflictDoUpdate({
          target: [weeklyPlanNoteHeaders.userId, weeklyPlanNoteHeaders.text],
          set: { updatedAt: new Date() },
        });
    }

    return NextResponse.json(row);
  } catch (error) {
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
