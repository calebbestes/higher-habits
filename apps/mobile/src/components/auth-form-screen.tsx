import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MaxContentWidth } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { authClient } from "@/lib/auth-client";

type AuthFormScreenProps = {
  mode: "login" | "sign-up";
};

export function AuthFormScreen({ mode: _mode }: AuthFormScreenProps) {
  const router = useRouter();
  const theme = useTheme();
  const { data: session, refetch: refetchSession } = authClient.useSession();
  const [error, setError] = useState<string | null>(null);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [shouldEnterApp, setShouldEnterApp] = useState(false);

  useEffect(() => {
    if (shouldEnterApp && session) {
      router.replace("/");
    }
  }, [router, session, shouldEnterApp]);

  const continueWithGoogle = async () => {
    if (isGoogleSubmitting) return;

    setError(null);
    setIsGoogleSubmitting(true);

    try {
      const response = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
        scopes: ["https://www.googleapis.com/auth/calendar.events"],
      });

      if (response.error) {
        setError(response.error.message ?? "Unable to continue with Google.");
        return;
      }

      await refetchSession();
      const sessionResponse = await authClient.getSession();
      if (!sessionResponse.data) {
        setShouldEnterApp(false);
        setError(
          "Signed in, but the session could not be saved. Please try again.",
        );
        return;
      }

      setShouldEnterApp(true);
    } catch {
      setShouldEnterApp(false);
      setError(
        "Could not reach the auth server. Check EXPO_PUBLIC_AUTH_URL and try again.",
      );
    } finally {
      setIsGoogleSubmitting(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Image
        contentFit="contain"
        source={require("../../assets/images/icon.png")}
        style={styles.backgroundLogo}
      />
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          bounces={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.brand}>
              <Image
                contentFit="contain"
                source={require("../../assets/images/icon.png")}
                style={styles.brandLogo}
              />
              <Text style={[styles.brandName, { color: theme.text }]}>
                float
              </Text>
            </View>

            <View
              style={[
                styles.card,
                {
                  backgroundColor: theme.tabBar,
                  borderColor: theme.tabBorder,
                },
              ]}
            >
              <View style={styles.heading}>
                <Text style={[styles.title, { color: theme.text }]}>
                  Welcome to float
                </Text>
                <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                  Plan what matters, sync it to Google Calendar, and capture
                  proof as you go.
                </Text>
              </View>

              <Pressable
                accessibilityRole="button"
                disabled={isGoogleSubmitting}
                onPress={() => void continueWithGoogle()}
                style={({ pressed }) => [
                  styles.googleButton,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderColor: theme.tabBorder,
                  },
                  isGoogleSubmitting && styles.disabled,
                  pressed && styles.pressed,
                ]}
              >
                {isGoogleSubmitting ? (
                  <ActivityIndicator color={theme.primary} />
                ) : (
                  <>
                    <View
                      style={[
                        styles.googleMark,
                        { backgroundColor: theme.tabBar },
                      ]}
                    >
                      <Text
                        style={[styles.googleMarkText, { color: theme.primary }]}
                      >
                        G
                      </Text>
                    </View>
                    <Text style={[styles.googleLabel, { color: theme.text }]}>
                      Continue with Google
                    </Text>
                  </>
                )}
              </Pressable>

              {error ? (
                <View style={styles.errorRow}>
                  <SymbolView
                    name={{
                      ios: "exclamationmark.circle.fill",
                      android: "error",
                      web: "error",
                    }}
                    size={17}
                    tintColor="#B84D54"
                  />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Text style={[styles.calendarNote, { color: theme.textSecondary }]}>
                Your Google profile photo becomes your float photo. Calendar
                access lets float keep plans in sync.
              </Text>
            </View>

            <Text style={[styles.privacy, { color: theme.textSecondary }]}>
              Your progress stays private until you choose to share it.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: "hidden",
  },
  backgroundLogo: {
    position: "absolute",
    width: 520,
    height: 520,
    top: -138,
    left: -166,
    opacity: 0.08,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: 22,
    paddingVertical: 36,
  },
  content: {
    width: "100%",
    maxWidth: Math.min(MaxContentWidth, 460),
    alignSelf: "center",
    gap: 24,
  },
  brand: {
    alignItems: "center",
    gap: 10,
  },
  brandLogo: {
    width: 82,
    height: 82,
  },
  brandName: {
    fontSize: 22,
    lineHeight: 27,
    fontWeight: "900",
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 28,
    padding: 24,
    gap: 22,
    shadowColor: "#2C5352",
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 28,
    elevation: 8,
  },
  heading: {
    gap: 8,
  },
  title: {
    fontSize: 33,
    lineHeight: 39,
    fontWeight: "900",
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "600",
  },
  googleButton: {
    minHeight: 58,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 16,
  },
  googleMark: {
    width: 29,
    height: 29,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 15,
  },
  googleMarkText: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "900",
  },
  googleLabel: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 7,
  },
  errorText: {
    flex: 1,
    color: "#B84D54",
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  calendarNote: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  privacy: {
    paddingHorizontal: 18,
    textAlign: "center",
    fontSize: 12,
    lineHeight: 18,
    fontWeight: "500",
  },
  disabled: {
    opacity: 0.42,
  },
  pressed: {
    opacity: 0.72,
  },
});
