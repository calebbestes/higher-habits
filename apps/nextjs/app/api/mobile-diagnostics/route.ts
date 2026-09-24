import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const diagnosticSchema = z.object({
  details: z.record(z.string(), z.unknown()).optional(),
  event: z.string().min(1).max(120),
  message: z.string().max(2_000).optional(),
});

export async function POST(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const data = diagnosticSchema.parse(await request.json());

    console.error(
      "[Mobile Diagnostic]",
      JSON.stringify({
        ...data,
        receivedAt: new Date().toISOString(),
        userId: user.id,
      }),
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;
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
