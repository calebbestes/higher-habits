import { mobileApiFetch } from "@/lib/mobile-api";

export type Project = {
  id: string;
  name: string;
  color: string;
  createdAt: string;
  totalTasks: number;
  completedTasks: number;
};

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
      message?: string;
    } | null;
    throw new Error(body?.error ?? body?.message ?? "Unable to continue.");
  }
  return response.json() as Promise<T>;
}

export const fetchProjects = () =>
  mobileApiFetch("/api/projects").then((response) =>
    parseResponse<Project[]>(response),
  );

export const createProject = (name: string, color = "") =>
  mobileApiFetch("/api/projects", {
    method: "POST",
    body: JSON.stringify({ type: "create", name, color }),
  }).then((response) => parseResponse<Project>(response));

export const deleteProject = (id: string) =>
  mobileApiFetch("/api/projects", {
    method: "POST",
    body: JSON.stringify({ type: "delete", id }),
  }).then((response) => parseResponse<{ ok: true }>(response));
