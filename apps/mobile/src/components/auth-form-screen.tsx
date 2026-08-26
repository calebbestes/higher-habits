import { Image } from "expo-image";
import * as ImageManipulator from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
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
import { updateAccountProfile } from "@/lib/account-client";
import {
  authClient,
  fetchMobileSession,
  useMobileSession,
} from "@/lib/auth-client";
import {
  getNativeAuthCallbackURL,
  getNativeAuthErrorCallbackURL,
} from "@/lib/native-auth-callback";
import { uploadProfilePicture } from "@/lib/profile-picture-client";
import { updateUserSettings } from "@/lib/user-settings-client";

type AuthFormScreenProps = {
  mode: "login" | "sign-up";
};

type SocialProvider = "apple" | "google";

type SignUpFields = {
  birthday: string | null;
  firstName: string;
  lastName: string;
  phoneNumber: string;
  profilePhotoUri: string | null;
};

const AUTH_INPUT_ACCESSORY_ID = "auth-input-accessory";

function getMissingSignUpFields(fields: SignUpFields) {
  return [
    fields.firstName.trim() ? null : "first name",
    fields.lastName.trim() ? null : "last name",
    fields.phoneNumber.trim() ? null : "phone number",
    fields.birthday ? null : "birthday",
    fields.profilePhotoUri ? null : "profile photo",
  ].filter((field): field is string => field !== null);
}

function formatMissingFields(fields: string[]) {
  if (fields.length === 1) return `Add your ${fields[0]} first.`;

  const lastField = fields.at(-1);
  return `Add your ${fields.slice(0, -1).join(", ")}, and ${lastField} first.`;
}

async function imageToDataUrl(uri: string) {
  const image = await ImageManipulator.manipulateAsync(
    uri,
    [{ resize: { width: 512 } }],
    {
      base64: true,
      compress: 0.72,
      format: ImageManipulator.SaveFormat.JPEG,
    },
  );

  if (!image.base64) {
    throw new Error("Could not prepare profile photo.");
  }

  return `data:image/jpeg;base64,${image.base64}`;
}

