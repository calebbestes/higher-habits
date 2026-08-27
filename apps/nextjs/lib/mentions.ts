import "server-only";

import {
  type MentionSourceType,
  contentMentions,
  friends,
  type getDb,
  users,
} from "@habit/db";
import { and, eq, inArray, or } from "drizzle-orm";

import { sendPushToUser } from "@/lib/push";

type Db = NonNullable<ReturnType<typeof getDb>>;

export type Mention = {
  userId: string;
  name: string;
};

type MentionCandidate = Mention;

function isWordCharacter(value: string | undefined) {
  return Boolean(value && /[\p{L}\p{N}_]/u.test(value));
}

function getMentionAliases(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const handle = words.join(".").replace(/[^a-z0-9.]/gi, "");

  return [name.trim(), words[0] ?? "", handle].filter(
    (alias, index, aliases) => alias && aliases.indexOf(alias) === index,
  );
}

function findMentionedUserIds(body: string, candidates: MentionCandidate[]) {
  const aliases = new Map<string, string | null>();

  for (const candidate of candidates) {
    for (const alias of getMentionAliases(candidate.name)) {
      const key = alias.toLocaleLowerCase();
      const previous = aliases.get(key);
      aliases.set(key, previous === undefined ? candidate.userId : null);
    }
  }

  const orderedAliases = [...aliases.entries()]
    .filter((entry): entry is [string, string] => entry[1] !== null)
    .sort(([left], [right]) => right.length - left.length);
  const mentionedUserIds = new Set<string>();
  const lowerBody = body.toLocaleLowerCase();

  for (let index = 0; index < body.length; index += 1) {
    if (
      body[index] !== "@" ||
      isWordCharacter(body[index - 1]) ||
      body[index - 1] === "@"
    ) {
      continue;
    }

    const tail = lowerBody.slice(index + 1);
    const match = orderedAliases.find(([alias]) => {
      if (!tail.startsWith(alias)) return false;
      return !isWordCharacter(tail[alias.length]);
    });

    if (match) {
      mentionedUserIds.add(match[1]);
      index += match[0].length;
    }
  }

  return mentionedUserIds;
}

export function stripMentionMarkup(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .trim();
}

export async function getAcceptedFriendIds(db: Db, authorId: string) {
  const rows = await db
    .select({ userId1: friends.userId1, userId2: friends.userId2 })
    .from(friends)
    .where(
      and(
        eq(friends.status, "accepted"),
        or(eq(friends.userId1, authorId), eq(friends.userId2, authorId)),
      ),
    );

  return rows.map((row) =>
    row.userId1 === authorId ? row.userId2 : row.userId1,
  );
}

async function getAcceptedMentionCandidates(db: Db, authorId: string) {
  return db
    .select({ userId: users.id, name: users.name })
    .from(friends)
    .innerJoin(
      users,
      or(
        and(eq(friends.userId1, authorId), eq(friends.userId2, users.id)),
        and(eq(friends.userId2, authorId), eq(friends.userId1, users.id)),
      ),
    )
    .where(
      and(
        eq(friends.status, "accepted"),
        or(eq(friends.userId1, authorId), eq(friends.userId2, authorId)),
      ),
    );
}

export async function syncContentMentions({
  allowedUserIds,
  authorId,
  body,
  db,
  sourceId,
  sourceType,
}: {
  allowedUserIds?: Set<string>;
  authorId: string;
  body: string;
  db: Db;
  sourceId: string;
  sourceType: MentionSourceType;
}) {
  const candidates = await getAcceptedMentionCandidates(db, authorId);
  const nextMentionedUserIds = [
    ...findMentionedUserIds(body, candidates),
  ].filter((userId) => !allowedUserIds || allowedUserIds.has(userId));

  const existingRows = await db
    .select({ mentionedUserId: contentMentions.mentionedUserId })
    .from(contentMentions)
    .where(
      and(
        eq(contentMentions.sourceType, sourceType),
        eq(contentMentions.sourceId, sourceId),
      ),
    );
  const existingUserIds = new Set(
    existingRows.map((row) => row.mentionedUserId),
  );

  await db
    .delete(contentMentions)
    .where(
      and(
        eq(contentMentions.sourceType, sourceType),
        eq(contentMentions.sourceId, sourceId),
      ),
    );

  if (nextMentionedUserIds.length > 0) {
    await db
      .insert(contentMentions)
      .values(
        nextMentionedUserIds.map((mentionedUserId) => ({
          authorId,
          mentionedUserId,
          sourceId,
          sourceType,
        })),
      )
      .onConflictDoNothing();
  }

  return {
    mentionedUserIds: nextMentionedUserIds,
    newlyMentionedUserIds: nextMentionedUserIds.filter(
      (userId) => !existingUserIds.has(userId),
    ),
  };
}

export async function syncContentMentionsAndNotify({
  allowedUserIds,
  authorId,
  authorName,
  body,
  db,
  sourceId,
  sourceType,
}: {
  allowedUserIds?: Set<string>;
  authorId: string;
  authorName: string;
  body: string;
  db: Db;
  sourceId: string;
  sourceType: MentionSourceType;
}) {
  const result = await syncContentMentions({
    allowedUserIds,
    authorId,
    body,
    db,
    sourceId,
    sourceType,
  });
  const excerpt = stripMentionMarkup(body).slice(0, 100);

  await Promise.all(
    result.newlyMentionedUserIds.map((mentionedUserId) =>
      sendPushToUser(mentionedUserId, "notifyPostComments", {
        title: `${authorName} mentioned you`,
        body: excerpt || "You were mentioned in a post.",
        data: { sourceId, sourceType, type: "mention" },
      }),
    ),
  );

  return result;
}

export async function loadContentMentions(
  db: Db,
  sourceType: MentionSourceType,
  sourceIds: string[],
) {
  if (sourceIds.length === 0) return new Map<string, Mention[]>();

  const rows = await db
    .select({
      sourceId: contentMentions.sourceId,
      userId: contentMentions.mentionedUserId,
      name: users.name,
    })
    .from(contentMentions)
    .innerJoin(users, eq(contentMentions.mentionedUserId, users.id))
    .where(
      and(
        eq(contentMentions.sourceType, sourceType),
        inArray(contentMentions.sourceId, sourceIds),
      ),
    );
  const mentionsBySourceId = new Map<string, Mention[]>();

  for (const row of rows) {
    const mentions = mentionsBySourceId.get(row.sourceId) ?? [];
    mentions.push({ name: row.name, userId: row.userId });
    mentionsBySourceId.set(row.sourceId, mentions);
  }

  return mentionsBySourceId;
}
