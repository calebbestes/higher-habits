export const dynamic = "force-dynamic";

import {
  SettingsPage as SettingsPageClient,
  parseSettingsSection,
} from "@/components/settings-page";
import { requireUser } from "@/lib/auth";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  await requireUser();
  const { section } = await searchParams;

  return <SettingsPageClient activeSection={parseSettingsSection(section)} />;
}
