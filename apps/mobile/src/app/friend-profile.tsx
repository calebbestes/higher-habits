import { useLocalSearchParams, useRouter } from "expo-router";

import { FriendProfileScreen } from "@/components/friend-profile-screen";

export default function FriendProfileRoute() {
  const router = useRouter();
  const { friendshipId } = useLocalSearchParams<{ friendshipId?: string }>();

  return (
    <FriendProfileScreen
      friendshipId={typeof friendshipId === "string" ? friendshipId : ""}
      onBack={() => router.back()}
    />
  );
}
