import { CommentsModal, FeedCard } from "@/components/feed-screen";
import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { GoalNoteEditorModal } from "@/components/goal-note-editor-modal";
import { MaxContentWidth } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  type FriendFeedComment,
  type FriendFeedEntry,
  addFeedComment,
  addReflectionComment,
  deleteFeedComment,
  deleteReflectionComment,
  deleteReflectionPost,
  fetchFriendsFeed,
  fetchMyPosts,
  reportContent,
  setReflectionBody,
  toggleFeedProp,
  toggleReflectionProp,
} from "@/lib/friends-client";
import { deleteGoalLog, setGoalLogNote } from "@/lib/goal-logs-client";
import { playSelectionHaptic, playSuccessHaptic } from "@/lib/haptics";
import { useRouter } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type SymbolName = SymbolViewProps["name"];

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

export function PostScreen({
  onBack,
  postId,
  source,
}: {
  onBack: () => void;
  postId: string;
  source?: "feed" | "self";
}) {
  const theme = useTheme();
  const router = useRouter();
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const [entry, setEntry] = useState<FriendFeedEntry | null>(null);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [commentDraft, setCommentDraft] = useState("");
  const [replyTarget, setReplyTarget] = useState<FriendFeedComment | null>(
    null,
  );
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isDeletingPost, setIsDeletingPost] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (refresh = false) => {
      const requestId = ++loadRequestIdRef.current;
      refresh ? setIsRefreshing(true) : setIsLoading(true);
      setError(null);

      try {
        const primary = source === "self" ? fetchMyPosts : fetchFriendsFeed;
        const fallback = source === "self" ? fetchFriendsFeed : fetchMyPosts;
        const primaryResponse = await primary();
        const primaryPosts = Array.isArray(primaryResponse)
          ? primaryResponse
          : primaryResponse.items;
        let nextEntry = primaryPosts.find((post) => post.id === postId) ?? null;

        if (!nextEntry) {
          const fallbackResponse = await fallback().catch(() => []);
          const fallbackPosts = Array.isArray(fallbackResponse)
            ? fallbackResponse
            : fallbackResponse.items;
          nextEntry = fallbackPosts.find((post) => post.id === postId) ?? null;
        }

        if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
          return;
        }

        setEntry(nextEntry);
        if (!nextEntry) setError("Post not found.");
      } catch (loadError) {
        if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
          return;
        }

        setEntry(null);
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load post.",
        );
      } finally {
        if (isMountedRef.current && requestId === loadRequestIdRef.current) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [postId, source],
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

  const handleToggleProp = useCallback(async () => {
    if (!entry || entry.kind === "goal_checkpoint") return;

    entry.props.hasPropped ? playSelectionHaptic() : playSuccessHaptic();
    const previous = entry;
    setEntry({
      ...entry,
      props: {
        count: entry.props.hasPropped
          ? Math.max(entry.props.count - 1, 0)
          : entry.props.count + 1,
        hasPropped: !entry.props.hasPropped,
      },
    });

    try {
      if (entry.kind === "reflection") {
        await toggleReflectionProp(entry.id);
      } else {
        await toggleFeedProp(entry.id);
      }
    } catch (propError) {
      if (!isMountedRef.current) return;
      setEntry(previous);
      Alert.alert(
        "Could not update props",
        propError instanceof Error ? propError.message : undefined,
      );
    }
  }, [entry]);

  const handleAddComment = useCallback(async () => {
    if (!entry || isSubmittingComment) return;
    const body = commentDraft.trim();
    if (!body) return;

    setIsSubmittingComment(true);
    try {
      if (entry.kind === "reflection") {
        await addReflectionComment(entry.id, body, replyTarget?.id ?? null);
      } else {
        await addFeedComment(entry.id, body, replyTarget?.id ?? null);
      }
      playSuccessHaptic();
      if (!isMountedRef.current) return;
      setCommentDraft("");
      setReplyTarget(null);
      await load(true);
    } catch (commentError) {
      if (!isMountedRef.current) return;
      Alert.alert(
        "Could not add comment",
        commentError instanceof Error ? commentError.message : undefined,
      );
    } finally {
      if (isMountedRef.current) setIsSubmittingComment(false);
    }
  }, [commentDraft, entry, isSubmittingComment, load, replyTarget]);

  const handleDeleteComment = useCallback(
    async (commentId: string) => {
      if (!entry) return;

      try {
        if (entry.kind === "reflection") {
          await deleteReflectionComment(entry.id, commentId);
        } else {
          await deleteFeedComment(entry.id, commentId);
        }
        if (!isMountedRef.current) return;
        playSelectionHaptic();
        setReplyTarget((current) =>
          current?.id === commentId ? null : current,
        );
        await load(true);
      } catch (commentError) {
        if (!isMountedRef.current) return;
        Alert.alert(
          "Could not delete comment",
          commentError instanceof Error ? commentError.message : undefined,
        );
      }
    },
    [entry, load],
  );

  const handleReportComment = useCallback(
    async (comment: FriendFeedComment) => {
      if (!entry) return;

      try {
        await reportContent({
          targetType: "feed_comment",
          targetId: comment.id,
          reason: "Reported from post comments.",
          context: {
            feedPostId: entry.id,
            authorId: comment.userId,
            parentCommentId: comment.parentCommentId,
          },
        });
        if (!isMountedRef.current) return;
        Alert.alert("Report sent", "Thanks. We'll review this comment.");
      } catch (reportError) {
        if (!isMountedRef.current) return;
        Alert.alert(
          "Could not send report",
          reportError instanceof Error ? reportError.message : undefined,
        );
      }
    },
    [entry],
  );

  const openProfile = useCallback(() => {
    if (!entry) return;
    if (source === "self") {
      router.push("/profile");
      return;
    }
    router.push({
      pathname: "/friend-profile",
      params: {
        friendId: entry.friend.id,
        initialName: entry.friend.name,
      },
    });
  }, [entry, router, source]);

  const canManagePost = source === "self" && entry !== null;

  const handleEditPost = useCallback(() => {
    if (!canManagePost) return;
    setIsEditingNote(true);
  }, [canManagePost]);

  const handleSavePostNote = useCallback(
    async (notes: string) => {
      if (!entry) return;

      if (entry.kind === "reflection") {
        await setReflectionBody(entry.id, notes);
      } else {
        await setGoalLogNote(entry.goal.id, entry.dateKey, notes);
      }

      if (!isMountedRef.current) return;
      setIsEditingNote(false);
      await load(true);
    },
    [entry, load],
  );

  const confirmDeletePost = useCallback(() => {
    if (!entry || !canManagePost || isDeletingPost) return;

    Alert.alert(
      entry.kind === "reflection" ? "Delete reflection?" : "Delete log?",
      entry.kind === "reflection"
        ? "This permanently deletes this reflection, its photos, comments, and props."
        : "This permanently deletes the report, note, photos, and feed activity for this habit.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setIsDeletingPost(true);
            try {
              if (entry.kind === "reflection") {
                await deleteReflectionPost(entry.id);
              } else {
                await deleteGoalLog(entry.goal.id, entry.dateKey);
              }
              if (!isMountedRef.current) return;
              playSelectionHaptic();
              onBack();
            } catch (deleteError) {
              if (!isMountedRef.current) return;
              Alert.alert(
                entry.kind === "reflection"
                  ? "Could not delete reflection"
                  : "Could not delete log",
                deleteError instanceof Error ? deleteError.message : undefined,
              );
            } finally {
              if (isMountedRef.current) setIsDeletingPost(false);
            }
          },
        },
      ],
    );
  }, [canManagePost, entry, isDeletingPost, onBack]);

  const openPostActions = useCallback(() => {
    if (!entry) return;

    if (!canManagePost) {
      Alert.alert(entry.friend.name, "Choose an action.", [
        {
          text: "Report Post",
          onPress: () =>
            void reportContent({
              targetType: "feed_post",
              targetId: entry.id,
              reason: "Reported from post detail.",
              context: { feedPostId: entry.id },
            }),
        },
        { text: "Cancel", style: "cancel" },
      ]);
      return;
    }

    Alert.alert("Post options", "Choose an action.", [
      {
        text: entry.notes.trim() ? "Edit note" : "Add note",
        onPress: handleEditPost,
      },
      {
        text: entry.kind === "reflection" ? "Delete reflection" : "Delete log",
        style: "destructive",
        onPress: confirmDeletePost,
      },
      { text: "Cancel", style: "cancel" },
    ]);
  }, [canManagePost, confirmDeletePost, entry, handleEditPost]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <View style={[styles.header, { borderBottomColor: theme.tabBorder }]}>
          <Pressable
            accessibilityLabel="Go back"
            hitSlop={12}
            onPress={onBack}
            style={({ pressed }) => [
              styles.backButton,
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={sym("chevron.left", "arrow_back")}
              size={22}
              weight="semibold"
              tintColor={theme.text}
            />
          </Pressable>
          <Text
            numberOfLines={1}
            style={[styles.headerTitle, { color: theme.text }]}
          >
            Post
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          canCancelContentTouches
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              tintColor={theme.primary}
              onRefresh={() => void load(true)}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          {error ? (
            <View style={styles.errorBanner}>
              <Text style={styles.errorText}>{error}</Text>
              <Pressable onPress={() => void load()}>
                <Text style={[styles.retryText, { color: theme.primary }]}>
                  Retry
                </Text>
              </Pressable>
            </View>
          ) : null}

          {isLoading ? (
            <View style={styles.centerState}>
              <FloatingLogoLoader />
            </View>
          ) : entry ? (
            <FeedCard
              entry={entry}
              onToggleProp={() => void handleToggleProp()}
              onPhotoPress={() => undefined}
              onOpenComments={() => {
                playSelectionHaptic();
                setIsCommentsOpen(true);
              }}
              onOpenProfile={openProfile}
              onOpenSafetyActions={openPostActions}
            />
          ) : null}
        </ScrollView>
      </SafeAreaView>
      <CommentsModal
        commentDraft={commentDraft}
        entry={isCommentsOpen ? entry : null}
        isSubmittingComment={isSubmittingComment}
        replyTarget={replyTarget}
        onAddComment={() => void handleAddComment()}
        onCancelReply={() => setReplyTarget(null)}
        onClose={() => setIsCommentsOpen(false)}
        onCommentDraftChange={setCommentDraft}
        onDeleteComment={(commentId) => void handleDeleteComment(commentId)}
        onReportComment={(comment) => void handleReportComment(comment)}
        onReplyToComment={(comment) => {
          playSelectionHaptic();
          setReplyTarget(comment);
        }}
      />
      {isEditingNote && entry ? (
        <GoalNoteEditorModal
          dateKey={entry.dateKey}
          goalName={entry.goal.name}
          initialValue={entry.notes.trim() ? entry.notes : null}
          onClose={() => setIsEditingNote(false)}
          onSave={handleSavePostNote}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
  },
  backButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "800",
  },
  headerSpacer: { width: 34 },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 36,
  },
  centerState: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 72,
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
  retryText: { fontSize: 12, fontWeight: "800" },
  pressed: { opacity: 0.72 },
});
