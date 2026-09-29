import {
  getDb,
  sharedGoalParticipants,
  sharedGoals,
  socialFeedPollOptions,
  socialFeedPollVotes,
  socialFeedPolls,
  socialFeedPostAudienceFriends,
  socialFeedPosts,
} from "@habit/db";
import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const voteSchema = z.object({ optionId: z.string().uuid() });

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  try {
    const user = await requireRequestUser(request);
    const { postId } = await params;
    const parsed = voteSchema.safeParse(await request.json());

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid poll option." },
        { status: 400 },
      );
    }

    const db = getDb();
    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const [poll] = await db
      .select({
        id: socialFeedPolls.id,
        optionId: socialFeedPollOptions.id,
        sharedGoalId: sharedGoals.id,
        sharedGoalMode: sharedGoals.mode,
      })
      .from(socialFeedPolls)
      .innerJoin(
        socialFeedPosts,
        eq(socialFeedPolls.socialFeedPostId, socialFeedPosts.id),
      )
      .innerJoin(
        socialFeedPollOptions,
        and(
          eq(socialFeedPollOptions.pollId, socialFeedPolls.id),
          eq(socialFeedPollOptions.id, parsed.data.optionId),
        ),
      )
      .leftJoin(sharedGoals, eq(socialFeedPosts.sourceId, sharedGoals.id))
      .where(
        and(
          eq(socialFeedPolls.socialFeedPostId, postId),
          eq(socialFeedPosts.kind, "shared_goal"),
        ),
      )
      .limit(1);

    if (!poll || poll.sharedGoalMode !== "competitive" || !poll.sharedGoalId) {
      return NextResponse.json({ error: "Poll not found." }, { status: 404 });
    }

    const [participant, audience] = await Promise.all([
      db
        .select({ id: sharedGoalParticipants.id })
        .from(sharedGoalParticipants)
        .where(
          and(
            eq(sharedGoalParticipants.sharedGoalId, poll.sharedGoalId),
            eq(sharedGoalParticipants.userId, user.id),
            or(
              eq(sharedGoalParticipants.status, "invited"),
              eq(sharedGoalParticipants.status, "accepted"),
            ),
          ),
        )
        .limit(1),
      db
        .select({ id: socialFeedPostAudienceFriends.id })
        .from(socialFeedPostAudienceFriends)
        .where(
          and(
            eq(socialFeedPostAudienceFriends.socialFeedPostId, postId),
            eq(socialFeedPostAudienceFriends.friendUserId, user.id),
          ),
        )
        .limit(1),
    ]);

    if (participant.length > 0 || audience.length === 0) {
      return NextResponse.json(
        { error: "Only friends of the competitors can vote." },
        { status: 403 },
      );
    }

    await db
      .insert(socialFeedPollVotes)
      .values({
        pollId: poll.id,
        optionId: poll.optionId,
        userId: user.id,
      })
      .onConflictDoUpdate({
        target: [socialFeedPollVotes.pollId, socialFeedPollVotes.userId],
        set: { optionId: poll.optionId },
      });

    return NextResponse.json({ optionId: poll.optionId });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);
    if (authErrorResponse) return authErrorResponse;

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
