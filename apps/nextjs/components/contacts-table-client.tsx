"use client";

import dynamic from "next/dynamic";

export const ContactsTableClient = dynamic(
  () => import("@/components/contacts-table").then((m) => m.ContactsTable),
  { ssr: false },
);
