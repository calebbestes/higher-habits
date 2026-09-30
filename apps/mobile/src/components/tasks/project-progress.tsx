import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

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
  onRenameProject,
  onTogglePinProject,
  selectedProjectId = null,
}: {
  onSelectProject?: (project: Project | null) => void;
  projects: Project[];
  onDeleteProject: (project: Project) => void;
  onRenameProject: (project: Project, name: string) => Promise<void>;
  onTogglePinProject: (project: Project) => Promise<void>;
  selectedProjectId?: string | null;
}) {
  const theme = useTheme();
  const [actionProject, setActionProject] = useState<Project | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const activeProjects = projects
    .filter((project) => project.totalTasks > project.completedTasks)
    .sort((left, right) => {
      if (Boolean(left.pinned) !== Boolean(right.pinned)) {
        return left.pinned ? -1 : 1;
      }
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

  const openProjectActions = (project: Project) => {
    setActionProject(project);
    setIsRenaming(false);
    setRenameValue(project.name);
  };

  const closeProjectActions = () => {
    if (isSaving) return;
    setActionProject(null);
    setIsRenaming(false);
  };

  const saveRename = async () => {
    if (!actionProject || !renameValue.trim() || isSaving) return;
    setIsSaving(true);
    await onRenameProject(actionProject, renameValue.trim());
    setIsSaving(false);
    setActionProject(null);
    setIsRenaming(false);
  };

  const togglePin = async () => {
    if (!actionProject || isSaving) return;
    setIsSaving(true);
    await onTogglePinProject(actionProject);
    setIsSaving(false);
    setActionProject(null);
  };

  const deleteProject = () => {
    if (!actionProject || isSaving) return;
    const project = actionProject;
    setActionProject(null);
    onDeleteProject(project);
  };

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
              onLongPress={() => openProjectActions(project)}
              onPress={() => onSelectProject(project)}
            />
          ))}
        </ScrollView>
        <ProjectActionsModal
          isRenaming={isRenaming}
          isSaving={isSaving}
          onChangeRename={setRenameValue}
          onClose={closeProjectActions}
          onDelete={deleteProject}
          onRename={() => setIsRenaming(true)}
          onSaveRename={() => void saveRename()}
          onTogglePin={() => void togglePin()}
          project={actionProject}
          renameValue={renameValue}
        />
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
          onLongPress={() => openProjectActions(project)}
        />
      ))}
      <ProjectActionsModal
        isRenaming={isRenaming}
        isSaving={isSaving}
        onChangeRename={setRenameValue}
        onClose={closeProjectActions}
        onDelete={deleteProject}
        onRename={() => setIsRenaming(true)}
        onSaveRename={() => void saveRename()}
        onTogglePin={() => void togglePin()}
        project={actionProject}
        renameValue={renameValue}
      />
    </View>
  );
}

function ProjectActionsModal({
  isRenaming,
  isSaving,
  onChangeRename,
  onClose,
  onDelete,
  onRename,
  onSaveRename,
  onTogglePin,
  project,
  renameValue,
}: {
  isRenaming: boolean;
  isSaving: boolean;
  onChangeRename: (value: string) => void;
  onClose: () => void;
  onDelete: () => void;
  onRename: () => void;
  onSaveRename: () => void;
  onTogglePin: () => void;
  project: Project | null;
  renameValue: string;
}) {
  const theme = useTheme();
  if (!project) return null;

  const actions: {
    label: string;
    icon: SymbolViewProps["name"];
    onPress: () => void;
    danger?: boolean;
  }[] = [
    {
      label: "Rename project",
      icon: { ios: "pencil", android: "edit", web: "edit" },
      onPress: onRename,
    },
    {
      label: project.pinned ? "Unpin project" : "Pin project",
      icon: {
        ios: project.pinned ? "pin.slash" : "pin",
        android: project.pinned ? "push_pin" : "push_pin",
        web: project.pinned ? "push_pin" : "push_pin",
      },
      onPress: onTogglePin,
    },
    {
      label: "Delete project",
      icon: { ios: "trash", android: "delete", web: "delete" },
      onPress: onDelete,
      danger: true,
    },
  ];

  return (
    <Modal animationType="fade" transparent visible onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.modalOverlay}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.actionSheet,
            { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
          ]}
        >
          <Text style={[styles.actionTitle, { color: theme.text }]}>
            {project.name}
          </Text>
          {isRenaming ? (
            <View style={styles.renamePanel}>
              <TextInput
                autoFocus
                editable={!isSaving}
                maxLength={120}
                onChangeText={onChangeRename}
                onSubmitEditing={onSaveRename}
                returnKeyType="done"
                style={[
                  styles.renameInput,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                    color: theme.text,
                  },
                ]}
                value={renameValue}
              />
              <View style={styles.renameButtons}>
                <Pressable
                  disabled={isSaving}
                  onPress={onClose}
                  style={({ pressed }) => [
                    styles.renameButton,
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.renameButtonLabel,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Cancel
                  </Text>
                </Pressable>
                <Pressable
                  disabled={isSaving || !renameValue.trim()}
                  onPress={onSaveRename}
                  style={({ pressed }) => [
                    styles.renameButton,
                    { backgroundColor: theme.primary },
                    pressed && styles.pressed,
                  ]}
                >
                  <Text
                    style={[
                      styles.renameButtonLabel,
                      { color: theme.primaryForeground },
                    ]}
                  >
                    {isSaving ? "Saving…" : "Save"}
                  </Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <>
              {actions.map((action) => (
                <Pressable
                  disabled={isSaving}
                  key={action.label}
                  onPress={action.onPress}
                  style={({ pressed }) => [
                    styles.actionRow,
                    pressed && { backgroundColor: theme.backgroundElement },
                  ]}
                >
                  <SymbolView
                    name={action.icon}
                    size={20}
                    tintColor={action.danger ? "#B84D54" : theme.tabIcon}
                  />
                  <Text
                    style={[
                      styles.actionLabel,
                      { color: action.danger ? "#B84D54" : theme.text },
                    ]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              ))}
              <Pressable
                disabled={isSaving}
                onPress={onClose}
                style={({ pressed }) => [
                  styles.actionRow,
                  pressed && { backgroundColor: theme.backgroundElement },
                ]}
              >
                <Text
                  style={[styles.actionLabel, { color: theme.textSecondary }]}
                >
                  Cancel
                </Text>
              </Pressable>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
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
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0, 0, 0, 0.35)",
    padding: 12,
  },
  actionSheet: {
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
    paddingBottom: 8,
  },
  actionTitle: {
    fontSize: 17,
    fontWeight: "700",
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 10,
  },
  actionRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
  },
  actionLabel: { fontSize: 16, fontWeight: "600" },
  renamePanel: { gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  renameInput: {
    minHeight: 46,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  renameButtons: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  renameButton: {
    minWidth: 84,
    minHeight: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  renameButtonLabel: { fontSize: 15, fontWeight: "700" },
  pressed: { opacity: 0.72 },
});
