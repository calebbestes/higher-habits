import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { GoalIcon } from "@/components/goal-icon";
import { HistoryHeaderMenu } from "@/components/history-header-menu";
import { type MenuAction, MenuView } from "@expo/ui/community/menu";
import { Image, type ImageLoadEventData } from "expo-image";
import { useRouter } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  type GestureResponderEvent,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import RenderHTML, { type MixedStyleRecord } from "react-native-render-html";
import { SafeAreaView } from "react-native-safe-area-context";

import { BrandedEmptyState } from "@/components/branded-empty-state";
import { GoalNoteEditorModal } from "@/components/goal-note-editor-modal";
import {
  type ImageNaturalSize,
  PhotoBackdropHitTargets,
  getContainedImageFrame,
} from "@/components/photo-backdrop-hit-targets";
import { Fonts, MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import {
  deleteCheckpointPhoto,
  uploadCheckpointPhoto,
} from "@/lib/checkpoint-photos-client";
import { addFeedComment } from "@/lib/friends-client";
import {
  deleteGoalLog,
  setGoalLogNote,
  setGoalLogVisibility,
} from "@/lib/goal-logs-client";
import { type GoalPhotoSource, pickGoalPhoto } from "@/lib/goal-photo-picker";
import {
  type GoalPhoto,
  deleteGoalPhoto,
  uploadGoalPhoto,
} from "@/lib/goal-photos-client";
import type { GoalVisibility } from "@/lib/goals-client";
import {
  playSelectionHaptic,
  playSuccessHaptic,
  playWarningHaptic,
} from "@/lib/haptics";
import {
  type JournalGoalSection,
  type JournalHistoryItem,
  type JournalSocialSummary,
  fetchJournalHistory,
} from "@/lib/journal-client";
import { rotateRemotePhoto } from "@/lib/photo-edit";
import { VISIBILITY_LABELS } from "@/lib/visibility-labels";

type SymbolName = SymbolViewProps["name"];
type ViewerPhotoSize = ImageNaturalSize & { photoId: string };

type JournalEntry = Extract<JournalHistoryItem, { kind: "habit" }>;
type CheckpointJournalEntry = Extract<
  JournalHistoryItem,
  { kind: "checkpoint" }
>;
type ReflectionJournalEntry = Extract<
  JournalHistoryItem,
  { kind: "reflection" }
>;
type JournalSocialComment = JournalSocialSummary["comments"][number];

const DAILY_REFLECTION_FILTER_ID = "__daily_reflections";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function useReliablePress(action: () => void) {
  const lockedRef = useRef(false);

  return useCallback(() => {
    if (lockedRef.current) return;

    lockedRef.current = true;
    action();
    setTimeout(() => {
      lockedRef.current = false;
    }, 500);
  }, [action]);
}

function usePressWithTouchEndFallback(action: () => void) {
  const lockedRef = useRef(false);

  return useCallback(() => {
    if (lockedRef.current) return;

    lockedRef.current = true;
    setTimeout(action, 0);
    setTimeout(() => {
      lockedRef.current = false;
    }, 350);
  }, [action]);
}

function useReliableTapResponder(action: () => void) {
  const press = usePressWithTouchEndFallback(action);
  const [pressed, setPressed] = useState(false);
  const startRef = useRef<{
    didMove: boolean;
    pageX: number;
    pageY: number;
  } | null>(null);

  const cancel = useCallback(() => {
    startRef.current = null;
    setPressed(false);
  }, []);

  return {
    pressed,
    responderProps: {
      onResponderGrant: (event: GestureResponderEvent) => {
        startRef.current = {
          didMove: false,
          pageX: event.nativeEvent.pageX,
          pageY: event.nativeEvent.pageY,
        };
        setPressed(true);
      },
      onResponderMove: (event: GestureResponderEvent) => {
        const start = startRef.current;
        if (!start) return;

        const dx = event.nativeEvent.pageX - start.pageX;
        const dy = event.nativeEvent.pageY - start.pageY;
        start.didMove = Math.abs(dx) > 10 || Math.abs(dy) > 10;
        if (start.didMove) setPressed(false);
      },
      onResponderRelease: () => {
        const start = startRef.current;
        startRef.current = null;
        setPressed(false);
        if (start && !start.didMove) press();
      },
      onResponderTerminate: cancel,
      onResponderTerminationRequest: () => Boolean(startRef.current?.didMove),
      onStartShouldSetResponder: () => true,
    },
  };
}

function formatDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function countJournalComments(comments: JournalSocialComment[]): number {
  return comments.reduce(
    (total, comment) => total + 1 + countJournalComments(comment.replies),
    0,
  );
}

export function JournalScreen() {
  const theme = useTheme();
  const router = useRouter();
  const tabBarHeight = useTabBarHeight();
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [journalItems, setJournalItems] = useState<JournalHistoryItem[]>([]);
  const [goalSections, setGoalSections] = useState<JournalGoalSection[]>([]);
  const [journalCursor, setJournalCursor] = useState<string | null>(null);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<"monthYear" | null>(null);
  const [activePhoto, setActivePhoto] = useState<GoalPhoto | null>(null);
  const [isEditingPhoto, setIsEditingPhoto] = useState(false);
  const [activePost, setActivePost] = useState<JournalEntry | null>(null);
  const [isUpdatingPost, setIsUpdatingPost] = useState(false);
  const [noteEditEntry, setNoteEditEntry] = useState<JournalEntry | null>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [replyTargets, setReplyTargets] = useState<
    Record<string, JournalSocialComment | null>
  >({});
  const [submittingReplyGoalLogId, setSubmittingReplyGoalLogId] = useState<
    string | null
  >(null);
  const [uploadingPhotoSource, setUploadingPhotoSource] =
    useState<GoalPhotoSource | null>(null);

  const selectedMonthKey = useMemo(
    () =>
      selectedMonth !== null && selectedYear !== null
        ? `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`
        : null,
    [selectedMonth, selectedYear],
  );
  const load = useCallback(
    async (refresh = false) => {
      const requestId = ++loadRequestIdRef.current;
      refresh ? setIsRefreshing(true) : setIsLoading(true);
      setError(null);
      setPhotoLoadFailed(false);

      try {
        const nextPage = await fetchJournalHistory({
          limit: 20,
          month: selectedMonthKey,
        });
        if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
          return;
        }
        setJournalItems(nextPage.items);
        setGoalSections(nextPage.goalSections);
        setJournalCursor(nextPage.nextCursor);
        setPhotoLoadFailed(false);
      } catch (loadError) {
        if (isMountedRef.current && requestId === loadRequestIdRef.current) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load journal.",
          );
        }
      } finally {
        if (isMountedRef.current && requestId === loadRequestIdRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [selectedMonthKey],
  );

  useEffect(
    () => () => {
      isMountedRef.current = false;
      loadRequestIdRef.current += 1;
    },
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const loadMoreJournalItems = useCallback(async () => {
    if (!journalCursor || isLoadingMore) return;

    setIsLoadingMore(true);
    try {
      const nextPage = await fetchJournalHistory({
        cursor: journalCursor,
        limit: 20,
        month: selectedMonthKey,
      });
      if (!isMountedRef.current) return;

      setJournalItems((current) => {
        const existingIds = new Set(current.map((item) => item.id));
        return [
          ...current,
          ...nextPage.items.filter((item) => !existingIds.has(item.id)),
        ];
      });
      setGoalSections(nextPage.goalSections);
      setJournalCursor(nextPage.nextCursor);
    } catch (loadError) {
      if (isMountedRef.current) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load more journal entries.",
        );
      }
    } finally {
      if (isMountedRef.current) setIsLoadingMore(false);
    }
  }, [isLoadingMore, journalCursor, selectedMonthKey]);

  const allSections = goalSections;
  const goals = useMemo(
    () => allSections.flatMap((section) => section.goals),
    [allSections],
  );
  const goalById = useMemo(
    () => new Map(goals.map((goal) => [goal.id, goal])),
    [goals],
  );
  const sections = allSections;
  const selectedGoal = selectedGoalId
    ? (goalById.get(selectedGoalId) ?? null)
    : null;
  const selectedFilterLabel =
    selectedGoalId === DAILY_REFLECTION_FILTER_ID
      ? "Daily reflections"
      : (selectedGoal?.name ?? "All goals");
  const goalFilterActions = useMemo<MenuAction[]>(() => {
    const actions: MenuAction[] = [
      {
        id: "all",
        image: "book",
        state: selectedGoalId === null ? "on" : undefined,
        title: "All goals",
      },
      {
        id: "reflections",
        image: "sparkles",
        state: selectedGoalId === DAILY_REFLECTION_FILTER_ID ? "on" : undefined,
        title: "Daily reflections",
      },
    ];

    for (const section of sections) {
      actions.push({
        displayInline: true,
        subactions: section.goals.map((goal) => ({
          id: `goal:${goal.id}`,
          state: selectedGoalId === goal.id ? "on" : undefined,
          title: goal.name,
        })),
        title: section.categoryName,
      });
    }

    return actions;
  }, [sections, selectedGoalId]);

  useEffect(() => {
    if (
      selectedGoalId &&
      selectedGoalId !== DAILY_REFLECTION_FILTER_ID &&
      !goals.some((goal) => goal.id === selectedGoalId)
    ) {
      setSelectedGoalId(null);
    }
  }, [goals, selectedGoalId]);

  const mergedEntries = useMemo(() => {
    const filtered = journalItems.filter((item) => {
      if (!selectedGoalId) return true;
      if (selectedGoalId === DAILY_REFLECTION_FILTER_ID) {
        return item.kind === "reflection";
      }
      return item.kind === "habit" && item.goal.id === selectedGoalId;
    });

    return filtered.sort((left, right) =>
      right.dateKey.localeCompare(left.dateKey),
    );
  }, [journalItems, selectedGoalId]);

  useEffect(() => {
    if (
      isLoading ||
      isLoadingMore ||
      mergedEntries.length > 0 ||
      !journalCursor
    ) {
      return;
    }

    void loadMoreJournalItems();
  }, [
    isLoading,
    isLoadingMore,
    journalCursor,
    loadMoreJournalItems,
    mergedEntries.length,
  ]);

  const handleSetPostVisibility = useCallback(
    async (entry: JournalEntry, visibility: GoalVisibility) => {
      if (isUpdatingPost || visibility === entry.visibility) return;
      setIsUpdatingPost(true);

      try {
        await setGoalLogVisibility(entry.goal.id, entry.dateKey, visibility);
        if (!isMountedRef.current) return;
        setJournalItems((current) =>
          current.map((item) =>
            item.kind === "habit" && item.id === entry.id
              ? { ...item, visibility }
              : item,
          ),
        );
        setActivePost((current) =>
          current ? { ...current, visibility } : current,
        );
      } catch (visibilityError) {
        if (isMountedRef.current) {
          Alert.alert(
            "Could not change visibility",
            visibilityError instanceof Error
              ? visibilityError.message
              : "The post visibility could not be changed.",
          );
        }
      } finally {
        if (isMountedRef.current) setIsUpdatingPost(false);
      }
    },
    [isUpdatingPost],
  );

  const confirmDeletePost = useCallback(
    (entry: JournalEntry) => {
      playWarningHaptic();
      Alert.alert(
        "Delete log?",
        "This permanently deletes the report, note, photos, and feed activity for this goal instance.",
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              setIsUpdatingPost(true);

              try {
                await deleteGoalLog(entry.goal.id, entry.dateKey);
                if (!isMountedRef.current) return;
                setActivePost(null);
                await load();
              } catch (deleteError) {
                if (isMountedRef.current) {
                  Alert.alert(
                    "Could not delete log",
                    deleteError instanceof Error
                      ? deleteError.message
                      : "The goal log could not be deleted.",
                  );
                }
              } finally {
                if (isMountedRef.current) setIsUpdatingPost(false);
              }
            },
          },
        ],
      );
    },
    [load],
  );

  const handleAddPhoto = useCallback(
    async (entry: JournalEntry, source: GoalPhotoSource) => {
      if (uploadingPhotoSource) return;
      setUploadingPhotoSource(source);
      try {
        const photo = await pickGoalPhoto(source);
        if (!isMountedRef.current) return;
        if (!photo) return;
        await uploadGoalPhoto(entry.goal.id, entry.dateKey, photo);
        if (!isMountedRef.current) return;
        await load();
      } catch (photoError) {
        if (isMountedRef.current) {
          Alert.alert(
            "Could not add photo",
            photoError instanceof Error
              ? photoError.message
              : "The photo could not be uploaded.",
          );
        }
      } finally {
        if (isMountedRef.current) setUploadingPhotoSource(null);
      }
    },
    [load, uploadingPhotoSource],
  );

  // Checkpoint photos are surfaced through the same GoalPhoto shape but carry an
  // empty dateKey and store the checkpoint id in goalId (see checkpointPhotosById).
  const isCheckpointPhoto = useCallback(
    (photo: GoalPhoto) => photo.dateKey === "",
    [],
  );

  const handleRotatePhoto = useCallback(
    async (photo: GoalPhoto, degrees: number) => {
      if (isEditingPhoto) return;
      setIsEditingPhoto(true);
      try {
        // No in-place replace endpoint exists, so rotate = upload the rotated
        // copy, then delete the original.
        const rotated = await rotateRemotePhoto(photo.url, degrees);
        let nextPhoto: GoalPhoto;
        if (isCheckpointPhoto(photo)) {
          const uploaded = await uploadCheckpointPhoto(photo.goalId, rotated);
          await deleteCheckpointPhoto(photo.id);
          nextPhoto = {
            id: uploaded.id,
            url: uploaded.url,
            contentType: uploaded.contentType,
            createdAt: uploaded.createdAt,
            dateKey: "",
            goalId: uploaded.checkpointId,
          };
        } else {
          nextPhoto = await uploadGoalPhoto(
            photo.goalId,
            photo.dateKey,
            rotated,
          );
          await deleteGoalPhoto(photo.id);
        }
        if (!isMountedRef.current) return;
        setActivePhoto(nextPhoto);
        await load();
      } catch (rotateError) {
        if (isMountedRef.current) {
          Alert.alert(
            "Could not rotate photo",
            rotateError instanceof Error
              ? rotateError.message
              : "The photo could not be updated.",
          );
        }
      } finally {
        if (isMountedRef.current) setIsEditingPhoto(false);
      }
    },
    [isCheckpointPhoto, isEditingPhoto, load],
  );

  const handleDeletePhoto = useCallback(
    (photo: GoalPhoto) => {
      playWarningHaptic();
      Alert.alert("Delete photo?", "This permanently removes this photo.", [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            if (isEditingPhoto) return;
            setIsEditingPhoto(true);
            try {
              if (isCheckpointPhoto(photo)) {
                await deleteCheckpointPhoto(photo.id);
              } else {
                await deleteGoalPhoto(photo.id);
              }
              if (!isMountedRef.current) return;
              setActivePhoto(null);
              await load();
            } catch (deleteError) {
              if (isMountedRef.current) {
                Alert.alert(
                  "Could not delete photo",
                  deleteError instanceof Error
                    ? deleteError.message
                    : "The photo could not be deleted.",
                );
              }
            } finally {
              if (isMountedRef.current) setIsEditingPhoto(false);
            }
          },
        },
      ]);
    },
    [isCheckpointPhoto, isEditingPhoto, load],
  );

  const handleSubmitReply = useCallback(
    async (goalLogId: string) => {
      const body = (replyDrafts[goalLogId] ?? "").trim();
      const replyTarget = replyTargets[goalLogId] ?? null;
      if (!body || !replyTarget || submittingReplyGoalLogId) return;

      setSubmittingReplyGoalLogId(goalLogId);
      try {
        await addFeedComment(goalLogId, body, replyTarget.id);
        playSuccessHaptic();
        if (!isMountedRef.current) return;
        setReplyDrafts((prev) => ({ ...prev, [goalLogId]: "" }));
        setReplyTargets((prev) => ({ ...prev, [goalLogId]: null }));
        await load();
      } catch (replyError) {
        if (isMountedRef.current) {
          Alert.alert(
            "Could not add reply",
            replyError instanceof Error ? replyError.message : undefined,
          );
        }
      } finally {
        if (isMountedRef.current) setSubmittingReplyGoalLogId(null);
      }
    },
    [load, replyDrafts, replyTargets, submittingReplyGoalLogId],
  );

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <FlatList
          canCancelContentTouches
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarHeight + 16 },
          ]}
          data={isLoading ? [] : mergedEntries}
          directionalLockEnabled
          initialNumToRender={5}
          ItemSeparatorComponent={() => <View style={styles.entrySeparator} />}
          keyboardShouldPersistTaps="handled"
          keyExtractor={(item) => `${item.kind}_${item.id}`}
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.centerState}>
                <FloatingLogoLoader />
              </View>
            ) : (
              <EmptyState
                goalName={selectedGoal?.name ?? null}
                isReflectionFilter={
                  selectedGoalId === DAILY_REFLECTION_FILTER_ID
                }
                dateLabel={
                  selectedMonth !== null && selectedYear !== null
                    ? `${MONTHS[selectedMonth]} ${selectedYear}`
                    : null
                }
              />
            )
          }
          ListFooterComponent={
            isLoadingMore ? (
              <ActivityIndicator
                color={theme.primary}
                size="small"
                style={styles.loadMoreIndicator}
              />
            ) : null
          }
          ListHeaderComponent={
            <>
              <View style={styles.header}>
                <View style={styles.headerText}>
                  <HistoryHeaderMenu currentSection="journal" />
                </View>
              </View>

              <View style={styles.filters}>
                <GoalFilterButton
                  actions={goalFilterActions}
                  icon={sym("book", "menu_book")}
                  label="Goal"
                  value={selectedFilterLabel}
                  onSelect={(event) => {
                    playSelectionHaptic();
                    setSelectedGoalId(
                      event === "all"
                        ? null
                        : event === "reflections"
                          ? DAILY_REFLECTION_FILTER_ID
                          : event.slice(5),
                    );
                  }}
                />
                <MonthButton
                  month={selectedMonth}
                  year={selectedYear}
                  onPress={() => {
                    playSelectionHaptic();
                    setPicker("monthYear");
                  }}
                />
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
            </>
          }
          maxToRenderPerBatch={5}
          onEndReached={() => void loadMoreJournalItems()}
          onEndReachedThreshold={0.4}
          onRefresh={() => void load(true)}
          refreshing={isRefreshing}
          removeClippedSubviews={Platform.OS !== "web"}
          renderItem={({ item }) => {
            if (item.kind === "checkpoint") {
              return (
                <CheckpointJournalCard
                  entry={item}
                  onOpenPhoto={(photo) => {
                    playSelectionHaptic();
                    setActivePhoto(photo);
                  }}
                />
              );
            }
            if (item.kind === "reflection") {
              return (
                <ReflectionJournalCard
                  entry={item}
                  onOpenComments={() => {
                    playSelectionHaptic();
                    router.push({
                      pathname: "/post",
                      params: { postId: item.id, source: "self" },
                    });
                  }}
                />
              );
            }

            const goalLogId = item.social.goalLogId;
            return (
              <JournalCard
                entry={item}
                commentDraft={replyDrafts[goalLogId] ?? ""}
                isSubmittingReply={submittingReplyGoalLogId === goalLogId}
                photoLoadFailed={photoLoadFailed}
                photos={item.photos}
                replyTarget={replyTargets[goalLogId] ?? null}
                onCancelReply={() => {
                  setReplyTargets((prev) => ({
                    ...prev,
                    [goalLogId]: null,
                  }));
                }}
                onCommentDraftChange={(value) => {
                  setReplyDrafts((prev) => ({
                    ...prev,
                    [goalLogId]: value,
                  }));
                }}
                onOpenPhoto={(photo) => {
                  playSelectionHaptic();
                  setActivePhoto(photo);
                }}
                onOpenMenu={(entry) => {
                  playSelectionHaptic();
                  setActivePost(entry);
                }}
                onOpenPost={() => {
                  playSelectionHaptic();
                  router.push({
                    pathname: "/post",
                    params: { postId: goalLogId, source: "self" },
                  });
                }}
                onReplyToComment={(comment) => {
                  playSelectionHaptic();
                  setReplyTargets((prev) => ({
                    ...prev,
                    [goalLogId]: comment,
                  }));
                }}
                onSubmitReply={() => void handleSubmitReply(goalLogId)}
              />
            );
          }}
          showsVerticalScrollIndicator={false}
          windowSize={7}
        />
      </SafeAreaView>

      <MonthYearPickerModal
        isOpen={picker === "monthYear"}
        selectedMonth={selectedMonth}
        selectedYear={selectedYear}
        onClose={() => setPicker(null)}
        onSelect={(month, year) => {
          playSelectionHaptic();
          setSelectedMonth(month);
          setSelectedYear(year);
          setPicker(null);
        }}
      />
      <PostActionsSheet
        entry={activePost}
        isUpdating={isUpdatingPost}
        uploadingPhotoSource={uploadingPhotoSource}
        onClose={() => setActivePost(null)}
        onDelete={confirmDeletePost}
        onSetVisibility={(entry, visibility) =>
          void handleSetPostVisibility(entry, visibility)
        }
        onEditNote={(entry) => {
          setActivePost(null);
          setNoteEditEntry(entry);
        }}
        onAddPhoto={(entry, source) => void handleAddPhoto(entry, source)}
      />
      {noteEditEntry ? (
        <GoalNoteEditorModal
          dateKey={noteEditEntry.dateKey}
          goalName={noteEditEntry.goal.name}
          initialValue={noteEditEntry.note?.trim() ? noteEditEntry.note : null}
          onClose={() => setNoteEditEntry(null)}
          onSave={async (notes) => {
            const entry = noteEditEntry;
            if (!entry) return;
            await setGoalLogNote(entry.goal.id, entry.dateKey, notes);
            if (!isMountedRef.current) return;
            await load();
          }}
        />
      ) : null}
      <PhotoViewer
        photo={activePhoto}
        isBusy={isEditingPhoto}
        onClose={() => setActivePhoto(null)}
        onDelete={() => {
          if (activePhoto) handleDeletePhoto(activePhoto);
        }}
        onRotate={(degrees) => {
          if (activePhoto) void handleRotatePhoto(activePhoto, degrees);
        }}
      />
    </View>
  );
}

