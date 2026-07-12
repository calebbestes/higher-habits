import { useRouter } from "expo-router";

import { FriendProfileScreen } from "@/components/friend-profile-screen";

export default function ProfileRoute() {
  const router = useRouter();

  return <FriendProfileScreen self onBack={() => router.back()} />;
}
