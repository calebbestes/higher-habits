import { Redirect, useLocalSearchParams } from "expo-router";

export default function LegacyCollabRoute() {
  const { section } = useLocalSearchParams<{ section?: string }>();
  const pathname =
    section === "feed" || section === "friends" ? "/friends" : "/";

  return <Redirect href={{ pathname, params: section ? { section } : {} }} />;
}
