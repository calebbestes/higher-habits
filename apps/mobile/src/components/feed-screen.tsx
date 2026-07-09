import { Image } from "expo-image";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CollabHeaderMenu } from "@/components/collab-header-menu";
import { FriendProfileModal } from "@/components/friends-screen";
import { GoalIcon } from "@/components/goal-icon";
import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import {
  type FriendFeedComment,
  type FriendFeedEntry,
  type FriendFeedPhoto,
  type FriendRow,
  addFeedComment,
  archiveFriend,
  deleteFeedComment,
  fetchFriendsFeed,
  fetchFriends,
  reportContent,
  toggleFeedProp,
} from "@/lib/friends-client";

type SymbolName = SymbolViewProps["name"];

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n• ")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function formatFeedDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y as number, (m as number) - 1, d as number);
  if (Number.isNaN(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatCommentTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function countComments(comments: FriendFeedComment[]): number {
  return comments.reduce(
    (total, comment) => total + 1 + countComments(comment.replies),
    0,
  );
}

function removeCommentById(
  comments: FriendFeedComment[],
  commentId: string,
): FriendFeedComment[] {
  return comments
    .filter((comment) => comment.id !== commentId)
    .map((comment) => ({
      ...comment,
      replies: removeCommentById(comment.replies, commentId),
    }));
}

export function FeedScreen() {
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();
  const [entries, setEntries] = useState<FriendFeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [replyTargets, setReplyTargets] = useState<
    Record<string, FriendFeedComment | null>
  >({});
  const [submittingComment, setSubmittingComment] = useState<string | null>(
    null,
  );
  const [activePhoto, setActivePhoto] = useState<FriendFeedPhoto | null>(null);
  const [activeCommentsEntryId, setActiveCommentsEntryId] = useState<
    string | null
  >(null);
  const [profileFriend, setProfileFriend] = useState<FriendRow | null>(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setIsRefreshing(true) : setIsLoading(true);
    setError(null);
    try {
      const data = await fetchFriendsFeed();
      setEntries(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load feed.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleToggleProp = useCallback(async (entryId: string) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id !== entryId
          ? e
          : {
              ...e,
              props: {
                count: e.props.hasPropped
                  ? e.props.count - 1
                  : e.props.count + 1,
                hasPropped: !e.props.hasPropped,
              },
            },
      ),
    );
    try {
      await toggleFeedProp(entryId);
    } catch {
      setEntries((prev) =>
        prev.map((e) =>
          e.id !== entryId
            ? e
            : {
                ...e,
                props: {
                  count: e.props.hasPropped
                    ? e.props.count - 1
                    : e.props.count + 1,
                  hasPropped: !e.props.hasPropped,
                },
              },
        ),
      );
    }
  }, []);

  const handleAddComment = useCallback(
    async (entryId: string) => {
      const body = (commentDrafts[entryId] ?? "").trim();
      if (!body || submittingComment) return;

      const replyTarget = replyTargets[entryId] ?? null;
      setSubmittingComment(entryId);
      try {
        await addFeedComment(entryId, body, replyTarget?.id ?? null);
        setCommentDrafts((prev) => ({ ...prev, [entryId]: "" }));
        setReplyTargets((prev) => ({ ...prev, [entryId]: null }));
        const data = await fetchFriendsFeed();
        setEntries(data);
      } catch (err) {
        Alert.alert(
          "Could not add comment",
          err instanceof Error ? err.message : undefined,
        );
      } finally {
        setSubmittingComment(null);
      }
    },
    [commentDrafts, replyTargets, submittingComment],
  );

  const handleDeleteComment = useCallback(
    async (entryId: string, commentId: string) => {
      try {
        await deleteFeedComment(entryId, commentId);
        setEntries((prev) =>
          prev.map((e) =>
            e.id !== entryId
              ? e
              : {
                  ...e,
                  comments: removeCommentById(e.comments, commentId),
                },
          ),
        );
        setReplyTargets((prev) =>
          prev[entryId]?.id === commentId ? { ...prev, [entryId]: null } : prev,
        );
      } catch (err) {
        Alert.alert(
          "Could not delete comment",
          err instanceof Error ? err.message : undefined,
        );
      }
    },
    [],
  );

  const reportPost = useCallback(async (entry: FriendFeedEntry) => {
    try {
      await reportContent({
        targetType: "feed_post",
        targetId: entry.id,
        reason: "Reported from feed post actions.",
        context: {
          friendId: entry.friend.id,
          goalId: entry.goal.id,
          dateKey: entry.dateKey,
        },
      });
      Alert.alert("Report sent", "Thanks. We'll review this post.");
    } catch (err) {
      Alert.alert(
        "Could not send report",
        err instanceof Error ? err.message : undefined,
      );
    }
  }, []);

  const reportComment = useCallback(
    async (entry: FriendFeedEntry, comment: FriendFeedComment) => {
      try {
        await reportContent({
          targetType: "feed_comment",
          targetId: comment.id,
          reason: "Reported from feed comment actions.",
          context: {
            feedPostId: entry.id,
            authorId: comment.userId,
            parentCommentId: comment.parentCommentId,
          },
        });
        Alert.alert("Report sent", "Thanks. We'll review this comment.");
      } catch (err) {
        Alert.alert(
          "Could not send report",
          err instanceof Error ? err.message : undefined,
        );
      }
    },
    [],
  );

  const blockFriend = useCallback(
    async (entry: FriendFeedEntry) => {
      try {
        await reportContent({
          targetType: "user",
          targetId: entry.friend.id,
          reason: "Blocked from feed post actions.",
          context: { feedPostId: entry.id },
        }).catch(() => undefined);

        const friends = await fetchFriends();
        const friendship = friends.find(
          (friend) =>
            friend.friendId === entry.friend.id && friend.status === "accepted",
        );

        if (!friendship) {
          throw new Error("Friendship not found.");
        }

        await archiveFriend(friendship.id);
        setEntries((prev) =>
          prev.filter((item) => item.friend.id !== entry.friend.id),
        );
        setActiveCommentsEntryId((current) =>
          current === entry.id ? null : current,
        );
        Alert.alert("Blocked", `${entry.friend.name} was removed.`);
      } catch (err) {
        Alert.alert(
          "Could not block user",
          err instanceof Error ? err.message : undefined,
        );
      }
    },
    [],
  );

  const openPostSafetyActions = useCallback(
    (entry: FriendFeedEntry) => {
      Alert.alert(entry.friend.name, "Choose a safety action.", [
        { text: "Report Post", onPress: () => void reportPost(entry) },
        {
          text: "Block User",
          style: "destructive",
          onPress: () => void blockFriend(entry),
        },
        { text: "Cancel", style: "cancel" },
      ]);
    },
    [blockFriend, reportPost],
  );

  const openFriendProfile = useCallback(async (entry: FriendFeedEntry) => {
    try {
      const friends = await fetchFriends();
      const friendship = friends.find(
        (friend) =>
          friend.friendId === entry.friend.id && friend.status === "accepted",
      );

      if (!friendship) {
        throw new Error("Friendship not found.");
      }

      setProfileFriend(friendship);
    } catch (err) {
      Alert.alert(
        "Could not open profile",
        err instanceof Error ? err.message : undefined,
      );
    }
  }, []);

  const activeCommentsEntry = activeCommentsEntryId
    ? (entries.find((entry) => entry.id === activeCommentsEntryId) ?? null)
    : null;

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: tabBarHeight + 16 },
            ]}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                tintColor={theme.primary}
                onRefresh={() => void load(true)}
              />
            }
            showsVerticalScrollIndicator={false}
          >
            {/* Page header */}
            <View style={styles.pageHeader}>
              <View style={styles.pageHeaderText}>
                <CollabHeaderMenu currentSection="feed" />
              </View>
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
                <ActivityIndicator color={theme.primary} size="large" />
              </View>
            ) : entries.length === 0 && !error ? (
              <View style={styles.centerState}>
                <View
                  style={[
                    styles.emptyIcon,
                    { backgroundColor: theme.backgroundElement },
                  ]}
                >
                  <SymbolView
                    name={sym("rectangle.stack", "feed")}
                    size={28}
                    tintColor={theme.primary}
                  />
                </View>
                <Text style={[styles.emptyTitle, { color: theme.text }]}>
                  No activity yet
                </Text>
                <Text
                  style={[
                    styles.emptyDescription,
                    { color: theme.textSecondary },
                  ]}
                >
                  Friends&apos; journal entries with photos will appear here.
                </Text>
              </View>
            ) : (
              <View style={styles.feedList}>
                {entries.map((entry) => (
                  <FeedCard
                    key={entry.id}
                    entry={entry}
                    onToggleProp={() => void handleToggleProp(entry.id)}
                    onPhotoPress={setActivePhoto}
                    onOpenComments={() => setActiveCommentsEntryId(entry.id)}
                    onOpenProfile={() => void openFriendProfile(entry)}
                    onOpenSafetyActions={() => openPostSafetyActions(entry)}
                  />
                ))}
              </View>
            )}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal
        visible={activePhoto !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setActivePhoto(null)}
      >
        <Pressable
          style={styles.lightboxOverlay}
          onPress={() => setActivePhoto(null)}
        >
          {activePhoto ? (
            <Image
              source={{ uri: activePhoto.url }}
              style={styles.lightboxImage}
              contentFit="contain"
            />
          ) : null}
        </Pressable>
      </Modal>

      <CommentsModal
        entry={activeCommentsEntry}
        commentDraft={
          activeCommentsEntry
            ? (commentDrafts[activeCommentsEntry.id] ?? "")
            : ""
        }
        isSubmittingComment={
          activeCommentsEntry
            ? submittingComment === activeCommentsEntry.id
            : false
        }
        replyTarget={
          activeCommentsEntry
            ? (replyTargets[activeCommentsEntry.id] ?? null)
            : null
        }
        onClose={() => setActiveCommentsEntryId(null)}
        onCommentDraftChange={(val) => {
          if (!activeCommentsEntry) return;
          setCommentDrafts((prev) => ({
            ...prev,
            [activeCommentsEntry.id]: val,
          }));
        }}
        onAddComment={() => {
          if (!activeCommentsEntry) return;
          void handleAddComment(activeCommentsEntry.id);
        }}
        onCancelReply={() => {
          if (!activeCommentsEntry) return;
          setReplyTargets((prev) => ({
            ...prev,
            [activeCommentsEntry.id]: null,
          }));
        }}
        onDeleteComment={(commentId) => {
          if (!activeCommentsEntry) return;
          void handleDeleteComment(activeCommentsEntry.id, commentId);
        }}
        onReportComment={(comment) => {
          if (!activeCommentsEntry) return;
          void reportComment(activeCommentsEntry, comment);
        }}
        onReplyToComment={(comment) => {
          if (!activeCommentsEntry) return;
          setReplyTargets((prev) => ({
            ...prev,
            [activeCommentsEntry.id]: comment,
          }));
        }}
      />
      <FriendProfileModal
        friend={profileFriend}
        onClose={() => setProfileFriend(null)}
      />
    </View>
  );
}

