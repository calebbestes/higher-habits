import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BrandedEmptyState } from "@/components/branded-empty-state";
import { GoalIcon } from "@/components/goal-icon";
import { Fonts, MaxContentWidth } from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import {
  type FriendFeedEntry,
  type FriendProfile,
  type FriendProfileHabit,
  fetchFriendProfile,
  fetchFriendProfileByFriendId,
  fetchFriendsFeed,
  fetchMyPosts,
  fetchMyProfile,
} from "@/lib/friends-client";
import { richTextToPlainText } from "@/lib/rich-text";

type SymbolName = SymbolViewProps["name"];

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

export function FriendProfileScreen({
  friendId,
  friendshipId,
  initialName,
  self = false,
  onBack,
}: {
  friendId?: string;
  friendshipId?: string;
  initialName?: string;
  self?: boolean;
  onBack: () => void;
}) {
  const theme = useTheme();
  const router = useRouter();
  const tabBarHeight = useTabBarHeight();
  const { width } = useWindowDimensions();
  const isMountedRef = useRef(true);
  const loadRequestIdRef = useRef(0);
  const [profile, setProfile] = useState<FriendProfile | null>(null);
  const [posts, setPosts] = useState<FriendFeedEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [arePostsLoading, setArePostsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tileSize = Math.floor((Math.min(width, MaxContentWidth) - 4) / 3);
  const habits = useMemo(
    () => profile?.categories.flatMap((category) => category.habits) ?? [],
    [profile],
  );

  const load = useCallback(
    async (refresh = false) => {
      if (!self && !friendshipId && !friendId) {
        setError("Profile data is unavailable.");
        setIsLoading(false);
        setArePostsLoading(false);
        return;
      }

      const requestId = ++loadRequestIdRef.current;
      refresh ? setIsRefreshing(true) : setIsLoading(true);
      setArePostsLoading(true);
      setError(null);
      try {
        if (self) {
          const nextProfile = await fetchMyProfile();

          if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
            return;
          }

          setProfile(nextProfile);
          setIsLoading(false);

          const myPosts = await fetchMyPosts().catch(() => []);

          if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
            return;
          }

          setPosts(
            myPosts.sort((left, right) =>
              right.dateKey.localeCompare(left.dateKey),
            ),
          );
          setArePostsLoading(false);
        } else {
          const nextProfile = friendId
            ? await fetchFriendProfileByFriendId(friendId)
            : await fetchFriendProfile(friendshipId as string);

          if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
            return;
          }

          setProfile(nextProfile);
          setIsLoading(false);

          const feed = await fetchFriendsFeed().catch(() => []);

          if (!isMountedRef.current || requestId !== loadRequestIdRef.current) {
            return;
          }

          setPosts(
            feed
              .filter((entry) => entry.friend.id === nextProfile.friend.id)
              .sort((left, right) => right.dateKey.localeCompare(left.dateKey)),
          );
          setArePostsLoading(false);
        }
      } catch (loadError) {
        if (isMountedRef.current && requestId === loadRequestIdRef.current) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load profile.",
          );
          setProfile(null);
          setPosts([]);
          setArePostsLoading(false);
        }
      } finally {
        if (isMountedRef.current && requestId === loadRequestIdRef.current) {
          setIsLoading(false);
          setArePostsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [friendId, friendshipId, self],
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
            {profile?.friend.name ?? initialName ?? (self ? "You" : "Profile")}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarHeight + 18 },
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
          {error ? (
            <View style={[styles.errorBanner, { backgroundColor: "#FFF0F0" }]}>
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
          ) : profile ? (
            <>
              <View style={styles.profileTop}>
                <ProfileAvatar
                  image={profile.friend.image}
                  name={profile.friend.name}
                  size={86}
                />
                <View style={styles.statsRow}>
                  <ProfileStat
                    label="friends"
                    value={profile.stats.friendCount}
                  />
                  <ProfileStat
                    label="habits done"
                    value={profile.stats.habitCompletions}
                  />
                </View>
              </View>
              <Text
                numberOfLines={1}
                style={[styles.profileName, { color: theme.text }]}
              >
                {profile.friend.name}
              </Text>

              <View style={styles.compactDashboard}>
                {habits.length > 0 ? (
                  habits.map((habit) => (
                    <CompactHabitRow
                      key={habit.id}
                      days={profile.dateKeys}
                      habit={habit}
                      logsByHabitDate={profile.logsByHabitDate}
                    />
                  ))
                ) : (
                  <Text
                    style={[styles.mutedText, { color: theme.textSecondary }]}
                  >
                    No visible habits yet.
                  </Text>
                )}
              </View>

              {posts.length > 0 ? (
                <View style={styles.postGrid}>
                  {posts.map((post) => (
                    <PostTile
                      key={post.id}
                      post={post}
                      size={tileSize}
                      onPress={() =>
                        router.push({
                          pathname: "/post",
                          params: {
                            postId: post.id,
                            source: self ? "self" : "feed",
                          },
                        })
                      }
                    />
                  ))}
                </View>
              ) : arePostsLoading ? (
                <View style={styles.emptyPosts}>
                  <Text
                    style={[
                      styles.loadingPostsText,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Loading posts...
                  </Text>
                </View>
              ) : (
                <View style={styles.emptyPosts}>
                  <BrandedEmptyState
                    compact
                    title={self ? "No posts yet" : "No visible posts yet"}
                    description={
                      self
                        ? "Completed habits with a note or photo will show up here."
                        : "Posts this friend shares with you will appear here."
                    }
                  />
                </View>
              )}
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function ProfileAvatar({
  image,
  name,
  size,
}: {
  image: string | null;
  name: string;
  size: number;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: theme.backgroundElement,
        },
      ]}
    >
      {image ? (
        <Image
          contentFit="cover"
          source={{ uri: image }}
          style={StyleSheet.absoluteFill}
        />
      ) : (
        <Text
          style={[
            styles.avatarText,
            { color: theme.primary, fontSize: Math.round(size * 0.34) },
          ]}
        >
          {name.slice(0, 1).toUpperCase()}
        </Text>
      )}
    </View>
  );
}

function ProfileStat({ label, value }: { label: string; value: number }) {
  const theme = useTheme();

  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, { color: theme.text }]}>
        {value.toLocaleString()}
      </Text>
      <Text style={[styles.statLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
    </View>
  );
}

function CompactHabitRow({
  days,
  habit,
  logsByHabitDate,
}: {
  days: string[];
  habit: FriendProfileHabit;
  logsByHabitDate: FriendProfile["logsByHabitDate"];
}) {
  const theme = useTheme();
  const [showName, setShowName] = useState(false);

  return (
    <View style={styles.habitRow}>
      <Pressable
        accessibilityLabel={habit.name}
        hitSlop={8}
        onPress={() => setShowName((current) => !current)}
        style={[styles.habitIcon, { backgroundColor: theme.secondary }]}
      >
        <GoalIcon
          iconKey={habit.iconKey}
          size={14}
          color={theme.secondaryForeground}
        />
      </Pressable>
      <View style={styles.dayBlocks}>
        {days.map((day) => {
          const status = getFriendHabitStatus(habit, day, logsByHabitDate);
          return (
            <View
              key={day}
              style={[
                styles.dayBlock,
                {
                  backgroundColor:
                    status === "complete"
                      ? theme.primary
                      : status === "planned"
                        ? `${theme.primary}33`
                        : theme.backgroundElement,
                },
              ]}
            />
          );
        })}
      </View>
      {showName ? (
        <View
          pointerEvents="none"
          style={[
            styles.tooltip,
            { backgroundColor: theme.text, borderColor: theme.tabBorder },
          ]}
        >
          <Text
            numberOfLines={2}
            style={[styles.tooltipText, { color: theme.background }]}
          >
            {habit.name}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function PostTile({
  onPress,
  post,
  size,
}: {
  onPress: () => void;
  post: FriendFeedEntry;
  size: number;
}) {
  const theme = useTheme();
  const photo = post.photos[0];
  const text = richTextToPlainText(post.notes);

  return (
    <Pressable
      accessibilityLabel={`Open post for ${post.goal.name}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.postTile,
        {
          width: size,
          height: size,
          backgroundColor: theme.backgroundElement,
        },
        pressed && styles.pressed,
      ]}
    >
      {photo ? (
        <>
          <Image
            contentFit="cover"
            source={{ uri: photo.url }}
            style={StyleSheet.absoluteFill}
          />
          {post.photos.length > 1 ? (
            <View style={styles.multiPhotoBadge}>
              <SymbolView
                name={sym("square.on.square", "filter_none")}
                size={15}
                weight="semibold"
                tintColor="#FFFFFF"
              />
            </View>
          ) : null}
        </>
      ) : (
        <View style={styles.textTileContent}>
          <Text
            numberOfLines={1}
            style={[styles.tileGoal, { color: theme.text }]}
          >
            {post.goal.name}
          </Text>
          <Text
            numberOfLines={5}
            style={[styles.tileNote, { color: theme.textSecondary }]}
          >
            {text || "Completed"}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

function getFriendHabitStatus(
  habit: FriendProfileHabit,
  dateKey: string,
  logsByHabitDate: FriendProfile["logsByHabitDate"],
) {
  const explicitStatus = logsByHabitDate[`${habit.id}_${dateKey}`];
  if (explicitStatus) return explicitStatus;
  return habit.defaultComplete ? "complete" : undefined;
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    height: 48,
    maxWidth: MaxContentWidth,
    width: "100%",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    textAlign: "center",
    fontFamily: Fonts.rounded,
    fontSize: 18,
    fontWeight: "900",
  },
  headerSpacer: { width: 42 },
  content: {
    maxWidth: MaxContentWidth,
    width: "100%",
    alignSelf: "center",
  },
  centerState: {
    minHeight: 260,
    alignItems: "center",
    justifyContent: "center",
  },
  errorBanner: {
    margin: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderRadius: 14,
    padding: 14,
  },
  errorText: { color: "#9D474D", fontSize: 14, fontWeight: "700" },
  retryText: { fontSize: 14, fontWeight: "800" },
  profileTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 22,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  avatar: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  avatarText: { fontWeight: "900" },
  statsRow: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    gap: 14,
  },
  stat: { alignItems: "center", minWidth: 86 },
  statValue: {
    fontFamily: Fonts.rounded,
    fontSize: 22,
    lineHeight: 25,
    fontWeight: "900",
  },
  statLabel: { marginTop: 2, fontSize: 12, fontWeight: "700" },
  profileName: {
    paddingHorizontal: 22,
    paddingTop: 12,
    fontFamily: Fonts.rounded,
    fontSize: 16,
    fontWeight: "900",
  },
  compactDashboard: {
    gap: 7,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
  },
  mutedText: { fontSize: 14, fontWeight: "700", textAlign: "center" },
  habitRow: {
    minHeight: 30,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    position: "relative",
  },
  habitIcon: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  dayBlocks: { flex: 1, flexDirection: "row", gap: 4 },
  dayBlock: { flex: 1, height: 28, borderRadius: 7 },
  tooltip: {
    position: "absolute",
    left: 34,
    top: -7,
    zIndex: 20,
    elevation: 20,
    minWidth: 110,
    maxWidth: 180,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  tooltipText: { fontSize: 11, lineHeight: 14, fontWeight: "800" },
  postGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 2,
    paddingTop: 2,
  },
  postTile: { overflow: "hidden" },
  multiPhotoBadge: {
    position: "absolute",
    top: 7,
    right: 7,
    width: 24,
    height: 24,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  textTileContent: { flex: 1, justifyContent: "space-between", padding: 10 },
  tileGoal: { fontSize: 12, fontWeight: "900" },
  tileNote: { fontSize: 11, lineHeight: 14, fontWeight: "600" },
  emptyPosts: { paddingHorizontal: 20, paddingTop: 8 },
  loadingPostsText: {
    fontSize: 14,
    fontWeight: "800",
    textAlign: "center",
  },
  pressed: { opacity: 0.72 },
});
