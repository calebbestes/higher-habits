import { type MenuAction, MenuView } from "@expo/ui/community/menu";
import { SymbolView } from "expo-symbols";
import {
  type ComponentProps,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
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
import { getLocalTimeZone } from "@/lib/google-calendar-client";
import {
  DEFAULT_PLAN_END_TIME,
  DEFAULT_PLAN_PERIOD,
  DEFAULT_PLAN_START_TIME,
  PLAN_PERIODS,
  type PlanPeriod,
  getPlanTimeInput,
  normalizePlanTimeInput,
  normalizeStoredPlanTime,
} from "@/lib/plan-time";
import { richTextToPlainText } from "@/lib/rich-text";

import {
  type ActionGoal,
  type GoalDateStatus,
  modalStyles,
  styles,
  sym,
} from "./shared";

type PlanTimePart = "hour" | "minute";
type PlanTimeParts = { hour: number; minute: number };
type ReliablePressableProps = Omit<
  ComponentProps<typeof Pressable>,
  "onPress"
> & {
  onPress: () => void;
};

const CLEAR_PLAN_TIME_ACTION = "clear-plan-time";
const PLAN_TIME_HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const PLAN_TIME_MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);
const TAP_MOVE_CANCEL_DISTANCE = 10;
const PRESS_LOCK_MS = 450;

