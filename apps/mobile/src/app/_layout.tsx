import {
  DarkTheme,
  DefaultTheme,
  type Href,
  Stack,
  ThemeProvider,
  useRouter,
} from "expo-router";
import { useEffect, useRef, useState } from "react";
import { AppState, StyleSheet, View, useColorScheme } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { AnimatedSplashOverlay } from "@/components/animated-icon";
import { FloatingLogoLoader } from "@/components/floating-logo-loader";
import { OnboardingScreen } from "@/components/onboarding-screen";
import { useTheme } from "@/hooks/use-theme";
import { authClient } from "@/lib/auth-client";
import {
  setCrashReportingUser,
  wrapWithCrashReporting,
} from "@/lib/crash-reporting";
import { syncHabitRemindersFromServerAsync } from "@/lib/push-notifications";
import {
  type AppStartPage,
  type CollabSection,
  type PlanReportView,
  applyNavigationDefaults,
  getAppStartHref,
} from "@/lib/tab-view-store";
import {
  applyColorThemePreference,
  applyThemePreference,
  getColorThemePreference,
  getThemePreference,
} from "@/lib/theme-preference";
import { recordAppOpened } from "@/lib/user-activity-client";
import { fetchUserSettings } from "@/lib/user-settings-client";

type NavigationDefaults = {
  defaultAppStartPage: AppStartPage;
  defaultCollabSection: CollabSection;
  defaultPlanReportView: PlanReportView;
};

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
    "/dashboard" | null
  >(null);
  const [navigationDefaults, setNavigationDefaults] =
    useState<NavigationDefaults | null>(null);
  const appliedStartPageUserRef = useRef<string | null>(null);

  useEffect(() => {
    setCrashReportingUser(sessionUserId ?? null);
  }, [sessionUserId]);

  useEffect(() => {
    let cancelled = false;

    if (!sessionUserId) {
      setOnboardingCompleted(null);
      setNavigationDefaults(null);
      setPostOnboardingRoute(null);
      appliedStartPageUserRef.current = null;
      return;
    }

    setOnboardingCompleted(null);
    setNavigationDefaults(null);
    appliedStartPageUserRef.current = null;
    void fetchUserSettings()
      .then((settings) => {
        if (!cancelled) {
          const nextNavigationDefaults = {
            defaultAppStartPage: settings.defaultAppStartPage,
            defaultCollabSection: settings.defaultCollabSection,
            defaultPlanReportView: settings.defaultPlanReportView,
          };
          applyNavigationDefaults(nextNavigationDefaults);
          setNavigationDefaults(nextNavigationDefaults);
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
    void syncHabitRemindersFromServerAsync();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") record();
    });

    return () => subscription.remove();
  }, [onboardingCompleted, sessionUserId]);

  useEffect(() => {
    if (
      !sessionUserId ||
      onboardingCompleted !== true ||
      !postOnboardingRoute
    ) {
      return;
    }

    appliedStartPageUserRef.current = sessionUserId;
    router.replace(postOnboardingRoute);
    setPostOnboardingRoute(null);
  }, [onboardingCompleted, postOnboardingRoute, router, sessionUserId]);

  useEffect(() => {
    if (
      !sessionUserId ||
      onboardingCompleted !== true ||
      postOnboardingRoute ||
      !navigationDefaults ||
      appliedStartPageUserRef.current === sessionUserId
    ) {
      return;
    }

    appliedStartPageUserRef.current = sessionUserId;
    router.replace(getAppStartHref(navigationDefaults) as Href);
  }, [
    navigationDefaults,
    onboardingCompleted,
    postOnboardingRoute,
    router,
    sessionUserId,
  ]);

  if (isPending || (session && onboardingCompleted === null)) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <FloatingLogoLoader />
      </View>
    );
  }

  if (session && onboardingCompleted === false) {
    return (
      <OnboardingScreen
        onComplete={() => {
          setPostOnboardingRoute("/dashboard");
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
        <Stack.Screen name="friend-profile" />
        <Stack.Screen name="post" />
        <Stack.Screen name="profile" />
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
