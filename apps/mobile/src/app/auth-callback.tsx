import { type Href, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo } from "react";
import { StyleSheet, View } from "react-native";

import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { useTheme } from "@/hooks/use-theme";
import {
  fetchMobileSession,
  persistAuthCallbackCookie,
} from "@/lib/auth-client";

const MAX_SESSION_REFRESH_ATTEMPTS = 8;
const SESSION_REFRESH_DELAY_MS = 300;

function getFirstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getSafeNextPath(value: string | string[] | undefined) {
  const nextPath = getFirstParam(value);

  if (
    !nextPath ||
    !nextPath.startsWith("/") ||
    nextPath.startsWith("//") ||
    nextPath.includes("\\")
  ) {
    return "/";
  }

  return nextPath;
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const theme = useTheme();
  const params = useLocalSearchParams<{
    cookie?: string | string[];
    next?: string | string[];
  }>();
  const callbackCookie = useMemo(
    () => getFirstParam(params.cookie),
    [params.cookie],
  );
  const nextPath = useMemo(() => getSafeNextPath(params.next), [params.next]);

  useEffect(() => {
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const completeAuth = async (attempt = 0) => {
      try {
        if (callbackCookie) {
          await persistAuthCallbackCookie(callbackCookie);
        }

        const sessionResponse = await fetchMobileSession({ force: true });
        if (!active) return;

        if (sessionResponse.data) {
          router.replace(nextPath as Href);
          return;
        }
      } catch {
        if (!active) return;
      }

      if (attempt >= MAX_SESSION_REFRESH_ATTEMPTS) {
        router.replace("/login");
        return;
      }

      timeout = setTimeout(
        () => void completeAuth(attempt + 1),
        SESSION_REFRESH_DELAY_MS,
      );
    };

    void completeAuth();

    return () => {
      active = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [callbackCookie, nextPath, router]);

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <FloatingLogoLoader />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
