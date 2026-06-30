import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  useRouter,
} from "expo-router";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  AppState,
  StyleSheet,
  View,
  useColorScheme,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { OnboardingScreen } from "@/components/onboarding-screen";
import { useTheme } from "@/hooks/use-theme";
import { authClient } from "@/lib/auth-client";
import {
  setCrashReportingUser,
  wrapWithCrashReporting,
} from "@/lib/crash-reporting";
import {
  registerForPushNotificationsAsync,
  syncHabitRemindersFromServerAsync,
} from "@/lib/push-notifications";
import {
  applyColorThemePreference,
  applyThemePreference,
  getColorThemePreference,
  getThemePreference,
} from "@/lib/theme-preference";
import { recordAppOpened } from "@/lib/user-activity-client";
import { fetchUserSettings } from "@/lib/user-settings-client";

function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    void getThemePreference().then(applyThemePreference);
    void getColorThemePreference().then(applyColorThemePreference);
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <AnimatedSplashOverlay />
        <AuthNavigator />
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function AuthNavigator() {
  const router = useRouter();
  const theme = useTheme();
  const { data: session, isPending } = authClient.useSession();
  const sessionUserId = session?.user.id;
  const [onboardingCompleted, setOnboardingCompleted] = useState<
    boolean | null
  >(null);
  const [postOnboardingRoute, setPostOnboardingRoute] = useState<
    "/journal" | null
  >(null);

  useEffect(() => {
    setCrashReportingUser(sessionUserId ?? null);
  }, [sessionUserId]);

  useEffect(() => {
    let cancelled = false;

    if (!sessionUserId) {
      setOnboardingCompleted(null);
      setPostOnboardingRoute(null);
      return;
    }

    setOnboardingCompleted(null);
    void fetchUserSettings()
      .then((settings) => {
        if (!cancelled) {
          setOnboardingCompleted(settings.onboardingCompleted);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOnboardingCompleted(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [sessionUserId]);

  useEffect(() => {
    if (!sessionUserId || onboardingCompleted !== true) return;

    const record = () => {
      void recordAppOpened().catch(() => undefined);
    };

    record();
    void registerForPushNotificationsAsync();
    void syncHabitRemindersFromServerAsync();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") record();
    });

    return () => subscription.remove();
  }, [onboardingCompleted, sessionUserId]);

  useEffect(() => {
    if (!sessionUserId || onboardingCompleted !== true || !postOnboardingRoute) {
      return;
    }

    router.replace(postOnboardingRoute);
    setPostOnboardingRoute(null);
  }, [onboardingCompleted, postOnboardingRoute, router, sessionUserId]);

  if (isPending || (session && onboardingCompleted === null)) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <ActivityIndicator color={theme.primary} size="large" />
      </View>
    );
  }

  if (session && onboardingCompleted === false) {
    return (
      <OnboardingScreen
        onComplete={() => {
          setPostOnboardingRoute("/journal");
          setOnboardingCompleted(true);
        }}
      />
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default wrapWithCrashReporting(RootLayout);

const styles = StyleSheet.create({
  root: { flex: 1 },
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
});