function ReliablePressable({
  disabled,
  onPress,
  onTouchCancel,
  onTouchEnd,
  onTouchMove,
  onTouchStart,
  ...props
}: ReliablePressableProps) {
  const lockRef = useRef(false);
  const touchStartRef = useRef<{
    didMove: boolean;
    pageX: number;
    pageY: number;
  } | null>(null);

  const runPress = useCallback(() => {
    if (disabled || lockRef.current || !onPress) return;

    lockRef.current = true;
    setTimeout(onPress, 0);
    setTimeout(() => {
      lockRef.current = false;
    }, PRESS_LOCK_MS);
  }, [disabled, onPress]);

  return (
    <Pressable
      {...props}
      disabled={disabled}
      onPress={runPress}
      onTouchCancel={(event) => {
        touchStartRef.current = null;
        onTouchCancel?.(event);
      }}
      onTouchEnd={(event) => {
        const touchStart = touchStartRef.current;
        touchStartRef.current = null;
        if (touchStart && !touchStart.didMove) {
          runPress();
        }
        onTouchEnd?.(event);
      }}
      onTouchMove={(event) => {
        const touchStart = touchStartRef.current;
        if (touchStart) {
          const dx = Math.abs(event.nativeEvent.pageX - touchStart.pageX);
          const dy = Math.abs(event.nativeEvent.pageY - touchStart.pageY);
          if (dx > TAP_MOVE_CANCEL_DISTANCE || dy > TAP_MOVE_CANCEL_DISTANCE) {
            touchStart.didMove = true;
          }
        }
        onTouchMove?.(event);
      }}
      onTouchStart={(event) => {
        touchStartRef.current = {
          didMove: false,
          pageX: event.nativeEvent.pageX,
          pageY: event.nativeEvent.pageY,
        };
        onTouchStart?.(event);
      }}
    />
  );
}

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
  completedCount,
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
  status: GoalDateStatus;
  isUpdating: boolean;
  isUpdatingVisibility: boolean;
  canPlan?: boolean;
  isFutureDate?: boolean;
  plannedTime?: {
    startTime: string | null;
    endTime: string | null;
    repeatsDaily?: boolean;
  };
  completedCount?: number;
  uploadingPhotoSource: GoalPhotoSource | null;
  onAddPhoto: (source: GoalPhotoSource) => void;
  onOpenNote: () => void;
  onSetVisibility: (visibility: GoalVisibility) => void;
  onSetStatus: (
    status: GoalLogStatus,
    options?: {
      endTime?: string | null;
      repeatPlan?: boolean;
      startTime?: string | null;
      timeZone?: string | null;
      completedCount?: number;
    },
  ) => void;
  onDismiss: () => void;
  onShown: () => void;
}) {
  const theme = useTheme();
  const isComplete = status === "complete";
  const hasSlip = status === "incomplete";
  const isPlanned = status === "planned";
  const isDefaultComplete = Boolean(goal?.defaultComplete);
  const instanceTarget = Math.max(goal?.frequencyGoal ?? 1, 1);
  const supportsPartialCredit =
    !isDefaultComplete && goal?.period === "daily" && instanceTarget > 1;
  const currentCompletedCount =
    status === "complete"
      ? Math.max(completedCount ?? 0, instanceTarget)
      : (completedCount ?? 0);
  const showCompleteAction = !isFutureDate || isComplete;
  const showPlanAction = canPlan && !isComplete;
  const isUploadingPhoto = uploadingPhotoSource !== null;
  const [planStartTime, setPlanStartTime] = useState("");
  const [planEndTime, setPlanEndTime] = useState("");
  const [planStartPeriod, setPlanStartPeriod] = useState<PlanPeriod>("AM");
  const [planEndPeriod, setPlanEndPeriod] = useState<PlanPeriod>("AM");
  const [planRepeatsDaily, setPlanRepeatsDaily] = useState(false);
  const [isPlanEditorOpen, setIsPlanEditorOpen] = useState(false);
  const notePreview = richTextToPlainText(noteText);
  const nextPlanStartTime = normalizePlanTimeInput(
    planStartTime,
    planStartPeriod,
  );
  const nextPlanEndTime = normalizePlanTimeInput(planEndTime, planEndPeriod);
  const currentPlanStartTime = normalizeStoredPlanTime(plannedTime?.startTime);
  const currentPlanEndTime = normalizeStoredPlanTime(plannedTime?.endTime);
  const canRepeatPlan = goal?.period === "daily";
  const currentPlanRepeatsDaily = Boolean(
    canRepeatPlan && plannedTime?.repeatsDaily,
  );
  const showPlanEditor = showPlanAction && isPlanEditorOpen;
  const hasAnyPlanTimeInput = Boolean(
    planStartTime.trim() || planEndTime.trim(),
  );
  const hasPlanTimeChanges =
    nextPlanStartTime !== currentPlanStartTime ||
    nextPlanEndTime !== currentPlanEndTime;
  const hasPlanRepeatChanges =
    Boolean(canRepeatPlan) && planRepeatsDaily !== currentPlanRepeatsDaily;
  const hasPlanChanges = hasPlanTimeChanges || hasPlanRepeatChanges;

  // A daily plan must carry something useful: a note or a valid time range.
  const hasPlanTimeRange = Boolean(nextPlanStartTime && nextPlanEndTime);
  const willSavePlan = showPlanAction && (!isPlanned || hasPlanChanges);
  const isPlanActionDisabled =
    showPlanEditor &&
    willSavePlan &&
    ((hasAnyPlanTimeInput && !hasPlanTimeRange) ||
      (!hasNote && !hasPlanTimeRange));
  const planActionLabel =
    isPlanned && !hasPlanChanges
      ? "Clear plan"
      : showPlanEditor || isPlanned
        ? "Save plan"
        : "Add plan";

  useEffect(() => {
    if (!visible) return;
    const start = getPlanTimeInput(plannedTime?.startTime);
    const end = getPlanTimeInput(plannedTime?.endTime);
    setPlanStartTime(start.time || DEFAULT_PLAN_START_TIME);
    setPlanStartPeriod(start.time ? start.period : DEFAULT_PLAN_PERIOD);
    setPlanEndTime(end.time || DEFAULT_PLAN_END_TIME);
    setPlanEndPeriod(end.time ? end.period : DEFAULT_PLAN_PERIOD);
    setPlanRepeatsDaily(Boolean(plannedTime?.repeatsDaily));
    setIsPlanEditorOpen(isPlanned || Boolean(start.time || end.time));
  }, [
    isPlanned,
    plannedTime?.endTime,
    plannedTime?.repeatsDaily,
    plannedTime?.startTime,
    visible,
  ]);

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
        <ReliablePressable
          accessibilityLabel="Close"
          style={[StyleSheet.absoluteFill, modalStyles.backdrop]}
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
                <ReliablePressable
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
                </ReliablePressable>
              </View>

              <ScrollView
                canCancelContentTouches
                contentContainerStyle={modalStyles.actions}
                showsVerticalScrollIndicator={false}
              >
                {showCompleteAction ? (
                  supportsPartialCredit ? (
                    <View
                      style={[
                        modalStyles.actionRow,
                        { backgroundColor: theme.backgroundElement },
                      ]}
                    >
                      {isUpdating ? (
                        <ActivityIndicator size="small" color={theme.primary} />
                      ) : (
                        <SymbolView
                          name={sym("checkmark.circle.fill", "check_circle")}
                          size={26}
                          tintColor={
                            currentCompletedCount >= instanceTarget
                              ? theme.primary
                              : theme.textSecondary
                          }
                        />
                      )}
                      <Text
                        style={[modalStyles.actionText, { color: theme.text }]}
                      >
                        {currentCompletedCount}/{instanceTarget} complete
                      </Text>
                      <View style={modalStyles.countStepper}>
                        <Pressable
                          disabled={isUpdating || currentCompletedCount <= 0}
                          onPress={() => {
                            const nextCount = Math.max(
                              currentCompletedCount - 1,
                              0,
                            );
                            onSetStatus(nextCount > 0 ? "incomplete" : null, {
                              completedCount: nextCount,
                            });
                          }}
                          style={({ pressed }) => [
                            modalStyles.countButton,
                            { backgroundColor: theme.backgroundSelected },
                            (isUpdating || currentCompletedCount <= 0) &&
                              modalStyles.disabled,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text
                            style={[
                              modalStyles.countButtonText,
                              { color: theme.text },
                            ]}
                          >
                            -
                          </Text>
                        </Pressable>
                        <Pressable
                          disabled={
                            isUpdating ||
                            currentCompletedCount >= instanceTarget
                          }
                          onPress={() => {
                            const nextCount = Math.min(
                              currentCompletedCount + 1,
                              instanceTarget,
                            );
                            onSetStatus(
                              nextCount >= instanceTarget
                                ? "complete"
                                : "incomplete",
                              { completedCount: nextCount },
                            );
                          }}
                          style={({ pressed }) => [
                            modalStyles.countButton,
                            { backgroundColor: theme.primary },
                            (isUpdating ||
                              currentCompletedCount >= instanceTarget) &&
                              modalStyles.disabled,
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text
                            style={[
                              modalStyles.countButtonText,
                              { color: theme.primaryForeground },
                            ]}
                          >
                            +
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  ) : (
                    <ReliablePressable
                      onPress={() =>
                        onSetStatus(
                          isDefaultComplete
                            ? hasSlip
                              ? null
                              : "incomplete"
                            : isComplete
                              ? null
                              : "complete",
                        )
                      }
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
                            hasSlip
                              ? sym("arrow.uturn.backward.circle.fill", "undo")
                              : isDefaultComplete
                                ? sym("exclamationmark.circle.fill", "error")
                                : isComplete
                                  ? sym(
                                      "arrow.uturn.backward.circle.fill",
                                      "undo",
                                    )
                                  : sym("checkmark.circle.fill", "check_circle")
                          }
                          size={26}
                          tintColor={
                            isComplete || hasSlip
                              ? theme.textSecondary
                              : theme.primary
                          }
                        />
                      )}
                      <Text
                        style={[modalStyles.actionText, { color: theme.text }]}
                      >
                        {isDefaultComplete
                          ? hasSlip
                            ? "Clear slip"
                            : "Record slip"
                          : isComplete
                            ? "Reopen"
                            : "Mark complete"}
                      </Text>
                    </ReliablePressable>
                  )
                ) : null}

                {showPlanAction ? (
                  <>
                    <ReliablePressable
                      disabled={isPlanActionDisabled}
                      onPress={() => {
                        if (!showPlanEditor && !isPlanned) {
                          setIsPlanEditorOpen(true);
                          return;
                        }

                        const nextStatus =
                          isPlanned && !hasPlanChanges ? null : "planned";

                        onSetStatus(
                          nextStatus,
                          nextStatus === "planned"
                            ? {
                                startTime: nextPlanStartTime,
                                endTime: nextPlanEndTime,
                                repeatPlan: Boolean(
                                  canRepeatPlan && planRepeatsDaily,
                                ),
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
                            isPlanned && !hasPlanChanges
                              ? sym("calendar.badge.minus", "event_busy")
                              : sym("calendar.badge.plus", "event_available")
                          }
                          size={26}
                          tintColor={
                            isPlanned && !hasPlanChanges
                              ? theme.textSecondary
                              : theme.secondary
                          }
                        />
                      )}
                      <Text
                        style={[modalStyles.actionText, { color: theme.text }]}
                      >
                        {planActionLabel}
                      </Text>
                    </ReliablePressable>

                    {showPlanEditor && isPlanActionDisabled ? (
                      <Text
                        style={[
                          modalStyles.planHint,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Add a note or a time range to plan this habit.
                      </Text>
                    ) : null}

                    {showPlanEditor ? (
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
                            <PlanTimeSelect
                              fallbackHour={9}
                              onChange={setPlanStartTime}
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
                            <PlanTimeSelect
                              fallbackHour={10}
                              onChange={setPlanEndTime}
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
                        {canRepeatPlan ? (
                          <Pressable
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: planRepeatsDaily }}
                            onPress={() =>
                              setPlanRepeatsDaily((current) => !current)
                            }
                            style={({ pressed }) => [
                              modalStyles.planRepeatRow,
                              { borderTopColor: theme.tabBorder },
                              pressed && styles.pressed,
                            ]}
                          >
                            <SymbolView
                              name={
                                planRepeatsDaily
                                  ? sym("checkmark.square.fill", "check_box")
                                  : sym("square", "check_box_outline_blank")
                              }
                              size={24}
                              weight="semibold"
                              tintColor={
                                planRepeatsDaily
                                  ? theme.primary
                                  : theme.textSecondary
                              }
                            />
                            <Text
                              style={[
                                modalStyles.planRepeatText,
                                { color: theme.text },
                              ]}
                            >
                              Repeat daily
                            </Text>
                          </Pressable>
                        ) : null}
                      </View>
                    ) : null}
                  </>
                ) : null}

                {!isFutureDate ? (
                  <View style={modalStyles.photoRow}>
                    <ReliablePressable
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
                    </ReliablePressable>
                    <ReliablePressable
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
                    </ReliablePressable>
                  </View>
                ) : null}

                {/* Add note */}
                <ReliablePressable
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
                </ReliablePressable>

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

function parsePlanTimeInputParts(value: string): PlanTimeParts | null {
  const match = value.trim().match(/^(0?[1-9]|1[0-2]):([0-5]\d)$/);
  if (!match) return null;

  return { hour: Number(match[1]), minute: Number(match[2]) };
}

function getPlanTimePartsForPicker(
  value: string,
  fallbackHour: number,
): PlanTimeParts {
  return parsePlanTimeInputParts(value) ?? { hour: fallbackHour, minute: 0 };
}

function formatPlanTimeInput({ hour, minute }: PlanTimeParts): string {
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

function updatePlanTimePart({
  fallbackHour,
  part,
  partValue,
  value,
}: {
  fallbackHour: number;
  part: PlanTimePart;
  partValue: number;
  value: string;
}): string {
  return formatPlanTimeInput({
    ...getPlanTimePartsForPicker(value, fallbackHour),
    [part]: partValue,
  });
}

function menuSelectedState(selected: boolean): MenuAction["state"] {
  return selected ? "on" : undefined;
}

export function PlanTimeSelect({
  fallbackHour,
  value,
  onChange,
}: {
  fallbackHour: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = parsePlanTimeInputParts(value);
  const pickerParts = getPlanTimePartsForPicker(value, fallbackHour);
  const hourActions: MenuAction[] = [
    {
      id: CLEAR_PLAN_TIME_ACTION,
      title: "No time",
      state: menuSelectedState(!selected),
    },
    ...PLAN_TIME_HOURS.map((hour) => ({
      id: String(hour),
      title: String(hour),
      state: menuSelectedState(selected?.hour === hour),
    })),
  ];
  const minuteActions: MenuAction[] = [
    {
      id: CLEAR_PLAN_TIME_ACTION,
      title: "No time",
      state: menuSelectedState(!selected),
    },
    ...PLAN_TIME_MINUTES.map((minute) => ({
      id: String(minute),
      title: String(minute).padStart(2, "0"),
      state: menuSelectedState(selected?.minute === minute),
    })),
  ];

  const selectPart = (part: PlanTimePart, actionId: string) => {
    if (actionId === CLEAR_PLAN_TIME_ACTION) {
      onChange("");
      return;
    }

    onChange(
      updatePlanTimePart({
        fallbackHour,
        part,
        partValue: Number(actionId),
        value,
      }),
    );
  };

  return (
    <View style={modalStyles.planTimePickerRow}>
      <PlanTimePartSelect
        actions={hourActions}
        label="Hour"
        value={selected ? String(pickerParts.hour) : null}
        onSelect={(actionId) => selectPart("hour", actionId)}
      />
      <PlanTimePartSelect
        actions={minuteActions}
        label="Min"
        value={selected ? String(pickerParts.minute).padStart(2, "0") : null}
        onSelect={(actionId) => selectPart("minute", actionId)}
      />
    </View>
  );
}

function PlanTimePartSelect({
  actions,
  label,
  value,
  onSelect,
}: {
  actions: MenuAction[];
  label: string;
  value: string | null;
  onSelect: (actionId: string) => void;
}) {
  const theme = useTheme();
  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => onSelect(nativeEvent.event)}
      style={modalStyles.planTimePickerMenu}
      title={`Select ${label.toLowerCase()}`}
    >
      <View
        accessible
        accessibilityLabel={`Select ${label.toLowerCase()}`}
        accessibilityRole="button"
        style={[modalStyles.planTimePicker, { borderColor: theme.tabBorder }]}
      >
        <Text
          numberOfLines={1}
          style={[
            modalStyles.planTimePickerText,
            { color: value ? theme.text : theme.textSecondary },
          ]}
        >
          {value ?? label}
        </Text>
        <SymbolView
          name={sym("chevron.down", "keyboard_arrow_down")}
          size={12}
          weight="semibold"
          tintColor={theme.textSecondary}
        />
      </View>
    </MenuView>
  );
}

export const GoalActionsModal = withErrorTrace(
  GoalActionsModalImpl,
  "GoalActionsModal",
);
