import { BrandedEmptyState } from "@/components/branded-empty-state";
import { GoalActionsModal } from "@/components/daily-goals/goal-actions-modal";
import { getGoalDateStatus } from "@/components/daily-goals/shared";
import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { GoalIcon } from "@/components/goal-icon";
import { GoalNoteEditorModal } from "@/components/goal-note-editor-modal";
import { HistoryHeaderMenu } from "@/components/history-header-menu";
import * as Clipboard from "expo-clipboard";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import { authClient } from "@/lib/auth-client";
import { type FriendRow, fetchFriends } from "@/lib/friends-client";
import {
  type CategoryWithGoals,
  type GoalInCategory,
  type GoalLogStatus,
  type GoalLogsSnapshot,
  type PeriodicGoalInfo,
  fetchGoalLogsSnapshot,
  getMonthKey,
  setGoalLog,
  setGoalLogNote,
  setGoalLogVisibility,
  toDateKey,
} from "@/lib/goal-logs-client";
import { type GoalPhotoSource, pickGoalPhoto } from "@/lib/goal-photo-picker";
import { uploadGoalPhoto } from "@/lib/goal-photos-client";
import type { GoalVisibility } from "@/lib/goals-client";

type SymbolName = SymbolViewProps["name"];

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

const COMPLETE_SHARE_TILE = "🟩";
const EMPTY_SHARE_TILE = "⬜";
type DashboardLogStatus = "complete" | "incomplete" | "planned";

const DAILY_DASHBOARD_DAY_COUNT = 7;

function getLast7Days(today: Date): string[] {
  const days: string[] = [];
  for (let i = DAILY_DASHBOARD_DAY_COUNT - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    days.push(toDateKey(d));
  }
  return days;
}

function dateFromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatShareDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function countMonthlyCompletions({
  goalId,
  currentMonthKey,
  logsByGoalDate,
}: {
  goalId: string;
  currentMonthKey: string;
  logsByGoalDate: Record<string, DashboardLogStatus>;
}): number {
  let count = 0;
  const prefix = `${goalId}_${currentMonthKey}-`;

  for (const [key, val] of Object.entries(logsByGoalDate)) {
    if (key.startsWith(prefix) && val === "complete") count++;
  }

  return count;
}

function buildHabitShareText({
  currentDate,
  categories,
  days,
  logsByGoalDate,
}: {
  currentDate: Date;
  categories: CategoryWithGoals[];
  days: string[];
  logsByGoalDate: Record<string, DashboardLogStatus>;
}): string {
  const currentDateKey = toDateKey(currentDate);
  const rows = categories.flatMap((category) =>
    category.goals.map((goal) => ({
      categoryName: category.name,
      goalName: goal.name,
      cells: days
        .map((dateKey) =>
          getGoalDateStatus(goal, dateKey, logsByGoalDate) === "complete"
            ? COMPLETE_SHARE_TILE
            : EMPTY_SHARE_TILE,
        )
        .join(""),
      completedToday:
        getGoalDateStatus(goal, currentDateKey, logsByGoalDate) === "complete",
    })),
  );

  if (rows.length === 0) return "";

  const firstDateKey = days[0];
  const lastDateKey = days[days.length - 1];
  const rangeLabel =
    firstDateKey && lastDateKey
      ? `Last ${days.length} days (${formatShareDate(
          dateFromDateKey(firstDateKey),
        )} - ${formatShareDate(dateFromDateKey(lastDateKey))})`
      : "Last 7 days";
  const completedToday = rows.filter((row) => row.completedToday).length;
  const lines = [
    `Dashboard ${formatShareDate(currentDate)} ${completedToday}/${rows.length}`,
    rangeLabel,
    "",
  ];
  let previousCategoryName: string | null = null;

  for (const row of rows) {
    if (row.categoryName !== previousCategoryName) {
      if (previousCategoryName !== null) lines.push("");
      lines.push(row.categoryName);
      previousCategoryName = row.categoryName;
    }

    lines.push(`${row.cells} ${row.goalName}`);
  }

  return lines.join("\n");
}

