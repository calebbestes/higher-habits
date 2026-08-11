import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { DatePartPicker } from "@/components/date-part-picker";
import { MaxContentWidth } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import {
  fetchAccountProfile,
  updateAccountProfile,
} from "@/lib/account-client";
import { useMobileSession } from "@/lib/auth-client";
import { uploadProfilePicture } from "@/lib/profile-picture-client";
import { updateUserSettings } from "@/lib/user-settings-client";

function splitName(value: string | null | undefined) {
  const [firstName = "", ...lastNameParts] = (value ?? "").trim().split(/\s+/);

  return { firstName, lastName: lastNameParts.join(" ") };
}

export function OnboardingScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { data: session } = useMobileSession();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [birthday, setBirthday] = useState<string | null>(null);
  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const providerPhotoUrl = session?.user.image ?? null;

  useEffect(() => {
    const fallbackName = splitName(session?.user.name);
    setFirstName(fallbackName.firstName);
    setLastName(fallbackName.lastName);

    void fetchAccountProfile()
      .then((profile) => {
        const profileName =
          profile.firstName || profile.lastName
            ? { firstName: profile.firstName, lastName: profile.lastName }
            : splitName(profile.name || session?.user.name);

        setFirstName(profileName.firstName);
        setLastName(profileName.lastName);
        setPhoneNumber(profile.phoneNumber ?? "");
        setBirthday(profile.birthday);
      })
      .catch(() => undefined);
  }, [session?.user.name]);

  const choosePhoto = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== "granted") {
      setError("Allow photo access to add your profile picture.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: true,
      aspect: [1, 1],
      mediaTypes: ["images"],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setPhotoUri(result.assets[0].uri);
      setError(null);
    }
  };

  const finishOnboarding = async () => {
    if (
      !firstName.trim() ||
      !lastName.trim() ||
      !phoneNumber.trim() ||
      !birthday ||
      (!photoUri && !providerPhotoUrl)
    ) {
      setError("Add your name, phone number, and birthday first.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      await updateAccountProfile({
        birthday,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: phoneNumber.trim(),
      });
      if (photoUri) {
        await uploadProfilePicture(photoUri);
      }
      await updateUserSettings({ onboardingCompleted: true });
      router.replace("/");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not finish setting up your profile.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.content}>
            <View style={styles.header}>
              <Text style={[styles.eyebrow, { color: theme.primary }]}>
                WELCOME TO FLOAT
              </Text>
              <Text style={[styles.title, { color: theme.text }]}>
                Finish your profile
              </Text>
              <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
                A few details help your friends recognize you and make the app
                work properly.
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
              <Pressable
                accessibilityLabel="Choose profile photo"
                accessibilityRole="button"
                disabled={isSaving}
                onPress={() => void choosePhoto()}
                style={({ pressed }) => [
                  styles.photoButton,
                  pressed && styles.pressed,
                ]}
              >
                {photoUri || providerPhotoUrl ? (
                  <Image
                    contentFit="cover"
                    source={{ uri: photoUri ?? providerPhotoUrl ?? undefined }}
                    style={styles.photo}
                  />
                ) : (
                  <View
                    style={[
                      styles.photoPlaceholder,
                      { backgroundColor: theme.backgroundElement },
                    ]}
                  >
                    <SymbolView
                      name={{
                        ios: "camera.fill",
                        android: "camera",
                        web: "camera",
                      }}
                      size={28}
                      tintColor={theme.primary}
                    />
                  </View>
                )}
                <Text style={[styles.photoLabel, { color: theme.primary }]}>
                  {photoUri
                    ? "Change profile photo"
                    : providerPhotoUrl
                      ? "Use a different photo"
                      : "Add profile photo"}
                </Text>
              </Pressable>

              <View style={styles.nameRow}>
                <ProfileInput
                  autoComplete="given-name"
                  editable={!isSaving}
                  label="First name"
                  onChangeText={setFirstName}
                  theme={theme}
                  value={firstName}
                />
                <ProfileInput
                  autoComplete="family-name"
                  editable={!isSaving}
                  label="Last name"
                  onChangeText={setLastName}
                  theme={theme}
                  value={lastName}
                />
              </View>

              <ProfileInput
                autoComplete="tel"
                editable={!isSaving}
                keyboardType="phone-pad"
                label="Phone number"
                onChangeText={setPhoneNumber}
                theme={theme}
                value={phoneNumber}
              />

              <View style={styles.birthdayBlock}>
                <Text style={[styles.fieldLabel, { color: theme.text }]}>
                  Birthday
                </Text>
                <Text
                  style={[styles.fieldHint, { color: theme.textSecondary }]}
                >
                  Shown to friends
                </Text>
                <DatePartPicker
                  defaultValue="2000-01-01"
                  onChange={setBirthday}
                  value={birthday}
                  yearMode="past"
                />
              </View>

              {error ? (
                <View style={styles.errorRow}>
                  <SymbolView
                    name={{
                      ios: "exclamationmark.circle.fill",
                      android: "error",
                      web: "error",
                    }}
                    size={18}
                    tintColor="#B84D54"
                  />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ) : null}

              <Pressable
                accessibilityRole="button"
                disabled={isSaving}
                onPress={() => void finishOnboarding()}
                style={({ pressed }) => [
                  styles.continueButton,
                  { backgroundColor: theme.primary },
                  pressed && styles.pressed,
                  isSaving && styles.disabled,
                ]}
              >
                {isSaving ? (
                  <ActivityIndicator color={theme.primaryForeground} />
                ) : (
                  <Text
                    style={[
                      styles.continueText,
                      { color: theme.primaryForeground },
                    ]}
                  >
                    Continue
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

function ProfileInput({
  label,
  theme,
  ...props
}: {
  autoComplete?: "family-name" | "given-name" | "tel";
  editable: boolean;
  keyboardType?: "default" | "phone-pad";
  label: string;
  onChangeText: (value: string) => void;
  theme: ReturnType<typeof useTheme>;
  value: string;
}) {
  return (
    <View style={styles.inputBlock}>
      <Text style={[styles.fieldLabel, { color: theme.text }]}>{label}</Text>
      <TextInput
        {...props}
        placeholder={label}
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.tabBorder,
            color: theme.text,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 40 },
  content: {
    alignSelf: "center",
    gap: 22,
    maxWidth: MaxContentWidth,
    width: "100%",
  },
  header: { gap: 8, paddingTop: 12 },
  eyebrow: { fontSize: 13, fontWeight: "800", letterSpacing: 1.3 },
  title: { fontSize: 34, fontWeight: "800", letterSpacing: -0.8 },
  subtitle: { fontSize: 17, lineHeight: 24 },
  card: {
    borderRadius: 24,
    borderWidth: StyleSheet.hairlineWidth,
    gap: 18,
    padding: 20,
  },
  photoButton: { alignItems: "center", gap: 9, paddingVertical: 4 },
  photo: { borderRadius: 48, height: 96, width: 96 },
  photoPlaceholder: {
    alignItems: "center",
    borderRadius: 48,
    height: 96,
    justifyContent: "center",
    width: 96,
  },
  photoLabel: { fontSize: 16, fontWeight: "700" },
  nameRow: { flexDirection: "row", gap: 12 },
  inputBlock: { flex: 1, gap: 7 },
  fieldLabel: { fontSize: 15, fontWeight: "700" },
  fieldHint: { fontSize: 13, marginTop: -2 },
  input: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 17,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  birthdayBlock: { gap: 7 },
  errorRow: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
  errorText: { color: "#B84D54", flex: 1, fontSize: 15, lineHeight: 21 },
  continueButton: {
    alignItems: "center",
    borderRadius: 16,
    minHeight: 54,
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  continueText: { fontSize: 17, fontWeight: "800" },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.78 },
});
