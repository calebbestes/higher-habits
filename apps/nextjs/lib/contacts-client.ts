const ENDPOINT = "/api/contacts";
const CATEGORIES_ENDPOINT = "/api/contact-categories";
const STATUSES_ENDPOINT = "/api/contact-statuses";

export type ContactCategory = {
  id: string;
  name: string;
  createdAt: string;
};

export type ContactStatus = {
  id: string;
  name: string;
  createdAt: string;
};

export type Contact = {
  id: string;
  name: string;
  organization: string;
  phone: string;
  email: string;
  contactCategoryId: string | null;
  contactStatusId: string | null;
  priority: string;
  nextContactDate: string | null;
  lastContacted: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ContactInput = {
  name: string;
  organization: string;
  phone: string;
  email: string;
  contactCategoryId: string | null;
  contactStatusId: string | null;
  priority: string;
  nextContactDate: string | null;
  lastContacted: string | null;
  notes: string;
};

async function parseResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(text);
  }
  return res.json() as Promise<T>;
}

export const fetchContactCategories = (): Promise<ContactCategory[]> =>
  fetch(CATEGORIES_ENDPOINT, { cache: "no-store" }).then((r) =>
    parseResponse<ContactCategory[]>(r),
  );

export const createContactCategory = (name: string): Promise<ContactCategory> =>
  fetch(CATEGORIES_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).then((r) => parseResponse<ContactCategory>(r));

export const fetchContactStatuses = (): Promise<ContactStatus[]> =>
  fetch(STATUSES_ENDPOINT, { cache: "no-store" }).then((r) =>
    parseResponse<ContactStatus[]>(r),
  );

export const fetchContacts = (): Promise<Contact[]> =>
  fetch(ENDPOINT, { cache: "no-store" }).then((r) =>
    parseResponse<Contact[]>(r),
  );

export const createContact = (input: ContactInput): Promise<Contact> =>
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "create", ...input }),
  }).then((r) => parseResponse<Contact>(r));

export const updateContact = (
  id: string,
  input: ContactInput,
): Promise<Contact> =>
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "update", id, ...input }),
  }).then((r) => parseResponse<Contact>(r));

export const deleteContact = (id: string): Promise<{ ok: true }> =>
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "delete", id }),
  }).then((r) => parseResponse<{ ok: true }>(r));

export const deleteManyContacts = (ids: string[]): Promise<{ ok: true }> =>
  fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "deleteMany", ids }),
  }).then((r) => parseResponse<{ ok: true }>(r));
