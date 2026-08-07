import { useLocalSearchParams, useRouter } from "expo-router";

import { FriendProfileScreen } from "@/components/friend-profile-screen";

export default function FriendProfileRoute() {
  const router = useRouter();
  const { friendId, friendshipId, initialImage, initialName, privateProfile } =
    useLocalSearchParams<{
      friendId?: string;
      friendshipId?: string;
      initialImage?: string;
      initialName?: string;
      privateProfile?: string;
    }>();

  return (
    <FriendProfileScreen
      friendId={typeof friendId === "string" ? friendId : undefined}
      friendshipId={typeof friendshipId === "string" ? friendshipId : ""}
      initialImage={typeof initialImage === "string" ? initialImage : undefined}
      initialName={typeof initialName === "string" ? initialName : undefined}
      privateProfile={privateProfile === "true"}
      onBack={() => router.back()}
    />
  );
}
