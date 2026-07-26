import { Redirect, useLocalSearchParams } from "expo-router";

export default function LegacyCollabRoute() {
  const { section } = useLocalSearchParams<{ section?: string }>();

  return (
    <Redirect href={{ pathname: "/", params: section ? { section } : {} }} />
  );
}
