import { contacts, getDb } from "@habit/db";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const contactFields = {
  name: z.string().min(1),
  company: z.string().default(""),
  phone: z.string().default(""),
  email: z.string().default(""),
  category: z.string().default(""),
  team: z.string().default(""),
  status: z.string().default(""),
  priority: z.string().default(""),
  lastResponse: z.string().nullable().default(null),
  lastContacted: z.string().nullable().default(null),
  notes: z.string().default(""),
};

const createSchema = z.object({ type: z.literal("create"), ...contactFields });
const updateSchema = z.object({ type: z.literal("update"), id: z.string().uuid(), ...contactFields });
const deleteSchema = z.object({ type: z.literal("delete"), id: z.string().uuid() });
const deleteManySchema = z.object({ type: z.literal("deleteMany"), ids: z.array(z.string().uuid()).min(1) });

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

export async function GET() {
  const db = getDatabase();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });
  const rows = await db.select().from(contacts).orderBy(asc(contacts.name));
  return NextResponse.json(rows);
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const db = getDatabase();
  if (!db) return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const data = parsed.data;

  const contactValues = (d: typeof createSchema._type | typeof updateSchema._type) => ({
    name: d.name,
    company: d.company,
    phone: d.phone,
    email: d.email,
    category: d.category,
    team: d.team,
    status: d.status,
    priority: d.priority,
    lastResponse: d.lastResponse ?? null,
    lastContacted: d.lastContacted ?? null,
    notes: d.notes,
  });

  if (data.type === "create") {
    const [row] = await db.insert(contacts).values(contactValues(data)).returning();
    return NextResponse.json(row);
  }

  if (data.type === "update") {
    const [row] = await db
      .update(contacts)
      .set({ ...contactValues(data), updatedAt: new Date() })
      .where(eq(contacts.id, data.id))
      .returning();
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  }

  if (data.type === "delete") {
    await db.delete(contacts).where(eq(contacts.id, data.id));
    return NextResponse.json({ ok: true });
  }

  if (data.type === "deleteMany") {
    for (const id of data.ids) await db.delete(contacts).where(eq(contacts.id, id));
    return NextResponse.json({ ok: true });
  }
}
