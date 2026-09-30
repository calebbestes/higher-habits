import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import * as Notifications from "expo-notifications";
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
import { useMobileSession } from "@/lib/auth-client";
import {
  setCrashReportingUser,
  wrapWithCrashReporting,
} from "@/lib/crash-reporting";
import { friendsFeedQueryOptions } from "@/lib/friends-feed-query";
import { toDateKey } from "@/lib/habit-logs-client";
import { initializeMobileAds } from "@/lib/mobile-ads";
import {
  myPostsQueryOptions,
  myProfileQueryOptions,
} from "@/lib/my-profile-query";
import {
  START_COMPLETE_CHECKIN_ACTIONS,
  applyStartCompleteCheckInAsync,
  syncHabitRemindersFromServerAsync,
  syncStartCompleteCheckInFromServerAsync,
} from "@/lib/push-notifications";
import { mobileQueryClient } from "@/lib/query-client";
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
import { syncTodayPlanWidgetAsync } from "@/lib/today-plan-widget";
import { recordAppOpened } from "@/lib/user-activity-client";
import { fetchUserSettings } from "@/lib/user-settings-client";

type NavigationDefaults = {
  defaultAppStartPage: AppStartPage;
  defaultCollabSection: CollabSection;
  defaultPlanReportView: PlanReportView;
};

const AUTH_STARTUP_TIMEOUT_MS = 3_000;
const USER_SETTINGS_STARTUP_TIMEOUT_MS = 2_000;

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
        <QueryClientProvider client={mobileQueryClient}>
          <AnimatedSplashOverlay />
          <AuthNavigator />
        </QueryClientProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

function AuthNavigator() {
  const router = useRouter();
  const theme = useTheme();
  const { data: session, isPending } = useMobileSession();
  const queryClient = useQueryClient();
  const sessionUserId = session?.user.id;
  const [authStartupResolved, setAuthStartupResolved] = useState(false);
  const [onboardingCompleted, setOnboardingCompleted] = useState<
    boolean | null
  >(null);
  const [navigationDefaults, setNavigationDefaults] =
    useState<NavigationDefaults | null>(null);
  const appliedStartPageUserRef = useRef<string | null>(null);
  const handledNotificationResponseRef = useRef<string | null>(null);

  useEffect(() => {
    if (!sessionUserId) {
      queryClient.clear();
      return;
    }

    // Warm the feed as soon as authentication is available. This improves
    // the first feed render without delaying the app's startup gate.
    void queryClient
      .prefetchInfiniteQuery(friendsFeedQueryOptions())
      .catch(() => undefined);
    void queryClient
      .prefetchQuery(myProfileQueryOptions())
      .catch(() => undefined);
    void queryClient
      .prefetchInfiniteQuery(myPostsQueryOptions())
      .catch(() => undefined);
  }, [queryClient, sessionUserId]);

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
      AUTH_STARTUP_TIMEOUT_MS,
    );

    return () => clearTimeout(timeout);
  }, [isPending]);

  useEffect(() => {
    setCrashReportingUser(sessionUserId ?? null);
  }, [sessionUserId]);

  useEffect(() => {
    let cancelled = false;

    if (!sessionUserId) {
      setOnboardingCompleted(null);
      setNavigationDefaults(null);
      appliedStartPageUserRef.current = null;
      return;
    }

    setNavigationDefaults(null);
    setOnboardingCompleted(null);
    appliedStartPageUserRef.current = null;
    const fallbackTimeout = setTimeout(() => {
      if (!cancelled) {
        applyNavigationDefaults(FALLBACK_NAVIGATION_DEFAULTS);
        setNavigationDefaults(FALLBACK_NAVIGATION_DEFAULTS);
      }
    }, USER_SETTINGS_STARTUP_TIMEOUT_MS);

    void fetchUserSettings()
      .then((settings) => {
        if (!cancelled) {
          const nextNavigationDefaults = {
            defaultAppStartPage: settings.defaultAppStartPage,
            defaultCollabSection: settings.defaultCollabSection,
            defaultPlanReportView: settings.defaultPlanReportView,
          };
          setOnboardingCompleted(settings.onboardingCompleted ?? true);
          applyNavigationDefaults(nextNavigationDefaults);
          setNavigationDefaults(nextNavigationDefaults);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOnboardingCompleted(true);
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
    void syncStartCompleteCheckInFromServerAsync();
    void syncTodayPlanWidgetAsync();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        record();
        void syncTodayPlanWidgetAsync();
      }
    });

    return () => subscription.remove();
  }, [sessionUserId]);

  useEffect(() => {
    if (!sessionUserId) return;

    let active = true;
    const handleResponse = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data;
      if (data?.type !== "start-complete-checkin") return;

      const responseKey = `${response.notification.request.identifier}:${response.notification.date}:${response.actionIdentifier}`;
      if (handledNotificationResponseRef.current === responseKey) return;
      handledNotificationResponseRef.current = responseKey;

      const dateKey = toDateKey(new Date());
      const action = response.actionIdentifier;
      if (action === START_COMPLETE_CHECKIN_ACTIONS.all) {
        void applyStartCompleteCheckInAsync("complete", dateKey).catch(
          () => undefined,
        );
      } else if (action === START_COMPLETE_CHECKIN_ACTIONS.none) {
        void applyStartCompleteCheckInAsync("incomplete", dateKey).catch(
          () => undefined,
        );
      } else {
        router.push({
          pathname: "/start-complete-check-in",
          params: { dateKey },
        });
      }

      Notifications.clearLastNotificationResponse();
    };

    const subscription =
      Notifications.addNotificationResponseReceivedListener(handleResponse);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (active && response) handleResponse(response);
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [router, sessionUserId]);

  useEffect(() => {
    if (!sessionUserId || onboardingCompleted === null) {
      return;
    }

    if (!onboardingCompleted) {
      if (appliedStartPageUserRef.current === sessionUserId) return;
      appliedStartPageUserRef.current = sessionUserId;
      router.replace("/onboarding");
      return;
    }

    if (
      !navigationDefaults ||
      appliedStartPageUserRef.current === sessionUserId
    ) {
      return;
    }

    appliedStartPageUserRef.current = sessionUserId;
    router.replace(getAppStartHref(navigationDefaults) as Href);
  }, [navigationDefaults, onboardingCompleted, router, sessionUserId]);

  if (
    (isPending && !authStartupResolved) ||
    (session && (navigationDefaults === null || onboardingCompleted === null))
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
        <Stack.Screen name="onboarding" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="start-complete-check-in" />
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
