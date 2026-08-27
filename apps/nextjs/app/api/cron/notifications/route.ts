import { NextResponse } from "next/server";

import { runNotificationJobs } from "@/lib/notification-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await runNotificationJobs());
  } catch (error) {
    console.error("GET /api/cron/notifications failed", error);
    return NextResponse.json(
      { error: "Notification job failed" },
      { status: 500 },
    );
  }
}
