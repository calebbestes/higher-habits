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
import { useTheme } from "@/hooks/use-theme";
import { authClient } from "@/lib/auth-client";
import {
  setCrashReportingUser,
  wrapWithCrashReporting,
} from "@/lib/crash-reporting";
import { initializeMobileAds } from "@/lib/mobile-ads";
import { syncHabitRemindersFromServerAsync } from "@/lib/push-notifications";
import {
  type AppStartPage,
  type CollabSection,
  DEFAULT_APP_START_PAGE,
  DEFAULT_COLLAB_SECTION,
  DEFAULT_PLAN_REPORT_VIEW,
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

const STARTUP_REQUEST_TIMEOUT_MS = 10_000;

const FALLBACK_NAVIGATION_DEFAULTS: NavigationDefaults = {
  defaultAppStartPage: DEFAULT_APP_START_PAGE,
  defaultCollabSection: DEFAULT_COLLAB_SECTION,
  defaultPlanReportView: DEFAULT_PLAN_REPORT_VIEW,
};

function RootLayout() {
  const colorScheme = useColorScheme();

  useEffect(() => {
    void getThemePreference().then(applyThemePreference);
    void getColorThemePreference().then(applyColorThemePreference);
    void initializeMobileAds();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <ThemeProvider value={colorScheme === "light" ? DefaultTheme : DarkTheme}>
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
  const [authStartupResolved, setAuthStartupResolved] = useState(false);
  const [navigationDefaults, setNavigationDefaults] =
    useState<NavigationDefaults | null>(null);
  const appliedStartPageUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isPending) {
      // Keep this resolved after the first response. Better Auth can briefly
      // set isPending again when its native cookie signal fires; that should
      // not put the whole app back behind the splash screen.
      setAuthStartupResolved(true);
      return;
    }

    const timeout = setTimeout(
      () => setAuthStartupResolved(true),
      STARTUP_REQUEST_TIMEOUT_MS,
    );

    return () => clearTimeout(timeout);
  }, [isPending]);

  useEffect(() => {
    setCrashReportingUser(sessionUserId ?? null);
  }, [sessionUserId]);

  useEffect(() => {
    let cancelled = false;

    if (!sessionUserId) {
      setNavigationDefaults(null);
      appliedStartPageUserRef.current = null;
      return;
    }

    setNavigationDefaults(null);
    appliedStartPageUserRef.current = null;
    const fallbackTimeout = setTimeout(() => {
      if (!cancelled) {
        applyNavigationDefaults(FALLBACK_NAVIGATION_DEFAULTS);
        setNavigationDefaults(FALLBACK_NAVIGATION_DEFAULTS);
      }
    }, STARTUP_REQUEST_TIMEOUT_MS);

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
        }
      })
      .catch(() => {
        if (!cancelled) {
          applyNavigationDefaults(FALLBACK_NAVIGATION_DEFAULTS);
          setNavigationDefaults(FALLBACK_NAVIGATION_DEFAULTS);
        }
      })
      .finally(() => {
        clearTimeout(fallbackTimeout);
      });

    return () => {
      cancelled = true;
      clearTimeout(fallbackTimeout);
    };
  }, [sessionUserId]);

  useEffect(() => {
    if (!sessionUserId) return;

    const record = () => {
      void recordAppOpened().catch(() => undefined);
    };

    record();
    void syncHabitRemindersFromServerAsync();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") record();
    });

    return () => subscription.remove();
  }, [sessionUserId]);

  useEffect(() => {
    if (
      !sessionUserId ||
      !navigationDefaults ||
      appliedStartPageUserRef.current === sessionUserId
    ) {
      return;
    }

    appliedStartPageUserRef.current = sessionUserId;
    router.replace(getAppStartHref(navigationDefaults) as Href);
  }, [navigationDefaults, router, sessionUserId]);

  if (
    (isPending && !authStartupResolved) ||
    (session && navigationDefaults === null)
  ) {
    return (
      <View style={[styles.loading, { backgroundColor: theme.background }]}>
        <FloatingLogoLoader />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="auth-callback" />
      <Stack.Protected guard={!session}>
        <Stack.Screen name="login" />
        <Stack.Screen name="sign-up" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(app)" />
        <Stack.Screen name="friend-profile" />
        <Stack.Screen name="post" />
        <Stack.Screen name="profile" />
        <Stack.Screen name="settings" />
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
