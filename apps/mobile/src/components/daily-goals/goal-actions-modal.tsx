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
  Alert,
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
import { DEFAULT_GOOGLE_CALENDAR_COLOR } from "@/constants/calendar-colors";
import { useGoogleCalendarEventColors } from "@/hooks/use-google-calendar-event-colors";
import { useGoogleCalendarSelection } from "@/hooks/use-google-calendar-selection";
import { useTheme } from "@/hooks/use-theme";
import { addCrashBreadcrumb, setCrashContext } from "@/lib/crash-reporting";
import type { GoalLogStatus } from "@/lib/goal-logs-client";
import type { GoalPhotoSource } from "@/lib/goal-photo-picker";
import type { GoalVisibility } from "@/lib/goals-client";
import { getLocalTimeZone } from "@/lib/google-calendar-client";
import type { PlannedRepeat } from "@/lib/habit-logs-client";
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
const REPEAT_WEEKDAYS = [
  ["S", 0, "Sunday"],
  ["M", 1, "Monday"],
  ["T", 2, "Tuesday"],
  ["W", 3, "Wednesday"],
  ["T", 4, "Thursday"],
  ["F", 5, "Friday"],
  ["S", 6, "Saturday"],
] as const;

const DEFAULT_PLANNED_REPEAT: PlannedRepeat = {
  cadence: "daily",
  interval: 1,
  days: null,
  monthlyType: null,
};

function arePlannedRepeatsEqual(
  left: PlannedRepeat | null,
  right: PlannedRepeat | null,
) {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.cadence === right.cadence &&
    left.interval === right.interval &&
    left.monthlyType === right.monthlyType &&
    (left.days ?? []).join(",") === (right.days ?? []).join(",")
  );
}

