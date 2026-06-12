import { useRouter } from "expo-router";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MaxContentWidth } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { authClient } from "@/lib/auth-client";

type SymbolName = SymbolViewProps["name"];

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

export function SettingsScreen() {
  const router = useRouter();
  const theme = useTheme();
  const colorScheme = useColorScheme();
  const { data: session } = authClient.useSession();
  const [isSigningOut, setIsSigningOut] = useState(false);

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

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView edges={["top", "left", "right"]} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.pageHeader}>
            <View style={styles.pageHeaderText}>
              <Text style={[styles.pageTitle, { color: theme.text }]}>
                Settings
              </Text>
              <Text
                style={[styles.pageSubtitle, { color: theme.textSecondary }]}
              >
                Account and app preferences
              </Text>
            </View>
          </View>

          <View
            style={[
              styles.profileCard,
              {
                backgroundColor: theme.backgroundElement,
                borderColor: theme.tabBorder,
              },
            ]}
          >
            <View style={[styles.avatar, { backgroundColor: theme.primary }]}>
              <Text
                style={[styles.avatarText, { color: theme.primaryForeground }]}
              >
                {initials(session?.user.name ?? session?.user.email ?? "HH")}
              </Text>
            </View>
            <View style={styles.profileText}>
              <Text style={[styles.profileName, { color: theme.text }]}>
                {session?.user.name ?? "Higher Habits account"}
              </Text>
              <Text
                numberOfLines={1}
                style={[styles.profileEmail, { color: theme.textSecondary }]}
              >
                {session?.user.email ?? "Signed in"}
              </Text>
            </View>
          </View>

          <SettingsGroup title="Preferences">
            <SettingsRow
              icon={sym("paintpalette.fill", "palette")}
              title="Appearance"
              value={colorScheme === "dark" ? "Dark" : "Light"}
            />
            <SettingsRow
              icon={sym("bell.fill", "notifications")}
              title="Notifications"
              value="System settings"
            />
          </SettingsGroup>

          <SettingsGroup title="Account">
            <Pressable
              accessibilityRole="button"
              disabled={isSigningOut}
              onPress={confirmSignOut}
              style={({ pressed }) => [
                styles.signOutRow,
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
          </SettingsGroup>
        </ScrollView>
      </SafeAreaView>
    </View>
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
  title,
  value,
}: {
  icon: SymbolName;
  title: string;
  value: string;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.row, { borderBottomColor: theme.tabBorder }]}>
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
  avatar: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
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
  signOutRow: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
  },
  signOutText: { flex: 1, color: "#B4232C", fontSize: 16, fontWeight: "700" },
  pressed: { opacity: 0.6 },
});