function GoalFilterButton({
  actions,
  icon,
  label,
  onSelect,
  value,
}: {
  actions: MenuAction[];
  icon: SymbolName;
  label: string;
  onSelect: (event: string) => void;
  value: string;
}) {
  const theme = useTheme();

  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        if (
          nativeEvent.event === "all" ||
          nativeEvent.event === "reflections" ||
          nativeEvent.event.startsWith("goal:")
        ) {
          onSelect(nativeEvent.event);
        }
      }}
      style={styles.pickerMenu}
      title="Filter goals"
    >
      <View
        accessible
        accessibilityLabel={`Filter by goal. Currently ${value}`}
        accessibilityRole="button"
        style={[
          styles.pickerButton,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.tabBorder,
          },
        ]}
      >
        <SymbolView name={icon} size={17} tintColor={theme.primary} />
        <View style={styles.pickerText}>
          <Text style={[styles.pickerLabel, { color: theme.textSecondary }]}>
            {label}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.pickerValue, { color: theme.text }]}
          >
            {value}
          </Text>
        </View>
        <SymbolView
          name={sym("chevron.down", "expand_more")}
          size={14}
          tintColor={theme.textSecondary}
        />
      </View>
    </MenuView>
  );
}

function MonthButton({
  month,
  year,
  onPress,
}: {
  month: number | null;
  year: number | null;
  onPress: () => void;
}) {
  const theme = useTheme();
  const hasDateFilter = month !== null && year !== null;
  const { pressed, responderProps } = useReliableTapResponder(onPress);

  return (
    <View
      accessible
      accessibilityLabel={`Select month and year. Currently ${
        hasDateFilter ? `${MONTHS[month]} ${year}` : "all dates"
      }`}
      accessibilityRole="button"
      {...responderProps}
      style={[
        styles.monthButton,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.tabBorder,
        },
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.monthButtonMonth, { color: theme.primary }]}>
        {hasDateFilter ? MONTHS[month].slice(0, 3) : "ALL"}
      </Text>
      <Text style={[styles.monthButtonYear, { color: theme.text }]}>
        {hasDateFilter ? year : "DATES"}
      </Text>
    </View>
  );
}

