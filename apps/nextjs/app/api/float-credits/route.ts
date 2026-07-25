import { getDb } from "@habit/db";
import { NextResponse } from "next/server";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";
import {
  EMPTY_FLOAT_CREDIT_SUMMARY,
  getFloatCreditSummary,
} from "@/lib/float-credits";

export async function GET(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDb();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    return NextResponse.json(await getFloatCreditSummary(db, user.id));
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    return NextResponse.json(EMPTY_FLOAT_CREDIT_SUMMARY);
  }
}