export function DashboardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { data: session } = authClient.useSession();
  const profileImageUrl = session?.user.image;
  const tabBarHeight = useTabBarHeight();
  const today = useRef(new Date()).current;
  const currentMonthKey = useMemo(() => getMonthKey(today), [today]);

  const [snapshot, setSnapshot] = useState<GoalLogsSnapshot | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dashTab, setDashTab] = useState<"daily" | "monthly">("daily");
  const [lowerOpen, setLowerOpen] = useState(false);
  const [isShareOpen, setIsShareOpen] = useState(false);
  const [shareFriends, setShareFriends] = useState<FriendRow[]>([]);
  const [isLoadingShareFriends, setIsLoadingShareFriends] = useState(false);
  const [activeLog, setActiveLog] = useState<{
    dateKey: string;
    goal: GoalInCategory;
  } | null>(null);
  const [noteLog, setNoteLog] = useState<{
    dateKey: string;
    goal: GoalInCategory;
  } | null>(null);
  const [updatingKey, setUpdatingKey] = useState<string | null>(null);
  const [uploadingPhotoSource, setUploadingPhotoSource] =
    useState<GoalPhotoSource | null>(null);
  const [isUpdatingVisibility, setIsUpdatingVisibility] = useState(false);
  const [tooltipGoalId, setTooltipGoalId] = useState<string | null>(null);

  const last7Days = useMemo(() => getLast7Days(today), [today]);
  const todayKey = useMemo(() => toDateKey(today), [today]);

  const load = useCallback(
    async (refresh = false) => {
      refresh ? setIsRefreshing(true) : setIsLoading(true);
      setError(null);
      try {
        const oldestVisibleDate = new Date(today);
        oldestVisibleDate.setDate(
          oldestVisibleDate.getDate() - (DAILY_DASHBOARD_DAY_COUNT - 1),
        );
        const prevMonthKey = getMonthKey(oldestVisibleDate);

        if (prevMonthKey !== currentMonthKey) {
          const [cur, prev] = await Promise.all([
            fetchGoalLogsSnapshot(currentMonthKey),
            fetchGoalLogsSnapshot(prevMonthKey),
          ]);
          setSnapshot({
            ...cur,
            logsByGoalDate: { ...prev.logsByGoalDate, ...cur.logsByGoalDate },
          });
        } else {
          const snap = await fetchGoalLogsSnapshot(currentMonthKey);
          setSnapshot(snap);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not load data.");
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    },
    [currentMonthKey, today],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const monthlyGoals = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.periodicGoals
      .filter((g) => g.period === "monthly" && (g.frequencyGoal ?? 0) > 0)
      .map((goal, index) => ({
        goal,
        index,
        completionRatio:
          countMonthlyCompletions({
            goalId: goal.id,
            currentMonthKey,
            logsByGoalDate: snapshot.logsByGoalDate,
          }) / (goal.frequencyGoal ?? 1),
      }))
      .sort(
        (a, b) => b.completionRatio - a.completionRatio || a.index - b.index,
      )
      .map(({ goal }) => goal);
  }, [currentMonthKey, snapshot]);

  const highPriorityCats = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.categories
      .map((cat) => ({
        ...cat,
        goals: cat.goals.filter((g) => g.priority === "high" && !g.hidden),
      }))
      .filter((cat) => cat.goals.length > 0);
  }, [snapshot]);

  const lowerPriorityCats = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.categories
      .map((cat) => ({
        ...cat,
        goals: cat.goals.filter((g) => g.priority !== "high" && !g.hidden),
      }))
      .filter((cat) => cat.goals.length > 0);
  }, [snapshot]);

  const lowerPriorityGoals = useMemo(
    () => lowerPriorityCats.flatMap((cat) => cat.goals),
    [lowerPriorityCats],
  );
  const shareText = useMemo(
    () =>
      snapshot
        ? buildHabitShareText({
            currentDate: today,
            categories: highPriorityCats,
            days: last7Days,
            logsByGoalDate: snapshot.logsByGoalDate,
          })
        : "",
    [highPriorityCats, last7Days, snapshot, today],
  );

  const openShare = async () => {
    if (!shareText) {
      Alert.alert(
        "Nothing to share yet",
        "No daily goal history is available.",
      );
      return;
    }

    setIsShareOpen(true);
    setIsLoadingShareFriends(true);
    try {
      const friends = await fetchFriends();
      setShareFriends(
        friends.filter(
          (friend) =>
            friend.status === "accepted" && Boolean(friend.friendPhoneNumber),
        ),
      );
    } catch {
      setShareFriends([]);
    } finally {
      setIsLoadingShareFriends(false);
    }
  };

  const copyResults = async () => {
    try {
      await Clipboard.setStringAsync(shareText);
      setIsShareOpen(false);
      Alert.alert("Results copied", "Paste them into any message.");
    } catch {
      Alert.alert("Could not copy results");
    }
  };

  const messageFriend = async (friend: FriendRow) => {
    if (!friend.friendPhoneNumber) return;

    const phoneNumber = friend.friendPhoneNumber.replace(/[^\d+]/g, "");
    const bodySeparator = Platform.OS === "ios" ? "&" : "?";
    const url = `sms:${phoneNumber}${bodySeparator}body=${encodeURIComponent(
      shareText,
    )}`;

    try {
      await Linking.openURL(url);
      setIsShareOpen(false);
    } catch {
      Alert.alert("Could not open Messages");
    }
  };

  const setSnapshotLogStatus = useCallback(
    (key: string, status: GoalLogStatus) => {
      setSnapshot((current) => {
        if (!current) return current;
        const logsByGoalDate = { ...current.logsByGoalDate };
        if (status) logsByGoalDate[key] = status;
        else delete logsByGoalDate[key];
        return { ...current, logsByGoalDate };
      });
    },
    [],
  );

  const handleSetStatus = useCallback(
    async (
      goalId: string,
      dateKey: string,
      status: GoalLogStatus,
      options?: {
        endTime?: string | null;
        repeatPlan?: boolean;
        startTime?: string | null;
        timeZone?: string | null;
      },
    ) => {
      const key = `${goalId}_${dateKey}`;
      if (updatingKey === key) return;
      const previousStatus = snapshot?.logsByGoalDate[key];
      setUpdatingKey(key);
      setSnapshotLogStatus(key, status);

      try {
        await setGoalLog(goalId, dateKey, status, options);
        setSnapshot((current) => {
          if (!current) return current;
          const plannedTimesByGoalDate = {
            ...current.plannedTimesByGoalDate,
          };
          if (status === "planned") {
            plannedTimesByGoalDate[key] = {
              startTime: options?.startTime ?? null,
              endTime: options?.endTime ?? null,
              repeatsDaily: options?.repeatPlan ?? false,
            };
          } else {
            delete plannedTimesByGoalDate[key];
          }
          return { ...current, plannedTimesByGoalDate };
        });
      } catch (statusError) {
        setSnapshotLogStatus(key, previousStatus ?? null);
        Alert.alert(
          "Could not update habit",
          statusError instanceof Error
            ? statusError.message
            : "The habit could not be updated.",
        );
      } finally {
        setUpdatingKey(null);
      }
    },
    [setSnapshotLogStatus, snapshot?.logsByGoalDate, updatingKey],
  );

  const handleSaveNote = useCallback(
    async (goalId: string, dateKey: string, notes: string) => {
      const key = `${goalId}_${dateKey}`;
      await setGoalLogNote(goalId, dateKey, notes);
      setSnapshot((current) =>
        current
          ? {
              ...current,
              notesByGoalDate: {
                ...current.notesByGoalDate,
                [key]: notes,
              },
            }
          : current,
      );
    },
    [],
  );

  const handleAddPhoto = useCallback(
    async (goalId: string, dateKey: string, source: GoalPhotoSource) => {
      if (uploadingPhotoSource) return;
      setUploadingPhotoSource(source);

      try {
        const photo = await pickGoalPhoto(source);
        if (!photo) return;
        await uploadGoalPhoto(goalId, dateKey, photo);
        const key = `${goalId}_${dateKey}`;
        setSnapshot((current) =>
          current
            ? {
                ...current,
                photoCountsByGoalDate: {
                  ...current.photoCountsByGoalDate,
                  [key]: (current.photoCountsByGoalDate[key] ?? 0) + 1,
                },
              }
            : current,
        );
      } catch (photoError) {
        Alert.alert(
          "Could not add photo",
          photoError instanceof Error
            ? photoError.message
            : "The photo could not be uploaded.",
        );
      } finally {
        setUploadingPhotoSource(null);
      }
    },
    [uploadingPhotoSource],
  );

  const handleSetVisibility = useCallback(
    async (goalId: string, dateKey: string, visibility: GoalVisibility) => {
      if (isUpdatingVisibility) return;
      const key = `${goalId}_${dateKey}`;
      setIsUpdatingVisibility(true);

      try {
        await setGoalLogVisibility(goalId, dateKey, visibility);
        setSnapshot((current) =>
          current
            ? {
                ...current,
                visibilityByGoalDate: {
                  ...current.visibilityByGoalDate,
                  [key]: visibility,
                },
              }
            : current,
        );
      } catch (visibilityError) {
        Alert.alert(
          "Could not change visibility",
          visibilityError instanceof Error
            ? visibilityError.message
            : "The post visibility could not be changed.",
        );
      } finally {
        setIsUpdatingVisibility(false);
      }
    },
    [isUpdatingVisibility],
  );

  const activeLogKey = activeLog
    ? `${activeLog.goal.id}_${activeLog.dateKey}`
    : null;
  const activeLogStatus = activeLogKey
    ? snapshot?.logsByGoalDate[activeLogKey]
    : undefined;
  const activeLogNote = activeLogKey
    ? (snapshot?.notesByGoalDate[activeLogKey] ?? "")
    : "";
  const activeLogPhotoCount = activeLogKey
    ? (snapshot?.photoCountsByGoalDate[activeLogKey] ?? 0)
    : 0;
  const activeLogVisibility =
    (activeLogKey ? snapshot?.visibilityByGoalDate[activeLogKey] : null) ??
    activeLog?.goal.visibility ??
    "only_me";
  const activeLogPlannedTime = activeLogKey
    ? snapshot?.plannedTimesByGoalDate[activeLogKey]
    : null;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView
          canCancelContentTouches
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarHeight + 16 },
          ]}
          directionalLockEnabled
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              tintColor={theme.primary}
              onRefresh={() => void load(true)}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pageHeader}>
            <View style={styles.pageHeaderText}>
              <HistoryHeaderMenu currentSection="dashboard" />
              <Text
                style={[styles.pageSubtitle, { color: theme.textSecondary }]}
              >
                Track your habits and progress
              </Text>
            </View>
            <Pressable
              accessibilityLabel="View your profile"
              hitSlop={8}
              onPress={() => router.push("/profile")}
              style={({ pressed }) => [
                styles.profileButton,
                {
                  backgroundColor: theme.backgroundElement,
                  borderColor: theme.tabBorder,
                },
                pressed && styles.pressed,
              ]}
            >
              {profileImageUrl ? (
                <Image
                  source={{ uri: profileImageUrl }}
                  style={styles.profileButtonImage}
                  contentFit="cover"
                />
              ) : (
                <Text
                  style={[
                    styles.profileButtonInitial,
                    { color: theme.primary },
                  ]}
                >
                  {(session?.user.name ?? session?.user.email ?? "?")
                    .slice(0, 1)
                    .toUpperCase()}
                </Text>
              )}
            </Pressable>
          </View>

          {error ? (
            <View style={styles.errorBanner}>
              <SymbolView
                name={sym("exclamationmark.circle.fill", "error")}
                size={18}
                tintColor="#9D474D"
              />
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => void load()}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          ) : null}

          {isLoading ? (
            <View style={styles.centerState}>
              <FloatingLogoLoader />
            </View>
          ) : snapshot ? (
            <View style={styles.sections}>
              <DashboardTabs value={dashTab} onChange={setDashTab} />

              {dashTab === "daily" ? (
                <>
                  <DashCard>
                    {highPriorityCats.length > 0 ? (
                      <>
                        <HeatmapDateHeader />
                        {highPriorityCats.map((cat, i) => (
                          <CategoryHeatmap
                            key={cat.id}
                            category={cat}
                            goals={cat.goals}
                            days={last7Days}
                            logsByGoalDate={snapshot.logsByGoalDate}
                            onPressDay={(goal, dateKey) =>
                              setActiveLog({ goal, dateKey })
                            }
                            onToggleTooltip={(goalId) =>
                              setTooltipGoalId((current) =>
                                current === goalId ? null : goalId,
                              )
                            }
                            showDivider={i > 0}
                            tooltipGoalId={tooltipGoalId}
                          />
                        ))}
                      </>
                    ) : (
                      <BrandedEmptyState compact title="No daily goals yet." />
                    )}
                  </DashCard>

                  {lowerPriorityGoals.length > 0 ? (
                    <DashSection
                      title="SHOW LOWER PRIORITY GOALS"
                      isOpen={lowerOpen}
                      onToggle={() => setLowerOpen((v) => !v)}
                      collapsedContent={
                        <IconPreview goals={lowerPriorityGoals} />
                      }
                    >
                      <HeatmapDateHeader />
                      {lowerPriorityCats.map((cat, i) => (
                        <CategoryHeatmap
                          key={cat.id}
                          category={cat}
                          goals={cat.goals}
                          days={last7Days}
                          logsByGoalDate={snapshot.logsByGoalDate}
                          onPressDay={(goal, dateKey) =>
                            setActiveLog({ goal, dateKey })
                          }
                          onToggleTooltip={(goalId) =>
                            setTooltipGoalId((current) =>
                              current === goalId ? null : goalId,
                            )
                          }
                          showDivider={i > 0}
                          tooltipGoalId={tooltipGoalId}
                        />
                      ))}
                    </DashSection>
                  ) : null}
                </>
              ) : (
                <DashCard>
                  {monthlyGoals.length > 0 ? (
                    monthlyGoals.map((goal, i) => (
                      <MonthlyGoalRow
                        key={goal.id}
                        goal={goal}
                        currentMonthKey={currentMonthKey}
                        logsByGoalDate={snapshot.logsByGoalDate}
                        showDivider={i > 0}
                      />
                    ))
                  ) : (
                    <BrandedEmptyState
                      compact
                      title="No periodic habits yet."
                    />
                  )}
                </DashCard>
              )}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
      <GoalActionsModal
        canPlan={Boolean(activeLog && activeLog.dateKey >= todayKey)}
        goal={activeLog?.goal ?? null}
        hasNote={Boolean(activeLogNote.trim())}
        hasPhoto={activeLogPhotoCount > 0}
        isFutureDate={Boolean(activeLog && activeLog.dateKey > todayKey)}
        isUpdating={Boolean(activeLogKey && updatingKey === activeLogKey)}
        isUpdatingVisibility={isUpdatingVisibility}
        noteText={activeLogNote}
        plannedTime={activeLogPlannedTime ?? undefined}
        status={activeLogStatus}
        uploadingPhotoSource={uploadingPhotoSource}
        visibility={activeLogVisibility}
        visible={Boolean(activeLog)}
        onAddPhoto={(source) => {
          if (!activeLog) return;
          void handleAddPhoto(activeLog.goal.id, activeLog.dateKey, source);
        }}
        onDismiss={() => setActiveLog(null)}
        onShown={() => undefined}
        onOpenNote={() => {
          if (!activeLog) return;
          setNoteLog(activeLog);
          setActiveLog(null);
        }}
        onSetStatus={(status, planOptions) => {
          if (!activeLog) return;
          void handleSetStatus(
            activeLog.goal.id,
            activeLog.dateKey,
            status,
            planOptions,
          );
          setActiveLog(null);
        }}
        onSetVisibility={(visibility) => {
          if (!activeLog) return;
          void handleSetVisibility(
            activeLog.goal.id,
            activeLog.dateKey,
            visibility,
          );
        }}
      />
      {noteLog ? (
        <GoalNoteEditorModal
          dateKey={noteLog.dateKey}
          goalName={noteLog.goal.name}
          initialValue={
            snapshot?.notesByGoalDate[
              `${noteLog.goal.id}_${noteLog.dateKey}`
            ] ?? null
          }
          onClose={() => setNoteLog(null)}
          onSave={(notes) =>
            handleSaveNote(noteLog.goal.id, noteLog.dateKey, notes)
          }
        />
      ) : null}
      <ShareResultsModal
        friends={shareFriends}
        isLoadingFriends={isLoadingShareFriends}
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        onCopy={() => void copyResults()}
        onMessage={(friend) => void messageFriend(friend)}
      />
    </View>
  );
}