function CheckpointJournalCard({
  entry,
  onOpenPhoto,
}: {
  entry: CheckpointJournalEntry;
  onOpenPhoto: (photo: GoalPhoto) => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
      ]}
    >
      <View style={styles.cardHeader}>
        <View
          style={[
            styles.goalIcon,
            { backgroundColor: theme.backgroundElement },
          ]}
        >
          <SymbolView
            name={sym("checkmark.seal.fill", "verified")}
            size={16}
            tintColor={theme.primary}
          />
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={[styles.cardDate, { color: theme.text }]}>
            {formatDate(entry.dateKey)}
          </Text>
          <Text style={[styles.cardGoal, { color: theme.textSecondary }]}>
            {entry.goalTitle} · {entry.checkpointTitle}
          </Text>
        </View>
        <View
          style={[
            styles.checkpointBadge,
            { backgroundColor: theme.backgroundElement },
          ]}
        >
          <Text style={[styles.checkpointBadgeText, { color: theme.primary }]}>
            GOAL
          </Text>
        </View>
      </View>

      {entry.note.trim() ? (
        <Text style={[styles.checkpointNote, { color: theme.text }]}>
          {entry.note.trim()}
        </Text>
      ) : null}

      {entry.photos.length > 0 ? (
        <JournalPhotoCarousel photos={entry.photos} onOpenPhoto={onOpenPhoto} />
      ) : null}
    </View>
  );
}

