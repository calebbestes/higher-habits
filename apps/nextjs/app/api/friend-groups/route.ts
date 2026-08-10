import {
  friendGroupMembers,
  friendGroups,
  friends,
  getDb,
  users,
} from "@habit/db";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";

import { requireRequestUser, toAuthErrorResponse } from "@/lib/auth";

const createFriendGroupSchema = z.object({
  name: z.string().trim().min(1).max(48),
  memberIds: z.array(z.string().min(1)).min(1).max(50),
});
const updateFriendGroupSchema = createFriendGroupSchema.extend({
  id: z.string().uuid(),
});

const getDatabase = () => getDb() ?? null;

type FriendGroupMemberRow = {
  groupId: string;
  id: string;
  name: string;
  image: string | null;
  phoneNumber: string | null;
};

function toFriendGroupRows(
  groups: Array<{
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
  }>,
  members: FriendGroupMemberRow[],
) {
  const membersByGroupId = new Map<string, FriendGroupMemberRow[]>();

  for (const member of members) {
    membersByGroupId.set(member.groupId, [
      ...(membersByGroupId.get(member.groupId) ?? []),
      member,
    ]);
  }

  return groups.map((group) => ({
    id: group.id,
    name: group.name,
    createdAt: group.createdAt.toISOString(),
    updatedAt: group.updatedAt.toISOString(),
    members: (membersByGroupId.get(group.id) ?? []).map((member) => ({
      id: member.id,
      name: member.name,
      image: member.image,
      phoneNumber: member.phoneNumber,
    })),
  }));
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

    const groupRows = await db
      .select({
        id: friendGroups.id,
        name: friendGroups.name,
        createdAt: friendGroups.createdAt,
        updatedAt: friendGroups.updatedAt,
      })
      .from(friendGroups)
      .where(eq(friendGroups.ownerId, user.id))
      .orderBy(asc(friendGroups.name));
    const groupIds = groupRows.map((group) => group.id);
    const memberRows =
      groupIds.length > 0
        ? await db
            .select({
              groupId: friendGroupMembers.groupId,
              id: users.id,
              name: users.name,
              image: users.image,
              phoneNumber: users.phoneNumber,
            })
            .from(friendGroupMembers)
            .innerJoin(users, eq(friendGroupMembers.memberUserId, users.id))
            .where(inArray(friendGroupMembers.groupId, groupIds))
            .orderBy(asc(users.name))
        : [];

    return NextResponse.json(toFriendGroupRows(groupRows, memberRows));
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
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

    const parsed = createFriendGroupSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.message },
        { status: 400 },
      );
    }

    const memberIds = [...new Set(parsed.data.memberIds)].filter(
      (memberId) => memberId !== user.id,
    );

    if (memberIds.length === 0) {
      return NextResponse.json(
        { error: "Choose at least one friend." },
        { status: 400 },
      );
    }

    const acceptedRows = await db
      .select({
        id: users.id,
        name: users.name,
        image: users.image,
        phoneNumber: users.phoneNumber,
      })
      .from(friends)
      .innerJoin(
        users,
        or(
          and(eq(friends.userId1, user.id), eq(friends.userId2, users.id)),
          and(eq(friends.userId2, user.id), eq(friends.userId1, users.id)),
        ),
      )
      .where(
        and(
          eq(friends.status, "accepted"),
          or(
            and(
              eq(friends.userId1, user.id),
              inArray(friends.userId2, memberIds),
            ),
            and(
              eq(friends.userId2, user.id),
              inArray(friends.userId1, memberIds),
            ),
          ),
        ),
      );
    const acceptedIds = new Set(acceptedRows.map((row) => row.id));

    if (memberIds.some((memberId) => !acceptedIds.has(memberId))) {
      return NextResponse.json(
        { error: "Groups can only include accepted friends." },
        { status: 400 },
      );
    }

    const group = await db.transaction(async (tx) => {
      const [createdGroup] = await tx
        .insert(friendGroups)
        .values({
          ownerId: user.id,
          name: parsed.data.name,
        })
        .returning({
          id: friendGroups.id,
          name: friendGroups.name,
          createdAt: friendGroups.createdAt,
          updatedAt: friendGroups.updatedAt,
        });

      if (!createdGroup) {
        throw new Error("Could not create group.");
      }

      await tx.insert(friendGroupMembers).values(
        memberIds.map((memberId) => ({
          groupId: createdGroup.id,
          memberUserId: memberId,
        })),
      );

      return createdGroup;
    });
    const memberOrder = new Map(
      memberIds.map((memberId, index) => [memberId, index]),
    );

    return NextResponse.json({
      id: group.id,
      name: group.name,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
      members: acceptedRows
        .sort(
          (left, right) =>
            (memberOrder.get(left.id) ?? 0) - (memberOrder.get(right.id) ?? 0),
        )
        .map((member) => ({
          id: member.id,
          name: member.name,
          image: member.image,
          phoneNumber: member.phoneNumber,
        })),
    });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
    }

    const message = error instanceof Error ? error.message : "";
    if (message.includes("friend_groups_owner_id_name_uidx")) {
      return NextResponse.json(
        { error: "You already have a group with that name." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireRequestUser(request);
    const db = getDatabase();

    if (!db) {
      return NextResponse.json(
        { error: "Database unavailable" },
        { status: 503 },
      );
    }

    const parsed = updateFriendGroupSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.message },
        { status: 400 },
      );
    }

    const memberIds = [...new Set(parsed.data.memberIds)].filter(
      (memberId) => memberId !== user.id,
    );

    if (memberIds.length === 0) {
      return NextResponse.json(
        { error: "Choose at least one friend." },
        { status: 400 },
      );
    }

    const [existingGroup] = await db
      .select({ id: friendGroups.id })
      .from(friendGroups)
      .where(
        and(eq(friendGroups.id, parsed.data.id), eq(friendGroups.ownerId, user.id)),
      )
      .limit(1);

    if (!existingGroup) {
      return NextResponse.json(
        { error: "Group not found." },
        { status: 404 },
      );
    }

    const acceptedRows = await db
      .select({
        id: users.id,
        name: users.name,
        image: users.image,
        phoneNumber: users.phoneNumber,
      })
      .from(friends)
      .innerJoin(
        users,
        or(
          and(eq(friends.userId1, user.id), eq(friends.userId2, users.id)),
          and(eq(friends.userId2, user.id), eq(friends.userId1, users.id)),
        ),
      )
      .where(
        and(
          eq(friends.status, "accepted"),
          or(
            and(
              eq(friends.userId1, user.id),
              inArray(friends.userId2, memberIds),
            ),
            and(
              eq(friends.userId2, user.id),
              inArray(friends.userId1, memberIds),
            ),
          ),
        ),
      );
    const acceptedIds = new Set(acceptedRows.map((row) => row.id));

    if (memberIds.some((memberId) => !acceptedIds.has(memberId))) {
      return NextResponse.json(
        { error: "Groups can only include accepted friends." },
        { status: 400 },
      );
    }

    const group = await db.transaction(async (tx) => {
      const [updatedGroup] = await tx
        .update(friendGroups)
        .set({ name: parsed.data.name, updatedAt: new Date() })
        .where(
          and(
            eq(friendGroups.id, parsed.data.id),
            eq(friendGroups.ownerId, user.id),
          ),
        )
        .returning({
          id: friendGroups.id,
          name: friendGroups.name,
          createdAt: friendGroups.createdAt,
          updatedAt: friendGroups.updatedAt,
        });

      if (!updatedGroup) {
        throw new Error("Could not update group.");
      }

      await tx
        .delete(friendGroupMembers)
        .where(eq(friendGroupMembers.groupId, updatedGroup.id));
      await tx.insert(friendGroupMembers).values(
        memberIds.map((memberId) => ({
          groupId: updatedGroup.id,
          memberUserId: memberId,
        })),
      );

      return updatedGroup;
    });
    const memberOrder = new Map(
      memberIds.map((memberId, index) => [memberId, index]),
    );

    return NextResponse.json({
      id: group.id,
      name: group.name,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
      members: acceptedRows
        .sort(
          (left, right) =>
            (memberOrder.get(left.id) ?? 0) - (memberOrder.get(right.id) ?? 0),
        )
        .map((member) => ({
          id: member.id,
          name: member.name,
          image: member.image,
          phoneNumber: member.phoneNumber,
        })),
    });
  } catch (error) {
    const authErrorResponse = toAuthErrorResponse(error);

    if (authErrorResponse) {
      return authErrorResponse;
    }

    const message = error instanceof Error ? error.message : "";
    if (message.includes("friend_groups_owner_id_name_uidx")) {
      return NextResponse.json(
        { error: "You already have a group with that name." },
        { status: 409 },
      );
    }

    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
