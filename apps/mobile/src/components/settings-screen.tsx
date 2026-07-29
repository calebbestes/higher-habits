import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { NotificationSettingsModal } from "@/components/notification-settings-screen";
import {
  ColorThemeOptions,
  ColorThemeOrder,
  type ColorThemePreference,
  DefaultColorThemePreference,
  MaxContentWidth,
} from "@/constants/theme";
import { useTabBarHeight } from "@/hooks/use-tab-bar-height";
import { useTheme } from "@/hooks/use-theme";
import { AUTH_BASE_URL, authClient } from "@/lib/auth-client";
import { reportContent } from "@/lib/friends-client";
import {
  type GoogleCalendarStatus,
  fetchGoogleCalendarStatus,
} from "@/lib/google-calendar-client";
import {
  playSelectionHaptic,
  playSuccessHaptic,
  playWarningHaptic,
} from "@/lib/haptics";
import { mobileApiFetch } from "@/lib/mobile-api";
import { uploadProfilePicture } from "@/lib/profile-picture-client";
import {
  registerForPushNotificationsAsync,
  sendTestNotificationAsync,
} from "@/lib/push-notifications";
import {
  type AppStartPage,
  type CollabSection,
  type PlanReportView,
  applyNavigationDefaults,
} from "@/lib/tab-view-store";
import {
  DEFAULT_THEME_PREFERENCE,
  type ThemePreference,
  getColorThemePreference,
  getThemePreference,
  setColorThemePreference,
  setThemePreference,
} from "@/lib/theme-preference";
import {
  USER_SETTING_DEFAULTS,
  type UserSettings,
  fetchUserSettings,
  updateUserSettings,
} from "@/lib/user-settings-client";

type SymbolName = SymbolViewProps["name"];
const abiLogoSource = require("@/assets/images/abi-logo-no-background.png");
type NavigationDefaultKey =
  | "defaultAppStartPage"
  | "defaultCollabSection"
  | "defaultPlanReportView";
type NavigationDefaults = Pick<UserSettings, NavigationDefaultKey>;
type SettingsSubmenu =
  | "account"
  | "appearance"
  | "integrations"
  | "notifications"
  | "support";

const PLAN_REPORT_DEFAULT_OPTIONS: {
  label: string;
  value: PlanReportView;
}[] = [
  { label: "Daily Plan", value: "day-plan" },
  { label: "Monthly Plan", value: "monthly-plan" },
];

const COLLAB_DEFAULT_OPTIONS: { label: string; value: CollabSection }[] = [
  { label: "Feed", value: "feed" },
  { label: "Friends", value: "friends" },
  { label: "Incentives", value: "incentives" },
  { label: "Shared Goals", value: "shared-goals" },
];

const APP_START_DEFAULT_OPTIONS: { label: string; value: AppStartPage }[] = [
  { label: "Create", value: "add" },
  { label: "Plan", value: "plan-report" },
  { label: "Collab", value: "collab" },
  { label: "Profile", value: "history" },
  { label: "Settings", value: "settings" },
];

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

