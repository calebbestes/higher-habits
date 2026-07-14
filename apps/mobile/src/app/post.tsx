import { useLocalSearchParams, useRouter } from "expo-router";

import { PostScreen } from "@/components/post-screen";

export default function PostRoute() {
  const router = useRouter();
  const { postId, source } = useLocalSearchParams<{
    postId?: string;
    source?: string;
  }>();

  return (
    <PostScreen
      postId={typeof postId === "string" ? postId : ""}
      source={source === "self" ? "self" : "feed"}
      onBack={() => router.back()}
    />
  );
}
