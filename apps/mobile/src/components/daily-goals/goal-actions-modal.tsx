import { SymbolView } from "expo-symbols";
import { useEffect } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { withErrorTrace } from "@/components/component-error-boundary";
import { GoalLogVisibilityControl } from "@/components/goal-log-visibility-control";
import { useTheme } from "@/hooks/use-theme";
import { addCrashBreadcrumb, setCrashContext } from "@/lib/crash-reporting";
import type { GoalLogStatus } from "@/lib/goal-logs-client";
import type { GoalPhotoSource } from "@/lib/goal-photo-picker";
import type { GoalVisibility } from "@/lib/goals-client";

import { type ActionGoal, modalStyles, styles, sym } from "./shared";

function GoalActionsModalImpl({
  goal,
  visible,
  hasNote,
  hasPhoto,
  visibility,
  status,
  isUpdating,
  isUpdatingVisibility,
  uploadingPhotoSource,
  onAddPhoto,
  onOpenNote,
  onSetVisibility,
  onSetStatus,
  onDismiss,
  onShown,
}: {
  goal: ActionGoal | null;
  visible: boolean;
  hasNote: boolean;
  hasPhoto: boolean;
  visibility: GoalVisibility;
  status: "complete" | "planned" | undefined;
  isUpdating: boolean;
  isUpdatingVisibility: boolean;
  uploadingPhotoSource: GoalPhotoSource | null;
  onAddPhoto: (source: GoalPhotoSource) => void;
  onOpenNote: () => void;
  onSetVisibility: (visibility: GoalVisibility) => void;
  onSetStatus: (status: GoalLogStatus) => void;
  onDismiss: () => void;
  onShown: () => void;
}) {
  const theme = useTheme();
  const isComplete = status === "complete";
  const isUploadingPhoto = uploadingPhotoSource !== null;

  useEffect(() => {
    if (!goal || !visible) return;
    const visibleGoal = goal;

    setCrashContext("goal_actions_modal", {
      goalId: visibleGoal.id,
      hasNote,
      hasPhoto,
      isUpdating,
      isUpdatingVisibility,
      period: visibleGoal.period,
      phase: "react-mounted",
      status: status ?? null,
    });
    addCrashBreadcrumb("Goal actions modal React mounted", {
      goalId: visibleGoal.id,
      period: visibleGoal.period,
    });

    return () => {
      addCrashBreadcrumb("Goal actions modal React unmounted", {
        goalId: visibleGoal.id,
        period: visibleGoal.period,
      });
    };
  }, [
    goal,
    hasNote,
    hasPhoto,
    isUpdating,
    isUpdatingVisibility,
    status,
    visible,
  ]);

  return (
    <Modal
      animationType="slide"
      transparent
      statusBarTranslucent
      visible={visible}
      onShow={onShown}
      onRequestClose={onDismiss}
    >
      <View style={modalStyles.overlay}>
        <Pressable
          accessibilityLabel="Close"
          style={StyleSheet.absoluteFill}
          onPress={onDismiss}
        />
        <SafeAreaView
          edges={["bottom"]}
          style={[modalStyles.sheet, { backgroundColor: theme.background }]}
        >
          {goal ? (
            <>
              <View
                style={[
                  modalStyles.header,
                  {
                    backgroundColor: theme.tabBar,
                    borderBottomColor: theme.tabBorder,
                  },
                ]}
              >
                <Text
                  style={[modalStyles.title, { color: theme.text }]}
                  numberOfLines={2}
                >
                  {goal.name}
                </Text>
                <Pressable
                  onPress={onDismiss}
                  hitSlop={8}
                  style={({ pressed }) => [
                    modalStyles.closeBtn,
                    { backgroundColor: theme.backgroundElement },
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={sym("xmark", "close")}
                    size={14}
                    weight="bold"
                    tintColor={theme.tabIcon}
                  />
                </Pressable>
              </View>

              <ScrollView
                contentContainerStyle={modalStyles.actions}
                showsVerticalScrollIndicator={false}
              >
                {/* Mark complete / Reopen */}
                <Pressable
                  onPress={() => onSetStatus(isComplete ? null : "complete")}
                  style={({ pressed }) => [
                    modalStyles.actionRow,
                    { backgroundColor: theme.backgroundElement },
                    pressed && styles.pressed,
                  ]}
                >
                  {isUpdating ? (
                    <ActivityIndicator size="small" color={theme.primary} />
                  ) : (
                    <SymbolView
                      name={
                        isComplete
                          ? sym("arrow.uturn.backward.circle.fill", "undo")
                          : sym("checkmark.circle.fill", "check_circle")
                      }
                      size={26}
                      tintColor={
                        isComplete ? theme.textSecondary : theme.primary
                      }
                    />
                  )}
                  <Text style={[modalStyles.actionText, { color: theme.text }]}>
                    {isComplete ? "Reopen" : "Mark complete"}
                  </Text>
                </Pressable>

                {/* Add note */}
                <Pressable
                  onPress={onOpenNote}
                  style={({ pressed }) => [
                    modalStyles.actionRow,
                    { backgroundColor: theme.backgroundElement },
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={sym("note.text", "notes")}
                    size={26}
                    tintColor={theme.primary}
                  />
                  <Text style={[modalStyles.actionText, { color: theme.text }]}>
                    {hasNote ? "Edit note" : "Add note"}
                  </Text>
                </Pressable>

                {hasNote || hasPhoto ? (
                  <GoalLogVisibilityControl
                    disabled={isUpdatingVisibility}
                    value={visibility}
                    onChange={onSetVisibility}
                  />
                ) : null}

                {/* Photo row */}
                <View style={modalStyles.photoRow}>
                  <Pressable
                    disabled={isUploadingPhoto}
                    onPress={() => onAddPhoto("camera")}
                    style={({ pressed }) => [
                      modalStyles.photoBtn,
                      { backgroundColor: theme.backgroundElement },
                      isUploadingPhoto && modalStyles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {uploadingPhotoSource === "camera" ? (
                      <ActivityIndicator color={theme.primary} size="small" />
                    ) : (
                      <SymbolView
                        name={sym("camera.fill", "camera_alt")}
                        size={26}
                        tintColor={theme.primary}
                      />
                    )}
                    <Text
                      style={[modalStyles.actionText, { color: theme.text }]}
                    >
                      Take photo
                    </Text>
                  </Pressable>
                  <Pressable
                    disabled={isUploadingPhoto}
                    onPress={() => onAddPhoto("library")}
                    style={({ pressed }) => [
                      modalStyles.photoBtn,
                      { backgroundColor: theme.backgroundElement },
                      isUploadingPhoto && modalStyles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {uploadingPhotoSource === "library" ? (
                      <ActivityIndicator color={theme.primary} size="small" />
                    ) : (
                      <SymbolView
                        name={sym("photo.fill", "photo_library")}
                        size={26}
                        tintColor={theme.primary}
                      />
                    )}
                    <Text
                      style={[modalStyles.actionText, { color: theme.text }]}
                    >
                      Add photo
                    </Text>
                  </Pressable>
                </View>
              </ScrollView>
            </>
          ) : null}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

export const GoalActionsModal = withErrorTrace(
  GoalActionsModalImpl,
  "GoalActionsModal",
);
