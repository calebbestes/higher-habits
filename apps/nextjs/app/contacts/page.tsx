export const dynamic = "force-dynamic";

import { ContactsTableClient } from "@/components/contacts-table-client";
import { requireUser } from "@/lib/auth";

export default async function ContactsPage() {
  await requireUser();
  return <ContactsTableClient />;
}
