import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { HistoryHeaderMenu } from "@/components/history-header-menu";
import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import {
  type FloatCreditActionType,
  type FloatCreditReward,
  type FloatCreditSummary,
  fetchFloatCredits,
} from "@/lib/float-credits-client";

type SymbolName = SymbolViewProps["name"];

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

const ACTION_ICONS: Record<FloatCreditActionType, SymbolName> = {
  comment: sym("bubble.left.and.bubble.right.fill", "forum"),
  daily_plan: sym("calendar.badge.clock", "event_note"),
  goal_checkpoint_complete: sym("target", "flag"),
  habit_complete: sym("checkmark.seal.fill", "verified"),
  incentive_create: sym("gift.fill", "card_giftcard"),
  monthly_plan: sym("calendar", "calendar_month"),
  post: sym("photo.fill", "image"),
  shared_goal_create: sym("person.3.fill", "groups"),
  task_complete: sym("checklist.checked", "checklist"),
};

const FLOAT_CREDIT_REWARDS: FloatCreditReward[] = [
  {
    id: "theme-unlocks",
    title: "Theme Unlocks",
    description: "Unlock future app themes, icon styles, and chip looks.",
    creditCost: 20,
    status: "coming_soon",
  },
  {
    id: "monthly-reward-offer",
    title: "Monthly Reward Offer",
    description:
      "Redeem credits for eligible monthly app rewards and offers when available.",
    creditCost: 30,
    status: "coming_soon",
  },
  {
    id: "profile-flair",
    title: "Profile Flair",
    description:
      "Add a credit-earned profile badge when profile flair launches.",
    creditCost: 50,
    status: "coming_soon",
  },
];

const EMPTY_CREDIT_SUMMARY: FloatCreditSummary = {
  balance: 0,
  lifetimeEarned: 0,
  recent: [],
  rewards: FLOAT_CREDIT_REWARDS,
};

