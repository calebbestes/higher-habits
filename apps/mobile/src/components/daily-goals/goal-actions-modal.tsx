import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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
import { getLocalTimeZone } from "@/lib/google-calendar-client";
import {
  PLAN_PERIODS,
  type PlanPeriod,
  getPlanTimeInput,
  normalizePlanTimeInput,
  normalizeStoredPlanTime,
} from "@/lib/plan-time";
import { richTextToPlainText } from "@/lib/rich-text";

import { type ActionGoal, modalStyles, styles, sym } from "./shared";

function GoalActionsModalImpl({
  goal,
  visible,
  hasNote,
  noteText,
  hasPhoto,
  visibility,
  status,
  isUpdating,
  isUpdatingVisibility,
  isFutureDate = false,
  canPlan = isFutureDate,
  plannedTime,
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
  noteText?: string | null;
  hasPhoto: boolean;
  visibility: GoalVisibility;
  status: "complete" | "planned" | undefined;
  isUpdating: boolean;
  isUpdatingVisibility: boolean;
  canPlan?: boolean;
  isFutureDate?: boolean;
  plannedTime?: { startTime: string | null; endTime: string | null };
  uploadingPhotoSource: GoalPhotoSource | null;
  onAddPhoto: (source: GoalPhotoSource) => void;
  onOpenNote: () => void;
  onSetVisibility: (visibility: GoalVisibility) => void;
  onSetStatus: (
    status: GoalLogStatus,
    options?: {
      endTime?: string | null;
      startTime?: string | null;
      timeZone?: string | null;
    },
  ) => void;
  onDismiss: () => void;
  onShown: () => void;
}) {
  const theme = useTheme();
  const isComplete = status === "complete";
  const isPlanned = status === "planned";
  const showCompleteAction = !isFutureDate || isComplete;
  const showPlanAction = canPlan && !isComplete;
  const isUploadingPhoto = uploadingPhotoSource !== null;
  const [planStartTime, setPlanStartTime] = useState("");
  const [planEndTime, setPlanEndTime] = useState("");
  const [planStartPeriod, setPlanStartPeriod] = useState<PlanPeriod>("AM");
  const [planEndPeriod, setPlanEndPeriod] = useState<PlanPeriod>("AM");
  const notePreview = richTextToPlainText(noteText);
  const nextPlanStartTime = normalizePlanTimeInput(
    planStartTime,
    planStartPeriod,
  );
  const nextPlanEndTime = normalizePlanTimeInput(planEndTime, planEndPeriod);
  const currentPlanStartTime = normalizeStoredPlanTime(plannedTime?.startTime);
  const currentPlanEndTime = normalizeStoredPlanTime(plannedTime?.endTime);
  const hasAnyPlanTimeInput = Boolean(
    planStartTime.trim() || planEndTime.trim(),
  );
  const hasPlanTimeChanges =
    nextPlanStartTime !== currentPlanStartTime ||
    nextPlanEndTime !== currentPlanEndTime;

  // A daily plan must carry something useful: a note or a valid time range.
  const hasPlanTimeRange = Boolean(nextPlanStartTime && nextPlanEndTime);
  const willSavePlan = showPlanAction && (!isPlanned || hasPlanTimeChanges);
  const isPlanActionDisabled =
    willSavePlan &&
    ((hasAnyPlanTimeInput && !hasPlanTimeRange) ||
      (!hasNote && !hasPlanTimeRange));

  useEffect(() => {
    if (!visible) return;
    const start = getPlanTimeInput(plannedTime?.startTime);
    const end = getPlanTimeInput(plannedTime?.endTime);
    setPlanStartTime(start.time);
    setPlanStartPeriod(start.period);
    setPlanEndTime(end.time);
    setPlanEndPeriod(end.period);
  }, [plannedTime?.endTime, plannedTime?.startTime, visible]);

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
                {showCompleteAction ? (
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
                    <Text
                      style={[modalStyles.actionText, { color: theme.text }]}
                    >
                      {isComplete ? "Reopen" : "Mark complete"}
                    </Text>
                  </Pressable>
                ) : null}

                {showPlanAction ? (
                  <>
                    <Pressable
                      disabled={isPlanActionDisabled}
                      onPress={() => {
                        const nextStatus =
                          isPlanned && !hasPlanTimeChanges ? null : "planned";

                        onSetStatus(
                          nextStatus,
                          nextStatus === "planned"
                            ? {
                                startTime: nextPlanStartTime,
                                endTime: nextPlanEndTime,
                                timeZone: getLocalTimeZone(),
                              }
                            : undefined,
                        );
                      }}
                      style={({ pressed }) => [
                        modalStyles.actionRow,
                        { backgroundColor: theme.backgroundElement },
                        isPlanActionDisabled && modalStyles.disabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      {isUpdating ? (
                        <ActivityIndicator
                          size="small"
                          color={theme.secondary}
                        />
                      ) : (
                        <SymbolView
                          name={
                            isPlanned && !hasPlanTimeChanges
                              ? sym("calendar.badge.minus", "event_busy")
                              : sym("calendar.badge.plus", "event_available")
                          }
                          size={26}
                          tintColor={
                            isPlanned && !hasPlanTimeChanges
                              ? theme.textSecondary
                              : theme.secondary
                          }
                        />
                      )}
                      <Text
                        style={[modalStyles.actionText, { color: theme.text }]}
                      >
                        {isPlanned && !hasPlanTimeChanges
                          ? "Clear plan"
                          : isPlanned
                            ? "Save plan"
                            : "Add plan"}
                      </Text>
                    </Pressable>

                    {isPlanActionDisabled ? (
                      <Text
                        style={[
                          modalStyles.planHint,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Add a note or a time range to plan this habit.
                      </Text>
                    ) : null}

                    <View
                      style={[
                        modalStyles.planTimeSection,
                        { backgroundColor: theme.backgroundElement },
                      ]}
                    >
                      <Text
                        style={[
                          modalStyles.planTimeSectionTitle,
                          { color: theme.text },
                        ]}
                      >
                        Time range
                      </Text>
                      <View style={modalStyles.planTimeFields}>
                        <View style={modalStyles.planTimeField}>
                          <Text
                            style={[
                              modalStyles.planTimeLabel,
                              { color: theme.textSecondary },
                            ]}
                          >
                            Start
                          </Text>
                          <TextInput
                            autoCapitalize="none"
                            keyboardType="numbers-and-punctuation"
                            onChangeText={setPlanStartTime}
                            placeholder="9:00"
                            placeholderTextColor={theme.textSecondary}
                            selectionColor={theme.primary}
                            style={[
                              modalStyles.planTimeInput,
                              {
                                borderColor: theme.tabBorder,
                                color: theme.text,
                              },
                            ]}
                            value={planStartTime}
                          />
                          <View style={modalStyles.planPeriodToggle}>
                            {PLAN_PERIODS.map((period) => {
                              const isSelected = planStartPeriod === period;

                              return (
                                <Pressable
                                  key={period}
                                  onPress={() => setPlanStartPeriod(period)}
                                  style={[
                                    modalStyles.planPeriodOption,
                                    {
                                      backgroundColor: isSelected
                                        ? theme.primary
                                        : "transparent",
                                      borderColor: theme.tabBorder,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      modalStyles.planPeriodText,
                                      {
                                        color: isSelected
                                          ? theme.primaryForeground
                                          : theme.textSecondary,
                                      },
                                    ]}
                                  >
                                    {period}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                        <View style={modalStyles.planTimeField}>
                          <Text
                            style={[
                              modalStyles.planTimeLabel,
                              { color: theme.textSecondary },
                            ]}
                          >
                            End
                          </Text>
                          <TextInput
                            autoCapitalize="none"
                            keyboardType="numbers-and-punctuation"
                            onChangeText={setPlanEndTime}
                            placeholder="10:00"
                            placeholderTextColor={theme.textSecondary}
                            selectionColor={theme.primary}
                            style={[
                              modalStyles.planTimeInput,
                              {
                                borderColor: theme.tabBorder,
                                color: theme.text,
                              },
                            ]}
                            value={planEndTime}
                          />
                          <View style={modalStyles.planPeriodToggle}>
                            {PLAN_PERIODS.map((period) => {
                              const isSelected = planEndPeriod === period;

                              return (
                                <Pressable
                                  key={period}
                                  onPress={() => setPlanEndPeriod(period)}
                                  style={[
                                    modalStyles.planPeriodOption,
                                    {
                                      backgroundColor: isSelected
                                        ? theme.primary
                                        : "transparent",
                                      borderColor: theme.tabBorder,
                                    },
                                  ]}
                                >
                                  <Text
                                    style={[
                                      modalStyles.planPeriodText,
                                      {
                                        color: isSelected
                                          ? theme.primaryForeground
                                          : theme.textSecondary,
                                      },
                                    ]}
                                  >
                                    {period}
                                  </Text>
                                </Pressable>
                              );
                            })}
                          </View>
                        </View>
                      </View>
                    </View>
                  </>
                ) : null}

                {!isFutureDate ? (
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
                ) : null}

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
                  <View style={modalStyles.noteRowContent}>
                    <Text
                      style={[modalStyles.actionText, { color: theme.text }]}
                    >
                      {hasNote ? "Edit note" : "Add note"}
                    </Text>
                    {hasNote && notePreview ? (
                      <Text
                        numberOfLines={3}
                        style={[
                          modalStyles.notePreview,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {notePreview}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>

                {!isFutureDate && (hasNote || hasPhoto) ? (
                  <GoalLogVisibilityControl
                    disabled={isUpdatingVisibility}
                    value={visibility}
                    onChange={onSetVisibility}
                  />
                ) : null}
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