function repeatUnitLabel(cadence: PlannedRepeat["cadence"], interval: number) {
  if (cadence === "daily") return interval === 1 ? "day" : "days";
  if (cadence === "weekly") return interval === 1 ? "week" : "weeks";
  return interval === 1 ? "month" : "months";
}

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
  repeatDate,
  color,
  plannedTime,
  completedCount,
  uploadingPhotoSource,
  onAddPhoto,
  onOpenNote,
  onSetVisibility,
  onSetStatus,
  isUpdatingColor = false,
  onSetColor,
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
  color?: string | null;
  isUpdatingColor?: boolean;
  onSetColor?: (color: string | null) => void;
  canPlan?: boolean;
  isFutureDate?: boolean;
  repeatDate?: Date;
  plannedTime?: {
    startTime: string | null;
    endTime: string | null;
    repeatsDaily?: boolean;
    repeat?: PlannedRepeat | null;
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
      repeat?: PlannedRepeat | null;
      repeatStop?: boolean;
      startTime?: string | null;
      timeZone?: string | null;
      completedCount?: number;
    },
  ) => void;
  onDismiss: () => void;
  onShown: () => void;
}) {
  const theme = useTheme();
  const { colors: googleEventColors, isLoading: isLoadingGoogleColors } =
    useGoogleCalendarEventColors();
  const { calendars } = useGoogleCalendarSelection();
  const floatCalendarColor =
    calendars.find((calendar) => calendar.summary === "Float")
      ?.backgroundColor ?? DEFAULT_GOOGLE_CALENDAR_COLOR;
  const effectiveColor = color ?? floatCalendarColor;
  const colorOptions = googleEventColors.map((googleColor) => ({
    color: googleColor.backgroundColor,
    label: googleColor.label ?? `Google color ${googleColor.colorId}`,
  }));
  const selectedColorOption = colorOptions.find(
    (option) =>
      option.color &&
      color &&
      option.color.toLowerCase() === color.toLowerCase(),
  );
  const isComplete = status === "complete";
  const hasSlip = status === "incomplete";
  const isPlanned = status === "planned";
  const isDefaultComplete = Boolean(goal?.defaultComplete);
  const requiresEvidence = Boolean(goal?.requireEvidence);
  const instanceTarget = Math.max(goal?.frequencyGoal ?? 1, 1);
  const supportsPartialCredit =
    !isDefaultComplete && goal?.period === "daily" && instanceTarget > 1;
  const currentCompletedCount =
    status === "complete"
      ? Math.max(completedCount ?? 0, instanceTarget)
      : (completedCount ?? 0);
  const showCompleteAction = !isFutureDate || isComplete;
  const hasExistingPlanTime = Boolean(
    plannedTime?.startTime || plannedTime?.endTime,
  );
  const showPlanAction =
    (canPlan || isPlanned || hasExistingPlanTime) && !isComplete;
  const isUploadingPhoto = uploadingPhotoSource !== null;
  const [planStartTime, setPlanStartTime] = useState("");
  const [planEndTime, setPlanEndTime] = useState("");
  const [planStartPeriod, setPlanStartPeriod] = useState<PlanPeriod>("AM");
  const [planEndPeriod, setPlanEndPeriod] = useState<PlanPeriod>("AM");
  const [planRepeat, setPlanRepeat] = useState<PlannedRepeat | null>(null);
  const [isRepeatOptionsOpen, setIsRepeatOptionsOpen] = useState(false);
  const [isPlanEditorOpen, setIsPlanEditorOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  const autoSavePlanTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const notePreview = richTextToPlainText(noteText);
  const nextPlanStartTime = normalizePlanTimeInput(
    planStartTime,
    planStartPeriod,
  );
  const nextPlanEndTime = normalizePlanTimeInput(planEndTime, planEndPeriod);
  const currentPlanStartTime = normalizeStoredPlanTime(plannedTime?.startTime);
  const currentPlanEndTime = normalizeStoredPlanTime(plannedTime?.endTime);
  const canRepeatPlan = goal?.period === "daily";
  const currentPlanRepeat =
    canRepeatPlan && plannedTime?.repeat
      ? plannedTime.repeat
      : canRepeatPlan && plannedTime?.repeatsDaily
        ? DEFAULT_PLANNED_REPEAT
        : null;
  const showPlanEditor = showPlanAction && isPlanEditorOpen;
  const hasAnyPlanTimeInput = Boolean(
    planStartTime.trim() || planEndTime.trim(),
  );
  const hasPlanTimeChanges =
    nextPlanStartTime !== currentPlanStartTime ||
    nextPlanEndTime !== currentPlanEndTime;
  const hasPlanRepeatChanges =
    Boolean(canRepeatPlan) &&
    !arePlannedRepeatsEqual(planRepeat, currentPlanRepeat);
  const hasPlanChanges = hasPlanTimeChanges || hasPlanRepeatChanges;

  // A daily plan must carry something useful: a note or a valid time range.
  const hasPlanTimeRange = Boolean(nextPlanStartTime && nextPlanEndTime);
  const willSavePlan = showPlanAction && (!isPlanned || hasPlanChanges);
  const isPlanActionDisabled =
    !showPlanEditor &&
    willSavePlan &&
    ((hasAnyPlanTimeInput && !hasPlanTimeRange) ||
      (!hasNote && !hasPlanTimeRange));
  const planActionLabel =
    showPlanEditor && isPlanned ? "Clear plan" : "Add plan";

  useEffect(() => {
    if (!visible) return;
    const start = getPlanTimeInput(plannedTime?.startTime);
    const end = getPlanTimeInput(plannedTime?.endTime);
    setPlanStartTime(start.time || DEFAULT_PLAN_START_TIME);
    setPlanStartPeriod(start.time ? start.period : DEFAULT_PLAN_PERIOD);
    setPlanEndTime(end.time || DEFAULT_PLAN_END_TIME);
    setPlanEndPeriod(end.time ? end.period : DEFAULT_PLAN_PERIOD);
    const nextRepeat =
      plannedTime?.repeat ??
      (plannedTime?.repeatsDaily ? DEFAULT_PLANNED_REPEAT : null);
    setPlanRepeat(nextRepeat);
    setIsRepeatOptionsOpen(Boolean(nextRepeat));
    setIsPlanEditorOpen(isPlanned || Boolean(start.time || end.time));
    setIsColorPickerOpen(false);
  }, [
    isPlanned,
    plannedTime?.endTime,
    plannedTime?.repeat,
    plannedTime?.repeatsDaily,
    plannedTime?.startTime,
    visible,
  ]);

  useEffect(() => {
    if (!visible || !showPlanEditor || !showPlanAction) return;
    if (hasAnyPlanTimeInput && !hasPlanTimeRange) return;
    if (!hasNote && !hasPlanTimeRange) return;
    if (isUpdating) return;

    if (!hasPlanChanges) return;

    if (autoSavePlanTimerRef.current) {
      clearTimeout(autoSavePlanTimerRef.current);
    }

    autoSavePlanTimerRef.current = setTimeout(() => {
      autoSavePlanTimerRef.current = null;
      onSetStatus("planned", {
        startTime: nextPlanStartTime,
        endTime: nextPlanEndTime,
        repeat: planRepeat,
        repeatPlan: Boolean(canRepeatPlan && planRepeat),
        timeZone: getLocalTimeZone(),
      });
    }, 450);

    return () => {
      if (autoSavePlanTimerRef.current) {
        clearTimeout(autoSavePlanTimerRef.current);
        autoSavePlanTimerRef.current = null;
      }
    };
  }, [
    canRepeatPlan,
    hasAnyPlanTimeInput,
    hasNote,
    hasPlanChanges,
    hasPlanTimeRange,
    isUpdating,
    nextPlanEndTime,
    nextPlanStartTime,
    onSetStatus,
    planRepeat,
    showPlanAction,
    showPlanEditor,
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
                    backgroundColor: theme.background,
                    borderBottomColor: theme.tabBorder,
                  },
                ]}
              >
                <View style={modalStyles.titleBlock}>
                  <Text
                    style={[modalStyles.title, { color: theme.text }]}
                    numberOfLines={2}
                  >
                    {goal.name}
                  </Text>
                  <Text
                    style={[
                      modalStyles.subtitle,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {goal.period === "daily"
                      ? "Daily habit"
                      : `${goal.period} habit`}
                  </Text>
                </View>
                <ReliablePressable
                  onPress={onDismiss}
                  hitSlop={8}
                  style={({ pressed }) => [
                    modalStyles.closeBtn,
                    {
                      backgroundColor: "transparent",
                      borderColor: theme.tabBorder,
                    },
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
                <View
                  style={[
                    modalStyles.actionGroup,
                    {
                      backgroundColor: theme.tabBar,
                      borderColor: theme.tabBorder,
                    },
                  ]}
                >
                  {showCompleteAction ? (
                    supportsPartialCredit ? (
                      <View style={modalStyles.actionRow}>
                        {isUpdating ? (
                          <ActivityIndicator
                            size="small"
                            color={theme.primary}
                          />
                        ) : (
                          <SymbolView
                            name={sym("checkmark.circle.fill", "check_circle")}
                            size={21}
                            tintColor={
                              currentCompletedCount >= instanceTarget
                                ? theme.primary
                                : theme.textSecondary
                            }
                          />
                        )}
                        <Text
                          style={[
                            modalStyles.actionText,
                            { color: theme.text },
                          ]}
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
                              { backgroundColor: theme.backgroundElement },
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
                              if (
                                nextCount >= instanceTarget &&
                                requiresEvidence &&
                                !hasPhoto &&
                                !hasNote
                              ) {
                                Alert.alert(
                                  "Evidence required",
                                  "Add a photo or note before marking this habit complete.",
                                );
                                return;
                              }
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
                        onPress={() => {
                          const nextStatus = isDefaultComplete
                            ? hasSlip
                              ? null
                              : "incomplete"
                            : isComplete
                              ? null
                              : "complete";
                          if (
                            nextStatus === "complete" &&
                            requiresEvidence &&
                            !hasPhoto &&
                            !hasNote
                          ) {
                            Alert.alert(
                              "Evidence required",
                              "Add a photo or note before marking this habit complete.",
                            );
                            return;
                          }
                          onSetStatus(nextStatus);
                        }}
                        style={({ pressed }) => [
                          modalStyles.actionRow,
                          pressed && styles.pressed,
                        ]}
                      >
                        {isUpdating ? (
                          <ActivityIndicator
                            size="small"
                            color={theme.primary}
                          />
                        ) : (
                          <SymbolView
                            name={
                              hasSlip
                                ? sym(
                                    "arrow.uturn.backward.circle.fill",
                                    "undo",
                                  )
                                : isDefaultComplete
                                  ? sym("exclamationmark.circle.fill", "error")
                                  : isComplete
                                    ? sym(
                                        "arrow.uturn.backward.circle.fill",
                                        "undo",
                                      )
                                    : sym(
                                        "checkmark.circle.fill",
                                        "check_circle",
                                      )
                            }
                            size={21}
                            tintColor={
                              isComplete || hasSlip
                                ? theme.textSecondary
                                : theme.primary
                            }
                          />
                        )}
                        <Text
                          style={[
                            modalStyles.actionText,
                            { color: theme.text },
                          ]}
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

                  {showCompleteAction && showPlanAction && !showPlanEditor ? (
                    <View
                      style={[
                        modalStyles.actionDivider,
                        { backgroundColor: theme.tabBorder },
                      ]}
                    />
                  ) : null}

                  {showPlanAction && (!showPlanEditor || isPlanned) ? (
                    <ReliablePressable
                      disabled={isPlanActionDisabled}
                      onPress={() => {
                        if (!showPlanEditor) {
                          setIsPlanEditorOpen(true);
                          return;
                        }

                        onSetStatus(null);
                      }}
                      style={({ pressed }) => [
                        modalStyles.actionRow,
                        isPlanActionDisabled && modalStyles.disabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      {isUpdating ? (
                        <ActivityIndicator
                          size="small"
                          color={theme.textSecondary}
                        />
                      ) : (
                        <SymbolView
                          name={
                            showPlanEditor && isPlanned
                              ? sym("calendar.badge.minus", "event_busy")
                              : sym("calendar.badge.plus", "event_available")
                          }
                          size={21}
                          tintColor={
                            showPlanEditor && isPlanned
                              ? theme.textSecondary
                              : theme.tabIcon
                          }
                        />
                      )}
                      <Text
                        style={[modalStyles.actionText, { color: theme.text }]}
                      >
                        {planActionLabel}
                      </Text>
                    </ReliablePressable>
                  ) : null}
                </View>

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

                {showCompleteAction &&
                requiresEvidence &&
                !hasPhoto &&
                !hasNote &&
                !isComplete &&
                !isDefaultComplete ? (
                  <Text
                    style={[
                      modalStyles.planHint,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Add a photo or note before marking this habit complete.
                  </Text>
                ) : null}

                {showPlanEditor ? (
                  <View
                    style={[
                      modalStyles.planTimeSection,
                      {
                        backgroundColor: theme.tabBar,
                        borderColor: theme.tabBorder,
                      },
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
                      <View
                        style={[
                          modalStyles.planRepeatRow,
                          { borderTopColor: theme.tabBorder },
                        ]}
                      >
                        <Pressable
                          accessibilityRole="checkbox"
                          accessibilityState={{ checked: planRepeat !== null }}
                          onPress={() => {
                            if (planRepeat) {
                              setPlanRepeat(null);
                              setIsRepeatOptionsOpen(false);
                            } else {
                              setPlanRepeat(DEFAULT_PLANNED_REPEAT);
                              setIsRepeatOptionsOpen(true);
                            }
                          }}
                          style={({ pressed }) => [
                            modalStyles.planRepeatToggle,
                            pressed && styles.pressed,
                          ]}
                        >
                          <SymbolView
                            name={
                              planRepeat
                                ? sym("checkmark.square.fill", "check_box")
                                : sym("square", "check_box_outline_blank")
                            }
                            size={24}
                            weight="semibold"
                            tintColor={
                              planRepeat ? theme.primary : theme.textSecondary
                            }
                          />
                          <Text
                            style={[
                              modalStyles.planRepeatText,
                              { color: theme.text },
                            ]}
                          >
                            Repeat
                          </Text>
                        </Pressable>

                        {planRepeat ? (
                          <View style={modalStyles.planRepeatOptions}>
                            <View style={modalStyles.planRepeatControlRow}>
                              <Text
                                style={[
                                  modalStyles.planRepeatControlLabel,
                                  { color: theme.textSecondary },
                                ]}
                              >
                                Repeat every
                              </Text>
                              <View style={modalStyles.planRepeatStepper}>
                                <Pressable
                                  accessibilityLabel="Decrease repeat interval"
                                  disabled={planRepeat.interval <= 1}
                                  onPress={() =>
                                    setPlanRepeat((current) =>
                                      current
                                        ? {
                                            ...current,
                                            interval: Math.max(
                                              1,
                                              current.interval - 1,
                                            ),
                                          }
                                        : current,
                                    )
                                  }
                                  style={({ pressed }) => [
                                    modalStyles.planRepeatStepButton,
                                    {
                                      borderColor: theme.tabBorder,
                                      opacity:
                                        planRepeat.interval <= 1 ? 0.4 : 1,
                                    },
                                    pressed && styles.pressed,
                                  ]}
                                >
                                  <SymbolView
                                    name={sym("minus", "remove")}
                                    size={16}
                                    weight="bold"
                                    tintColor={theme.textSecondary}
                                  />
                                </Pressable>
                                <Text
                                  style={[
                                    modalStyles.planRepeatInterval,
                                    { color: theme.text },
                                  ]}
                                >
                                  {planRepeat.interval}
                                </Text>
                                <Pressable
                                  accessibilityLabel="Increase repeat interval"
                                  disabled={planRepeat.interval >= 99}
                                  onPress={() =>
                                    setPlanRepeat((current) =>
                                      current
                                        ? {
                                            ...current,
                                            interval: Math.min(
                                              99,
                                              current.interval + 1,
                                            ),
                                          }
                                        : current,
                                    )
                                  }
                                  style={({ pressed }) => [
                                    modalStyles.planRepeatStepButton,
                                    {
                                      borderColor: theme.tabBorder,
                                      opacity:
                                        planRepeat.interval >= 99 ? 0.4 : 1,
                                    },
                                    pressed && styles.pressed,
                                  ]}
                                >
                                  <SymbolView
                                    name={sym("plus", "add")}
                                    size={16}
                                    weight="bold"
                                    tintColor={theme.textSecondary}
                                  />
                                </Pressable>
                              </View>
                            </View>

                            <View style={modalStyles.planRepeatUnitRow}>
                              {(["daily", "weekly", "monthly"] as const).map(
                                (cadence) => {
                                  const isSelected =
                                    planRepeat.cadence === cadence;
                                  return (
                                    <Pressable
                                      key={cadence}
                                      accessibilityRole="button"
                                      accessibilityState={{
                                        selected: isSelected,
                                      }}
                                      onPress={() =>
                                        setPlanRepeat((current) =>
                                          current
                                            ? {
                                                ...current,
                                                cadence,
                                                days:
                                                  cadence === "weekly"
                                                    ? current.days?.length
                                                      ? current.days
                                                      : [
                                                          repeatDate?.getDay() ??
                                                            new Date().getDay(),
                                                        ]
                                                    : null,
                                                monthlyType:
                                                  cadence === "monthly"
                                                    ? (current.monthlyType ??
                                                      "day_of_month")
                                                    : null,
                                              }
                                            : current,
                                        )
                                      }
                                      style={({ pressed }) => [
                                        modalStyles.planRepeatUnitOption,
                                        {
                                          backgroundColor: isSelected
                                            ? theme.primary
                                            : "transparent",
                                          borderColor: theme.tabBorder,
                                        },
                                        pressed && styles.pressed,
                                      ]}
                                    >
                                      <Text
                                        numberOfLines={1}
                                        style={[
                                          modalStyles.planRepeatUnitText,
                                          {
                                            color: isSelected
                                              ? theme.primaryForeground
                                              : theme.textSecondary,
                                          },
                                        ]}
                                      >
                                        {repeatUnitLabel(
                                          cadence,
                                          planRepeat.interval,
                                        )}
                                      </Text>
                                    </Pressable>
                                  );
                                },
                              )}
                            </View>

                            {isRepeatOptionsOpen &&
                            planRepeat.cadence === "weekly" ? (
                              <View style={modalStyles.planRepeatControlRow}>
                                <Text
                                  style={[
                                    modalStyles.planRepeatControlLabel,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  Repeat on
                                </Text>
                                <View style={modalStyles.planRepeatDays}>
                                  {REPEAT_WEEKDAYS.map(
                                    ([label, day, dayName]) => {
                                      const isSelected = (
                                        planRepeat.days?.length
                                          ? planRepeat.days
                                          : [
                                              repeatDate?.getDay() ??
                                                new Date().getDay(),
                                            ]
                                      ).includes(day);
                                      return (
                                        <Pressable
                                          key={dayName}
                                          accessibilityLabel={`${dayName} repeat day`}
                                          accessibilityRole="checkbox"
                                          accessibilityState={{
                                            checked: isSelected,
                                          }}
                                          onPress={() =>
                                            setPlanRepeat((current) => {
                                              if (!current) return current;
                                              const days = current.days?.length
                                                ? current.days
                                                : [
                                                    repeatDate?.getDay() ??
                                                      new Date().getDay(),
                                                  ];
                                              const nextDays = isSelected
                                                ? days.filter(
                                                    (value) => value !== day,
                                                  )
                                                : [...days, day].sort(
                                                    (a, b) => a - b,
                                                  );
                                              return nextDays.length
                                                ? { ...current, days: nextDays }
                                                : current;
                                            })
                                          }
                                          style={({ pressed }) => [
                                            modalStyles.planRepeatDay,
                                            {
                                              backgroundColor: isSelected
                                                ? theme.primary
                                                : theme.tabBar,
                                            },
                                            pressed && styles.pressed,
                                          ]}
                                        >
                                          <Text
                                            style={[
                                              modalStyles.planRepeatDayText,
                                              {
                                                color: isSelected
                                                  ? theme.primaryForeground
                                                  : theme.textSecondary,
                                              },
                                            ]}
                                          >
                                            {label}
                                          </Text>
                                        </Pressable>
                                      );
                                    },
                                  )}
                                </View>
                              </View>
                            ) : null}

                            {isRepeatOptionsOpen &&
                            planRepeat.cadence === "monthly" ? (
                              <View style={modalStyles.planRepeatControlRow}>
                                <Text
                                  style={[
                                    modalStyles.planRepeatControlLabel,
                                    { color: theme.textSecondary },
                                  ]}
                                >
                                  Monthly on
                                </Text>
                                <Pressable
                                  accessibilityRole="button"
                                  onPress={() =>
                                    setPlanRepeat((current) =>
                                      current
                                        ? {
                                            ...current,
                                            monthlyType:
                                              current.monthlyType ===
                                              "day_of_week"
                                                ? "day_of_month"
                                                : "day_of_week",
                                          }
                                        : current,
                                    )
                                  }
                                  style={({ pressed }) => [
                                    modalStyles.planRepeatMonthlyOption,
                                    {
                                      borderColor: theme.tabBorder,
                                      flex: 1,
                                    },
                                    pressed && styles.pressed,
                                  ]}
                                >
                                  <Text
                                    style={[
                                      modalStyles.planRepeatControlLabel,
                                      { color: theme.text },
                                    ]}
                                  >
                                    {planRepeat.monthlyType === "day_of_week"
                                      ? "the same weekday"
                                      : `day ${repeatDate?.getDate() ?? new Date().getDate()}`}
                                  </Text>
                                  <SymbolView
                                    name={sym(
                                      "chevron.down",
                                      "arrow_drop_down",
                                    )}
                                    size={17}
                                    weight="semibold"
                                    tintColor={theme.textSecondary}
                                  />
                                </Pressable>
                              </View>
                            ) : null}
                          </View>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {onSetColor ? (
                  <View
                    style={[
                      modalStyles.colorSection,
                      {
                        backgroundColor: theme.tabBar,
                        borderColor: theme.tabBorder,
                      },
                    ]}
                  >
                    <ReliablePressable
                      accessibilityLabel={`${isColorPickerOpen ? "Hide" : "Show"} color options`}
                      accessibilityRole="button"
                      disabled={isUpdatingColor}
                      onPress={() =>
                        setIsColorPickerOpen((current) => !current)
                      }
                      style={({ pressed }) => [
                        modalStyles.colorHeaderButton,
                        pressed && styles.pressed,
                      ]}
                    >
                      <View style={modalStyles.colorSectionHeader}>
                        <View style={modalStyles.colorLabelRow}>
                          <View
                            style={[
                              modalStyles.colorCurrentSwatch,
                              {
                                backgroundColor: effectiveColor,
                              },
                            ]}
                          />
                          <Text
                            style={[
                              modalStyles.colorSectionTitle,
                              { color: theme.text },
                            ]}
                          >
                            Color
                          </Text>
                        </View>
                        <View style={modalStyles.colorValueRow}>
                          <Text
                            style={[
                              modalStyles.colorSectionValue,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {color === null || color === undefined
                              ? "Default"
                              : (selectedColorOption?.label ?? "Selected")}
                          </Text>
                          <SymbolView
                            name={sym(
                              isColorPickerOpen ? "chevron.up" : "chevron.down",
                              isColorPickerOpen
                                ? "keyboard_arrow_up"
                                : "keyboard_arrow_down",
                            )}
                            size={17}
                            tintColor={theme.textSecondary}
                          />
                        </View>
                      </View>
                    </ReliablePressable>
                    {isColorPickerOpen ? (
                      <>
                        <ReliablePressable
                          accessibilityLabel="Use Float calendar color"
                          accessibilityRole="radio"
                          accessibilityState={{
                            checked: color === null || color === undefined,
                            disabled: isUpdatingColor,
                          }}
                          disabled={isUpdatingColor}
                          onPress={() => {
                            setIsColorPickerOpen(false);
                            onSetColor(null);
                          }}
                          style={({ pressed }) => [
                            modalStyles.colorDefaultOption,
                            { borderColor: theme.tabBorder },
                            pressed && styles.pressed,
                          ]}
                        >
                          <Text
                            style={[
                              modalStyles.colorSectionValue,
                              { color: theme.textSecondary },
                            ]}
                          >
                            Float calendar color
                          </Text>
                        </ReliablePressable>
                        <View style={modalStyles.colorOptions}>
                          {isLoadingGoogleColors ? (
                            <ActivityIndicator
                              color={theme.primary}
                              size="small"
                            />
                          ) : (
                            colorOptions.map((option) => {
                              const isSelected = color === option.color;

                              return (
                                <ReliablePressable
                                  accessibilityLabel={`${option.label} color`}
                                  accessibilityRole="radio"
                                  accessibilityState={{
                                    checked: isSelected,
                                    disabled: isUpdatingColor,
                                  }}
                                  disabled={
                                    isUpdatingColor || isLoadingGoogleColors
                                  }
                                  key={option.label}
                                  onPress={() => {
                                    setIsColorPickerOpen(false);
                                    onSetColor(option.color);
                                  }}
                                  style={({ pressed }) => [
                                    modalStyles.colorOption,
                                    {
                                      borderColor: isSelected
                                        ? theme.text
                                        : "transparent",
                                    },
                                    pressed && styles.pressed,
                                  ]}
                                >
                                  <View
                                    style={[
                                      modalStyles.colorSwatch,
                                      { backgroundColor: option.color },
                                    ]}
                                  />
                                </ReliablePressable>
                              );
                            })
                          )}
                        </View>
                      </>
                    ) : null}
                  </View>
                ) : null}

                {!isFutureDate ? (
                  <View style={modalStyles.photoRow}>
                    <ReliablePressable
                      disabled={isUploadingPhoto}
                      onPress={() => onAddPhoto("camera")}
                      style={({ pressed }) => [
                        modalStyles.photoBtn,
                        {
                          backgroundColor: theme.tabBar,
                          borderColor: theme.tabBorder,
                        },
                        isUploadingPhoto && modalStyles.disabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      {uploadingPhotoSource === "camera" ? (
                        <ActivityIndicator color={theme.primary} size="small" />
                      ) : (
                        <SymbolView
                          name={sym("camera.fill", "camera_alt")}
                          size={20}
                          tintColor={theme.tabIcon}
                        />
                      )}
                      <Text
                        style={[
                          modalStyles.photoBtnText,
                          { color: theme.text },
                        ]}
                      >
                        Take photo
                      </Text>
                    </ReliablePressable>
                    <ReliablePressable
                      disabled={isUploadingPhoto}
                      onPress={() => onAddPhoto("library")}
                      style={({ pressed }) => [
                        modalStyles.photoBtn,
                        {
                          backgroundColor: theme.tabBar,
                          borderColor: theme.tabBorder,
                        },
                        isUploadingPhoto && modalStyles.disabled,
                        pressed && styles.pressed,
                      ]}
                    >
                      {uploadingPhotoSource === "library" ? (
                        <ActivityIndicator color={theme.primary} size="small" />
                      ) : (
                        <SymbolView
                          name={sym("photo.fill", "photo_library")}
                          size={20}
                          tintColor={theme.tabIcon}
                        />
                      )}
                      <Text
                        style={[
                          modalStyles.photoBtnText,
                          { color: theme.text },
                        ]}
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
                    modalStyles.standaloneActionRow,
                    {
                      backgroundColor: theme.tabBar,
                      borderColor: theme.tabBorder,
                    },
                    pressed && styles.pressed,
                  ]}
                >
                  <SymbolView
                    name={sym("note.text", "notes")}
                    size={21}
                    tintColor={theme.tabIcon}
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
