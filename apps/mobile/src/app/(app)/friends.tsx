import { Redirect, useLocalSearchParams } from "expo-router";

export default function LegacyFriendsRoute() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const nextSection = section === "friends" ? "friends" : "feed";

  return <Redirect href={`/?section=${nextSection}`} />;
}
