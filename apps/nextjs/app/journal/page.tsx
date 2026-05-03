export const dynamic = "force-dynamic";

import { JournalPageClient } from "@/components/journal-page-client";
import { requireUser } from "@/lib/auth";

export default async function JournalPage() {
  await requireUser();

  return <JournalPageClient />;
}
