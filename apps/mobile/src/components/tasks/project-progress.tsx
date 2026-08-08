import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/use-theme";
import type { Project } from "@/lib/projects-client";

export function ProjectProgressRow({
  isSelected = false,
  onPress,
  project,
  onLongPress,
}: {
  isSelected?: boolean;
  onPress?: () => void;
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
      accessibilityLabel={`${project.name}, ${percent}% complete. ${
        onPress
          ? isSelected
            ? "Selected."
            : "Tap to filter tasks."
          : "Long press to delete."
      }`}
      accessibilityState={{ selected: isSelected }}
      delayLongPress={400}
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.projectRow,
        onPress && styles.projectRowInteractive,
        {
          backgroundColor:
            onPress && isSelected ? theme.backgroundElement : "transparent",
          borderColor: onPress && isSelected ? theme.primary : "transparent",
        },
        pressed && styles.pressed,
      ]}
    >
      <View style={styles.projectRowHeader}>
        <Text
          style={[styles.projectName, { color: theme.text }]}
          numberOfLines={1}
        >
          {project.name}
        </Text>
        <Text style={[styles.projectCount, { color: theme.textSecondary }]}>
          {project.completedTasks}/{project.totalTasks}
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
  onSelectProject,
  projects,
  onDeleteProject,
  selectedProjectId = null,
}: {
  onSelectProject?: (project: Project | null) => void;
  projects: Project[];
  onDeleteProject: (project: Project) => void;
  selectedProjectId?: string | null;
}) {
  const theme = useTheme();
  const activeProjects = projects
    .filter((project) => project.totalTasks > project.completedTasks)
    .sort((left, right) => {
      const leftRemaining = Math.max(left.totalTasks - left.completedTasks, 0);
      const rightRemaining = Math.max(
        right.totalTasks - right.completedTasks,
        0,
      );
      if (rightRemaining !== leftRemaining) {
        return rightRemaining - leftRemaining;
      }
      return left.name.localeCompare(right.name);
    });
  if (activeProjects.length === 0) return null;

  if (onSelectProject) {
    const totalOpenTasks = activeProjects.reduce(
      (sum, project) =>
        sum + Math.max(project.totalTasks - project.completedTasks, 0),
      0,
    );

    return (
      <View style={styles.projectFilterSection}>
        <Text style={[styles.projectsTitle, { color: theme.textSecondary }]}>
          Projects
        </Text>
        <ScrollView
          horizontal
          contentContainerStyle={styles.projectFilterList}
          showsHorizontalScrollIndicator={false}
        >
          <ProjectFilterItem
            count={totalOpenTasks}
            isSelected={selectedProjectId === null}
            label="All"
            onPress={() => onSelectProject(null)}
          />
          {activeProjects.map((project) => (
            <ProjectFilterItem
              key={project.id}
              count={Math.max(project.totalTasks - project.completedTasks, 0)}
              isSelected={project.id === selectedProjectId}
              label={project.name}
              onLongPress={() => onDeleteProject(project)}
              onPress={() => onSelectProject(project)}
            />
          ))}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.projectsCard}>
      <Text style={[styles.projectsTitle, { color: theme.text }]}>
        Project progress
      </Text>
      {activeProjects.map((project) => (
        <ProjectProgressRow
          key={project.id}
          isSelected={project.id === selectedProjectId}
          project={project}
          onLongPress={() => onDeleteProject(project)}
        />
      ))}
    </View>
  );
}

function ProjectFilterItem({
  count,
  isSelected,
  label,
  onLongPress,
  onPress,
}: {
  count: number;
  isSelected: boolean;
  label: string;
  onLongPress?: () => void;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      delayLongPress={400}
      onLongPress={onLongPress}
      onPress={onPress}
      style={({ pressed }) => [
        styles.projectFilterItem,
        pressed && styles.pressed,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[
          styles.projectFilterName,
          { color: isSelected ? theme.text : theme.textSecondary },
        ]}
      >
        {label}
      </Text>
      <Text
        style={[
          styles.projectFilterCount,
          { color: isSelected ? theme.text : theme.textSecondary },
        ]}
      >
        {count}
      </Text>
      <View
        style={[
          styles.projectFilterIndicator,
          { backgroundColor: isSelected ? theme.primary : "transparent" },
        ]}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  projectsCard: { gap: 12 },
  projectFilterSection: { gap: 8 },
  projectFilterList: {
    gap: 22,
    paddingRight: 18,
  },
  projectFilterItem: {
    maxWidth: 128,
    gap: 5,
    paddingVertical: 3,
  },
  projectFilterName: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "600",
  },
  projectFilterCount: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "500",
  },
  projectFilterIndicator: {
    height: 2.5,
    borderRadius: 999,
  },
  projectsTitle: {
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
    textTransform: "uppercase",
  },
  projectRow: {
    gap: 6,
  },
  projectRowInteractive: {
    borderWidth: 0,
    borderRadius: 10,
    marginHorizontal: -6,
    padding: 6,
  },
  projectRowHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  projectName: { flex: 1, fontSize: 17, fontWeight: "600" },
  projectCount: {
    fontSize: 13,
    fontWeight: "500",
    fontVariant: ["tabular-nums"],
  },
  projectTrack: { height: 4, borderRadius: 999, overflow: "hidden" },
  projectFill: { height: "100%", borderRadius: 999 },
  pressed: { opacity: 0.72 },
});
