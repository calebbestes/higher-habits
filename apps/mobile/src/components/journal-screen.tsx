import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { GoalIcon } from "@/components/goal-icon";
import { HistoryHeaderMenu } from "@/components/history-header-menu";
import { Image } from "expo-image";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Pressable,
  RefreshControl,
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
import { Fonts, MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import {
  type CheckpointPhoto,
  deleteCheckpointPhoto,
  fetchAllCheckpointPhotos,
  uploadCheckpointPhoto,
} from "@/lib/checkpoint-photos-client";
import { addFeedComment } from "@/lib/friends-client";
import {
  type GoalLogsSnapshot,
  deleteGoalLog,
  fetchAllGoalLogsSnapshot,
  fetchGoalLogsSnapshot,
  getMonthKey,
  setGoalLogNote,
  setGoalLogVisibility,
} from "@/lib/goal-logs-client";
import { type GoalPhotoSource, pickGoalPhoto } from "@/lib/goal-photo-picker";
import {
  type GoalPhoto,
  deleteGoalPhoto,
  fetchAllGoalPhotos,
  fetchGoalPhotosForRange,
  uploadGoalPhoto,
} from "@/lib/goal-photos-client";
import type { GoalVisibility } from "@/lib/goals-client";
import {
  playSelectionHaptic,
  playSuccessHaptic,
  playWarningHaptic,
} from "@/lib/haptics";
import { rotateRemotePhoto } from "@/lib/photo-edit";
import { type Goal, fetchPlanGoals } from "@/lib/planning-goals-client";
import { VISIBILITY_LABELS } from "@/lib/visibility-labels";

type SymbolName = SymbolViewProps["name"];

type GoalOption = {
  id: string;
  name: string;
  iconKey: string;
  categoryId: string;
};

type GoalSection = {
  categoryId: string;
  categoryName: string;
  goals: GoalOption[];
};

type JournalEntry = {
  dateKey: string;
  goal: GoalOption;
  note: string;
  photoCount: number;
  visibility: GoalVisibility;
  social: JournalSocialSummary | null;
};

type JournalSocialSummary = GoalLogsSnapshot["socialByGoalDate"][string];
type JournalSocialComment = JournalSocialSummary["comments"][number];

type CheckpointJournalEntry = {
  id: string;
  goalTitle: string;
  checkpointTitle: string;
  dateKey: string;
  note: string;
  visibility: GoalVisibility;
  photos: GoalPhoto[];
};

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

function dateKey(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthRange(year: number, month: number) {
  return {
    startDateKey: dateKey(year, month, 1),
    endDateKey: dateKey(year, month, new Date(year, month + 1, 0).getDate()),
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

function buildGoalSections(snapshot: GoalLogsSnapshot | null): GoalSection[] {
  if (!snapshot) return [];

  return snapshot.categories
    .map((category) => {
      const dailyGoals = category.goals.map((goal) => ({
        id: goal.id,
        name: goal.name,
        iconKey: goal.iconKey,
        categoryId: goal.categoryId,
      }));
      const periodicGoals = snapshot.periodicGoals
        .filter((goal) => goal.categoryId === category.id)
        .map((goal) => ({
          id: goal.id,
          name: goal.name,
          iconKey: goal.iconKey,
          categoryId: goal.categoryId,
        }));

      return {
        categoryId: category.id,
        categoryName: category.name,
        goals: [...dailyGoals, ...periodicGoals].sort((left, right) =>
          left.name.localeCompare(right.name),
        ),
      };
    })
    .filter((section) => section.goals.length > 0);
}

export function JournalScreen() {
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const [selectedMonth, setSelectedMonth] = useState<number | null>(null);
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);
  const [snapshot, setSnapshot] = useState<GoalLogsSnapshot | null>(null);
  const [photos, setPhotos] = useState<GoalPhoto[]>([]);
  const [photoLoadFailed, setPhotoLoadFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<"goal" | "monthYear" | null>(null);
  const [activePhoto, setActivePhoto] = useState<GoalPhoto | null>(null);
  const [isEditingPhoto, setIsEditingPhoto] = useState(false);
  const [checkpointGoals, setCheckpointGoals] = useState<Goal[]>([]);
  const [checkpointPhotos, setCheckpointPhotos] = useState<CheckpointPhoto[]>(
    [],
  );
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

  const selectedDate = useMemo(
    () =>
      selectedMonth !== null && selectedYear !== null
        ? new Date(selectedYear, selectedMonth, 1)
        : null,
    [selectedMonth, selectedYear],
  );
  const range = useMemo(
    () =>
      selectedMonth !== null && selectedYear !== null
        ? monthRange(selectedYear, selectedMonth)
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
        const nextSnapshot = selectedDate
          ? await fetchGoalLogsSnapshot(getMonthKey(selectedDate))
          : await fetchAllGoalLogsSnapshot();
        let nextPhotoLoadFailed = false;
        const nextPhotos = await (range
          ? fetchGoalPhotosForRange(
              selectedGoalId,
              range.startDateKey,
              range.endDateKey,
            )
          : fetchAllGoalPhotos(selectedGoalId)
        ).catch(() => {
          nextPhotoLoadFailed = true;
          return [];
        });
        if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
          return;
        }
        setSnapshot(nextSnapshot);
        setPhotos(nextPhotos);
        setPhotoLoadFailed(nextPhotoLoadFailed);

        const [nextGoals, nextCheckpointPhotos] = await Promise.all([
          fetchPlanGoals().catch(() => [] as Goal[]),
          fetchAllCheckpointPhotos().catch(() => [] as CheckpointPhoto[]),
        ]);
        if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
          return;
        }
        setCheckpointGoals(nextGoals);
        setCheckpointPhotos(nextCheckpointPhotos);
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
    [range, selectedDate, selectedGoalId],
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

  const allSections = useMemo(() => buildGoalSections(snapshot), [snapshot]);
  const goals = useMemo(
    () => allSections.flatMap((section) => section.goals),
    [allSections],
  );
  const goalById = useMemo(
    () => new Map(goals.map((goal) => [goal.id, goal])),
    [goals],
  );
  const journalGoalIds = useMemo(() => {
    const ids = new Set<string>();
    if (!snapshot) return ids;

    const keys = new Set([
      ...Object.keys(snapshot.notesByGoalDate),
      ...Object.keys(snapshot.photoCountsByGoalDate ?? {}),
      ...Object.keys(snapshot.socialByGoalDate ?? {}),
    ]);

    for (const key of keys) {
      if (snapshot.logsByGoalDate[key] !== "complete") continue;
      const note = snapshot.notesByGoalDate[key] ?? "";
      const photoCount = snapshot.photoCountsByGoalDate?.[key] ?? 0;
      const social = snapshot.socialByGoalDate?.[key] ?? null;
      const hasSocial =
        (social?.props.count ?? 0) > 0 || (social?.comments.length ?? 0) > 0;
      if (note.trim() || photoCount > 0 || hasSocial) {
        ids.add(key.slice(0, key.indexOf("_")));
      }
    }

    return ids;
  }, [snapshot]);
  const sections = useMemo(
    () =>
      allSections
        .map((section) => ({
          ...section,
          goals: section.goals.filter((goal) => journalGoalIds.has(goal.id)),
        }))
        .filter((section) => section.goals.length > 0),
    [allSections, journalGoalIds],
  );
  const selectedGoal = selectedGoalId
    ? (goalById.get(selectedGoalId) ?? null)
    : null;

  useEffect(() => {
    if (selectedGoalId && snapshot && !journalGoalIds.has(selectedGoalId)) {
      setSelectedGoalId(null);
    }
  }, [journalGoalIds, selectedGoalId, snapshot]);

  const photosByEntry = useMemo(() => {
    const grouped = new Map<string, GoalPhoto[]>();
    for (const photo of photos) {
      const key = `${photo.goalId}_${photo.dateKey}`;
      grouped.set(key, [...(grouped.get(key) ?? []), photo]);
    }
    return grouped;
  }, [photos]);

  const entries = useMemo(() => {
    if (!snapshot) return [];
    const keys = new Set([
      ...Object.keys(snapshot.notesByGoalDate),
      ...Object.keys(snapshot.photoCountsByGoalDate ?? {}),
      ...Object.keys(snapshot.socialByGoalDate ?? {}),
    ]);
    const results: JournalEntry[] = [];

    for (const key of keys) {
      const separator = key.indexOf("_");
      const goalId = key.slice(0, separator);
      const entryDateKey = key.slice(separator + 1);
      const goal = goalById.get(goalId);
      if (!goal || (selectedGoalId && goalId !== selectedGoalId)) continue;
      if (
        (range &&
          (entryDateKey < range.startDateKey ||
            entryDateKey > range.endDateKey)) ||
        snapshot.logsByGoalDate[key] !== "complete"
      ) {
        continue;
      }

      const note = snapshot.notesByGoalDate[key] ?? "";
      const photoCount = snapshot.photoCountsByGoalDate?.[key] ?? 0;
      const social = snapshot.socialByGoalDate?.[key] ?? null;
      const hasSocial =
        (social?.props.count ?? 0) > 0 || (social?.comments.length ?? 0) > 0;
      if (!note.trim() && photoCount === 0 && !hasSocial) continue;
      results.push({
        dateKey: entryDateKey,
        goal,
        note,
        photoCount,
        visibility: snapshot.visibilityByGoalDate?.[key] ?? "only_me",
        social,
      });
    }

    return results.sort(
      (left, right) =>
        right.dateKey.localeCompare(left.dateKey) ||
        left.goal.name.localeCompare(right.goal.name),
    );
  }, [goalById, range, selectedGoalId, snapshot]);

  const checkpointPhotosById = useMemo(() => {
    const grouped = new Map<string, GoalPhoto[]>();
    for (const photo of checkpointPhotos) {
      const mapped: GoalPhoto = {
        id: photo.id,
        url: photo.url,
        contentType: photo.contentType,
        createdAt: photo.createdAt,
        dateKey: "",
        goalId: photo.checkpointId,
      };
      grouped.set(photo.checkpointId, [
        ...(grouped.get(photo.checkpointId) ?? []),
        mapped,
      ]);
    }
    return grouped;
  }, [checkpointPhotos]);

  const checkpointEntries = useMemo(() => {
    // Checkpoints aren't tied to a habit goal, so hide them when filtering by
    // a specific habit.
    if (selectedGoalId) return [] as CheckpointJournalEntry[];

    const results: CheckpointJournalEntry[] = [];
    for (const goal of checkpointGoals) {
      for (const checkpoint of goal.checkpoints) {
        if (!checkpoint.completed || !checkpoint.completedAt) continue;

        const entryDateKey = checkpoint.completedAt.slice(0, 10);
        if (
          range &&
          (entryDateKey < range.startDateKey || entryDateKey > range.endDateKey)
        ) {
          continue;
        }

        const note = checkpoint.notes ?? "";
        const photos = checkpointPhotosById.get(checkpoint.id) ?? [];
        if (!note.trim() && photos.length === 0) continue;

        results.push({
          id: checkpoint.id,
          goalTitle: goal.title,
          checkpointTitle: checkpoint.title,
          dateKey: entryDateKey,
          note,
          visibility: checkpoint.visibility,
          photos,
        });
      }
    }

    return results.sort((left, right) =>
      right.dateKey.localeCompare(left.dateKey),
    );
  }, [checkpointGoals, checkpointPhotosById, range, selectedGoalId]);

  const mergedEntries = useMemo(
    () =>
      [
        ...entries.map((entry) => ({ kind: "habit" as const, entry })),
        ...checkpointEntries.map((entry) => ({
          kind: "checkpoint" as const,
          entry,
        })),
      ].sort((left, right) =>
        right.entry.dateKey.localeCompare(left.entry.dateKey),
      ),
    [entries, checkpointEntries],
  );

  const handleSetPostVisibility = useCallback(
    async (entry: JournalEntry, visibility: GoalVisibility) => {
      if (isUpdatingPost || visibility === entry.visibility) return;
      const key = `${entry.goal.id}_${entry.dateKey}`;
      setIsUpdatingPost(true);

      try {
        await setGoalLogVisibility(entry.goal.id, entry.dateKey, visibility);
        if (!isMountedRef.current) return;
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
        <ScrollView
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
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <View style={styles.headerText}>
              <HistoryHeaderMenu currentSection="journal" />
            </View>
          </View>

          <View style={styles.filters}>
            <PickerButton
              icon={sym("book", "menu_book")}
              label="Goal"
              value={selectedGoal?.name ?? "All goals"}
              onPress={() => {
                playSelectionHaptic();
                setPicker("goal");
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

          {isLoading ? (
            <View style={styles.centerState}>
              <FloatingLogoLoader />
            </View>
          ) : mergedEntries.length === 0 ? (
            <EmptyState
              goalName={selectedGoal?.name ?? null}
              dateLabel={
                selectedMonth !== null && selectedYear !== null
                  ? `${MONTHS[selectedMonth]} ${selectedYear}`
                  : null
              }
            />
          ) : (
            <View style={styles.entryList}>
              {mergedEntries.map((item) => {
                if (item.kind === "checkpoint") {
                  return (
                    <CheckpointJournalCard
                      key={`checkpoint_${item.entry.id}`}
                      entry={item.entry}
                      onOpenPhoto={(photo) => {
                        playSelectionHaptic();
                        setActivePhoto(photo);
                      }}
                    />
                  );
                }

                const entry = item.entry;
                const goalLogId = entry.social?.goalLogId ?? null;

                return (
                  <JournalCard
                    key={`${entry.goal.id}_${entry.dateKey}`}
                    entry={entry}
                    commentDraft={
                      goalLogId ? (replyDrafts[goalLogId] ?? "") : ""
                    }
                    isSubmittingReply={
                      goalLogId !== null &&
                      submittingReplyGoalLogId === goalLogId
                    }
                    photoLoadFailed={photoLoadFailed}
                    photos={
                      photosByEntry.get(`${entry.goal.id}_${entry.dateKey}`) ??
                      []
                    }
                    replyTarget={
                      goalLogId ? (replyTargets[goalLogId] ?? null) : null
                    }
                    onCancelReply={() => {
                      if (!goalLogId) return;
                      setReplyTargets((prev) => ({
                        ...prev,
                        [goalLogId]: null,
                      }));
                    }}
                    onCommentDraftChange={(value) => {
                      if (!goalLogId) return;
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
                    onReplyToComment={(comment) => {
                      if (!goalLogId) return;
                      playSelectionHaptic();
                      setReplyTargets((prev) => ({
                        ...prev,
                        [goalLogId]: comment,
                      }));
                    }}
                    onSubmitReply={() => {
                      if (!goalLogId) return;
                      void handleSubmitReply(goalLogId);
                    }}
                  />
                );
              })}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>

      <GoalPickerModal
        isOpen={picker === "goal"}
        sections={sections}
        selectedGoalId={selectedGoalId}
        onClose={() => setPicker(null)}
        onSelect={(goalId) => {
          playSelectionHaptic();
          setSelectedGoalId(goalId);
          setPicker(null);
        }}
      />
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

function PickerButton({
  icon,
  label,
  value,
  onPress,
}: {
  icon: SymbolName;
  label: string;
  value: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.pickerButton,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.tabBorder,
        },
        pressed && styles.pressed,
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
    </Pressable>
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
  return (
    <Pressable
      accessibilityLabel={`Select month and year. Currently ${
        hasDateFilter ? `${MONTHS[month]} ${year}` : "all dates"
      }`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
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
    </Pressable>
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
  onReplyToComment,
  onSubmitReply,
}: {
  commentDraft: string;
  isSubmittingReply: boolean;
  replyTarget: JournalSocialComment | null;
  social: JournalSocialSummary | null;
  onCancelReply: () => void;
  onCommentDraftChange: (value: string) => void;
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

  if (propCount === 0 && commentCount === 0) {
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
  dateLabel,
}: {
  goalName: string | null;
  dateLabel: string | null;
}) {
  return (
    <View style={styles.centerState}>
      <BrandedEmptyState
        title="No journal entries"
        description={`${goalName ? `${goalName} has` : "No goals have"} notes or photos from completed days${dateLabel ? ` in ${dateLabel}` : ""}.`}
      />
    </View>
  );
}

function GoalPickerModal({
  isOpen,
  sections,
  selectedGoalId,
  onClose,
  onSelect,
}: {
  isOpen: boolean;
  sections: GoalSection[];
  selectedGoalId: string | null;
  onClose: () => void;
  onSelect: (goalId: string | null) => void;
}) {
  const theme = useTheme();
  return (
    <PickerSheet isOpen={isOpen} title="Select goal" onClose={onClose}>
      <PickerRow
        icon={sym("book", "menu_book")}
        label="All goals"
        selected={selectedGoalId === null}
        onPress={() => onSelect(null)}
      />
      {sections.map((section) => (
        <View key={section.categoryId}>
          <Text style={[styles.sheetSection, { color: theme.textSecondary }]}>
            {section.categoryName}
          </Text>
          {section.goals.map((goal) => (
            <PickerRow
              key={goal.id}
              iconKey={goal.iconKey}
              label={goal.name}
              selected={selectedGoalId === goal.id}
              onPress={() => onSelect(goal.id)}
            />
          ))}
        </View>
      ))}
    </PickerSheet>
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
          <ScrollView showsVerticalScrollIndicator={false}>
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, selected }}
      disabled={disabled}
      onPress={onPress}
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
  const viewerViewportStyle = useMemo(
    () => ({ width: viewportWidth, height: viewportHeight }),
    [viewportHeight, viewportWidth],
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
              />
            </View>
          </ScrollView>
        ) : null}
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
  entryList: { gap: 12 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    overflow: "hidden",
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
