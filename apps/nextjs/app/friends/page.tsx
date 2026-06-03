export const dynamic = "force-dynamic";

import { FriendsPageClient } from "@/components/friends-page-client";
import { requireUser } from "@/lib/auth";

export default async function FriendsPage() {
  await requireUser();

  return <FriendsPageClient />;
}