function ShareResultsModal({
  friends,
  isLoadingFriends,
  isOpen,
  onClose,
  onCopy,
  onMessage,
}: {
  friends: FriendRow[];
  isLoadingFriends: boolean;
  isOpen: boolean;
  onClose: () => void;
  onCopy: () => void;
  onMessage: (friend: FriendRow) => void;
}) {
  const theme = useTheme();

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={isOpen}
    >
      <View style={styles.modalOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.shareSheet,
            { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
          ]}
        >
          <View style={styles.shareSheetHeader}>
            <View style={styles.shareSheetHeading}>
              <Text style={[styles.shareSheetTitle, { color: theme.text }]}>
                Share results
              </Text>
              <Text
                style={[
                  styles.shareSheetSubtitle,
                  { color: theme.textSecondary },
                ]}
              >
                Copy the grid or send it through{" "}
                {Platform.OS === "ios" ? "iMessage" : "Messages"}
              </Text>
            </View>
            <Pressable accessibilityLabel="Close" hitSlop={8} onPress={onClose}>
              <SymbolView
                name={sym("xmark.circle.fill", "cancel")}
                size={22}
                tintColor={theme.textSecondary}
              />
            </Pressable>
          </View>

          <Pressable
            onPress={onCopy}
            style={({ pressed }) => [
              styles.shareAction,
              { backgroundColor: theme.backgroundElement },
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={sym("doc.on.doc", "content_copy")}
              size={19}
              tintColor={theme.primary}
            />
            <Text style={[styles.shareActionText, { color: theme.text }]}>
              Copy results
            </Text>
          </Pressable>

          <Text
            style={[styles.shareFriendsLabel, { color: theme.textSecondary }]}
          >
            SEND TO A FRIEND
          </Text>
          {isLoadingFriends ? (
            <ActivityIndicator color={theme.primary} />
          ) : friends.length > 0 ? (
            <ScrollView
              canCancelContentTouches
              contentContainerStyle={styles.shareFriendsList}
              style={styles.shareFriendsScroll}
            >
              {friends.map((friend) => (
                <Pressable
                  key={friend.id}
                  onPress={() => onMessage(friend)}
                  style={({ pressed }) => [
                    styles.shareFriendRow,
                    pressed && { backgroundColor: theme.backgroundElement },
                  ]}
                >
                  <View style={styles.shareFriendText}>
                    <Text
                      numberOfLines={1}
                      style={[styles.shareFriendName, { color: theme.text }]}
                    >
                      {friend.friendName}
                    </Text>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.shareFriendPhone,
                        { color: theme.textSecondary },
                      ]}
                    >
                      {friend.friendPhoneNumber}
                    </Text>
                  </View>
                  <SymbolView
                    name={sym("message.fill", "message")}
                    size={18}
                    tintColor={theme.primary}
                  />
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text
              style={[styles.noShareFriends, { color: theme.textSecondary }]}
            >
              No friends with phone numbers yet.
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

function DashboardTabs({
  value,
  onChange,
}: {
  value: "daily" | "monthly";
  onChange: (value: "daily" | "monthly") => void;
}) {
  const theme = useTheme();
  const tabs: { key: "daily" | "monthly"; label: string }[] = [
    { key: "daily", label: "Daily" },
    { key: "monthly", label: "Periodic" },
  ];

  return (
    <View
      style={[
        styles.tabBar,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.tabBorder,
        },
      ]}
    >
      {tabs.map((tab) => {
        const active = value === tab.key;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(tab.key)}
            style={[styles.tab, active && { backgroundColor: theme.tabBar }]}
          >
            <Text
              style={[
                styles.tabLabel,
                { color: active ? theme.text : theme.textSecondary },
              ]}
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

function DashCard({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.section,
        {
          backgroundColor: theme.background,
          borderColor: `${theme.tabBorder}80`,
        },
      ]}
    >
      <View style={styles.cardContent}>{children}</View>
    </View>
  );
}

function DashSection({
  title,
  isOpen,
  onToggle,
  children,
  collapsedContent,
}: {
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  collapsedContent?: React.ReactNode;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.section,
        { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
      ]}
    >
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.sectionHeader,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
      >
        <Text style={[styles.sectionTitle, { color: theme.textSecondary }]}>
          {title}
        </Text>
        <SymbolView
          name={sym(
            isOpen ? "chevron.up" : "chevron.down",
            isOpen ? "expand_less" : "expand_more",
          )}
          size={14}
          weight="semibold"
          tintColor={theme.textSecondary}
        />
      </Pressable>
      {isOpen ? (
        <View
          style={[styles.sectionContent, { borderTopColor: theme.tabBorder }]}
        >
          {children}
        </View>
      ) : collapsedContent ? (
        collapsedContent
      ) : null}
    </View>
  );
}

function HeatmapDateHeader() {
  const theme = useTheme();

  return (
    <View style={styles.heatmapDateHeader}>
      <View style={styles.heatmapDateIconSpacer} />
      <Text style={[styles.heatmapDateLabel, { color: theme.textSecondary }]}>
        Last 7 Days
      </Text>
    </View>
  );
}

function MonthlyGoalRow({
  goal,
  currentMonthKey,
  logsByGoalDate,
  showDivider,
}: {
  goal: PeriodicGoalInfo;
  currentMonthKey: string;
  logsByGoalDate: Record<string, DashboardLogStatus>;
  showDivider: boolean;
}) {
  const theme = useTheme();

  const completions = useMemo(
    () =>
      countMonthlyCompletions({
        goalId: goal.id,
        currentMonthKey,
        logsByGoalDate,
      }),
    [goal.id, currentMonthKey, logsByGoalDate],
  );

  const total = goal.frequencyGoal ?? 1;
  const pct = Math.min(completions / total, 1);
  const isComplete = pct >= 1;

  return (
    <View>
      {showDivider ? (
        <View
          style={[styles.rowDivider, { backgroundColor: theme.tabBorder }]}
        />
      ) : null}
      <View style={styles.monthlyRow}>
        <View
          style={[styles.monthlyIcon, { backgroundColor: theme.secondary }]}
        >
          <GoalIcon
            iconKey={goal.iconKey}
            size={18}
            color={theme.secondaryForeground}
          />
        </View>
        <View style={styles.progressBarWrap}>
          <View
            style={[
              styles.progressTrack,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            {pct > 0 ? (
              <View
                style={[
                  styles.progressFill,
                  {
                    backgroundColor: theme.primary,
                    width: `${Math.round(pct * 100)}%`,
                  },
                ]}
              />
            ) : null}
          </View>
        </View>
        <Text style={[styles.progressCount, { color: theme.textSecondary }]}>
          {completions}/{total}
        </Text>
      </View>
    </View>
  );
}

function CategoryHeatmap({
  category,
  goals,
  days,
  logsByGoalDate,
  onPressDay,
  onToggleTooltip,
  showDivider,
  tooltipGoalId,
}: {
  category: CategoryWithGoals;
  goals: GoalInCategory[];
  days: string[];
  logsByGoalDate: Record<string, DashboardLogStatus>;
  onPressDay: (goal: GoalInCategory, dateKey: string) => void;
  onToggleTooltip: (goalId: string) => void;
  showDivider: boolean;
  tooltipGoalId: string | null;
}) {
  const theme = useTheme();

  return (
    <View style={styles.catHeatmap}>
      {showDivider ? (
        <View
          style={[styles.catDivider, { backgroundColor: theme.tabBorder }]}
        />
      ) : null}
      <Text style={[styles.catLabel, { color: theme.textSecondary }]}>
        {category.name.toUpperCase()}
      </Text>
      {goals.map((goal) => {
        const dayStatuses = days.map(
          (d) => getGoalDateStatus(goal, d, logsByGoalDate) === "complete",
        );
        return (
          <View key={goal.id} style={styles.heatmapRow}>
            <Pressable
              accessibilityLabel={goal.name}
              accessibilityRole="button"
              hitSlop={8}
              onPress={() => onToggleTooltip(goal.id)}
              style={[styles.heatmapIcon, { backgroundColor: theme.secondary }]}
            >
              <GoalIcon
                iconKey={goal.iconKey}
                size={13}
                color={theme.secondaryForeground}
              />
              {tooltipGoalId === goal.id ? (
                <View
                  pointerEvents="none"
                  style={[
                    styles.iconTooltip,
                    {
                      backgroundColor: theme.text,
                      borderColor: theme.tabBorder,
                    },
                  ]}
                >
                  <Text
                    numberOfLines={2}
                    style={[
                      styles.iconTooltipText,
                      { color: theme.background },
                    ]}
                  >
                    {goal.name}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            <View style={styles.dayBlocks}>
              {days.map((d, i) => (
                <Pressable
                  accessibilityLabel={`${goal.name} on ${formatShareDate(
                    dateFromDateKey(d),
                  )}, ${
                    dayStatuses[i] ? "complete" : "not complete"
                  }. Tap to edit.`}
                  accessibilityRole="button"
                  key={d}
                  onPress={() => onPressDay(goal, d)}
                  style={[
                    styles.dayBlock,
                    {
                      backgroundColor: dayStatuses[i]
                        ? `${theme.primary}DD`
                        : theme.backgroundElement,
                    },
                  ]}
                />
              ))}
            </View>
          </View>
        );
      })}
    </View>
  );
}

function IconPreview({ goals }: { goals: GoalInCategory[] }) {
  const theme = useTheme();
  return (
    <View style={styles.iconPreview}>
      {goals.map((goal) => (
        <View
          key={goal.id}
          style={[styles.iconPreviewItem, { backgroundColor: theme.secondary }]}
        >
          <GoalIcon
            iconKey={goal.iconKey}
            size={16}
            color={theme.secondaryForeground}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 32,
    gap: 18,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 11,
  },
  pageHeaderIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  pageHeaderText: { minWidth: 0, flex: 1, gap: 1 },
  pageTitle: {
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  pageSubtitle: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  shareButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
  },
  profileButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 21,
    overflow: "hidden",
  },
  profileButtonImage: {
    width: "100%",
    height: "100%",
  },
  profileButtonInitial: {
    fontSize: 18,
    fontWeight: "900",
  },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 14,
    backgroundColor: "#F3B7B933",
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  errorText: {
    flex: 1,
    color: "#9D474D",
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  retryText: { color: "#9D474D", fontSize: 12, fontWeight: "800" },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 64,
  },
  sections: { gap: 14 },
  tabBar: {
    flexDirection: "row",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    padding: 3,
    gap: 3,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 9,
    borderRadius: 11,
  },
  tabLabel: { fontSize: 14, fontWeight: "700" },
  section: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    overflow: "visible",
  },
  cardContent: { paddingHorizontal: 12, paddingVertical: 6 },
  emptyHint: {
    fontSize: 13,
    fontWeight: "500",
    textAlign: "center",
    paddingVertical: 24,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  sectionTitle: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  sectionContent: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  pressed: { opacity: 0.72 },
  rowDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
  },
  monthlyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingVertical: 9,
    paddingHorizontal: 4,
  },
  monthlyIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  progressBarWrap: { flex: 1 },
  progressTrack: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressFill: {
    height: "100%",
    borderRadius: 999,
    minWidth: 6,
  },
  progressCount: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "700",
    width: 38,
    textAlign: "right",
  },
  catHeatmap: {
    paddingVertical: 8,
    paddingHorizontal: 4,
    gap: 4,
  },
  catDivider: {
    height: StyleSheet.hairlineWidth,
    marginBottom: 6,
  },
  catLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  heatmapDateHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 4,
    paddingTop: 2,
    paddingBottom: 3,
  },
  heatmapDateIconSpacer: {
    width: 26,
  },
  heatmapDateLabel: {
    flex: 1,
    minWidth: 0,
    textAlign: "center",
    fontSize: 9,
    lineHeight: 11,
    fontWeight: "800",
  },
  heatmapRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    height: 28,
    overflow: "visible",
  },
  heatmapIcon: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
    zIndex: 10,
    elevation: 10,
  },
  iconTooltip: {
    position: "absolute",
    left: 28,
    top: -6,
    zIndex: 20,
    elevation: 20,
    minWidth: 96,
    maxWidth: 160,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  iconTooltipText: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
  },
  dayBlocks: {
    flex: 1,
    flexDirection: "row",
    gap: 4,
    zIndex: 0,
  },
  dayBlock: {
    flex: 1,
    height: 24,
    borderRadius: 7,
  },
  iconPreview: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 7,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  iconPreviewItem: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  modalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#0000004D",
    padding: 12,
  },
  shareSheet: {
    maxHeight: "72%",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 24,
    padding: 16,
  },
  shareSheetHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  shareSheetHeading: { minWidth: 0, flex: 1, gap: 2 },
  shareSheetTitle: { fontSize: 19, fontWeight: "800", letterSpacing: -0.2 },
  shareSheetSubtitle: { fontSize: 12, lineHeight: 17, fontWeight: "500" },
  shareAction: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  shareActionText: { fontSize: 15, fontWeight: "700" },
  shareFriendsLabel: {
    marginTop: 2,
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  shareFriendsScroll: { flexGrow: 0 },
  shareFriendsList: { gap: 2 },
  shareFriendRow: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  shareFriendText: { minWidth: 0, flex: 1, gap: 1 },
  shareFriendName: { fontSize: 14, fontWeight: "700" },
  shareFriendPhone: { fontSize: 11, fontWeight: "500" },
  noShareFriends: {
    paddingHorizontal: 4,
    paddingVertical: 10,
    fontSize: 13,
    fontWeight: "500",
  },
});
