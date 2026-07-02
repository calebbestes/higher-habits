import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
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
import { SafeAreaView } from "react-native-safe-area-context";

import { DatePartPicker } from "@/components/date-part-picker";
import { useTheme } from "@/hooks/use-theme";
import type { Project } from "@/lib/projects-client";
import {
  TASK_IMPORTANCES,
  TASK_TIME_OPTIONS,
  TASK_URGENCIES,
  type Task,
  type TaskInput,
  getTaskDueDateForUrgency,
  getTaskUrgency,
  todayDateKey,
} from "@/lib/tasks-client";

import { EMPTY_TASK, capitalize, sym, toInput } from "./shared";

export function TaskFormModal({
  isOpen,
  onClose,
  onSave,
  task,
  projects,
  onCreateProject,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (input: TaskInput) => Promise<void>;
  task: Task | null;
  projects: Project[];
  onCreateProject: (name: string) => Promise<Project>;
}) {
  const theme = useTheme();
  const [form, setForm] = useState<TaskInput>(EMPTY_TASK);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newProjectName, setNewProjectName] = useState("");
  const [isCreatingProject, setIsCreatingProject] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setForm(task ? toInput(task) : EMPTY_TASK);
    setError(null);
    setNewProjectName("");
  }, [isOpen, task]);

  const addProject = async () => {
    const name = newProjectName.trim();
    if (!name || isCreatingProject) return;
    setIsCreatingProject(true);
    setError(null);
    try {
      const created = await onCreateProject(name);
      setForm((current) => ({ ...current, projectId: created.id }));
      setNewProjectName("");
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "Could not create project.",
      );
    } finally {
      setIsCreatingProject(false);
    }
  };

  const dueDateValid =
    !form.dueDate || /^\d{4}-\d{2}-\d{2}$/.test(form.dueDate);

  const save = async () => {
    if (!form.name.trim() || !dueDateValid || isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      await onSave({ ...form, name: form.name.trim() });
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save task.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      presentationStyle="pageSheet"
      visible={isOpen}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={[styles.formScreen, { backgroundColor: theme.background }]}
      >
        <SafeAreaView style={styles.formSafeArea}>
          <View
            style={[
              styles.formHeader,
              {
                backgroundColor: theme.tabBar,
                borderBottomColor: theme.tabBorder,
              },
            ]}
          >
            <Pressable onPress={onClose} style={styles.formHeaderButton}>
              <Text
                style={[styles.formHeaderButtonText, { color: theme.primary }]}
              >
                Cancel
              </Text>
            </Pressable>
            <Text style={[styles.formTitle, { color: theme.text }]}>
              {task ? "Edit Task" : "New Task"}
            </Text>
            <Pressable
              disabled={!form.name.trim() || !dueDateValid || isSaving}
              onPress={() => void save()}
              style={styles.formHeaderButton}
            >
              {isSaving ? (
                <ActivityIndicator color={theme.primary} size="small" />
              ) : (
                <Text
                  style={[
                    styles.formHeaderButtonText,
                    {
                      color:
                        form.name.trim() && dueDateValid
                          ? theme.primary
                          : theme.textSecondary,
                    },
                  ]}
                >
                  Save
                </Text>
              )}
            </Pressable>
          </View>

          <ScrollView
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <FormSection title="Task">
              <LabeledInput
                autoFocus
                label="Name"
                onChangeText={(name) =>
                  setForm((current) => ({ ...current, name }))
                }
                placeholder="What needs to get done?"
                returnKeyType="done"
                value={form.name}
              />
            </FormSection>

            <FormSection title="Priority">
              <Text style={[styles.fieldLabel, { color: theme.text }]}>
                Importance
              </Text>
              <View style={styles.choiceWrap}>
                {TASK_IMPORTANCES.map((importance) => (
                  <Choice
                    key={importance}
                    label={importance}
                    selected={form.importance === importance}
                    tone={importance === "High" ? "blush" : undefined}
                    onPress={() =>
                      setForm((current) => ({ ...current, importance }))
                    }
                  />
                ))}
              </View>
              <Text style={[styles.fieldLabel, { color: theme.text }]}>
                Urgency
              </Text>
              <View style={styles.choiceWrap}>
                {TASK_URGENCIES.map((urgency) => (
                  <Choice
                    key={urgency}
                    label={capitalize(urgency)}
                    selected={getTaskUrgency(form) === urgency}
                    tone={urgency === "today" ? "blush" : undefined}
                    onPress={() =>
                      setForm((current) => ({
                        ...current,
                        dueDate: getTaskDueDateForUrgency(urgency),
                      }))
                    }
                  />
                ))}
              </View>
            </FormSection>

            <FormSection title="Schedule">
              <View style={styles.inputField}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>
                  Exact due date
                </Text>
                <DatePartPicker
                  value={form.dueDate}
                  onChange={(dueDate) =>
                    setForm((current) => ({ ...current, dueDate }))
                  }
                />
              </View>
              {!dueDateValid ? (
                <Text style={styles.fieldError}>Use YYYY-MM-DD format.</Text>
              ) : null}
              <Text style={[styles.fieldLabel, { color: theme.text }]}>
                Time required
              </Text>
              <View style={styles.choiceWrap}>
                {TASK_TIME_OPTIONS.map((timeRequired) => (
                  <Choice
                    key={timeRequired}
                    label={timeRequired}
                    selected={form.timeRequired === timeRequired}
                    onPress={() =>
                      setForm((current) => ({ ...current, timeRequired }))
                    }
                  />
                ))}
              </View>
            </FormSection>

            <FormSection title="Project">
              <View style={styles.choiceWrap}>
                <Choice
                  label="None"
                  selected={!form.projectId}
                  onPress={() =>
                    setForm((current) => ({ ...current, projectId: null }))
                  }
                />
                {projects.map((project) => (
                  <Choice
                    key={project.id}
                    label={project.name}
                    selected={form.projectId === project.id}
                    onPress={() =>
                      setForm((current) => ({
                        ...current,
                        projectId: project.id,
                      }))
                    }
                  />
                ))}
              </View>
              <View style={styles.newProjectRow}>
                <TextInput
                  autoCapitalize="words"
                  autoCorrect={false}
                  onChangeText={setNewProjectName}
                  onSubmitEditing={() => void addProject()}
                  placeholder="New project name"
                  placeholderTextColor={theme.textSecondary}
                  returnKeyType="done"
                  selectionColor={theme.primary}
                  style={[
                    styles.newProjectInput,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.tabBorder,
                      color: theme.text,
                    },
                  ]}
                  value={newProjectName}
                />
                <Pressable
                  accessibilityLabel="Add project"
                  disabled={!newProjectName.trim() || isCreatingProject}
                  onPress={() => void addProject()}
                  style={[
                    styles.newProjectButton,
                    {
                      backgroundColor: newProjectName.trim()
                        ? theme.primary
                        : theme.backgroundElement,
                    },
                  ]}
                >
                  {isCreatingProject ? (
                    <ActivityIndicator
                      color={theme.primaryForeground}
                      size="small"
                    />
                  ) : (
                    <SymbolView
                      name={sym("plus", "add")}
                      size={18}
                      weight="semibold"
                      tintColor={
                        newProjectName.trim()
                          ? theme.primaryForeground
                          : theme.textSecondary
                      }
                    />
                  )}
                </Pressable>
              </View>
            </FormSection>

            <FormSection title="Status">
              <View style={styles.statusChoices}>
                <Choice
                  label="Active"
                  selected={!form.completedAt}
                  onPress={() =>
                    setForm((current) => ({ ...current, completedAt: null }))
                  }
                />
                <Choice
                  label="Completed today"
                  selected={Boolean(form.completedAt)}
                  onPress={() =>
                    setForm((current) => ({
                      ...current,
                      completedAt: todayDateKey(),
                    }))
                  }
                />
              </View>
            </FormSection>

            {error ? <Text style={styles.formError}>{error}</Text> : null}
          </ScrollView>
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FormSection({
  children,
  title,
}: {
  children: React.ReactNode;
  title: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.formSection}>
      <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
        {title}
      </Text>
      <View
        style={[
          styles.sectionSurface,
          { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function LabeledInput({
  label,
  style,
  ...props
}: React.ComponentProps<typeof TextInput> & { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.inputField}>
      <Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        selectionColor={theme.primary}
        style={[
          styles.input,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.tabBorder,
            color: theme.text,
          },
          style,
        ]}
        {...props}
      />
    </View>
  );
}

function Choice({
  label,
  onPress,
  selected,
  tone,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
  tone?: "blush";
}) {
  const theme = useTheme();
  const selectedBackground = tone === "blush" ? "#9D7474" : theme.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.choice,
        {
          backgroundColor: selected
            ? selectedBackground
            : theme.backgroundElement,
          borderColor: selected ? selectedBackground : theme.tabBorder,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text
        style={[
          styles.choiceLabel,
          { color: selected ? "#FFFFFF" : theme.textSecondary },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  formScreen: { flex: 1 },
  formSafeArea: { flex: 1 },
  formHeader: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  formHeaderButton: {
    minWidth: 64,
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  formHeaderButtonText: { fontSize: 15, fontWeight: "700" },
  formTitle: { fontSize: 16, lineHeight: 21, fontWeight: "800" },
  formContent: {
    width: "100%",
    maxWidth: 620,
    alignSelf: "center",
    gap: 22,
    padding: 18,
    paddingBottom: 48,
  },
  formSection: { gap: 7 },
  sectionTitle: {
    paddingHorizontal: 4,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  sectionSurface: {
    gap: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    padding: 16,
  },
  inputField: { gap: 7 },
  fieldLabel: { fontSize: 13, lineHeight: 17, fontWeight: "700" },
  input: {
    minHeight: 49,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingHorizontal: 14,
    fontSize: 15,
    fontWeight: "500",
  },
  fieldError: {
    color: "#B84D54",
    marginTop: -9,
    fontSize: 11,
    lineHeight: 15,
    fontWeight: "600",
  },
  choiceWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  choice: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    paddingHorizontal: 13,
    paddingVertical: 8,
  },
  choiceLabel: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  statusChoices: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  newProjectRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  newProjectInput: {
    flex: 1,
    height: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    paddingHorizontal: 12,
    fontSize: 15,
  },
  newProjectButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  formError: {
    color: "#B84D54",
    paddingHorizontal: 4,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  pressed: { opacity: 0.72 },
});