export function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const tabBarHeight = useTabBarHeight();
  const { data: session, refetch } = authClient.useSession();
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isGoogleConnecting, setIsGoogleConnecting] = useState(false);
  const [isRegisteringNotifications, setIsRegisteringNotifications] =
    useState(false);
  const [isSendingTestNotification, setIsSendingTestNotification] =
    useState(false);
  const [appearance, setAppearance] = useState<ThemePreference>(
    DEFAULT_THEME_PREFERENCE,
  );
  const [colorTheme, setColorTheme] = useState<ColorThemePreference>(
    DefaultColorThemePreference,
  );
  const [googleCalendarStatus, setGoogleCalendarStatus] =
    useState<GoogleCalendarStatus | null>(null);
  const [navigationDefaults, setNavigationDefaults] =
    useState<NavigationDefaults>({
      defaultAppStartPage: USER_SETTING_DEFAULTS.defaultAppStartPage,
      defaultCollabSection: USER_SETTING_DEFAULTS.defaultCollabSection,
      defaultPlanReportView: USER_SETTING_DEFAULTS.defaultPlanReportView,
    });
  const [activeSubmenu, setActiveSubmenu] = useState<SettingsSubmenu | null>(
    null,
  );
  const [showNotifications, setShowNotifications] = useState(false);

  useEffect(() => {
    void getThemePreference().then(setAppearance);
    void getColorThemePreference().then(setColorTheme);
  }, []);

  const loadGoogleCalendarStatus = useCallback(async () => {
    try {
      setGoogleCalendarStatus(await fetchGoogleCalendarStatus());
    } catch {
      setGoogleCalendarStatus(null);
    }
  }, []);

  useEffect(() => {
    void loadGoogleCalendarStatus();
  }, [loadGoogleCalendarStatus]);

  useEffect(() => {
    let active = true;

    void fetchUserSettings()
      .then((settings) => {
        if (!active) return;
        const nextDefaults = pickNavigationDefaults(settings);
        setNavigationDefaults(nextDefaults);
        applyNavigationDefaults(nextDefaults);
      })
      .catch(() => undefined);

    return () => {
      active = false;
    };
  }, []);

  const signOut = async () => {
    setIsSigningOut(true);
    try {
      await authClient.signOut();
      router.replace("/login");
    } finally {
      setIsSigningOut(false);
    }
  };

  const confirmSignOut = () => {
    Alert.alert("Sign out?", "You can sign back in at any time.", [
      { text: "Cancel", style: "cancel" },
      { text: "Sign Out", style: "destructive", onPress: () => void signOut() },
    ]);
  };

  const deleteAccount = async () => {
    setIsDeletingAccount(true);
    try {
      const response = await mobileApiFetch("/api/account", {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(payload?.error ?? "Could not delete account.");
      }

      await authClient.signOut().catch(() => undefined);
      Alert.alert("Account deleted", "Your account has been deleted.", [
        { text: "OK", onPress: () => router.replace("/login") },
      ]);
    } catch (deleteError) {
      Alert.alert(
        "Delete account",
        deleteError instanceof Error
          ? deleteError.message
          : "Could not delete account.",
      );
    } finally {
      setIsDeletingAccount(false);
    }
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      "Delete account?",
      "This permanently deletes your account, goals, plans, journal entries, photos, friends, and settings.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Account",
          style: "destructive",
          onPress: () => void deleteAccount(),
        },
      ],
    );
  };

  const chooseAppearance = () => {
    const choose = (preference: ThemePreference) => {
      playSelectionHaptic();
      setAppearance(preference);
      void setThemePreference(preference);
    };

    Alert.alert("Appearance", "Choose how float looks.", [
      { text: "Automatic", onPress: () => choose("system") },
      { text: "Light", onPress: () => choose("light") },
      { text: "Dark", onPress: () => choose("dark") },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const chooseColorTheme = (preference: ColorThemePreference) => {
    playSelectionHaptic();
    setColorTheme(preference);
    void setColorThemePreference(preference);
  };

  const saveNavigationDefault = <Key extends NavigationDefaultKey>(
    key: Key,
    value: NavigationDefaults[Key],
  ) => {
    const previous = navigationDefaults;
    if (previous[key] === value) {
      playSelectionHaptic();
      return;
    }

    const next = { ...previous, [key]: value };
    setNavigationDefaults(next);
    applyNavigationDefaults(next);

    updateUserSettings({ [key]: value })
      .then(() => {
        playSuccessHaptic();
      })
      .catch((settingsError: unknown) => {
        playWarningHaptic();
        setNavigationDefaults(previous);
        applyNavigationDefaults(previous);
        Alert.alert(
          "Settings",
          settingsError instanceof Error
            ? settingsError.message
            : "Could not save that setting.",
        );
      });
  };

  const choosePlanReportDefault = () => {
    Alert.alert("Plan default", "Choose the first Plan page.", [
      ...PLAN_REPORT_DEFAULT_OPTIONS.map((option) => ({
        text: option.label,
        onPress: () =>
          saveNavigationDefault("defaultPlanReportView", option.value),
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const chooseCollabDefault = () => {
    Alert.alert("Collab default", "Choose the first Collab page.", [
      ...COLLAB_DEFAULT_OPTIONS.map((option) => ({
        text: option.label,
        onPress: () =>
          saveNavigationDefault("defaultCollabSection", option.value),
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const chooseAppStartDefault = () => {
    Alert.alert("App start page", "Choose what opens when float starts.", [
      ...APP_START_DEFAULT_OPTIONS.map((option) => ({
        text: option.label,
        onPress: () =>
          saveNavigationDefault("defaultAppStartPage", option.value),
      })),
      { text: "Cancel", style: "cancel" as const },
    ]);
  };

  const pickProfilePicture = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert(
        "Permission required",
        "Allow photo access in Settings to change your profile picture.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (result.canceled || !result.assets[0]) return;

    setIsUploadingPhoto(true);
    try {
      await uploadProfilePicture(result.assets[0].uri);
      await refetch();
    } catch (err) {
      Alert.alert(
        "Upload failed",
        err instanceof Error ? err.message : "Could not upload photo.",
      );
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const connectGoogleCalendar = async () => {
    if (isGoogleConnecting) return;

    setIsGoogleConnecting(true);
    try {
      const response = await authClient.linkSocial({
        provider: "google",
        callbackURL: "/",
        scopes: [
          "openid",
          "email",
          "profile",
          "https://www.googleapis.com/auth/calendar.events",
        ],
      });

      if (response.error) {
        Alert.alert(
          "Google Calendar",
          response.error.message ?? "Could not connect Google Calendar.",
        );
        return;
      }

      await loadGoogleCalendarStatus();
    } catch (connectError) {
      Alert.alert(
        "Google Calendar",
        connectError instanceof Error
          ? connectError.message
          : "Could not connect Google Calendar.",
      );
    } finally {
      setIsGoogleConnecting(false);
    }
  };

  const sendTestNotification = async () => {
    if (isSendingTestNotification) return;

    setIsSendingTestNotification(true);
    try {
      await sendTestNotificationAsync();
      playSuccessHaptic();
    } catch (notificationError) {
      playWarningHaptic();
      Alert.alert(
        "Notifications",
        notificationError instanceof Error
          ? notificationError.message
          : "Could not send a test notification.",
      );
    } finally {
      setIsSendingTestNotification(false);
    }
  };

  const enableDeviceNotifications = async () => {
    if (isRegisteringNotifications) return;

    setIsRegisteringNotifications(true);
    try {
      const result = await registerForPushNotificationsAsync();

      if (result === "registered") {
        playSuccessHaptic();
        Alert.alert("Notifications enabled", "float can now send reminders.");
        return;
      }

      if (result === "denied") {
        playWarningHaptic();
        Alert.alert(
          "Notifications are off",
          "Enable notifications in Settings to receive reminders.",
        );
        return;
      }

      if (result === "unavailable") {
        playWarningHaptic();
        Alert.alert(
          "Notifications",
          "Push notifications require a physical device.",
        );
        return;
      }

      playWarningHaptic();
      Alert.alert("Notifications", "Could not enable notifications.");
    } finally {
      setIsRegisteringNotifications(false);
    }
  };

  const contactSupport = () => {
    const subject = encodeURIComponent("float support");
    const body = encodeURIComponent(
      `Account: ${session?.user.email ?? "signed in"}\n\nHow can we help?`,
    );
    Linking.openURL(
      `mailto:estes.caleb.b@gmail.com?subject=${subject}&body=${body}`,
    ).catch(() => {
      Alert.alert("Support", "Email estes.caleb.b@gmail.com for help.");
    });
  };

  const reportSafetyConcern = async () => {
    try {
      await reportContent({
        targetType: "general",
        reason: "Safety concern reported from Settings.",
        context: { email: session?.user.email ?? null },
      });
      Alert.alert("Report sent", "Thanks. We'll review it.");
    } catch (reportError) {
      Alert.alert(
        "Could not send report",
        reportError instanceof Error ? reportError.message : undefined,
      );
    }
  };

  const showCommunityStandards = () => {
    Alert.alert(
      "Community Standards",
      "Share progress respectfully. Do not post abusive, harassing, hateful, sexual, threatening, or illegal content. Report anything that feels unsafe.",
      [{ text: "OK" }],
    );
  };

  const showPrivacySummary = () => {
    Alert.alert(
      "Privacy Summary",
      "float uses your account details, goals, journal entries, photos, friends, notifications, and crash diagnostics to run the app. Your progress stays private unless you choose to share it.",
      [{ text: "OK" }],
    );
  };

  const openPrivacyPolicy = () => {
    Linking.openURL(`${AUTH_BASE_URL}/privacy`).catch(() => {
      Alert.alert("Privacy Policy", `${AUTH_BASE_URL}/privacy`);
    });
  };

  const profileImageUrl = session?.user.image;
  const appearanceValue =
    appearance === "system"
      ? "Automatic"
      : appearance === "dark"
        ? "Dark"
        : "Light";
  const googleCalendarValue = isGoogleConnecting
    ? "Connecting"
    : googleCalendarStatus
      ? googleCalendarStatus.configured
        ? googleCalendarStatus.connected
          ? "Connected"
          : googleCalendarStatus.hasGoogleAccount
            ? "Reconnect"
            : "Connect"
        : "Not configured"
      : "Checking";
  const submenuCopy: Record<
    SettingsSubmenu,
    { title: string; subtitle: string }
  > = {
    account: {
      title: "Account",
      subtitle: "Sign out or delete your account",
    },
    appearance: {
      title: "Appearance",
      subtitle: "Color, defaults, and startup behavior",
    },
    integrations: {
      title: "Integrations",
      subtitle: "Connect outside services",
    },
    notifications: {
      title: "Notifications",
      subtitle: "Device alerts and reminder preferences",
    },
    support: {
      title: "Safety & Support",
      subtitle: "Privacy, policies, and help",
    },
  };
  const headerTitle = activeSubmenu
    ? submenuCopy[activeSubmenu].title
    : "Settings";
  const headerSubtitle = activeSubmenu
    ? submenuCopy[activeSubmenu].subtitle
    : "Account and app preferences";

  const openSubmenu = (submenu: SettingsSubmenu) => {
    playSelectionHaptic();
    setActiveSubmenu(submenu);
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView
          canCancelContentTouches
          contentContainerStyle={[
            styles.content,
            { paddingBottom: tabBarHeight + 16 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pageHeader}>
            {activeSubmenu ? (
              <Pressable
                accessibilityLabel="Back to settings"
                accessibilityRole="button"
                hitSlop={10}
                onPress={() => {
                  playSelectionHaptic();
                  setActiveSubmenu(null);
                }}
                style={({ pressed }) => [
                  styles.backButton,
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={sym("chevron.left", "chevron_left")}
                  size={22}
                  weight="bold"
                  tintColor={theme.primary}
                />
              </Pressable>
            ) : null}
            <View style={styles.pageHeaderText}>
              <Text style={[styles.pageTitle, { color: theme.text }]}>
                {headerTitle}
              </Text>
              <Text
                style={[styles.pageSubtitle, { color: theme.textSecondary }]}
              >
                {headerSubtitle}
              </Text>
            </View>
          </View>

          {activeSubmenu === null ? (
            <>
              <View
                style={[
                  styles.profileCard,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                  },
                ]}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Change profile picture"
                  disabled={isUploadingPhoto}
                  onPress={() => void pickProfilePicture()}
                  style={({ pressed }) => [
                    styles.avatarWrapper,
                    pressed && styles.pressed,
                  ]}
                >
                  {profileImageUrl ? (
                    <Image
                      source={{ uri: profileImageUrl }}
                      style={[styles.avatar, styles.avatarImage]}
                      contentFit="cover"
                    />
                  ) : (
                    <View
                      style={[
                        styles.avatar,
                        { backgroundColor: theme.primary },
                      ]}
                    >
                      <Text
                        style={[
                          styles.avatarText,
                          { color: theme.primaryForeground },
                        ]}
                      >
                        {initials(
                          session?.user.name ?? session?.user.email ?? "HH",
                        )}
                      </Text>
                    </View>
                  )}
                  <View
                    style={[
                      styles.avatarBadge,
                      { backgroundColor: theme.backgroundElement },
                    ]}
                  >
                    {isUploadingPhoto ? (
                      <ActivityIndicator size={10} color={theme.primary} />
                    ) : (
                      <SymbolView
                        name={sym("camera.fill", "photo_camera")}
                        size={10}
                        weight="semibold"
                        tintColor={theme.primary}
                      />
                    )}
                  </View>
                </Pressable>
                <View style={styles.profileText}>
                  <Text style={[styles.profileName, { color: theme.text }]}>
                    {session?.user.name ?? "float account"}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.profileEmail,
                      { color: theme.textSecondary },
                    ]}
                  >
                    {session?.user.email ?? "Signed in"}
                  </Text>
                </View>
              </View>

              <SettingsGroup title="Preferences">
                <SettingsRow
                  icon={sym("paintpalette.fill", "palette")}
                  title="Appearance"
                  value={appearanceValue}
                  onPress={() => openSubmenu("appearance")}
                />
                <SettingsRow
                  icon={sym("bell.fill", "notifications")}
                  title="Notifications"
                  value="Manage"
                  onPress={() => openSubmenu("notifications")}
                />
                <SettingsRow
                  icon={sym("calendar.badge.plus", "event_available")}
                  title="Integrations"
                  value={googleCalendarValue}
                  onPress={() => openSubmenu("integrations")}
                />
                <SettingsRow
                  icon={sym("shield.lefthalf.filled", "shield")}
                  title="Safety & Support"
                  value="Help"
                  onPress={() => openSubmenu("support")}
                />
                <SettingsRow
                  icon={sym("person.crop.circle.fill", "account_circle")}
                  title="Account"
                  value="Manage"
                  onPress={() => openSubmenu("account")}
                />
              </SettingsGroup>
            </>
          ) : null}

          {activeSubmenu === "appearance" ? (
            <SettingsGroup title="Appearance">
              <SettingsRow
                icon={sym("paintpalette.fill", "palette")}
                title="Appearance"
                value={appearanceValue}
                onPress={chooseAppearance}
              />
              <ColorThemePickerRow
                value={colorTheme}
                onChange={chooseColorTheme}
              />
              <SettingsRow
                icon={sym("calendar.badge.clock", "event_note")}
                title="Plan default"
                value={getPlanReportDefaultLabel(
                  navigationDefaults.defaultPlanReportView,
                )}
                onPress={choosePlanReportDefault}
              />
              <SettingsRow
                icon={sym("person.2.fill", "groups")}
                title="Collab default"
                value={getCollabDefaultLabel(
                  navigationDefaults.defaultCollabSection,
                )}
                onPress={chooseCollabDefault}
              />
              <SettingsRow
                icon={sym("house.fill", "home")}
                title="App start page"
                value={getAppStartDefaultLabel(
                  navigationDefaults.defaultAppStartPage,
                )}
                onPress={chooseAppStartDefault}
              />
            </SettingsGroup>
          ) : null}

          {activeSubmenu === "notifications" ? (
            <SettingsGroup title="Notifications">
              <SettingsRow
                icon={sym("bell.badge.fill", "notifications_active")}
                title="Enable device notifications"
                value={isRegisteringNotifications ? "Enabling" : "Enable"}
                onPress={
                  isRegisteringNotifications
                    ? undefined
                    : () => void enableDeviceNotifications()
                }
              />
              <SettingsRow
                icon={sym("bell.fill", "notifications")}
                title="Notifications"
                value="Manage"
                onPress={() => {
                  playSelectionHaptic();
                  setShowNotifications(true);
                }}
              />
              <SettingsRow
                icon={sym("paperplane.fill", "send")}
                title="Test notification"
                value={isSendingTestNotification ? "Sending" : "Send"}
                onPress={
                  isSendingTestNotification
                    ? undefined
                    : () => void sendTestNotification()
                }
              />
            </SettingsGroup>
          ) : null}

          {activeSubmenu === "integrations" ? (
            <SettingsGroup title="Integrations">
              <SettingsRow
                icon={sym("calendar.badge.plus", "event_available")}
                title="Google Calendar"
                value={googleCalendarValue}
                onPress={
                  googleCalendarStatus?.configured && !isGoogleConnecting
                    ? () => void connectGoogleCalendar()
                    : undefined
                }
              />
            </SettingsGroup>
          ) : null}

          {activeSubmenu === "support" ? (
            <SettingsGroup title="Safety & Support">
              <SettingsRow
                icon={sym("exclamationmark.bubble.fill", "report")}
                title="Report a concern"
                value="Send"
                onPress={() => void reportSafetyConcern()}
              />
              <SettingsRow
                icon={sym("shield.lefthalf.filled", "shield")}
                title="Community Standards"
                value="View"
                onPress={showCommunityStandards}
              />
              <SettingsRow
                icon={sym("lock.shield.fill", "lock")}
                title="Privacy Summary"
                value="View"
                onPress={showPrivacySummary}
              />
              <SettingsRow
                icon={sym("doc.text.fill", "article")}
                title="Privacy Policy"
                value="Open"
                onPress={openPrivacyPolicy}
              />
              <SettingsRow
                icon={sym("envelope.fill", "mail")}
                title="Contact support"
                value="Email"
                onPress={contactSupport}
              />
            </SettingsGroup>
          ) : null}

          {activeSubmenu === "account" ? (
            <SettingsGroup title="Account">
              <Pressable
                accessibilityRole="button"
                disabled={isSigningOut || isDeletingAccount}
                onPress={confirmSignOut}
                style={({ pressed }) => [
                  styles.signOutRow,
                  { borderBottomColor: theme.tabBorder },
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={sym("rectangle.portrait.and.arrow.right", "logout")}
                  size={20}
                  weight="semibold"
                  tintColor="#B4232C"
                />
                <Text style={styles.signOutText}>Sign Out</Text>
                {isSigningOut ? (
                  <ActivityIndicator color="#B4232C" size="small" />
                ) : null}
              </Pressable>
              <Pressable
                accessibilityRole="button"
                disabled={isSigningOut || isDeletingAccount}
                onPress={confirmDeleteAccount}
                style={({ pressed }) => [
                  styles.deleteAccountRow,
                  pressed && styles.pressed,
                ]}
              >
                <SymbolView
                  name={sym("trash.fill", "delete")}
                  size={20}
                  weight="semibold"
                  tintColor="#B4232C"
                />
                <View style={styles.deleteAccountText}>
                  <Text style={styles.deleteAccountTitle}>Delete Account</Text>
                  <Text
                    style={[
                      styles.deleteAccountDescription,
                      { color: theme.textSecondary },
                    ]}
                  >
                    Permanently remove your account and data
                  </Text>
                </View>
                {isDeletingAccount ? (
                  <ActivityIndicator color="#B4232C" size="small" />
                ) : null}
              </Pressable>
            </SettingsGroup>
          ) : null}
          <View style={styles.brandFooter}>
            <Image
              source={abiLogoSource}
              style={styles.brandFooterLogo}
              contentFit="contain"
            />
            <Text
              style={[styles.brandFooterText, { color: theme.textSecondary }]}
            >
              float
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>

      <NotificationSettingsModal
        visible={showNotifications}
        onClose={() => setShowNotifications(false)}
      />
    </View>
  );
}

function ColorThemePickerRow({
  onChange,
  value,
}: {
  onChange: (value: ColorThemePreference) => void;
  value: ColorThemePreference;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.colorRow, { borderBottomColor: theme.tabBorder }]}>
      <SymbolView
        name={sym("swatchpalette.fill", "palette")}
        size={20}
        weight="semibold"
        tintColor={theme.primary}
      />
      <View style={styles.colorRowText}>
        <Text style={[styles.rowTitle, { color: theme.text }]}>Colors</Text>
        <Text style={[styles.colorRowValue, { color: theme.textSecondary }]}>
          {ColorThemeOptions[value].label}
        </Text>
      </View>
      <View style={styles.colorSwatches}>
        {ColorThemeOrder.map((optionKey) => {
          const option = ColorThemeOptions[optionKey];
          const selected = optionKey === value;

          return (
            <Pressable
              accessibilityLabel={`Use ${option.label} colors`}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={optionKey}
              onPress={() => onChange(optionKey)}
              style={({ pressed }) => [
                styles.colorSwatchButton,
                {
                  borderColor: selected ? theme.text : theme.tabBorder,
                },
                pressed && styles.pressed,
              ]}
            >
              <View
                style={[
                  styles.colorSwatchHalf,
                  {
                    backgroundColor: option.colors.primary,
                    borderTopLeftRadius: 999,
                    borderBottomLeftRadius: 999,
                  },
                ]}
              />
              <View
                style={[
                  styles.colorSwatchHalf,
                  {
                    backgroundColor: option.colors.secondary,
                    borderTopRightRadius: 999,
                    borderBottomRightRadius: 999,
                  },
                ]}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function pickNavigationDefaults(settings: UserSettings): NavigationDefaults {
  return {
    defaultAppStartPage: settings.defaultAppStartPage,
    defaultCollabSection: settings.defaultCollabSection,
    defaultPlanReportView: settings.defaultPlanReportView,
  };
}

function getPlanReportDefaultLabel(value: PlanReportView): string {
  return (
    PLAN_REPORT_DEFAULT_OPTIONS.find((option) => option.value === value)
      ?.label ?? "Daily Plan"
  );
}

function getCollabDefaultLabel(value: CollabSection): string {
  return (
    COLLAB_DEFAULT_OPTIONS.find((option) => option.value === value)?.label ??
    "Shared Goals"
  );
}

function getAppStartDefaultLabel(value: AppStartPage): string {
  return (
    APP_START_DEFAULT_OPTIONS.find((option) => option.value === value)?.label ??
    (value === "journal" || value === "dashboard" ? "Profile" : "Collab")
  );
}

function SettingsGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <View style={styles.group}>
      <Text style={[styles.groupTitle, { color: theme.textSecondary }]}>
        {title}
      </Text>
      <View
        style={[
          styles.groupCard,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.tabBorder,
          },
        ]}
      >
        {children}
      </View>
    </View>
  );
}

function SettingsRow({
  icon,
  onPress,
  title,
  value,
}: {
  icon: SymbolName;
  onPress?: () => void;
  title: string;
  value: string;
}) {
  const theme = useTheme();
  const content = (
    <>
      <SymbolView
        name={icon}
        size={20}
        weight="semibold"
        tintColor={theme.primary}
      />
      <Text style={[styles.rowTitle, { color: theme.text }]}>{title}</Text>
      <Text style={[styles.rowValue, { color: theme.textSecondary }]}>
        {value}
      </Text>
      {onPress ? (
        <SymbolView
          name={sym("chevron.right", "chevron_right")}
          size={13}
          weight="semibold"
          tintColor={theme.textSecondary}
        />
      ) : null}
    </>
  );

  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: theme.tabBorder },
        pressed && styles.pressed,
      ]}
    >
      {content}
    </Pressable>
  ) : (
    <View style={[styles.row, { borderBottomColor: theme.tabBorder }]}>
      {content}
    </View>
  );
}

function initials(value: string): string {
  return (
    value
      .trim()
      .split(/\s+/)
      .map((part) => part[0])
      .join("")
      .slice(0, 2)
      .toUpperCase() || "HH"
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 40,
    gap: 24,
  },
  pageHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
  },
  backButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
  },
  pageHeaderIcon: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  pageHeaderText: { flex: 1, gap: 1 },
  pageTitle: {
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  pageSubtitle: { fontSize: 13, lineHeight: 18, fontWeight: "500" },
  profileCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 16,
  },
  avatarWrapper: {
    position: "relative",
  },
  avatar: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  avatarImage: {
    borderRadius: 18,
  },
  avatarBadge: {
    position: "absolute",
    bottom: -4,
    right: -4,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1.5,
    borderColor: "rgba(0,0,0,0.08)",
  },
  avatarText: { fontSize: 18, fontWeight: "800" },
  profileText: { flex: 1, gap: 2 },
  profileName: { fontSize: 18, fontWeight: "700" },
  profileEmail: { fontSize: 14, fontWeight: "500" },
  group: { gap: 8 },
  groupTitle: {
    paddingHorizontal: 4,
    fontSize: 12,
    fontWeight: "800",
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  groupCard: {
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
  },
  row: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  rowTitle: { flex: 1, fontSize: 16, fontWeight: "600" },
  rowValue: { fontSize: 14, fontWeight: "500" },
  colorRow: {
    minHeight: 70,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  colorRowText: { flex: 1, gap: 2 },
  colorRowValue: { fontSize: 13, fontWeight: "600" },
  colorSwatches: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  colorSwatchButton: {
    width: 34,
    height: 34,
    flexDirection: "row",
    overflow: "hidden",
    borderWidth: 2,
    borderRadius: 17,
  },
  colorSwatchHalf: { flex: 1 },
  signOutRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  signOutText: { flex: 1, color: "#B4232C", fontSize: 16, fontWeight: "700" },
  deleteAccountRow: {
    minHeight: 64,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  deleteAccountText: { flex: 1, gap: 2 },
  deleteAccountTitle: { color: "#B4232C", fontSize: 16, fontWeight: "700" },
  deleteAccountDescription: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "600",
  },
  brandFooter: {
    alignItems: "center",
    gap: 2,
    paddingTop: 6,
    paddingBottom: 18,
  },
  brandFooterLogo: {
    width: 48,
    height: 48,
  },
  brandFooterText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    letterSpacing: 0.8,
  },
  pressed: { opacity: 0.6 },
});
