import { mobileApiFetch } from "@/lib/mobile-api";

export type AccountProfile = {
  birthday: string | null;
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new Error(body?.error ?? body?.message ?? "Request failed.");
  }

  return response.json() as Promise<T>;
}

export const fetchAccountProfile = (): Promise<AccountProfile> =>
  mobileApiFetch("/api/account").then((response) =>
    parseResponse<AccountProfile>(response),
  );

export const updateAccountProfile = (
  profile: Partial<AccountProfile>,
): Promise<AccountProfile> =>
  mobileApiFetch("/api/account", {
    method: "PATCH",
    body: JSON.stringify(profile),
  }).then((response) => parseResponse<AccountProfile>(response));