export function CreditsScreen() {
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();
  const [summary, setSummary] = useState<FloatCreditSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const load = useCallback(async (refresh = false) => {
    refresh ? setIsRefreshing(true) : setIsLoading(true);

    try {
      const nextSummary = await fetchFloatCredits();
      setSummary({
        ...nextSummary,
        rewards: nextSummary.rewards.length
          ? nextSummary.rewards
          : FLOAT_CREDIT_REWARDS,
      });
    } catch {
      setSummary(EMPTY_CREDIT_SUMMARY);
    } finally {
      refresh ? setIsRefreshing(false) : setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const balance = summary?.balance ?? 0;
  const lifetimeEarned = summary?.lifetimeEarned ?? 0;
  const rewards = summary?.rewards.length
    ? summary.rewards
    : FLOAT_CREDIT_REWARDS;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView
          canCancelContentTouches={false}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarHeight + 16 },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              tintColor={theme.primary}
              onRefresh={() => void load(true)}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <HistoryHeaderMenu currentSection="credits" />
            <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
              Earned by real progress
            </Text>
          </View>

          {isLoading ? (
            <View style={styles.centerState}>
              <FloatingLogoLoader />
            </View>
          ) : (
            <>
              <View
                style={[
                  styles.balancePanel,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                  },
                ]}
              >
                <View style={styles.balanceTopRow}>
                  <View
                    style={[
                      styles.balanceIcon,
                      { backgroundColor: theme.primary },
                    ]}
                  >
                    <SymbolView
                      name={sym("sparkles", "auto_awesome")}
                      size={24}
                      weight="bold"
                      tintColor={theme.primaryForeground}
                    />
                  </View>
                  <View style={styles.balanceCopy}>
                    <Text
                      style={[
                        styles.balanceLabel,
                        { color: theme.textSecondary },
                      ]}
                    >
                      Current balance
                    </Text>
                    <Text style={[styles.balanceValue, { color: theme.text }]}>
                      {balance}
                    </Text>
                  </View>
                </View>
                <View style={styles.statRow}>
                  <StatPill label="Lifetime earned" value={lifetimeEarned} />
                  <StatPill
                    label="Recent activity"
                    value={summary?.recent.length ?? 0}
                  />
                </View>
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Store
                </Text>
                {rewards.map((reward) => {
                  const progress =
                    reward.creditCost > 0
                      ? Math.min(1, balance / reward.creditCost)
                      : 0;

                  return (
                    <View
                      key={reward.id}
                      style={[
                        styles.rewardCard,
                        {
                          backgroundColor: theme.backgroundElement,
                          borderColor: theme.tabBorder,
                        },
                      ]}
                    >
                      <View style={styles.rewardHeader}>
                        <Text
                          style={[styles.rewardTitle, { color: theme.text }]}
                        >
                          {reward.title}
                        </Text>
                        <Text
                          style={[
                            styles.rewardCost,
                            {
                              backgroundColor: theme.backgroundSelected,
                              color: theme.text,
                            },
                          ]}
                        >
                          {reward.creditCost}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.rewardDescription,
                          { color: theme.textSecondary },
                        ]}
                      >
                        {reward.description}
                      </Text>
                      <View
                        style={[
                          styles.progressTrack,
                          { backgroundColor: theme.backgroundSelected },
                        ]}
                      >
                        <View
                          style={[
                            styles.progressFill,
                            {
                              backgroundColor: theme.primary,
                              width: `${progress * 100}%`,
                            },
                          ]}
                        />
                      </View>
                      <Text
                        style={[
                          styles.rewardStatus,
                          { color: theme.textSecondary },
                        ]}
                      >
                        Coming soon
                      </Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.section}>
                <Text style={[styles.sectionTitle, { color: theme.text }]}>
                  Recent
                </Text>
                {summary?.recent.length ? (
                  summary.recent.map((transaction) => (
                    <View
                      key={transaction.id}
                      style={[
                        styles.activityRow,
                        {
                          backgroundColor: theme.backgroundElement,
                          borderColor: theme.tabBorder,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.activityIcon,
                          { backgroundColor: theme.backgroundSelected },
                        ]}
                      >
                        <SymbolView
                          name={ACTION_ICONS[transaction.actionType]}
                          size={19}
                          weight="semibold"
                          tintColor={
                            transaction.amount >= 0
                              ? theme.primary
                              : theme.textSecondary
                          }
                        />
                      </View>
                      <View style={styles.activityCopy}>
                        <Text
                          style={[styles.activityTitle, { color: theme.text }]}
                        >
                          {transaction.description}
                        </Text>
                        <Text
                          style={[
                            styles.activityDate,
                            { color: theme.textSecondary },
                          ]}
                        >
                          {formatActivityDate(transaction.actionDate)}
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.activityAmount,
                          {
                            color:
                              transaction.amount >= 0
                                ? theme.primary
                                : theme.textSecondary,
                          },
                        ]}
                      >
                        {transaction.amount > 0 ? "+" : ""}
                        {transaction.amount}
                      </Text>
                    </View>
                  ))
                ) : (
                  <View style={styles.emptyState}>
                    <Text style={[styles.emptyTitle, { color: theme.text }]}>
                      No credits yet
                    </Text>
                    <Text
                      style={[styles.emptyCopy, { color: theme.textSecondary }]}
                    >
                      Your credit history will appear here.
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function StatPill({ label, value }: { label: string; value: number }) {
  const theme = useTheme();

  return (
    <View
      style={[styles.statPill, { backgroundColor: theme.backgroundSelected }]}
    >
      <Text style={[styles.statValue, { color: theme.text }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
}

function formatActivityDate(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    alignSelf: "center",
    maxWidth: MaxContentWidth,
    paddingHorizontal: 20,
    paddingTop: 38,
    width: "100%",
  },
  header: {
    marginBottom: 22,
  },
  subtitle: {
    fontSize: 14,
    fontWeight: "800",
    marginTop: 4,
  },
  centerState: {
    alignItems: "center",
    minHeight: 260,
    justifyContent: "center",
  },
  balancePanel: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 18,
    padding: 20,
  },
  balanceTopRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 14,
  },
  balanceIcon: {
    alignItems: "center",
    borderRadius: 24,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  balanceCopy: {
    flex: 1,
  },
  balanceLabel: {
    fontSize: 13,
    fontWeight: "900",
    letterSpacing: 0,
    textTransform: "uppercase",
  },
  balanceValue: {
    fontSize: 54,
    fontWeight: "900",
    lineHeight: 58,
  },
  statRow: {
    flexDirection: "row",
    gap: 10,
  },
  statPill: {
    borderRadius: 8,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "900",
    lineHeight: 24,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: "800",
  },
  section: {
    gap: 10,
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: "900",
    lineHeight: 26,
  },
  rewardCard: {
    borderRadius: 8,
    borderWidth: 1,
    gap: 10,
    padding: 16,
  },
  rewardHeader: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    justifyContent: "space-between",
  },
  rewardTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "900",
    lineHeight: 22,
  },
  rewardCost: {
    borderRadius: 16,
    fontSize: 14,
    fontWeight: "900",
    minWidth: 42,
    overflow: "hidden",
    paddingHorizontal: 10,
    paddingVertical: 5,
    textAlign: "center",
  },
  rewardDescription: {
    fontSize: 13,
    fontWeight: "700",
    lineHeight: 18,
  },
  progressTrack: {
    borderRadius: 5,
    height: 10,
    overflow: "hidden",
  },
  progressFill: {
    borderRadius: 5,
    height: "100%",
  },
  rewardStatus: {
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
  },
  activityRow: {
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    padding: 12,
  },
  activityIcon: {
    alignItems: "center",
    borderRadius: 20,
    height: 40,
    justifyContent: "center",
    width: 40,
  },
  activityCopy: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 14,
    fontWeight: "900",
    lineHeight: 18,
  },
  activityDate: {
    fontSize: 12,
    fontWeight: "700",
  },
  activityAmount: {
    fontSize: 17,
    fontWeight: "900",
    minWidth: 36,
    textAlign: "right",
  },
  emptyState: {
    alignItems: "center",
    paddingVertical: 40,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "900",
  },
  emptyCopy: {
    fontSize: 13,
    fontWeight: "700",
    marginTop: 4,
    textAlign: "center",
  },
});
