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
import { MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import {
  type FriendFeedComment,
  type FriendFeedEntry,
  type FriendFeedPhoto,
  addFeedComment,
  deleteFeedComment,
  fetchFriendsFeed,
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
  if (isNaN(date.getTime())) return dateKey;
  return new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function formatCommentTime(timestamp: string): string {
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function iconSvgUrl(iconKey: string, color: string): string | null {
  const colon = iconKey.indexOf(":");
  if (colon === -1) return null;
  const prefix = iconKey.slice(0, colon);
  const name = iconKey.slice(colon + 1);
  return `https://api.iconify.design/${prefix}/${name}.svg?color=${encodeURIComponent(color)}`;
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
  const [submittingComment, setSubmittingComment] = useState<string | null>(
    null,
  );
  const [activePhoto, setActivePhoto] = useState<FriendFeedPhoto | null>(null);

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

      setSubmittingComment(entryId);
      try {
        await addFeedComment(entryId, body);
        setCommentDrafts((prev) => ({ ...prev, [entryId]: "" }));
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
    [commentDrafts, submittingComment],
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
                  comments: e.comments.filter((c) => c.id !== commentId),
                },
          ),
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

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={styles.keyboardView}
        >
          <ScrollView
            contentContainerStyle={[styles.content, { paddingBottom: tabBarHeight + 16 }]}
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
                    commentDraft={commentDrafts[entry.id] ?? ""}
                    isSubmittingComment={submittingComment === entry.id}
                    onToggleProp={() => void handleToggleProp(entry.id)}
                    onPhotoPress={setActivePhoto}
                    onCommentDraftChange={(val) =>
                      setCommentDrafts((prev) => ({ ...prev, [entry.id]: val }))
                    }
                    onAddComment={() => void handleAddComment(entry.id)}
                    onDeleteComment={(commentId) =>
                      void handleDeleteComment(entry.id, commentId)
                    }
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
    </View>
  );
}

function FeedCard({
  entry,
  commentDraft,
  isSubmittingComment,
  onToggleProp,
  onPhotoPress,
  onCommentDraftChange,
  onAddComment,
  onDeleteComment,
}: {
  entry: FriendFeedEntry;
  commentDraft: string;
  isSubmittingComment: boolean;
  onToggleProp: () => void;
  onPhotoPress: (photo: FriendFeedPhoto) => void;
  onCommentDraftChange: (val: string) => void;
  onAddComment: () => void;
  onDeleteComment: (commentId: string) => void;
}) {
  const theme = useTheme();
  const [notesExpanded, setNotesExpanded] = useState(false);
  const [notesOverflows, setNotesOverflows] = useState(false);
  const strippedNotes = stripHtml(entry.notes);
  const isSinglePhoto = entry.photos.length === 1;

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
      ]}
    >
      {/* Header */}
      <View style={styles.cardHeader}>
        <FriendAvatar image={entry.friend.image} name={entry.friend.name} />
        <View style={styles.headerMeta}>
          <Text
            numberOfLines={1}
            style={[styles.friendName, { color: theme.text }]}
          >
            {entry.friend.name}
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.dateText, { color: theme.textSecondary }]}
          >
            {formatFeedDate(entry.dateKey)}
          </Text>
        </View>
        <GoalPill goal={entry.goal} />
      </View>

      {/* Photos */}
      {entry.photos.length > 0 ? (
        <View
          style={[
            styles.photoGrid,
            isSinglePhoto ? styles.photoGridSingle : styles.photoGridMulti,
          ]}
        >
          {entry.photos.map((photo) => (
            <Pressable
              key={photo.id}
              onPress={() => onPhotoPress(photo)}
              style={({ pressed }) => [
                styles.photoItem,
                isSinglePhoto ? styles.photoItemSingle : styles.photoItemMulti,
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

      {/* Actions row */}
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

        <View style={styles.commentCountWrap}>
          <SymbolView
            name={sym("bubble.left", "chat_bubble_outline")}
            size={16}
            weight="semibold"
            tintColor={theme.textSecondary}
          />
          <Text
            style={[styles.commentCountText, { color: theme.textSecondary }]}
          >
            {entry.comments.length}{" "}
            {entry.comments.length === 1 ? "comment" : "comments"}
          </Text>
        </View>
      </View>

      {/* Comments */}
      {entry.comments.length > 0 ? (
        <View
          style={[styles.commentsList, { borderTopColor: theme.tabBorder }]}
        >
          {entry.comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              onDelete={() => onDeleteComment(comment.id)}
            />
          ))}
        </View>
      ) : null}

      {/* Comment input */}
      <View
        style={[styles.commentInputRow, { borderTopColor: theme.tabBorder }]}
      >
        <TextInput
          style={[
            styles.commentInput,
            {
              backgroundColor: theme.backgroundElement,
              color: theme.text,
            },
          ]}
          placeholder="Write a comment..."
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
            <ActivityIndicator size="small" color={theme.primaryForeground} />
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

function GoalPill({ goal }: { goal: FriendFeedEntry["goal"] }) {
  const theme = useTheme();
  const svgUrl = iconSvgUrl(goal.icon, theme.textSecondary);

  return (
    <View
      style={[styles.goalPill, { backgroundColor: theme.backgroundElement }]}
    >
      {svgUrl ? (
        <Image
          source={{ uri: svgUrl }}
          style={styles.goalPillIcon}
          contentFit="contain"
        />
      ) : null}
      <Text
        numberOfLines={1}
        style={[styles.goalPillText, { color: theme.textSecondary }]}
      >
        {goal.name}
      </Text>
    </View>
  );
}

function CommentRow({
  comment,
  onDelete,
}: {
  comment: FriendFeedComment;
  onDelete: () => void;
}) {
  const theme = useTheme();

  return (
    <View
      style={[styles.commentRow, { backgroundColor: theme.backgroundElement }]}
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
      </View>
      {comment.canDelete ? (
        <Pressable
          onPress={onDelete}
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
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "500",
  },
  goalPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 140,
    flexShrink: 1,
  },
  goalPillIcon: {
    width: 13,
    height: 13,
    flexShrink: 0,
  },
  goalPillText: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "600",
    flexShrink: 1,
  },
  photoGrid: {
    marginHorizontal: 14,
    marginBottom: 12,
    borderRadius: 14,
    overflow: "hidden",
  },
  photoGridSingle: {},
  photoGridMulti: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 3,
  },
  photoItem: {
    overflow: "hidden",
    borderRadius: 12,
  },
  photoItemSingle: {
    aspectRatio: 4 / 3,
  },
  photoItemMulti: {
    width: "48.5%",
    aspectRatio: 1,
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
  commentsList: {
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  commentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 9,
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
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
  deleteCommentBtn: {
    padding: 4,
    flexShrink: 0,
  },
  commentInputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
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
