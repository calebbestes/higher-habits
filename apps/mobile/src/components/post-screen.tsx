import { FeedCard } from "@/components/feed-screen";
import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { MaxContentWidth } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  type FriendFeedEntry,
  fetchFriendsFeed,
  fetchMyPosts,
  toggleFeedProp,
} from "@/lib/friends-client";
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
        const primaryPosts = await primary();
        let nextEntry = primaryPosts.find((post) => post.id === postId) ?? null;

        if (!nextEntry) {
          const fallbackPosts = await fallback().catch(() => []);
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
    if (!entry || entry.kind !== "habit") return;

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
      await toggleFeedProp(entry.id);
    } catch (propError) {
      if (!isMountedRef.current) return;
      setEntry(previous);
      Alert.alert(
        "Could not update props",
        propError instanceof Error ? propError.message : undefined,
      );
    }
  }, [entry]);

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
              onOpenComments={() =>
                Alert.alert("Comments", "Open comments from the feed for now.")
              }
              onOpenProfile={openProfile}
              onOpenSafetyActions={() => undefined}
            />
          ) : null}
        </ScrollView>
      </SafeAreaView>
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