export function AuthFormScreen({ mode }: AuthFormScreenProps) {
  const router = useRouter();
  const theme = useTheme();
  const { data: session } = useMobileSession();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [birthday, setBirthday] = useState<string | null>(null);
  const [profilePhotoDataUrl, setProfilePhotoDataUrl] = useState<string | null>(
    null,
  );
  const [profilePhotoUri, setProfilePhotoUri] = useState<string | null>(null);
  const [isPreparingPhoto, setIsPreparingPhoto] = useState(false);
  const [submitting, setSubmitting] = useState<SocialProvider | "email" | null>(
    null,
  );
  const [shouldEnterApp, setShouldEnterApp] = useState(false);

  const isSignUp = mode === "sign-up";
  const isSubmitting = submitting !== null;
  const signUpFields = {
    birthday,
    firstName,
    lastName,
    phoneNumber,
    profilePhotoUri,
  };
  const missingSignUpFields = isSignUp
    ? getMissingSignUpFields(signUpFields)
    : [];

  const validateSignUp = () => {
    if (missingSignUpFields.length === 0) return true;

    setError(formatMissingFields(missingSignUpFields));
    return false;
  };

  useEffect(() => {
    if (shouldEnterApp && session) {
      router.replace("/");
    }
  }, [router, session, shouldEnterApp]);

  const enterApp = async () => {
    if (isSignUp && !validateSignUp()) {
      setShouldEnterApp(false);
      return;
    }

    const sessionResponse = await fetchMobileSession({ force: true });
    if (!sessionResponse.data) {
      setShouldEnterApp(false);
      setError(
        "Signed in, but the session could not be saved. Please try again.",
      );
      return;
    }

    if (isSignUp) {
      await updateAccountProfile({
        birthday: birthday as string,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        phoneNumber: phoneNumber.trim(),
      });
      await uploadProfilePicture(profilePhotoUri as string);
      await updateUserSettings({ onboardingCompleted: true });
    }

    setShouldEnterApp(true);
  };

  const continueWithSocial = async (provider: SocialProvider) => {
    if (isSubmitting || isPreparingPhoto) return;
    if (isSignUp && !validateSignUp()) return;

    setError(null);
    setSubmitting(provider);

    try {
      const response = await authClient.signIn.social({
        provider,
        callbackURL: getNativeAuthCallbackURL(),
        errorCallbackURL: getNativeAuthErrorCallbackURL(),
      });

      if (response.error) {
        setError(
          response.error.message ??
            `Unable to continue with ${provider === "apple" ? "Apple" : "Google"}.`,
        );
        return;
      }

      await enterApp();
    } catch {
      setShouldEnterApp(false);
      setError(
        "Could not reach the auth server. Check EXPO_PUBLIC_AUTH_URL and try again.",
      );
    } finally {
      setSubmitting(null);
    }
  };

  const chooseProfilePhoto = async () => {
    if (isSubmitting || isPreparingPhoto) return;
    setIsPreparingPhoto(true);
    try {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission required",
          "Allow photo access in Settings to choose your profile photo.",
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

      setError(null);
      const uri = result.assets[0].uri;
      const dataUrl = await imageToDataUrl(uri);
      setProfilePhotoUri(uri);
      setProfilePhotoDataUrl(dataUrl);
    } catch (photoError) {
      setProfilePhotoUri(null);
      setProfilePhotoDataUrl(null);
      setError(
        photoError instanceof Error
          ? photoError.message
          : "Could not prepare that profile photo.",
      );
    } finally {
      setIsPreparingPhoto(false);
    }
  };

  const submitEmail = async () => {
    if (isSubmitting || isPreparingPhoto) return;
    if (isSignUp && !validateSignUp()) return;

    setError(null);
    setSubmitting("email");

    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`;
      const response = isSignUp
        ? await authClient.signUp.email({
            name: fullName,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            phoneNumber: phoneNumber.trim(),
            birthday,
            email: email.trim(),
            password,
            image: profilePhotoDataUrl ?? undefined,
          } as Parameters<typeof authClient.signUp.email>[0] & {
            birthday?: string | null;
            firstName?: string;
            lastName?: string;
            phoneNumber?: string;
          })
        : await authClient.signIn.email({
            email: email.trim(),
            password,
          });

      if (response.error) {
        setError(response.error.message ?? "Unable to continue.");
        return;
      }

      await enterApp();
    } catch {
      setShouldEnterApp(false);
      setError(
        "Could not reach the auth server. Check EXPO_PUBLIC_AUTH_URL and try again.",
      );
    } finally {
      setSubmitting(null);
    }
  };

  const canSubmitEmail =
    email.trim().length > 0 &&
    password.length > 0 &&
    (!isSignUp || (missingSignUpFields.length === 0 && !isPreparingPhoto));

  return (
    <View style={[styles.screen, { backgroundColor: theme.background }]}>
      <Image
        contentFit="contain"
        source={require("@/assets/images/abi-logo-no-background.png")}
        style={styles.backgroundLogo}
      />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? 8 : 0}
          style={styles.keyboardView}
        >
          <ScrollView
            bounces={false}
            canCancelContentTouches
            contentContainerStyle={styles.scrollContent}
            keyboardDismissMode={
              Platform.OS === "ios" ? "interactive" : "on-drag"
            }
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.content}>
              <View style={styles.brand}>
                <Image
                  contentFit="contain"
                  source={require("@/assets/images/abi-logo-no-background.png")}
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
                    {isSignUp ? "Create your account" : "Welcome back"}
                  </Text>
                  <Text
                    style={[styles.subtitle, { color: theme.textSecondary }]}
                  >
                    {isSignUp
                      ? "Keep your plans, goals, and proof synced across devices."
                      : "Sign in to get back to your goals and calendar."}
                  </Text>
                </View>

                <View style={styles.socialStack}>
                  <AuthButton
                    disabled={isSubmitting || isPreparingPhoto}
                    iconColor="#111111"
                    isLoading={submitting === "apple"}
                    label="Continue with Apple"
                    mark="apple.logo"
                    onPress={() => void continueWithSocial("apple")}
                    theme={theme}
                  />
                  <AuthButton
                    disabled={isSubmitting || isPreparingPhoto}
                    iconColor={theme.primary}
                    isLoading={submitting === "google"}
                    label="Continue with Google"
                    mark="G"
                    onPress={() => void continueWithSocial("google")}
                    theme={theme}
                  />
                </View>

                <View style={styles.dividerRow}>
                  <View
                    style={[
                      styles.dividerLine,
                      { backgroundColor: theme.tabBorder },
                    ]}
                  />
                  <Text
                    style={[styles.dividerText, { color: theme.textSecondary }]}
                  >
                    or
                  </Text>
                  <View
                    style={[
                      styles.dividerLine,
                      { backgroundColor: theme.tabBorder },
                    ]}
                  />
                </View>

                <View style={styles.form}>
                  {isSignUp ? (
                    <>
                      <Pressable
                        accessibilityRole="button"
                        disabled={isSubmitting || isPreparingPhoto}
                        onPress={() => void chooseProfilePhoto()}
                        style={({ pressed }) => [
                          styles.photoPicker,
                          {
                            backgroundColor: theme.backgroundElement,
                            borderColor: theme.tabBorder,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        {profilePhotoUri ? (
                          <Image
                            contentFit="cover"
                            source={{ uri: profilePhotoUri }}
                            style={styles.photoPreview}
                          />
                        ) : (
                          <View
                            style={[
                              styles.photoPlaceholder,
                              { backgroundColor: theme.tabBar },
                            ]}
                          >
                            <SymbolView
                              name={{
                                ios: "camera.fill",
                                android: "photo_camera",
                                web: "photo_camera",
                              }}
                              size={20}
                              tintColor={theme.primary}
                            />
                          </View>
                        )}
                        <View style={styles.photoText}>
                          <Text
                            style={[styles.photoTitle, { color: theme.text }]}
                          >
                            Profile photo
                          </Text>
                          <Text
                            style={[
                              styles.photoSubtitle,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {profilePhotoUri
                              ? "Choose a different photo"
                              : "Required"}
                          </Text>
                        </View>
                      </Pressable>

                      <View style={styles.nameRow}>
                        <View style={styles.nameInput}>
                          <AuthInput
                            autoComplete="given-name"
                            editable={!isSubmitting}
                            label="First name"
                            onChangeText={setFirstName}
                            theme={theme}
                            value={firstName}
                          />
                        </View>
                        <View style={styles.nameInput}>
                          <AuthInput
                            autoComplete="family-name"
                            editable={!isSubmitting}
                            label="Last name"
                            onChangeText={setLastName}
                            theme={theme}
                            value={lastName}
                          />
                        </View>
                      </View>
                      <AuthInput
                        autoComplete="tel"
                        editable={!isSubmitting}
                        keyboardType="phone-pad"
                        label="Phone number"
                        onChangeText={setPhoneNumber}
                        theme={theme}
                        value={phoneNumber}
                      />
                      <BirthdayPicker
                        disabled={isSubmitting}
                        onChange={setBirthday}
                        theme={theme}
                        value={birthday}
                      />
                    </>
                  ) : null}

                  <AuthInput
                    autoCapitalize="none"
                    autoComplete="email"
                    editable={!isSubmitting}
                    keyboardType="email-address"
                    label="Email"
                    onChangeText={setEmail}
                    theme={theme}
                    value={email}
                  />
                  <AuthInput
                    autoCapitalize="none"
                    autoComplete={
                      isSignUp ? "new-password" : "current-password"
                    }
                    editable={!isSubmitting}
                    label="Password"
                    onChangeText={setPassword}
                    onSubmitEditing={() => Keyboard.dismiss()}
                    returnKeyType="done"
                    secureTextEntry
                    theme={theme}
                    value={password}
                  />

                  <Pressable
                    accessibilityRole="button"
                    disabled={!canSubmitEmail || isSubmitting}
                    onPress={() => void submitEmail()}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      { backgroundColor: theme.primary },
                      (!canSubmitEmail || isSubmitting) && styles.disabled,
                      pressed && styles.pressed,
                    ]}
                  >
                    {submitting === "email" ? (
                      <ActivityIndicator color={theme.primaryForeground} />
                    ) : (
                      <Text
                        style={[
                          styles.primaryButtonText,
                          { color: theme.primaryForeground },
                        ]}
                      >
                        {isSignUp ? "Create account" : "Sign in"}
                      </Text>
                    )}
                  </Pressable>
                </View>

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

                <Pressable
                  accessibilityRole="link"
                  onPress={() =>
                    router.replace(isSignUp ? "/login" : "/sign-up")
                  }
                >
                  <Text
                    style={[styles.switchText, { color: theme.textSecondary }]}
                  >
                    {isSignUp ? "Already have an account?" : "Need an account?"}{" "}
                    <Text style={{ color: theme.primary }}>
                      {isSignUp ? "Sign in" : "Create one"}
                    </Text>
                  </Text>
                </Pressable>
              </View>

              <Text style={[styles.privacy, { color: theme.textSecondary }]}>
                Your progress stays private until you choose to share it.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
      {Platform.OS === "ios" ? (
        <InputAccessoryView nativeID={AUTH_INPUT_ACCESSORY_ID}>
          <View
            style={[
              styles.inputAccessory,
              {
                backgroundColor: theme.tabBar,
                borderTopColor: theme.tabBorder,
              },
            ]}
          >
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss keyboard"
              onPress={() => Keyboard.dismiss()}
              style={({ pressed }) => [pressed && styles.pressed]}
            >
              <Text
                style={[styles.inputAccessoryText, { color: theme.primary }]}
              >
                Done
              </Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      ) : null}
    </View>
  );
}

function BirthdayPicker({
  disabled,
  onChange,
  theme,
  value,
}: {
  disabled: boolean;
  onChange: (value: string | null) => void;
  theme: ReturnType<typeof useTheme>;
  value: string | null;
}) {
  return (
    <View style={[styles.inputGroup, disabled && styles.disabled]}>
      <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
        Birthday
      </Text>
      <DatePartPicker
        compact
        defaultValue="2000-01-01"
        onChange={onChange}
        value={value}
        yearMode="past"
      />
    </View>
  );
}

function AuthButton({
  disabled,
  iconColor,
  isLoading,
  label,
  mark,
  onPress,
  theme,
}: {
  disabled: boolean;
  iconColor: string;
  isLoading: boolean;
  label: string;
  mark: "apple.logo" | "G";
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.authButton,
        {
          backgroundColor: theme.backgroundElement,
          borderColor: theme.tabBorder,
        },
        disabled && styles.disabled,
        pressed && styles.pressed,
      ]}
    >
      {isLoading ? (
        <ActivityIndicator color={theme.primary} />
      ) : (
        <>
          <View style={[styles.authMark, { backgroundColor: theme.tabBar }]}>
            {mark === "apple.logo" ? (
              <SymbolView
                name={{
                  ios: "apple.logo",
                  android: "account_circle",
                  web: "account_circle",
                }}
                size={18}
                tintColor={iconColor}
              />
            ) : (
              <Text style={[styles.googleMarkText, { color: iconColor }]}>
                G
              </Text>
            )}
          </View>
          <Text style={[styles.authLabel, { color: theme.text }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

function AuthInput({
  label,
  theme,
  ...props
}: TextInput["props"] & {
  label: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={[styles.inputLabel, { color: theme.textSecondary }]}>
        {label}
      </Text>
      <TextInput
        {...props}
        inputAccessoryViewID={
          props.inputAccessoryViewID ?? AUTH_INPUT_ACCESSORY_ID
        }
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
  keyboardView: {
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
    gap: 20,
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
  socialStack: {
    gap: 10,
  },
  authButton: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 11,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 16,
  },
  authMark: {
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
  authLabel: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: "900",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  form: {
    gap: 12,
  },
  photoPicker: {
    minHeight: 72,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 10,
  },
  photoPreview: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  photoPlaceholder: {
    width: 52,
    height: 52,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 14,
  },
  photoText: {
    flex: 1,
    gap: 2,
  },
  photoTitle: {
    fontSize: 15,
    lineHeight: 20,
    fontWeight: "900",
  },
  photoSubtitle: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "600",
  },
  inputGroup: {
    gap: 6,
  },
  nameRow: {
    flexDirection: "row",
    gap: 10,
  },
  nameInput: {
    flex: 1,
    minWidth: 0,
  },
  inputLabel: {
    paddingHorizontal: 2,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: "800",
    textTransform: "uppercase",
  },
  input: {
    minHeight: 52,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 14,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
  primaryButton: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
    paddingHorizontal: 16,
  },
  primaryButtonText: {
    fontSize: 16,
    lineHeight: 21,
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
  inputAccessory: {
    minHeight: 42,
    alignItems: "flex-end",
    justifyContent: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  inputAccessoryText: {
    fontSize: 16,
    lineHeight: 21,
    fontWeight: "800",
  },
  switchText: {
    textAlign: "center",
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "700",
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
