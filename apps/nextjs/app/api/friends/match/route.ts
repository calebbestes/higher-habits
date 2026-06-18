import { friends, getDb, users } from "@habit/db";
import { and, eq, inArray, ne, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

// Match a user's device contacts against app users they aren't already
// connected to. Contact identifiers are normalized and used only for this
// lookup — they are not stored.
const matchSchema = z.object({
  emails: z.array(z.string()).max(2000).default([]),
  phones: z.array(z.string()).max(2000).default([]),
});

const getDatabase = () => getDb() ?? null;

// Keep the last 10 digits so different formattings of the same number match.
function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 ? digits.slice(-10) : null;
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

    const body = await request.json().catch(() => null);
    const parsed = matchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const emails = [
      ...new Set(
        parsed.data.emails
          .map((email) => email.trim().toLowerCase())
          .filter((email) => email.includes("@")),
      ),
    ];
    const phones = [
      ...new Set(
        parsed.data.phones
          .map(normalizePhone)
          .filter((phone): phone is string => phone !== null),
      ),
    ];

    if (emails.length === 0 && phones.length === 0) {
      return NextResponse.json([]);
    }

    const matchConditions = [];
    if (emails.length > 0) {
      matchConditions.push(inArray(sql`lower(${users.email})`, emails));
    }
    if (phones.length > 0) {
      matchConditions.push(
        inArray(
          sql`right(regexp_replace(coalesce(${users.phoneNumber}, ''), '[^0-9]', '', 'g'), 10)`,
          phones,
        ),
      );
    }

    const candidates = await db
      .select({
        userId: users.id,
        name: users.name,
        email: users.email,
        image: users.image,
      })
      .from(users)
      .where(and(ne(users.id, user.id), or(...matchConditions)));

    if (candidates.length === 0) {
      return NextResponse.json([]);
    }

    // Exclude anyone already connected (any direction, any status).
    const existing = await db
      .select({ userId1: friends.userId1, userId2: friends.userId2 })
      .from(friends)
      .where(or(eq(friends.userId1, user.id), eq(friends.userId2, user.id)));

    const connectedIds = new Set<string>();
    for (const row of existing) {
      connectedIds.add(row.userId1 === user.id ? row.userId2 : row.userId1);
    }

    return NextResponse.json(
      candidates.filter((candidate) => !connectedIds.has(candidate.userId)),
    );
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
