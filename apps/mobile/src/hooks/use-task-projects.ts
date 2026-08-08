import { useCallback, useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

import {
  getCachedData,
  isCacheFresh,
  setCachedData,
} from "@/lib/app-data-cache";
import {
  type Project,
  createProject as createProjectApi,
  deleteProject as deleteProjectApi,
  fetchProjects,
} from "@/lib/projects-client";

const TASK_PROJECTS_CACHE_KEY = "tasks:projects";

/**
 * Shared projects state for the task screens: the project list (with progress
 * counts), a refresh, inline creation, and a confirm-and-delete flow. Both
 * task screens use this so the logic lives in one place.
 */
export function useTaskProjects() {
  const cachedProjects = getCachedData<Project[]>(TASK_PROJECTS_CACHE_KEY);
  const [projects, setProjects] = useState<Project[]>(
    cachedProjects?.data ?? [],
  );
  const isMountedRef = useRef(true);

  useEffect(
    () => () => {
      isMountedRef.current = false;
    },
    [],
  );

  const reloadProjects = useCallback(async (force = false) => {
    const cached = getCachedData<Project[]>(TASK_PROJECTS_CACHE_KEY);
    if (!force && cached) {
      if (isMountedRef.current) setProjects(cached.data);
      if (isCacheFresh(cached)) return cached.data;
    }

    try {
      const nextProjects = await fetchProjects();
      setCachedData(TASK_PROJECTS_CACHE_KEY, nextProjects);
      if (isMountedRef.current) setProjects(nextProjects);
      return nextProjects;
    } catch {
      // Progress bars are non-critical; ignore load failures here.
      return cached?.data ?? [];
    }
  }, []);

  const createProject = useCallback(async (name: string): Promise<Project> => {
    const created = await createProjectApi(name);
    if (isMountedRef.current) {
      setProjects((current) => {
        const next = [
          ...current.filter((project) => project.id !== created.id),
          created,
        ].sort((a, b) => a.name.localeCompare(b.name));
        setCachedData(TASK_PROJECTS_CACHE_KEY, next);
        return next;
      });
    }
    return created;
  }, []);

  const confirmDeleteProject = useCallback(
    (project: Project, onDeleted?: (projectId: string) => void) => {
      Alert.alert(
        "Delete project?",
        `"${project.name}" will be removed. Its tasks are kept but unlinked.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              try {
                await deleteProjectApi(project.id);
                if (isMountedRef.current) {
                  setProjects((current) => {
                    const next = current.filter(
                      (item) => item.id !== project.id,
                    );
                    setCachedData(TASK_PROJECTS_CACHE_KEY, next);
                    return next;
                  });
                  onDeleted?.(project.id);
                }
              } catch (error) {
                Alert.alert(
                  "Could not delete project",
                  error instanceof Error
                    ? error.message
                    : "The project could not be deleted.",
                );
              }
            },
          },
        ],
      );
    },
    [],
  );

  return { projects, reloadProjects, createProject, confirmDeleteProject };
}
