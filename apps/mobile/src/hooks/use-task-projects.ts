import { useCallback, useState } from "react";
import { Alert } from "react-native";

import {
  type Project,
  createProject as createProjectApi,
  deleteProject as deleteProjectApi,
  fetchProjects,
} from "@/lib/projects-client";

/**
 * Shared projects state for the task screens: the project list (with progress
 * counts), a refresh, inline creation, and a confirm-and-delete flow. Both
 * task screens use this so the logic lives in one place.
 */
export function useTaskProjects() {
  const [projects, setProjects] = useState<Project[]>([]);

  const reloadProjects = useCallback(async () => {
    try {
      setProjects(await fetchProjects());
    } catch {
      // Progress bars are non-critical; ignore load failures here.
    }
  }, []);

  const createProject = useCallback(async (name: string): Promise<Project> => {
    const created = await createProjectApi(name);
    setProjects((current) =>
      [...current, created].sort((a, b) => a.name.localeCompare(b.name)),
    );
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
                setProjects((current) =>
                  current.filter((item) => item.id !== project.id),
                );
                onDeleted?.(project.id);
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