function FeedCard({
  entry,
  onToggleProp,
  onPhotoPress,
  onOpenComments,
  onOpenProfile,
  onOpenSafetyActions,
}: {
  entry: FriendFeedEntry;
  onToggleProp: () => void;
  onPhotoPress: (photo: FriendFeedPhoto) => void;
  onOpenComments: () => void;
  onOpenProfile: () => void;
  onOpenSafetyActions: () => void;
}) {
  const theme = useTheme();
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [notesOverflows, setNotesOverflows] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [carouselWidth, setCarouselWidth] = useState(0);
  const strippedNotes = stripHtml(entry.notes);
  const commentCount = countComments(entry.comments);

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
      ]}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <Pressable
          accessibilityLabel={`Open ${entry.friend.name}'s profile`}
          accessibilityRole="button"
          hitSlop={8}
          onPress={onOpenProfile}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <FriendAvatar image={entry.friend.image} name={entry.friend.name} />
        </Pressable>
        <View style={styles.headerMeta}>
          <Text
            numberOfLines={1}
            style={[styles.friendName, { color: theme.text }]}
          >
            {entry.friend.name}
          </Text>
          <View style={styles.headerGoalRow}>
            <GoalIcon
              iconKey={entry.goal.icon}
              size={14}
              color={theme.textSecondary}
            />
            <Text
              numberOfLines={1}
              style={[styles.goalText, { color: theme.textSecondary }]}
            >
              {entry.goal.name}
            </Text>
          </View>
        </View>
        <Text
          numberOfLines={1}
          style={[styles.dateText, { color: theme.textSecondary }]}
        >
          {formatFeedDate(entry.dateKey)}
        </Text>
        <Pressable
          accessibilityLabel="Post safety actions"
          hitSlop={8}
          onPress={onOpenSafetyActions}
          style={({ pressed }) => [
            styles.safetyButton,
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

      {/* Photos */}
      {entry.photos.length > 0 ? (
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
              showsHorizontalScrollIndicator={false}
              scrollEventThrottle={16}
              onMomentumScrollEnd={(event) => {
                if (!carouselWidth) return;
                setCarouselIndex(
                  Math.round(event.nativeEvent.contentOffset.x / carouselWidth),
                );
              }}
            >
              {entry.photos.map((photo) => (
                <Pressable
                  key={photo.id}
                  onPress={() => onPhotoPress(photo)}
                  style={({ pressed }) => [
                    styles.carouselSlide,
                    { width: carouselWidth || 1 },
                    pressed && styles.pressed,
                  ]}
                >
                  <Image
                    source={{ uri: photo.url }}
                    style={styles.photoImage}
                    contentFit="cover"
                  />
                </Pressable>
              ))}
            </ScrollView>
            {entry.photos.length > 1 ? (
              <View
                style={[
                  styles.carouselCounter,
                  { backgroundColor: "rgba(0,0,0,0.5)" },
                ]}
              >
                <Text style={styles.carouselCounterText}>
                  {carouselIndex + 1}/{entry.photos.length}
                </Text>
              </View>
            ) : null}
          </View>
          {entry.photos.length > 1 ? (
            <View style={styles.carouselDots}>
              {entry.photos.map((photo, index) => (
                <View
                  key={photo.id}
                  style={[
                    styles.carouselDot,
                    {
                      backgroundColor:
                        index === carouselIndex
                          ? theme.primary
                          : theme.backgroundSelected,
                    },
                  ]}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}

      {/* Notes */}
      {strippedNotes ? (
        <View>
          <Text
            style={[
              styles.notes,
              { color: theme.text, paddingBottom: notesOverflows ? 4 : 12 },
            ]}
            numberOfLines={notesExpanded ? undefined : 5}
            onTextLayout={(e) => {
              if (!notesOverflows && e.nativeEvent.lines.length >= 5) {
                setNotesOverflows(true);
              }
            }}
          >
            {strippedNotes}
          </Text>
          {notesOverflows ? (
            <Pressable
              onPress={() => setNotesExpanded((x) => !x)}
              style={styles.showMoreButton}
            >
              <Text style={[styles.showMoreText, { color: theme.primary }]}>
                {notesExpanded ? "Show less" : "Show more"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      {/* Actions row — props/comments are habit-only for now */}
      {entry.kind === "habit" ? (
        <View style={[styles.actionsRow, { borderTopColor: theme.tabBorder }]}>
          <Pressable
            onPress={onToggleProp}
            style={({ pressed }) => [
              styles.propButton,
              entry.props.hasPropped && {
                backgroundColor: `${theme.primary}18`,
              },
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={sym("hands.clap.fill", "volunteer_activism")}
              size={18}
              weight="semibold"
              tintColor={entry.props.hasPropped ? theme.primary : theme.tabIcon}
            />
            <Text
              style={[
                styles.propText,
                {
                  color: entry.props.hasPropped ? theme.primary : theme.tabIcon,
                },
              ]}
            >
              {entry.props.count > 0
                ? `${entry.props.count} ${entry.props.count === 1 ? "Prop" : "Props"}`
                : "Prop"}
            </Text>
          </Pressable>

          <Pressable
            onPress={onOpenComments}
            style={({ pressed }) => [
              styles.commentCountWrap,
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={sym("bubble.left", "chat_bubble_outline")}
              size={16}
              weight="semibold"
              tintColor={theme.textSecondary}
            />
            <Text
              style={[styles.commentCountText, { color: theme.textSecondary }]}
            >
              {commentCount} {commentCount === 1 ? "comment" : "comments"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

function CommentsModal({
  commentDraft,
  entry,
  isSubmittingComment,
  onAddComment,
  onCancelReply,
  onClose,
  onCommentDraftChange,
  onDeleteComment,
  onReportComment,
  onReplyToComment,
  replyTarget,
}: {
  commentDraft: string;
  entry: FriendFeedEntry | null;
  isSubmittingComment: boolean;
  onAddComment: () => void;
  onCancelReply: () => void;
  onClose: () => void;
  onCommentDraftChange: (value: string) => void;
  onDeleteComment: (commentId: string) => void;
  onReportComment: (comment: FriendFeedComment) => void;
  onReplyToComment: (comment: FriendFeedComment) => void;
  replyTarget: FriendFeedComment | null;
}) {
  const theme = useTheme();

  return (
    <Modal
      visible={entry !== null}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.commentsModalOverlay}
      >
        <Pressable style={styles.commentsModalBackdrop} onPress={onClose} />
        <SafeAreaView
          edges={["bottom"]}
          style={[
            styles.commentsSheet,
            {
              backgroundColor: theme.background,
              borderColor: theme.tabBorder,
            },
          ]}
        >
          <View
            style={[
              styles.commentsModalHeader,
              { borderBottomColor: theme.tabBorder },
            ]}
          >
            <View style={styles.commentsModalTitleBlock}>
              <Text style={[styles.commentsModalTitle, { color: theme.text }]}>
                Comments
              </Text>
              {entry ? (
                <Text
                  numberOfLines={1}
                  style={[
                    styles.commentsModalSubtitle,
                    { color: theme.textSecondary },
                  ]}
                >
                  {entry.friend.name} · {entry.goal.name}
                </Text>
              ) : null}
            </View>
            <Pressable
              accessibilityLabel="Close comments"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [
                styles.commentsModalClose,
                { backgroundColor: theme.backgroundElement },
                pressed && styles.pressed,
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
            contentContainerStyle={styles.modalCommentsContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={styles.modalCommentsScroll}
          >
            {entry && entry.comments.length > 0 ? (
              entry.comments.map((comment) => (
                <CommentRow
                  key={comment.id}
                  comment={comment}
                  onDeleteComment={onDeleteComment}
                  onReportComment={onReportComment}
                  onReply={onReplyToComment}
                />
              ))
            ) : (
              <View style={styles.emptyComments}>
                <Text
                  style={[styles.emptyCommentsTitle, { color: theme.text }]}
                >
                  No comments yet
                </Text>
                <Text
                  style={[
                    styles.emptyCommentsText,
                    { color: theme.textSecondary },
                  ]}
                >
                  Start the conversation.
                </Text>
              </View>
            )}
          </ScrollView>

          <View
            style={[
              styles.commentComposer,
              { borderTopColor: theme.tabBorder },
            ]}
          >
            {replyTarget ? (
              <View style={styles.replyingToRow}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.replyingToText,
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
            ) : null}
            <View style={styles.commentInputRow}>
              <TextInput
                style={[
                  styles.commentInput,
                  {
                    backgroundColor: theme.backgroundElement,
                    color: theme.text,
                  },
                ]}
                placeholder={
                  replyTarget
                    ? `Reply to ${replyTarget.authorName}...`
                    : "Write a comment..."
                }
                placeholderTextColor={theme.textSecondary}
                value={commentDraft}
                onChangeText={onCommentDraftChange}
                returnKeyType="send"
                onSubmitEditing={onAddComment}
                maxLength={2000}
                multiline={false}
              />
              <Pressable
                onPress={onAddComment}
                disabled={!commentDraft.trim() || isSubmittingComment}
                style={({ pressed }) => [
                  styles.sendButton,
                  { backgroundColor: theme.primary },
                  (!commentDraft.trim() || isSubmittingComment) &&
                    styles.sendButtonDisabled,
                  pressed && styles.pressed,
                ]}
              >
                {isSubmittingComment ? (
                  <ActivityIndicator
                    size="small"
                    color={theme.primaryForeground}
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
        </SafeAreaView>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function FriendAvatar({
  image,
  name,
  size = 40,
}: {
  image: string | null;
  name: string;
  size?: number;
}) {
  const theme = useTheme();
  const radius = size / 2;

  if (image) {
    return (
      <Image
        source={{ uri: image }}
        style={[
          styles.avatar,
          { width: size, height: size, borderRadius: radius },
        ]}
        contentFit="cover"
      />
    );
  }

  return (
    <View
      style={[
        styles.avatarFallback,
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: `${theme.primary}22`,
        },
      ]}
    >
      <Text style={[styles.avatarInitial, { color: theme.primary }]}>
        {name.slice(0, 1).toUpperCase()}
      </Text>
    </View>
  );
}

function CommentRow({
  comment,
  depth = 0,
  onDeleteComment,
  onReportComment,
  onReply,
}: {
  comment: FriendFeedComment;
  depth?: number;
  onDeleteComment: (commentId: string) => void;
  onReportComment: (comment: FriendFeedComment) => void;
  onReply: (comment: FriendFeedComment) => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[styles.commentThread, depth > 0 && styles.commentReplyThread]}
    >
      <View
        style={[
          styles.commentRow,
          depth > 0 && styles.commentReplyRow,
          { backgroundColor: theme.backgroundElement },
        ]}
      >
        <FriendAvatar
          image={comment.authorImage}
          name={comment.authorName}
          size={28}
        />
        <View style={styles.commentBody}>
          <View style={styles.commentMeta}>
            <Text
              numberOfLines={1}
              style={[styles.commentAuthor, { color: theme.text }]}
            >
              {comment.authorName}
            </Text>
            <Text style={[styles.commentTime, { color: theme.textSecondary }]}>
              {formatCommentTime(comment.createdAt)}
            </Text>
          </View>
          <Text style={[styles.commentText, { color: theme.text }]}>
            {comment.body}
          </Text>
          <View style={styles.commentActions}>
            <Pressable
              hitSlop={8}
              onPress={() => onReply(comment)}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text
                style={[styles.commentActionText, { color: theme.primary }]}
              >
                Reply
              </Text>
            </Pressable>
            <Pressable
              hitSlop={8}
              onPress={() => onReportComment(comment)}
              style={({ pressed }) => pressed && styles.pressed}
            >
              <Text style={[styles.commentActionText, { color: "#9D474D" }]}>
                Report
              </Text>
            </Pressable>
          </View>
        </View>
        {comment.canDelete ? (
          <Pressable
            onPress={() => onDeleteComment(comment.id)}
            hitSlop={8}
            style={({ pressed }) => [
              styles.deleteCommentBtn,
              pressed && styles.pressed,
            ]}
          >
            <SymbolView
              name={sym("trash", "delete_outline")}
              size={14}
              weight="semibold"
              tintColor="#9D474D"
            />
          </Pressable>
        ) : null}
      </View>
      {comment.replies.length > 0 ? (
        <View style={styles.commentReplies}>
          {comment.replies.map((reply) => (
            <CommentRow
              key={reply.id}
              comment={reply}
              depth={depth + 1}
              onDeleteComment={onDeleteComment}
              onReportComment={onReportComment}
              onReply={onReply}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  keyboardView: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 18,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  pageHeaderIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  pageHeaderText: { flex: 1, gap: 1 },
  pageTitle: {
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  pageSubtitle: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
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
    gap: 10,
    paddingVertical: 64,
  },
  emptyIcon: {
    width: 62,
    height: 62,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    marginBottom: 3,
  },
  emptyTitle: { fontSize: 18, lineHeight: 23, fontWeight: "800" },
  emptyDescription: {
    maxWidth: 280,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "500",
  },
  feedList: { gap: 14 },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    overflow: "hidden",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  avatar: { flexShrink: 0 },
  avatarFallback: {
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarInitial: {
    fontSize: 16,
    fontWeight: "700",
  },
  headerMeta: {
    flex: 1,
    minWidth: 0,
    gap: 1,
  },
  friendName: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  },
  dateText: {
    maxWidth: 138,
    flexShrink: 0,
    textAlign: "right",
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  safetyButton: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  headerGoalRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  goalText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
    flex: 1,
    minWidth: 0,
  },
  carouselWrap: {
    marginBottom: 12,
  },
  carouselFrame: {
    position: "relative",
    aspectRatio: 1,
    overflow: "hidden",
    width: "100%",
  },
  carouselSlide: {
    aspectRatio: 1,
  },
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
  photoImage: {
    width: "100%",
    height: "100%",
  },
  notes: {
    fontSize: 14,
    lineHeight: 21,
    fontWeight: "400",
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  showMoreButton: {
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  showMoreText: {
    fontSize: 13,
    fontWeight: "500",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  propButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
  },
  propText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
  },
  commentCountWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  commentCountText: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
  },
  commentThread: {
    gap: 6,
  },
  commentReplyThread: {
    marginLeft: 22,
  },
  commentReplies: {
    gap: 6,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  commentReplyRow: {
    borderTopLeftRadius: 4,
  },
  commentBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  commentMeta: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 6,
    flexWrap: "wrap",
  },
  commentAuthor: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  commentTime: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "400",
  },
  commentText: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "400",
  },
  commentActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  commentActionText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  deleteCommentBtn: {
    padding: 4,
    flexShrink: 0,
  },
  commentComposer: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: 8,
  },
  replyingToRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 6,
  },
  replyingToText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "700",
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  commentInput: {
    flex: 1,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    lineHeight: 19,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  sendButtonDisabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
  commentsModalOverlay: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.42)",
  },
  commentsModalBackdrop: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  commentsSheet: {
    position: "relative",
    zIndex: 1,
    maxHeight: "84%",
    minHeight: "54%",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    borderBottomWidth: 0,
    overflow: "hidden",
  },
  commentsModalHeader: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  commentsModalTitleBlock: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  commentsModalTitle: {
    fontSize: 20,
    lineHeight: 25,
    fontWeight: "900",
  },
  commentsModalSubtitle: {
    fontSize: 13,
    lineHeight: 17,
    fontWeight: "600",
  },
  commentsModalClose: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  modalCommentsScroll: {
    flex: 1,
  },
  modalCommentsContent: {
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  emptyComments: {
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingVertical: 44,
  },
  emptyCommentsTitle: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
  },
  emptyCommentsText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  lightboxOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.9)",
    alignItems: "center",
    justifyContent: "center",
  },
  lightboxImage: {
    width: "100%",
    height: "85%",
  },
});
