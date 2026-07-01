import { SymbolView } from "expo-symbols";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/use-theme";
import type { PlannedEvent } from "@/lib/planned-events-client";
import type { Task } from "@/lib/tasks-client";

import { sym } from "./shared";

export function TaskActionsModal({
  task,
  onClose,
  onEdit,
  onDelete,
  onToggle,
  onPlan,
  onClearPlan,
  plannedEvent,
}: {
  task: Task | null;
  onClose: () => void;
  onEdit: (task: Task) => void;
  onDelete: (task: Task) => void;
  onToggle: (task: Task) => void;
  onPlan?: (task: Task) => void;
  onClearPlan?: (task: Task) => void;
  plannedEvent?: PlannedEvent | null;
}) {
  const theme = useTheme();
  if (!task) return null;

  const actions = [
    {
      label: "Edit task",
      icon: sym("pencil", "edit"),
      onPress: () => onEdit(task),
    },
    ...(onPlan
      ? [
          {
            label: plannedEvent ? "Edit calendar plan" : "Plan to calendar",
            icon: sym("calendar.badge.plus", "event_available"),
            onPress: () => onPlan(task),
          },
        ]
      : []),
    ...(plannedEvent && onClearPlan
      ? [
          {
            label: "Clear calendar plan",
            icon: sym("calendar.badge.minus", "event_busy"),
            onPress: () => onClearPlan(task),
          },
        ]
      : []),
    {
      label: task.completedAt ? "Mark as active" : "Mark as complete",
      icon: sym(
        task.completedAt ? "arrow.uturn.backward.circle" : "checkmark.circle",
        task.completedAt ? "undo" : "check_circle",
      ),
      onPress: () => onToggle(task),
    },
    {
      label: "Delete task",
      icon: sym("trash", "delete"),
      danger: true,
      onPress: () => onDelete(task),
    },
  ];

  return (
    <Modal animationType="fade" transparent visible onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.actionSheet,
            { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
          ]}
        >
          <Text style={[styles.actionTitle, { color: theme.text }]}>
            {task.name}
          </Text>
          {actions.map((action) => (
            <Pressable
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
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#00000055",
    padding: 12,
  },
  actionSheet: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 25,
    padding: 8,
    paddingBottom: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 12,
  },
  actionTitle: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: "800",
  },
  actionRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  actionLabel: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
});
