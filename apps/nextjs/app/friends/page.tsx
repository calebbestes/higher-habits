export const dynamic = "force-dynamic";

import { FriendsPageClient } from "@/components/friends-page-client";
import { requireUser } from "@/lib/auth";
import { parseFriendsSection } from "@/lib/friends-navigation";

export default async function FriendsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  await requireUser();
  const { section } = await searchParams;

  return <FriendsPageClient activeSection={parseFriendsSection(section)} />;
}
