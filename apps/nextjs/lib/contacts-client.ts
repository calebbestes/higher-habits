const ENDPOINT = "/api/contacts";

export type Contact = {
  id: string;
  name: string;
  company: string;
  phone: string;
  email: string;
  category: string;
  team: string;
  status: string;
  priority: string;
  lastResponse: string | null;
  lastContacted: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type ContactInput = {
  name: string;
  company: string;
  phone: string;
  email: string;
  category: string;
  team: string;
  status: string;
  priority: string;
  lastResponse: string | null;
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
