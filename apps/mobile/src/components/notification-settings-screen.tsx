import { FloatingLogoLoader } from "@/components/floating-logo-loader";
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

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

type ToggleItem = {
  key: keyof NotificationSettings;
  icon: SymbolName;
  title: string;
  description: string;
};

type ToggleSection = {
  title: string;
  items: ToggleItem[];
};

const SECTIONS: ToggleSection[] = [
  {
    title: "Reminders",
    items: [
      {
        key: "notifyScheduleEvents",
        icon: sym("calendar.badge.clock", "event_available"),
        title: "Scheduled events",
        description: "A reminder when an event on your day plan starts.",
      },
      {
        key: "notifyMonthlyGoalToday",
        icon: sym("calendar", "event"),
        title: "Periodic habit today",
        description:
          "A 9:00 AM reminder for periodic habits planned for today.",
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

  const toggle = (key: keyof NotificationSettings, value: boolean) => {
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
              contentContainerStyle={styles.content}
              showsVerticalScrollIndicator={false}
            >
              {error ? (
                <Text style={[styles.errorText, { color: "#B4232C" }]}>
                  {error}
                </Text>
              ) : null}
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
  footnote: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
    marginTop: 4,
    paddingHorizontal: 4,
  },
});
