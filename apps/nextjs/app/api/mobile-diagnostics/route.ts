import { NextResponse } from "next/server";
import { z } from "zod";

const diagnosticValueSchema = z.union([
  z.boolean(),
  z.number().finite(),
  z.string().max(500),
  z.null(),
]);

const diagnosticSchema = z.object({
  details: z
    .record(z.string().max(80), diagnosticValueSchema)
    .refine((details) => Object.keys(details).length <= 30)
    .optional(),
  event: z.string().min(1).max(120),
  message: z.string().max(2_000).optional(),
});

export async function POST(request: Request) {
  try {
    const data = diagnosticSchema.parse(await request.json());

    // Keep this endpoint independent from Better Auth. It is used to diagnose
    // auth/database failures, so requiring a session here would create another
    // database request during the outage we are trying to observe.
    console.error(
      "[Mobile Diagnostic]",
      JSON.stringify({
        ...data,
        receivedAt: new Date().toISOString(),
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[Mobile Diagnostic] Failed to record diagnostic", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