function ReflectionJournalCard({
  entry,
  onOpenComments,
}: {
  entry: ReflectionJournalEntry;
  onOpenComments: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        styles.reflectionJournalCard,
        {
          backgroundColor: `${theme.primary}0F`,
          borderColor: `${theme.primary}33`,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View
          style={[styles.goalIcon, { backgroundColor: `${theme.primary}18` }]}
        >
          <SymbolView
            name={sym("sparkles", "auto_awesome")}
            size={16}
            tintColor={theme.primary}
          />
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={[styles.cardDate, { color: theme.text }]}>
            {formatDate(entry.dateKey)}
          </Text>
          <Text style={[styles.cardGoal, { color: theme.textSecondary }]}>
            Daily reflection
          </Text>
        </View>
      </View>

      <View style={styles.reflectionJournalBody}>
        <Text
          style={[styles.reflectionJournalPrompt, { color: theme.primary }]}
        >
          {entry.prompt}
        </Text>
        <Text style={[styles.reflectionJournalAnswer, { color: theme.text }]}>
          {entry.answer}
        </Text>
      </View>

      {entry.photos.length > 0 ? (
        <View style={styles.reflectionPhotoStrip}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.reflectionPhotoStripContent}
          >
            {entry.photos.map((photo) => (
              <Image
                key={photo.id}
                contentFit="cover"
                source={{ uri: photo.url }}
                style={[
                  styles.reflectionPhotoThumb,
                  { backgroundColor: theme.backgroundElement },
                ]}
                transition={180}
              />
            ))}
          </ScrollView>
        </View>
      ) : null}

      <View
        style={[styles.journalOpenPostRow, { borderTopColor: theme.tabBorder }]}
      >
        <Pressable
          accessibilityLabel="Open reflection comments"
          accessibilityRole="button"
          hitSlop={8}
          onPress={onOpenComments}
          style={({ pressed }) => [
            styles.journalOpenPostButton,
            pressed && styles.pressed,
          ]}
        >
          <SymbolView
            name={sym("bubble.left", "chat_bubble_outline")}
            size={15}
            weight="semibold"
            tintColor={theme.primary}
          />
          <Text style={[styles.journalOpenPostText, { color: theme.primary }]}>
            Comments
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function JournalCard({
  entry,
  commentDraft,
  isSubmittingReply,
  photoLoadFailed,
  photos,
  replyTarget,
  onCancelReply,
  onCommentDraftChange,
  onOpenPhoto,
  onOpenMenu,
  onOpenPost,
  onReplyToComment,
  onSubmitReply,
}: {
  entry: JournalEntry;
  commentDraft: string;
  isSubmittingReply: boolean;
  photoLoadFailed: boolean;
  photos: GoalPhoto[];
  replyTarget: JournalSocialComment | null;
  onCancelReply: () => void;
  onCommentDraftChange: (value: string) => void;
  onOpenPhoto: (photo: GoalPhoto) => void;
  onOpenMenu: (entry: JournalEntry) => void;
  onOpenPost?: () => void;
  onReplyToComment: (comment: JournalSocialComment) => void;
  onSubmitReply: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
      ]}
    >
      <View style={styles.cardHeader}>
        <View
          style={[
            styles.goalIcon,
            { backgroundColor: theme.backgroundElement },
          ]}
        >
          <GoalIcon
            iconKey={entry.goal.iconKey}
            size={16}
            color={theme.primary}
          />
        </View>
        <View style={styles.cardHeaderText}>
          <Text style={[styles.cardDate, { color: theme.text }]}>
            {formatDate(entry.dateKey)}
          </Text>
          <Text style={[styles.cardGoal, { color: theme.textSecondary }]}>
            {entry.goal.name}
          </Text>
        </View>
        <Pressable
          accessibilityLabel={`Open options for ${entry.goal.name} on ${formatDate(entry.dateKey)}`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={() => onOpenMenu(entry)}
          style={({ pressed }) => [
            styles.postMenuButton,
            { backgroundColor: theme.backgroundElement },
            pressed && styles.pressed,
          ]}
        >
          <SymbolView
            name={sym("ellipsis", "more_horiz")}
            size={18}
            weight="semibold"
            tintColor={theme.textSecondary}
          />
        </Pressable>
      </View>

      {entry.note.trim() ? <RichJournalNote html={entry.note} /> : null}

      {entry.photoCount > 0 ? (
        photos.length > 0 ? (
          <JournalPhotoCarousel photos={photos} onOpenPhoto={onOpenPhoto} />
        ) : (
          <View
            style={[
              styles.photoPlaceholder,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            {photoLoadFailed ? (
              <Text
                style={[
                  styles.photoPlaceholderText,
                  { color: theme.textSecondary },
                ]}
              >
                Photos could not be loaded.
              </Text>
            ) : (
              <ActivityIndicator color={theme.primary} size="small" />
            )}
          </View>
        )
      ) : null}

      <JournalSocialActivity
        commentDraft={commentDraft}
        isSubmittingReply={isSubmittingReply}
        replyTarget={replyTarget}
        social={entry.social}
        onCancelReply={onCancelReply}
        onCommentDraftChange={onCommentDraftChange}
        onOpenPost={onOpenPost}
        onReplyToComment={onReplyToComment}
        onSubmitReply={onSubmitReply}
      />
    </View>
  );
}

function JournalPhotoCarousel({
  photos,
  onOpenPhoto,
}: {
  photos: GoalPhoto[];
  onOpenPhoto: (photo: GoalPhoto) => void;
}) {
  const theme = useTheme();
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const visibleCarouselIndex = Math.min(carouselIndex, photos.length - 1);

  return (
    <View style={styles.carouselWrap}>
      <View
        onLayout={(event) => {
          setCarouselWidth(event.nativeEvent.layout.width);
        }}
        style={[
          styles.carouselFrame,
          { backgroundColor: theme.backgroundElement },
        ]}
      >
        <ScrollView
          horizontal
          pagingEnabled
          onMomentumScrollEnd={(event) => {
            if (!carouselWidth) return;
            setCarouselIndex(
              Math.round(event.nativeEvent.contentOffset.x / carouselWidth),
            );
          }}
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
        >
          {photos.map((photo) => (
            <Pressable
              key={photo.id}
              accessibilityLabel="Open journal photo"
              onPress={() => onOpenPhoto(photo)}
              style={({ pressed }) => [
                styles.carouselSlide,
                { width: carouselWidth || 1 },
                pressed && styles.pressed,
              ]}
            >
              <Image
                contentFit="contain"
                source={{ uri: photo.url }}
                style={styles.carouselImage}
                transition={180}
              />
            </Pressable>
          ))}
        </ScrollView>
        {photos.length > 1 ? (
          <View
            style={[
              styles.carouselCounter,
              { backgroundColor: "rgba(0,0,0,0.5)" },
            ]}
          >
            <Text style={styles.carouselCounterText}>
              {visibleCarouselIndex + 1}/{photos.length}
            </Text>
          </View>
        ) : null}
      </View>
      {photos.length > 1 ? (
        <View style={styles.carouselDots}>
          {photos.map((photo, index) => (
            <View
              key={photo.id}
              style={[
                styles.carouselDot,
                {
                  backgroundColor:
                    index === visibleCarouselIndex
                      ? theme.primary
                      : theme.backgroundSelected,
                },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function JournalSocialActivity({
  commentDraft,
  isSubmittingReply,
  replyTarget,
  social,
  onCancelReply,
  onCommentDraftChange,
  onOpenPost,
  onReplyToComment,
  onSubmitReply,
}: {
  commentDraft: string;
  isSubmittingReply: boolean;
  replyTarget: JournalSocialComment | null;
  social: JournalSocialSummary | null;
  onCancelReply: () => void;
  onCommentDraftChange: (value: string) => void;
  onOpenPost?: () => void;
  onReplyToComment: (comment: JournalSocialComment) => void;
  onSubmitReply: () => void;
}) {
  const theme = useTheme();
  const propCount = social?.props.count ?? 0;
  const comments = social?.comments ?? [];
  const commentCount = useMemo(
    () => countJournalComments(comments),
    [comments],
  );

  if (propCount === 0 && commentCount === 0 && !onOpenPost) {
    return null;
  }

  return (
    <View style={[styles.socialPanel, { borderTopColor: theme.tabBorder }]}>
      <View style={styles.socialSummaryRow}>
        {propCount > 0 ? (
          <View
            style={[
              styles.socialPill,
              { backgroundColor: `${theme.primary}18` },
            ]}
          >
            <SymbolView
              name={sym("hands.clap.fill", "volunteer_activism")}
              size={15}
              weight="semibold"
              tintColor={theme.primary}
            />
            <Text style={[styles.socialPillText, { color: theme.primary }]}>
              {propCount} {propCount === 1 ? "Prop" : "Props"}
            </Text>
          </View>
        ) : null}
        {commentCount > 0 ? (
          <View
            style={[
              styles.socialPill,
              { backgroundColor: theme.backgroundElement },
            ]}
          >
            <SymbolView
              name={sym("bubble.left", "chat_bubble_outline")}
              size={14}
              weight="semibold"
              tintColor={theme.textSecondary}
            />
            <Text
              style={[styles.socialPillText, { color: theme.textSecondary }]}
            >
              {commentCount} {commentCount === 1 ? "comment" : "comments"}
            </Text>
          </View>
        ) : null}
        {onOpenPost ? (
          <Pressable
            accessibilityLabel="Open comments"
            accessibilityRole="button"
            hitSlop={8}
            onPress={onOpenPost}
            style={({ pressed }) => [
              styles.socialPill,
              { backgroundColor: theme.backgroundElement },
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={sym("bubble.left", "chat_bubble_outline")}
              size={14}
              weight="semibold"
              tintColor={theme.primary}
            />
            <Text style={[styles.socialPillText, { color: theme.primary }]}>
              Open comments
            </Text>
          </Pressable>
        ) : null}
      </View>

      {commentCount > 0 ? (
        <View style={styles.journalCommentsList}>
          {comments.map((comment) => (
            <JournalCommentRow
              key={comment.id}
              comment={comment}
              onReply={onReplyToComment}
            />
          ))}
        </View>
      ) : null}

      {replyTarget ? (
        <View style={styles.journalReplyComposer}>
          <View style={styles.journalReplyingToRow}>
            <Text
              numberOfLines={1}
              style={[
                styles.journalReplyingToText,
                { color: theme.textSecondary },
              ]}
            >
              Replying to {replyTarget.authorName}
            </Text>
            <Pressable
              accessibilityLabel="Cancel reply"
              hitSlop={8}
              onPress={onCancelReply}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <SymbolView
                name={sym("xmark", "close")}
                size={13}
                weight="bold"
                tintColor={theme.textSecondary}
              />
            </Pressable>
          </View>
          <View style={styles.journalReplyInputRow}>
            <TextInput
              maxLength={2000}
              onChangeText={onCommentDraftChange}
              onSubmitEditing={onSubmitReply}
              placeholder={`Reply to ${replyTarget.authorName}...`}
              placeholderTextColor={theme.textSecondary}
              returnKeyType="send"
              style={[
                styles.journalReplyInput,
                {
                  backgroundColor: theme.backgroundElement,
                  color: theme.text,
                },
              ]}
              value={commentDraft}
            />
            <Pressable
              disabled={!commentDraft.trim() || isSubmittingReply}
              onPress={onSubmitReply}
              style={({ pressed }) => [
                styles.journalReplySendButton,
                { backgroundColor: theme.primary },
                (!commentDraft.trim() || isSubmittingReply) &&
                  styles.journalReplySendButtonDisabled,
                pressed && styles.pressed,
              ]}
            >
              {isSubmittingReply ? (
                <ActivityIndicator
                  color={theme.primaryForeground}
                  size="small"
                />
              ) : (
                <SymbolView
                  name={sym("paperplane.fill", "send")}
                  size={15}
                  weight="semibold"
                  tintColor={theme.primaryForeground}
                />
              )}
            </Pressable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

function JournalCommentRow({
  comment,
  depth = 0,
  onReply,
}: {
  comment: JournalSocialComment;
  depth?: number;
  onReply: (comment: JournalSocialComment) => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.journalCommentThread,
        depth > 0 && styles.journalCommentReplyThread,
      ]}
    >
      <View
        style={[
          styles.journalCommentRow,
          depth > 0 && styles.journalCommentReplyRow,
          { backgroundColor: theme.backgroundElement },
        ]}
      >
        <JournalCommentAvatar
          image={comment.authorImage}
          name={comment.authorName}
        />
        <View style={styles.journalCommentBody}>
          <Text
            numberOfLines={1}
            style={[styles.journalCommentAuthor, { color: theme.text }]}
          >
            {comment.authorName}
          </Text>
          <Text style={[styles.journalCommentText, { color: theme.text }]}>
            {comment.body}
          </Text>
          <Pressable
            hitSlop={8}
            onPress={() => onReply(comment)}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Text
              style={[styles.journalCommentReplyText, { color: theme.primary }]}
            >
              Reply
            </Text>
          </Pressable>
        </View>
      </View>
      {comment.replies.length > 0 ? (
        <View style={styles.journalCommentReplies}>
          {comment.replies.map((reply) => (
            <JournalCommentRow
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              onReply={onReply}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function JournalCommentAvatar({
  image,
  name,
}: {
  image: string | null;
  name: string;
}) {
  const theme = useTheme();

  if (image) {
    return (
      <Image
        contentFit="cover"
        source={{ uri: image }}
        style={styles.journalCommentAvatarImage}
      />
    );
  }

  return (
    <View
      style={[
        styles.journalCommentAvatarFallback,
        { backgroundColor: `${theme.primary}22` },
      ]}
    >
      <Text style={[styles.journalCommentAvatarText, { color: theme.primary }]}>
        {(name.trim().slice(0, 1) || "?").toUpperCase()}
      </Text>
    </View>
  );
}

const VISIBILITY_OPTIONS: Array<{
  value: GoalVisibility;
  label: string;
  icon: SymbolName;
}> = [
  {
    value: "only_me",
    label: VISIBILITY_LABELS.only_me,
    icon: sym("person.fill", "person"),
  },
  {
    value: "goal_friends",
    label: VISIBILITY_LABELS.goal_friends,
    icon: sym("person.2.fill", "group"),
  },
  {
    value: "all_friends",
    label: VISIBILITY_LABELS.all_friends,
    icon: sym("person.3.fill", "groups"),
  },
];

function PostActionsSheet({
  entry,
  isUpdating,
  uploadingPhotoSource,
  onClose,
  onDelete,
  onSetVisibility,
  onEditNote,
  onAddPhoto,
}: {
  entry: JournalEntry | null;
  isUpdating: boolean;
  uploadingPhotoSource: GoalPhotoSource | null;
  onClose: () => void;
  onDelete: (entry: JournalEntry) => void;
  onSetVisibility: (entry: JournalEntry, visibility: GoalVisibility) => void;
  onEditNote: (entry: JournalEntry) => void;
  onAddPhoto: (entry: JournalEntry, source: GoalPhotoSource) => void;
}) {
  const theme = useTheme();
  const hasNote = Boolean(entry?.note?.trim());
  const isUploadingPhoto = uploadingPhotoSource !== null;

  return (
    <PickerSheet isOpen={entry !== null} title="Post options" onClose={onClose}>
      {entry ? (
        <>
          <Text style={[styles.sheetSection, { color: theme.textSecondary }]}>
            Edit
          </Text>
          <PickerRow
            disabled={isUpdating}
            icon={sym("note.text", "notes")}
            label={hasNote ? "Edit note" : "Add note"}
            onPress={() => onEditNote(entry)}
          />
          <PickerRow
            disabled={isUploadingPhoto}
            loading={uploadingPhotoSource === "camera"}
            icon={sym("camera.fill", "camera_alt")}
            label="Take photo"
            onPress={() => onAddPhoto(entry, "camera")}
          />
          <PickerRow
            disabled={isUploadingPhoto}
            loading={uploadingPhotoSource === "library"}
            icon={sym("photo.fill", "photo_library")}
            label="Add photo"
            onPress={() => onAddPhoto(entry, "library")}
          />
          <View
            style={[
              styles.postActionDivider,
              { backgroundColor: theme.tabBorder },
            ]}
          />
          <Text style={[styles.sheetSection, { color: theme.textSecondary }]}>
            Post visibility
          </Text>
          {VISIBILITY_OPTIONS.map((option) => (
            <PickerRow
              key={option.value}
              disabled={isUpdating}
              icon={option.icon}
              label={option.label}
              selected={entry.visibility === option.value}
              onPress={() => onSetVisibility(entry, option.value)}
            />
          ))}
          <View
            style={[
              styles.postActionDivider,
              { backgroundColor: theme.tabBorder },
            ]}
          />
          <Pressable
            accessibilityRole="button"
            disabled={isUpdating}
            onPress={() => onDelete(entry)}
            style={({ pressed }) => [
              styles.deleteLogRow,
              isUpdating && styles.disabled,
              pressed && styles.pressed,
            ]}
          >
            {isUpdating ? (
              <ActivityIndicator color="#C84850" size="small" />
            ) : (
              <SymbolView
                name={sym("trash.fill", "delete")}
                size={18}
                tintColor="#C84850"
              />
            )}
            <View style={styles.deleteLogText}>
              <Text style={styles.deleteLogTitle}>Delete log</Text>
              <Text
                style={[
                  styles.deleteLogDescription,
                  { color: theme.textSecondary },
                ]}
              >
                Deletes its report, note, photos, and feed activity.
              </Text>
            </View>
          </Pressable>
        </>
      ) : null}
    </PickerSheet>
  );
}

const JOURNAL_COLLAPSE_HEIGHT = 130;
const HTML_IGNORED_TAGS = ["script", "style", "iframe", "img", "video"];
const HTML_DEFAULT_TEXT_PROPS = { selectable: true };

function RichJournalNote({ html }: { html: string }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const contentWidth = Math.max(0, Math.min(width, MaxContentWidth) - 66);
  const [expanded, setExpanded] = useState(false);
  const isLong = html.replace(/<[^>]*>/g, "").trim().length > 300;
  const source = useMemo(() => ({ html }), [html]);
  const baseStyle = useMemo(
    () => ({
      color: theme.text,
      fontSize: 14,
      fontWeight: "500" as const,
      lineHeight: 21,
    }),
    [theme.text],
  );
  const tagsStyles = useMemo<MixedStyleRecord>(
    () => ({
      p: {
        marginTop: 0,
        marginBottom: 6,
      },
      h1: {
        fontSize: 17,
        lineHeight: 24,
        fontWeight: "800",
        marginTop: 0,
        marginBottom: 6,
      },
      h2: {
        fontSize: 16,
        lineHeight: 23,
        fontWeight: "800",
        marginTop: 0,
        marginBottom: 6,
      },
      h3: {
        fontSize: 15,
        lineHeight: 22,
        fontWeight: "700",
        marginTop: 0,
        marginBottom: 6,
      },
      strong: { fontWeight: "800" },
      b: { fontWeight: "800" },
      em: { fontStyle: "italic" },
      i: { fontStyle: "italic" },
      s: { textDecorationLine: "line-through" },
      del: { textDecorationLine: "line-through" },
      ul: {
        marginTop: 0,
        marginBottom: 6,
        paddingLeft: 18,
      },
      ol: {
        marginTop: 0,
        marginBottom: 6,
        paddingLeft: 18,
      },
      li: { marginBottom: 3 },
      blockquote: {
        borderLeftWidth: 3,
        borderLeftColor: theme.tabBorder,
        color: theme.textSecondary,
        marginTop: 0,
        marginBottom: 6,
        marginLeft: 0,
        paddingLeft: 10,
      },
      a: {
        color: theme.primary,
        textDecorationLine: "underline",
      },
      code: {
        fontFamily: Fonts.mono,
        backgroundColor: theme.backgroundElement,
      },
      pre: {
        fontFamily: Fonts.mono,
        backgroundColor: theme.backgroundElement,
        borderRadius: 8,
        marginTop: 0,
        marginBottom: 6,
        padding: 10,
      },
    }),
    [
      theme.backgroundElement,
      theme.primary,
      theme.tabBorder,
      theme.textSecondary,
    ],
  );

  return (
    <View style={styles.richNote}>
      <View
        style={
          isLong && !expanded
            ? { maxHeight: JOURNAL_COLLAPSE_HEIGHT, overflow: "hidden" }
            : undefined
        }
      >
        <RenderHTML
          baseStyle={baseStyle}
          contentWidth={contentWidth}
          defaultTextProps={HTML_DEFAULT_TEXT_PROPS}
          enableCSSInlineProcessing={false}
          ignoredDomTags={HTML_IGNORED_TAGS}
          source={source}
          tagsStyles={tagsStyles}
        />
      </View>
      {isLong ? (
        <Pressable
          onPress={() => setExpanded((x) => !x)}
          style={styles.showMoreButton}
        >
          <Text style={[styles.showMoreText, { color: theme.primary }]}>
            {expanded ? "Show less" : "Show more"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function EmptyState({
  goalName,
  isReflectionFilter,
  dateLabel,
}: {
  goalName: string | null;
  isReflectionFilter: boolean;
  dateLabel: string | null;
}) {
  const subject = isReflectionFilter
    ? "No daily reflections"
    : goalName
      ? `${goalName} has no journal entries`
      : "No journal entries";
  const detail = isReflectionFilter
    ? `Your reflection answers will appear here${dateLabel ? ` in ${dateLabel}` : ""}.`
    : `${goalName ? `${goalName} has` : "No goals have"} notes or photos from completed days${dateLabel ? ` in ${dateLabel}` : ""}.`;

  return (
    <View style={styles.centerState}>
      <BrandedEmptyState title={subject} description={detail} />
    </View>
  );
}

function MonthYearPickerModal({
  isOpen,
  selectedMonth,
  selectedYear,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  selectedMonth: number | null;
  selectedYear: number | null;
  onClose: () => void;
  onSelect: (month: number | null, year: number | null) => void;
}) {
  const theme = useTheme();
  const [displayYear, setDisplayYear] = useState(
    selectedYear ?? new Date().getFullYear(),
  );

  useEffect(() => {
    if (isOpen) setDisplayYear(selectedYear ?? new Date().getFullYear());
  }, [isOpen, selectedYear]);

  return (
    <PickerSheet isOpen={isOpen} title="Filter by date" onClose={onClose}>
      <PickerRow
        icon={sym("calendar", "calendar_month")}
        label="All dates"
        selected={selectedMonth === null && selectedYear === null}
        onPress={() => onSelect(null, null)}
      />
      <View style={styles.yearNavigator}>
        <Pressable
          accessibilityLabel="Previous year"
          onPress={() => setDisplayYear((year) => year - 1)}
          style={({ pressed }) => [
            styles.yearArrow,
            { backgroundColor: theme.backgroundElement },
            pressed && styles.pressed,
          ]}
        >
          <SymbolView
            name={sym("chevron.left", "chevron_left")}
            size={17}
            weight="semibold"
            tintColor={theme.textSecondary}
          />
        </Pressable>
        <Text style={[styles.yearLabel, { color: theme.text }]}>
          {displayYear}
        </Text>
        <Pressable
          accessibilityLabel="Next year"
          onPress={() => setDisplayYear((year) => year + 1)}
          style={({ pressed }) => [
            styles.yearArrow,
            { backgroundColor: theme.backgroundElement },
            pressed && styles.pressed,
          ]}
        >
          <SymbolView
            name={sym("chevron.right", "chevron_right")}
            size={17}
            weight="semibold"
            tintColor={theme.textSecondary}
          />
        </Pressable>
      </View>
      <View style={styles.monthGrid}>
        {MONTHS.map((month, index) => {
          const selected =
            index === selectedMonth && displayYear === selectedYear;
          return (
            <Pressable
              key={month}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onSelect(index, displayYear)}
              style={({ pressed }) => [
                styles.monthOption,
                {
                  backgroundColor: selected
                    ? theme.primary
                    : theme.backgroundElement,
                },
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.monthOptionText,
                  {
                    color: selected ? theme.primaryForeground : theme.text,
                  },
                ]}
              >
                {month.slice(0, 3)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </PickerSheet>
  );
}

function PickerSheet({
  children,
  isOpen,
  title,
  onClose,
}: {
  children: React.ReactNode;
  isOpen: boolean;
  title: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={isOpen}
    >
      <View style={styles.sheetOverlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View
          style={[
            styles.sheet,
            { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
          ]}
        >
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: theme.text }]}>
              {title}
            </Text>
            <Pressable
              hitSlop={8}
              onPress={onClose}
              style={[
                styles.closeButton,
                { backgroundColor: theme.backgroundElement },
              ]}
            >
              <SymbolView
                name={sym("xmark", "close")}
                size={14}
                weight="bold"
                tintColor={theme.textSecondary}
              />
            </Pressable>
          </View>
          <ScrollView
            canCancelContentTouches
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function PickerRow({
  icon,
  iconKey,
  label,
  selected = false,
  disabled = false,
  loading = false,
  onPress,
}: {
  icon?: SymbolName;
  iconKey?: string;
  label: string;
  selected?: boolean;
  disabled?: boolean;
  loading?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const press = useReliablePress(onPress);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={press}
      style={({ pressed }) => [
        styles.sheetRow,
        selected && { backgroundColor: `${theme.primary}12` },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={theme.primary}
          style={styles.pickerRowSpinner}
        />
      ) : iconKey ? (
        <GoalIcon
          iconKey={iconKey}
          size={18}
          color={selected ? theme.primary : theme.tabIcon}
        />
      ) : (
        <SymbolView
          name={icon ?? sym("target", "target")}
          size={18}
          tintColor={selected ? theme.primary : theme.tabIcon}
        />
      )}
      <Text
        style={[
          styles.sheetRowLabel,
          { color: selected ? theme.primary : theme.text },
        ]}
      >
        {label}
      </Text>
      {selected ? (
        <SymbolView
          name={sym("checkmark", "check")}
          size={14}
          weight="bold"
          tintColor={theme.primary}
        />
      ) : null}
    </Pressable>
  );
}

function PhotoViewer({
  photo,
  isBusy,
  onClose,
  onDelete,
  onRotate,
}: {
  photo: GoalPhoto | null;
  isBusy: boolean;
  onClose: () => void;
  onDelete: () => void;
  onRotate: (degrees: number) => void;
}) {
  const { width: viewportWidth, height: viewportHeight } =
    useWindowDimensions();
  const [photoSize, setPhotoSize] = useState<ViewerPhotoSize | null>(null);
  const activePhotoId = photo?.id ?? null;
  const activePhotoSize =
    photoSize?.photoId === activePhotoId ? photoSize : null;
  const viewerViewportStyle = useMemo(
    () => ({ width: viewportWidth, height: viewportHeight }),
    [viewportHeight, viewportWidth],
  );
  const photoFrame = useMemo(
    () =>
      getContainedImageFrame(activePhotoSize, viewportWidth, viewportHeight),
    [activePhotoSize, viewportHeight, viewportWidth],
  );

  const handlePhotoLoad = useCallback(
    (photoId: string, event: ImageLoadEventData) => {
      const { height, width } = event.source;
      if (width > 0 && height > 0) {
        setPhotoSize({ photoId, width, height });
      }
    },
    [],
  );

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible={photo !== null}
    >
      <View style={styles.photoViewer}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        {photo ? (
          <ScrollView
            key={photo.id}
            bounces={false}
            bouncesZoom
            centerContent
            contentContainerStyle={[
              styles.photoZoomContent,
              viewerViewportStyle,
            ]}
            maximumZoomScale={4}
            minimumZoomScale={1}
            pinchGestureEnabled
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            style={styles.photoZoomFrame}
          >
            <View style={viewerViewportStyle}>
              <Image
                contentFit="contain"
                source={{ uri: photo.url }}
                style={styles.fullPhoto}
                onLoad={(event) => handlePhotoLoad(photo.id, event)}
              />
            </View>
          </ScrollView>
        ) : null}
        <PhotoBackdropHitTargets
          frame={photoFrame}
          viewportWidth={viewportWidth}
          viewportHeight={viewportHeight}
          onPress={onClose}
        />
        <Pressable
          accessibilityLabel="Close photo"
          disabled={isBusy}
          onPress={onClose}
          style={styles.viewerClose}
        >
          <SymbolView
            name={sym("xmark", "close")}
            size={18}
            weight="bold"
            tintColor="#FFFFFF"
          />
        </Pressable>
        {photo ? (
          <View style={styles.viewerControls}>
            <Pressable
              accessibilityLabel="Rotate left"
              disabled={isBusy}
              onPress={() => onRotate(-90)}
              style={({ pressed }) => [
                styles.viewerControlButton,
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("rotate.left", "rotate_left")}
                size={22}
                weight="bold"
                tintColor="#FFFFFF"
              />
            </Pressable>
            <Pressable
              accessibilityLabel="Rotate right"
              disabled={isBusy}
              onPress={() => onRotate(90)}
              style={({ pressed }) => [
                styles.viewerControlButton,
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("rotate.right", "rotate_right")}
                size={22}
                weight="bold"
                tintColor="#FFFFFF"
              />
            </Pressable>
            <Pressable
              accessibilityLabel="Delete photo"
              disabled={isBusy}
              onPress={onDelete}
              style={({ pressed }) => [
                styles.viewerControlButton,
                pressed && styles.pressed,
              ]}
            >
              <SymbolView
                name={sym("trash", "delete")}
                size={22}
                weight="bold"
                tintColor="#FF453A"
              />
            </Pressable>
          </View>
        ) : null}
        {isBusy ? (
          <View
            pointerEvents="auto"
            style={[StyleSheet.absoluteFill, styles.viewerBusy]}
          >
            <ActivityIndicator color="#FFFFFF" size="large" />
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    gap: 18,
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 40,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 11 },
  headerIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  headerText: { flex: 1, gap: 1 },
  title: {
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  subtitle: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  filters: { flexDirection: "row", alignItems: "stretch", gap: 9 },
  pickerMenu: { flex: 1 },
  pickerButton: {
    flex: 1,
    minHeight: 60,
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 17,
    paddingHorizontal: 14,
  },
  pickerText: { flex: 1, gap: 1 },
  pickerLabel: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  pickerValue: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
  monthButton: {
    width: 70,
    minHeight: 60,
    alignItems: "center",
    justifyContent: "center",
    gap: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 17,
  },
  monthButtonMonth: {
    fontSize: 13,
    lineHeight: 16,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.7,
  },
  monthButtonYear: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
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
  errorText: { flex: 1, color: "#9D474D", fontSize: 12, fontWeight: "600" },
  retryText: { color: "#9D474D", fontSize: 12, fontWeight: "800" },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingHorizontal: 30,
    paddingVertical: 64,
  },
  emptyIcon: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 19,
    marginBottom: 2,
  },
  emptyTitle: { fontSize: 17, lineHeight: 22, fontWeight: "800" },
  emptyDescription: {
    maxWidth: 300,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
  },
  entrySeparator: { height: 12 },
  loadMoreIndicator: { paddingVertical: 16 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    overflow: "hidden",
  },
  reflectionJournalCard: {
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  goalIcon: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  cardHeaderText: { flex: 1, gap: 1 },
  cardDate: { fontSize: 14, lineHeight: 19, fontWeight: "800" },
  cardGoal: { fontSize: 11, lineHeight: 15, fontWeight: "600" },
  checkpointBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  checkpointBadgeText: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "900",
    letterSpacing: 0.5,
  },
  checkpointNote: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  reflectionJournalBody: {
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  reflectionJournalPrompt: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "800",
  },
  reflectionJournalAnswer: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "600",
  },
  reflectionPhotoStrip: {
    paddingBottom: 14,
  },
  reflectionPhotoStripContent: {
    gap: 8,
    paddingHorizontal: 14,
  },
  reflectionPhotoThumb: {
    width: 112,
    height: 112,
    borderRadius: 16,
  },
  journalOpenPostRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  journalOpenPostButton: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  journalOpenPostText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
  postMenuButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  richNote: { minWidth: 0, paddingHorizontal: 14, paddingBottom: 12 },
  showMoreButton: { paddingTop: 4 },
  showMoreText: { fontSize: 13, fontWeight: "500" },
  carouselWrap: {
    marginBottom: 12,
  },
  carouselFrame: {
    position: "relative",
    width: "100%",
    aspectRatio: 1,
    overflow: "hidden",
  },
  carouselSlide: {
    aspectRatio: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  carouselImage: { width: "100%", height: "100%" },
  carouselCounter: {
    position: "absolute",
    top: 10,
    right: 10,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  carouselCounterText: {
    color: "#FFFFFF",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "800",
  },
  carouselDots: {
    minHeight: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingTop: 8,
  },
  carouselDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  photoPlaceholder: {
    minHeight: 100,
    marginHorizontal: 14,
    marginBottom: 12,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  photoPlaceholderText: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "600",
  },
  socialPanel: {
    gap: 9,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingTop: 11,
    paddingBottom: 12,
  },
  socialSummaryRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 7,
  },
  socialPill: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  socialPillText: { fontSize: 12, lineHeight: 16, fontWeight: "700" },
  journalCommentsList: { gap: 7 },
  journalCommentThread: { gap: 6 },
  journalCommentReplyThread: { marginLeft: 22 },
  journalCommentReplies: { gap: 6 },
  journalCommentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  journalCommentReplyRow: { borderTopLeftRadius: 4 },
  journalCommentAvatarImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  journalCommentAvatarFallback: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  journalCommentAvatarText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "800",
  },
  journalCommentBody: { flex: 1, minWidth: 0, gap: 2 },
  journalCommentAuthor: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  journalCommentText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  journalCommentReplyText: {
    alignSelf: "flex-start",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  journalReplyComposer: { gap: 7 },
  journalReplyingToRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 2,
  },
  journalReplyingToText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
  },
  journalReplyInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  journalReplyInput: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    lineHeight: 19,
  },
  journalReplySendButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: 11,
  },
  journalReplySendButtonDisabled: { opacity: 0.45 },
  sheetOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "#00000055",
    padding: 12,
  },
  sheet: {
    maxHeight: "82%",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 25,
    padding: 8,
    paddingBottom: 14,
  },
  sheetHeader: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
  },
  sheetTitle: { fontSize: 17, lineHeight: 22, fontWeight: "800" },
  closeButton: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 11,
  },
  sheetSection: {
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 5,
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  sheetRow: {
    minHeight: 50,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  sheetRowLabel: { flex: 1, fontSize: 15, lineHeight: 20, fontWeight: "700" },
  pickerRowSpinner: { width: 18 },
  postActionDivider: {
    height: StyleSheet.hairlineWidth,
    marginHorizontal: 14,
    marginVertical: 8,
  },
  deleteLogRow: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderRadius: 16,
    paddingHorizontal: 14,
  },
  deleteLogText: { flex: 1, gap: 1 },
  deleteLogTitle: {
    color: "#C84850",
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "800",
  },
  deleteLogDescription: { fontSize: 11, lineHeight: 15, fontWeight: "600" },
  disabled: { opacity: 0.5 },
  yearNavigator: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    marginBottom: 6,
  },
  yearArrow: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  yearLabel: { fontSize: 19, lineHeight: 24, fontWeight: "800" },
  monthGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 6,
    paddingBottom: 6,
  },
  monthOption: {
    width: "31.6%",
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  monthOptionText: { fontSize: 13, lineHeight: 17, fontWeight: "800" },
  photoViewer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#000000E8",
  },
  photoZoomFrame: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
  },
  photoZoomContent: {
    alignItems: "center",
    justifyContent: "center",
  },
  fullPhoto: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  viewerClose: {
    position: "absolute",
    top: 54,
    right: 20,
    zIndex: 2,
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    backgroundColor: "#FFFFFF22",
  },
  viewerControls: {
    position: "absolute",
    bottom: 54,
    zIndex: 2,
    flexDirection: "row",
    gap: 18,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderRadius: 28,
    backgroundColor: "#000000AA",
  },
  viewerControlButton: {
    width: 48,
    height: 48,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 24,
    backgroundColor: "#FFFFFF1A",
  },
  viewerBusy: {
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#00000066",
  },
  pressed: { opacity: 0.72 },
});
