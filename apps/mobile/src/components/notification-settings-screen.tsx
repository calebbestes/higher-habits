import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { type MenuAction, MenuView } from "@expo/ui/community/menu";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MaxContentWidth } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { cancelAllScheduleEventNotificationsAsync } from "@/lib/push-notifications";
import {
  NOTIFICATION_SETTING_DEFAULTS,
  type NotificationSettings,
  fetchNotificationSettings,
  updateNotificationSettings,
} from "@/lib/user-settings-client";

type SymbolName = SymbolViewProps["name"];
type NotificationToggleKey = {
  [K in keyof NotificationSettings]: NotificationSettings[K] extends boolean
    ? K
    : never;
}[keyof NotificationSettings];
type NotificationTimeKey =
  | "dailyNotificationTime"
  | "weeklyNotificationTime"
  | "monthlyNotificationTime";
type NotificationDayKey = "weeklyNotificationDay" | "monthlyNotificationDay";

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

type ToggleItem = {
  key: NotificationToggleKey;
  icon: SymbolName;
  title: string;
  description: string;
};

type ToggleSection = {
  title: string;
  items: ToggleItem[];
};
type TimeItem = {
  dayKey?: NotificationDayKey;
  dayOptions?: MenuAction[];
  icon: SymbolName;
  key: NotificationTimeKey;
  title: string;
  description: string;
};

const HOURS = Array.from({ length: 12 }, (_, index) => index + 1);
const MINUTES = Array.from({ length: 12 }, (_, index) => index * 5);
const WEEKLY_DAY_ACTIONS: MenuAction[] = [
  { id: "sunday", title: "Sunday" },
  { id: "monday", title: "Monday" },
  { id: "tuesday", title: "Tuesday" },
  { id: "wednesday", title: "Wednesday" },
  { id: "thursday", title: "Thursday" },
  { id: "friday", title: "Friday" },
  { id: "saturday", title: "Saturday" },
];
const MONTHLY_DAY_ACTIONS: MenuAction[] = [
  { id: "first", title: "1st" },
  { id: "fifteenth", title: "15th" },
  { id: "last", title: "Last day" },
];

