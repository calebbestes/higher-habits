import { categories, goals, getDb } from "@habit/db";
import { asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

const goalFields = {
  name: z.string().min(1),
  frequencyGoal: z.number().int().positive().nullable().default(null),
  period: z
    .union([z.enum(["daily", "weekly", "monthly"]), z.null()])
    .default(null),
  categoryId: z.string().uuid(),
  priority: z.enum(["high", "medium", "low"]),
  iconKey: z.string().default(""),
  hidden: z.boolean().default(false),
};

const createSchema = z.object({ type: z.literal("create"), ...goalFields });
const updateSchema = z.object({
  type: z.literal("update"),
  id: z.string().uuid(),
  ...goalFields,
});
const deleteManySchema = z.object({
  type: z.literal("deleteMany"),
  ids: z.array(z.string().uuid()).min(1),
});

const bodySchema = z.discriminatedUnion("type", [
  createSchema,
  updateSchema,
  deleteManySchema,
]);

const getDatabase = () => {
  const db = getDb();
  if (!db) return null;
  return db;
};

export async function GET() {
  const db = getDatabase();
  if (!db)
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const rows = await db
    .select({
      id: goals.id,
      name: goals.name,
      frequencyGoal: goals.frequencyGoal,
      period: goals.period,
      categoryId: goals.categoryId,
      categoryName: categories.name,
      categoryIcon: categories.icon,
      priority: goals.priority,
      iconKey: goals.iconKey,
      hidden: goals.hidden,
      createdAt: goals.createdAt,
      updatedAt: goals.updatedAt,
    })
    .from(goals)
    .leftJoin(categories, eq(goals.categoryId, categories.id))
    .orderBy(asc(goals.name));

  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      categoryName: r.categoryName ?? "",
      categoryIcon: r.categoryIcon ?? "",
    })),
  );
}

export async function POST(request: Request) {
  const body = await request.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });

  const db = getDatabase();
  if (!db)
    return NextResponse.json({ error: "Database unavailable" }, { status: 503 });

  const data = parsed.data;

  const goalValues = (
    d: typeof createSchema._type | typeof updateSchema._type,
  ) => ({
    name: d.name,
    frequencyGoal: d.frequencyGoal,
    period: d.period,
    categoryId: d.categoryId,
    priority: d.priority,
    iconKey: d.iconKey,
    hidden: d.hidden,
  });

  if (data.type === "create") {
    const [row] = await db
      .insert(goals)
      .values(goalValues(data))
      .returning({ id: goals.id });
    if (!row) return NextResponse.json({ error: "Insert failed" }, { status: 500 });

    const [full] = await db
      .select({
        id: goals.id,
        name: goals.name,
        frequencyGoal: goals.frequencyGoal,
        period: goals.period,
        categoryId: goals.categoryId,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        priority: goals.priority,
        iconKey: goals.iconKey,
        hidden: goals.hidden,
        createdAt: goals.createdAt,
        updatedAt: goals.updatedAt,
      })
      .from(goals)
      .leftJoin(categories, eq(goals.categoryId, categories.id))
      .where(eq(goals.id, row.id));

    return NextResponse.json({
      ...full,
      categoryName: full?.categoryName ?? "",
      categoryIcon: full?.categoryIcon ?? "",
    });
  }

  if (data.type === "update") {
    await db
      .update(goals)
      .set({ ...goalValues(data), updatedAt: new Date() })
      .where(eq(goals.id, data.id));

    const [full] = await db
      .select({
        id: goals.id,
        name: goals.name,
        frequencyGoal: goals.frequencyGoal,
        period: goals.period,
        categoryId: goals.categoryId,
        categoryName: categories.name,
        categoryIcon: categories.icon,
        priority: goals.priority,
        iconKey: goals.iconKey,
        hidden: goals.hidden,
        createdAt: goals.createdAt,
        updatedAt: goals.updatedAt,
      })
      .from(goals)
      .leftJoin(categories, eq(goals.categoryId, categories.id))
      .where(eq(goals.id, data.id));

    if (!full) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({
      ...full,
      categoryName: full.categoryName ?? "",
      categoryIcon: full.categoryIcon ?? "",
    });
  }

  if (data.type === "deleteMany") {
    for (const id of data.ids) await db.delete(goals).where(eq(goals.id, id));
    return NextResponse.json({ ok: true });
  }
}
