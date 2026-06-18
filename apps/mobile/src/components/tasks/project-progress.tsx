import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/use-theme";
import type { Project } from "@/lib/projects-client";

export function ProjectProgressRow({
  project,
  onLongPress,
}: {
  project: Project;
  onLongPress: () => void;
}) {
  const theme = useTheme();
  const percent =
    project.totalTasks > 0
      ? Math.round((project.completedTasks / project.totalTasks) * 100)
      : 0;
  const barColor = project.color?.trim() || theme.primary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${project.name}, ${percent}% complete. Long press to delete.`}
      delayLongPress={400}
      onLongPress={onLongPress}
      style={styles.projectRow}
    >
      <View style={styles.projectRowHeader}>
        <Text
          style={[styles.projectName, { color: theme.text }]}
          numberOfLines={1}
        >
          {project.name}
        </Text>
        <Text style={[styles.projectCount, { color: theme.textSecondary }]}>
          {project.completedTasks}/{project.totalTasks} · {percent}%
        </Text>
      </View>
      <View style={[styles.projectTrack, { backgroundColor: theme.tabBorder }]}>
        {project.totalTasks > 0 ? (
          <View
            style={[
              styles.projectFill,
              { width: `${percent}%`, backgroundColor: barColor },
            ]}
          />
        ) : null}
      </View>
    </Pressable>
  );
}

export function ProjectProgressCard({
  projects,
  onDeleteProject,
}: {
  projects: Project[];
  onDeleteProject: (project: Project) => void;
}) {
  const theme = useTheme();
  if (projects.length === 0) return null;

  return (
    <View style={styles.projectsCard}>
      <Text style={[styles.projectsTitle, { color: theme.text }]}>
        Project progress
      </Text>
      {projects.map((project) => (
        <ProjectProgressRow
          key={project.id}
          project={project}
          onLongPress={() => onDeleteProject(project)}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  projectsCard: { gap: 12 },
  projectsTitle: {
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  projectRow: { gap: 6 },
  projectRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  projectName: { flex: 1, fontSize: 14, fontWeight: "700" },
  projectCount: {
    fontSize: 12,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
  },
  projectTrack: { height: 8, borderRadius: 999, overflow: "hidden" },
  projectFill: { height: "100%", borderRadius: 999 },
});
