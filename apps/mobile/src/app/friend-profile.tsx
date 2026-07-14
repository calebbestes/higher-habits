import { useLocalSearchParams, useRouter } from "expo-router";

import { FriendProfileScreen } from "@/components/friend-profile-screen";

export default function FriendProfileRoute() {
  const router = useRouter();
  const { friendId, friendshipId, initialName } = useLocalSearchParams<{
    friendId?: string;
    friendshipId?: string;
    initialName?: string;
  }>();

  return (
    <FriendProfileScreen
      friendId={typeof friendId === "string" ? friendId : undefined}
      friendshipId={typeof friendshipId === "string" ? friendshipId : ""}
      initialName={typeof initialName === "string" ? initialName : undefined}
      onBack={() => router.back()}
    />
  );
}