const SECTIONS: ToggleSection[] = [
  {
    title: "Reminders",
    items: [
      {
        key: "notifyScheduleEvents",
        icon: sym("calendar.badge.clock", "event_available"),
        title: "Scheduled events",
        description: "A reminder when an event on your daily plan starts.",
      },
      {
        key: "notifyMonthlyGoalToday",
        icon: sym("calendar", "event"),
        title: "Periodic habit today",
        description: "A reminder for periodic habits planned for today.",
      },
      {
        key: "notifyTasksDueToday",
        icon: sym("checklist", "checklist"),
        title: "Tasks due today",
        description: "A daily reminder of tasks due today.",
      },
      {
        key: "notifyPlanTomorrow",
        icon: sym("moon.stars.fill", "bedtime"),
        title: "Plan tomorrow",
        description: "An evening nudge to set up tomorrow's goals.",
      },
      {
        key: "notifyInactivityReminder",
        icon: sym("clock.arrow.circlepath", "history"),
        title: "Get back on track",
        description: "If your last check-in was a week or a month ago.",
      },
    ],
  },
  {
    title: "Streaks & progress",
    items: [
      {
        key: "notifyStreakAtRisk",
        icon: sym("flame.fill", "local_fire_department"),
        title: "Streak at risk",
        description: "Late-day reminder when a streak is about to break.",
      },
      {
        key: "notifyStreakMilestone",
        icon: sym("trophy.fill", "emoji_events"),
        title: "Streak milestones",
        description: "Celebrate hitting a new streak length.",
      },
      {
        key: "notifyEndOfDayNudge",
        icon: sym("sun.haze.fill", "wb_twilight"),
        title: "End-of-day nudge",
        description: "How many high-priority goals are still open today.",
      },
      {
        key: "notifyWeeklyRecap",
        icon: sym("chart.bar.fill", "bar_chart"),
        title: "Weekly recap",
        description: "A summary of how your week went.",
      },
    ],
  },
  {
    title: "Friends & social",
    items: [
      {
        key: "notifyFriendRequests",
        icon: sym("person.crop.circle.badge.plus", "person_add"),
        title: "Friend requests",
        description: "When someone sends you a friend request.",
      },
      {
        key: "notifyFriendRequestAccepted",
        icon: sym("person.fill.checkmark", "how_to_reg"),
        title: "Request accepted",
        description: "When someone accepts your friend request.",
      },
      {
        key: "notifyPostProps",
        icon: sym("hand.thumbsup.fill", "thumb_up"),
        title: "Props on your posts",
        description: "When a friend props one of your journal posts.",
      },
      {
        key: "notifyPostComments",
        icon: sym("bubble.left.fill", "chat_bubble"),
        title: "Comments on your posts",
        description: "When a friend comments on one of your posts.",
      },
      {
        key: "notifyFriendPosts",
        icon: sym("rectangle.stack.badge.person.crop", "dynamic_feed"),
        title: "Friends post",
        description: "When a friend shares a visible post.",
      },
      {
        key: "notifyFriendMilestone",
        icon: sym("party.popper.fill", "celebration"),
        title: "Friend milestones",
        description: "When a friend finishes their goals or hits a streak.",
      },
    ],
  },
  {
    title: "Shared goals & incentives",
    items: [
      {
        key: "notifySharedGoalInvites",
        icon: sym("person.2.fill", "group"),
        title: "New shared goal / incentive",
        description: "When a friend invites you to a shared goal or incentive.",
      },
      {
        key: "notifySharedGoalResponses",
        icon: sym("person.badge.plus", "group_add"),
        title: "Invite responses",
        description: "When someone joins or declines your shared goal.",
      },
      {
        key: "notifyLastToComplete",
        icon: sym("exclamationmark.circle.fill", "error"),
        title: "You're the last one",
        description: "When everyone else finished a shared goal today.",
      },
      {
        key: "notifySharedGoalEnding",
        icon: sym("hourglass", "hourglass_empty"),
        title: "Shared goal ending soon",
        description: "When a shared goal is close to its end date.",
      },
      {
        key: "notifyStakesReminder",
        icon: sym("exclamationmark.triangle.fill", "warning"),
        title: "Stakes reminder",
        description: "A heads-up before a carrot or stick consequence hits.",
      },
      {
        key: "notifyIncentiveEarned",
        icon: sym("gift.fill", "redeem"),
        title: "Incentive earned",
        description: "When an incentive you set or received is met.",
      },
    ],
  },
];
const TIME_ITEMS: TimeItem[] = [
  {
    key: "dailyNotificationTime",
    icon: sym("bell.and.waves.left.and.right.fill", "notifications_active"),
    title: "Daily reminders",
    description: "Planning and end-of-day nudges.",
  },
  {
    key: "weeklyNotificationTime",
    dayKey: "weeklyNotificationDay",
    dayOptions: WEEKLY_DAY_ACTIONS,
    icon: sym("calendar.badge.clock", "event_available"),
    title: "Weekly recap",
    description: "Progress recap.",
  },
  {
    key: "monthlyNotificationTime",
    dayKey: "monthlyNotificationDay",
    dayOptions: MONTHLY_DAY_ACTIONS,
    icon: sym("calendar", "event"),
    title: "Monthly reminders",
    description: "Monthly and periodic habits.",
  },
];

function parseTime(value: string) {
  const [hourText = "0", minuteText = "0"] = value.split(":");
  const hour24 = Number(hourText);
  const minute = Number(minuteText);
  if (
    !Number.isInteger(hour24) ||
    !Number.isInteger(minute) ||
    hour24 < 0 ||
    hour24 > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return { hour: 9, minute: 0, period: "AM" as const };
  }

  return {
    hour: hour24 % 12 || 12,
    minute,
    period: hour24 >= 12 ? ("PM" as const) : ("AM" as const),
  };
}

