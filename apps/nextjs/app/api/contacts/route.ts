import { contacts, getDb } from "@habit/db";
import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const dateKeySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const contactFields = {
  name: z.string().min(1),
  organization: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().default(""),
  contactCategoryId: z.string().uuid().nullable().default(null),
  contactStatusId: z.string().uuid().nullable().default(null),
  priority: z.string().default(""),
  nextContactDate: dateKeySchema.nullable().default(null),
  lastContactAttempt: dateKeySchema.nullable().default(null),
  lastContacted: dateKeySchema.nullable().default(null),
  notes: z.string().default(""),
};

const createSchema = z.object({ type: z.literal("create"), ...contactFields });
const updateSchema = z.object({
  type: z.literal("update"),
  id: z.string().uuid(),
  ...contactFields,
});
const deleteSchema = z.object({
  type: z.literal("delete"),
  id: z.string().uuid(),
});
const deleteManySchema = z.object({
  type: z.literal("deleteMany"),
  ids: z.array(z.string().uuid()).min(1),
});

const bodySchema = z.discriminatedUnion("type", [
  createSchema,
  updateSchema,
  deleteSchema,
  deleteManySchema,
]);

const getDatabase = () => {
  const db = getDb();
  if (!db) return null;
  return db;
};

function mountainTodayDateKey(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Denver",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${value("year")}-${value("month")}-${value("day")}`;
}

function resolveLastContactAttempt(
  lastContactAttempt: string | null,
  lastContacted: string | null,
  fallback: string,
) {
  const attempt = lastContactAttempt ?? fallback;

  if (lastContacted && lastContacted > attempt) {
    return lastContacted;
  }

  return attempt;
}

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDatabase();
    if (!db)
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    const rows = await db
      .select()
      .from(contacts)
      .where(eq(contacts.userId, user.id))
      .orderBy(asc(contacts.name));
    return NextResponse.json(rows);
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.message },
        { status: 400 },
      );

    const db = getDatabase();
    if (!db)
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );

    const data = parsed.data;

    const contactValues = (
      d: typeof createSchema._type | typeof updateSchema._type,
      lastContactAttempt: string,
    ) => ({
      userId: user.id,
      name: d.name,
      organization: d.organization,
      phone: d.phone,
      email: d.email,
      contactCategoryId: d.contactCategoryId ?? null,
      contactStatusId: d.contactStatusId ?? null,
      priority: d.priority,
      nextContactDate: d.nextContactDate ?? null,
      lastContactAttempt,
      lastContacted: d.lastContacted ?? null,
      notes: d.notes,
    });

    if (data.type === "create") {
      const lastContactAttempt = resolveLastContactAttempt(
        data.lastContactAttempt,
        data.lastContacted,
        mountainTodayDateKey(),
      );
      const [row] = await db
        .insert(contacts)
        .values(contactValues(data, lastContactAttempt))
        .returning();
      return NextResponse.json(row);
    }

    if (data.type === "update") {
      const [existing] = await db
        .select({ lastContactAttempt: contacts.lastContactAttempt })
        .from(contacts)
        .where(and(eq(contacts.id, data.id), eq(contacts.userId, user.id)));

      if (!existing)
        return NextResponse.json({ error: "Not found" }, { status: 404 });

      const lastContactAttempt = resolveLastContactAttempt(
        data.lastContactAttempt,
        data.lastContacted,
        existing.lastContactAttempt,
      );
      const [row] = await db
        .update(contacts)
        .set({
          ...contactValues(data, lastContactAttempt),
          updatedAt: new Date(),
        })
        .where(and(eq(contacts.id, data.id), eq(contacts.userId, user.id)))
        .returning();
      if (!row)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(row);
    }

    if (data.type === "delete") {
      await db
        .delete(contacts)
        .where(and(eq(contacts.id, data.id), eq(contacts.userId, user.id)));
      return NextResponse.json({ ok: true });
    }

    if (data.type === "deleteMany") {
      for (const id of data.ids) {
        await db
          .delete(contacts)
          .where(and(eq(contacts.id, id), eq(contacts.userId, user.id)));
      }
      return NextResponse.json({ ok: true });
    }
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
