export const dynamic = "force-dynamic";

import { ContactsTable } from "@/components/contacts-table";
import { requireUser } from "@/lib/auth";

export default async function ContactsPage() {
  await requireUser();
  return <ContactsTable />;
}