function formatTimeValue({
  hour,
  minute,
  period,
}: {
  hour: number;
  minute: number;
  period: "AM" | "PM";
}) {
  const hour24 =
    period === "AM" ? (hour === 12 ? 0 : hour) : hour === 12 ? 12 : hour + 12;

  return `${String(hour24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function TimeSettingRow({
  dayValue,
  item,
  onDayChange,
  onChange,
  showDivider,
  value,
}: {
  dayValue?: string;
  item: TimeItem;
  onDayChange?: (value: string) => void;
  onChange: (value: string) => void;
  showDivider: boolean;
  value: string;
}) {
  const theme = useTheme();
  const time = parseTime(value);
  const hourActions: MenuAction[] = HOURS.map((hour) => ({
    id: String(hour),
    title: String(hour),
    state: time.hour === hour ? "on" : undefined,
  }));
  const minuteActions: MenuAction[] = MINUTES.map((minute) => ({
    id: String(minute),
    title: String(minute).padStart(2, "0"),
    state: time.minute === minute ? "on" : undefined,
  }));
  const dayActions = item.dayOptions?.map((action) => ({
    ...action,
    state: dayValue === action.id ? ("on" as const) : undefined,
  }));
  const dayLabel =
    dayActions?.find((action) => action.id === dayValue)?.title ?? null;
  const periodActions: MenuAction[] = [
    { id: "AM", title: "AM", state: time.period === "AM" ? "on" : undefined },
    { id: "PM", title: "PM", state: time.period === "PM" ? "on" : undefined },
  ];
  const select = (part: "hour" | "minute" | "period", actionId: string) => {
    const next = { ...time };
    if (part === "hour") next.hour = Number(actionId);
    if (part === "minute") next.minute = Number(actionId);
    if (part === "period" && (actionId === "AM" || actionId === "PM")) {
      next.period = actionId;
    }
    onChange(formatTimeValue(next));
  };

  return (
    <View
      style={[
        styles.timeRow,
        showDivider && {
          borderBottomColor: theme.tabBorder,
          borderBottomWidth: StyleSheet.hairlineWidth,
        },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: `${theme.primary}1A` }]}>
        <SymbolView
          name={item.icon}
          size={18}
          weight="semibold"
          tintColor={theme.primary}
        />
      </View>
      <View style={styles.timeBody}>
        <View style={styles.timeHeader}>
          <View style={styles.rowText}>
            <Text style={[styles.rowTitle, { color: theme.text }]}>
              {item.title}
            </Text>
            <Text
              style={[styles.rowDescription, { color: theme.textSecondary }]}
            >
              {item.description}
            </Text>
          </View>
        </View>
        <View style={styles.timeControls}>
          {dayActions && onDayChange && dayLabel ? (
            <TimeMenu
              actions={dayActions}
              label={dayLabel}
              minWidth={86}
              onSelect={onDayChange}
            />
          ) : null}
          <TimeMenu
            actions={hourActions}
            label={String(time.hour)}
            onSelect={(actionId) => select("hour", actionId)}
          />
          <TimeMenu
            actions={minuteActions}
            label={String(time.minute).padStart(2, "0")}
            onSelect={(actionId) => select("minute", actionId)}
          />
          <TimeMenu
            actions={periodActions}
            label={time.period}
            onSelect={(actionId) => select("period", actionId)}
          />
        </View>
      </View>
    </View>
  );
}

function TimeMenu({
  actions,
  label,
  minWidth,
  onSelect,
}: {
  actions: MenuAction[];
  label: string;
  minWidth?: number;
  onSelect: (actionId: string) => void;
}) {
  const theme = useTheme();

  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => onSelect(nativeEvent.event)}
    >
      <View
        style={[
          styles.timeChip,
          minWidth ? { minWidth } : null,
          { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
        ]}
      >
        <Text style={[styles.timeChipText, { color: theme.text }]}>
          {label}
        </Text>
        <SymbolView
          name={sym("chevron.down", "expand_more")}
          size={12}
          weight="semibold"
          tintColor={theme.textSecondary}
        />
      </View>
    </MenuView>
  );
}

export function NotificationSettingsModal({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const theme = useTheme();
  const [settings, setSettings] = useState<NotificationSettings>(
    NOTIFICATION_SETTING_DEFAULTS,
  );
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setIsLoading(true);
    setError(null);
    fetchNotificationSettings()
      .then((data) => {
        if (active) setSettings(data);
      })
      .catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : "Could not load settings.",
          );
        }
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible]);

  const toggle = (key: NotificationToggleKey, value: boolean) => {
    const previous = settings;
    const next = { ...settings, [key]: value };
    setSettings(next);
    if (key === "notifyScheduleEvents" && !value) {
      void cancelAllScheduleEventNotificationsAsync();
    }
    // Persist just the changed field; revert on failure.
    updateNotificationSettings({ [key]: value }).catch(() => {
      setSettings(previous);
    });
  };
  const updateTime = (key: NotificationTimeKey, value: string) => {
    const previous = settings;
    const next = { ...settings, [key]: value };
    setSettings(next);
    updateNotificationSettings({ [key]: value }).catch(() => {
      setSettings(previous);
    });
  };
  const updateDay = (key: NotificationDayKey, value: string) => {
    const previous = settings;
    const next = { ...settings, [key]: value };
    setSettings(next);
    updateNotificationSettings({ [key]: value }).catch(() => {
      setSettings(previous);
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={[styles.screen, { backgroundColor: theme.background }]}>
        <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
          <View style={[styles.header, { borderBottomColor: theme.tabBorder }]}>
            <Text style={[styles.headerTitle, { color: theme.text }]}>
              Notifications
            </Text>
            <Pressable
              onPress={onClose}
              hitSlop={12}
              accessibilityLabel="Close"
              style={[
                styles.closeBtn,
                { backgroundColor: theme.backgroundElement },
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

          {isLoading ? (
            <View style={styles.centerState}>
              <FloatingLogoLoader />
            </View>
          ) : (
            <ScrollView
              canCancelContentTouches
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              {error ? (
                <Text style={[styles.errorText, { color: "#B4232C" }]}>
                  {error}
                </Text>
              ) : null}
              <View style={styles.section}>
                <Text
                  style={[styles.groupTitle, { color: theme.textSecondary }]}
                >
                  Timing
                </Text>
                <View
                  style={[
                    styles.groupCard,
                    {
                      backgroundColor: theme.backgroundElement,
                      borderColor: theme.tabBorder,
                    },
                  ]}
                >
                  {TIME_ITEMS.map((item, index) => (
                    <TimeSettingRow
                      key={item.key}
                      dayValue={item.dayKey ? settings[item.dayKey] : undefined}
                      item={item}
                      onDayChange={
                        item.dayKey
                          ? (value) =>
                              updateDay(
                                item.dayKey as NotificationDayKey,
                                value,
                              )
                          : undefined
                      }
                      onChange={(value) => updateTime(item.key, value)}
                      showDivider={index < TIME_ITEMS.length - 1}
                      value={settings[item.key]}
                    />
                  ))}
                </View>
              </View>
              {SECTIONS.map((section) => (
                <View key={section.title} style={styles.section}>
                  <Text
                    style={[styles.groupTitle, { color: theme.textSecondary }]}
                  >
                    {section.title}
                  </Text>
                  <View
                    style={[
                      styles.groupCard,
                      {
                        backgroundColor: theme.backgroundElement,
                        borderColor: theme.tabBorder,
                      },
                    ]}
                  >
                    {section.items.map((item, index) => (
                      <View
                        key={item.key}
                        style={[
                          styles.row,
                          index < section.items.length - 1 && {
                            borderBottomColor: theme.tabBorder,
                            borderBottomWidth: StyleSheet.hairlineWidth,
                          },
                        ]}
                      >
                        <View
                          style={[
                            styles.rowIcon,
                            { backgroundColor: `${theme.primary}1A` },
                          ]}
                        >
                          <SymbolView
                            name={item.icon}
                            size={18}
                            weight="semibold"
                            tintColor={theme.primary}
                          />
                        </View>
                        <View style={styles.rowText}>
                          <Text
                            style={[styles.rowTitle, { color: theme.text }]}
                          >
                            {item.title}
                          </Text>
                          <Text
                            style={[
                              styles.rowDescription,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {item.description}
                          </Text>
                        </View>
                        <Switch
                          value={settings[item.key]}
                          onValueChange={(value) => toggle(item.key, value)}
                          trackColor={{ true: theme.primary }}
                        />
                      </View>
                    ))}
                  </View>
                </View>
              ))}
              <Text style={[styles.footnote, { color: theme.textSecondary }]}>
                Turn off any notification you don't want to receive. Make sure
                notifications are also enabled for float in your device
                settings.
              </Text>
            </ScrollView>
          )}
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
    letterSpacing: -0.4,
  },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 12,
  },
  centerState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  errorText: { fontSize: 13, fontWeight: "600" },
  section: { gap: 8 },
  groupTitle: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginLeft: 4,
  },
  groupCard: {
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 68,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
  rowDescription: { fontSize: 12, lineHeight: 16, fontWeight: "500" },
  timeRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    minHeight: 92,
  },
  timeBody: {
    flex: 1,
    gap: 10,
    minWidth: 0,
  },
  timeHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  timeControls: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 7,
  },
  timeChip: {
    minWidth: 47,
    minHeight: 36,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 11,
    paddingHorizontal: 7,
  },
  timeChipText: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
  },
  footnote: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    marginTop: 4,
    paddingHorizontal: 4,
  },
});
