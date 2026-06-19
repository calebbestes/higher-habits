import { Image } from "expo-image";
import { SaveFormat, manipulateAsync } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { forwardRef, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { MaxContentWidth } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { authClient } from "@/lib/auth-client";
import { uploadProfilePicture } from "@/lib/profile-picture-client";

type AuthFormScreenProps = {
  mode: "login" | "sign-up";
};

export function AuthFormScreen({ mode }: AuthFormScreenProps) {
  const router = useRouter();
  const theme = useTheme();
  const { data: session, refetch: refetchSession } = authClient.useSession();
  const passwordInput = useRef<TextInput>(null);
  const emailInput = useRef<TextInput>(null);
  const phoneInput = useRef<TextInput>(null);
  const [name, setName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [profilePicture, setProfilePicture] = useState<{
    uri: string;
    dataUrl: string;
  } | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPickingPhoto, setIsPickingPhoto] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGoogleSubmitting, setIsGoogleSubmitting] = useState(false);
  const [shouldEnterApp, setShouldEnterApp] = useState(false);
  const isSignUp = mode === "sign-up";
  const canSubmit =
    email.trim().length > 0 &&
    password.length > 0 &&
    (!isSignUp ||
      (name.trim().length > 0 &&
        phoneNumber.replace(/\D/g, "").length >= 10 &&
        profilePicture !== null));

  useEffect(() => {
    if (shouldEnterApp && session) {
      router.replace("/");
    }
  }, [router, session, shouldEnterApp]);

  const pickProfilePicture = async () => {
    setError(null);
    setIsPickingPhoto(true);

    try {
      const permission =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError("Photo access is required to choose a profile picture.");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;

      const image = await manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 512, height: 512 } }],
        {
          base64: true,
          compress: 0.7,
          format: SaveFormat.JPEG,
        },
      );
      if (!image.base64) {
        setError("Could not prepare that profile picture.");
        return;
      }

      setProfilePicture({
        uri: image.uri,
        dataUrl: `data:image/jpeg;base64,${image.base64}`,
      });
    } catch {
      setError("Could not choose that profile picture.");
    } finally {
      setIsPickingPhoto(false);
    }
  };

  const submit = async () => {
    if (!canSubmit || isSubmitting || isGoogleSubmitting) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const response = isSignUp
        ? await authClient.signUp.email({
            name: name.trim(),
            phoneNumber: phoneNumber.trim(),
            email: email.trim(),
            password,
            image: profilePicture?.dataUrl,
          } as Parameters<typeof authClient.signUp.email>[0] & {
            phoneNumber: string;
          })
        : await authClient.signIn.email({
            email: email.trim(),
            password,
          });

      if (response.error) {
        setError(response.error.message ?? "Unable to continue.");
        return;
      }

      if (isSignUp && profilePicture) {
        await uploadProfilePicture(profilePicture.uri).catch(() => undefined);
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
      setIsSubmitting(false);
    }
  };

  const continueWithGoogle = async () => {
    if (isSubmitting || isGoogleSubmitting) return;

    setError(null);
    setIsGoogleSubmitting(true);

    try {
      const response = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
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
      <View style={[styles.glow, styles.glowTeal]} />
      <View style={[styles.glow, styles.glowBlush]} />
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.keyboardView}
        >
          <ScrollView
            bounces={false}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.content}>
              <View style={styles.brand}>
                <View
                  style={[
                    styles.brandMark,
                    {
                      backgroundColor: theme.primary,
                      borderColor: theme.tabBorder,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.brandLetter,
                      { color: theme.primaryForeground },
                    ]}
                  >
                    H
                  </Text>
                </View>
                <Text style={[styles.brandName, { color: theme.text }]}>
                  Higher Habits
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
                      ? "Keep your goals, categories, and progress together."
                      : "Sign in to get back to your goals and calendar."}
                  </Text>
                </View>

                <View style={styles.form}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={isSubmitting || isGoogleSubmitting}
                    onPress={() => void continueWithGoogle()}
                    style={({ pressed }) => [
                      styles.googleButton,
                      {
                        backgroundColor: theme.backgroundElement,
                        borderColor: theme.tabBorder,
                      },
                      (isSubmitting || isGoogleSubmitting) && styles.disabled,
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
                            style={[
                              styles.googleMarkText,
                              { color: theme.primary },
                            ]}
                          >
                            G
                          </Text>
                        </View>
                        <Text
                          style={[styles.googleLabel, { color: theme.text }]}
                        >
                          Continue with Google
                        </Text>
                      </>
                    )}
                  </Pressable>

                  <View style={styles.dividerRow}>
                    <View
                      style={[
                        styles.dividerLine,
                        { backgroundColor: theme.tabBorder },
                      ]}
                    />
                    <Text
                      style={[
                        styles.dividerText,
                        { color: theme.textSecondary },
                      ]}
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

                  {isSignUp ? (
                    <>
                      <Pressable
                        accessibilityLabel={
                          profilePicture
                            ? "Change profile picture"
                            : "Choose profile picture"
                        }
                        accessibilityRole="button"
                        disabled={isPickingPhoto}
                        onPress={() => void pickProfilePicture()}
                        style={({ pressed }) => [
                          styles.photoPicker,
                          {
                            backgroundColor: theme.backgroundElement,
                            borderColor: profilePicture
                              ? theme.primary
                              : theme.tabBorder,
                          },
                          pressed && styles.pressed,
                        ]}
                      >
                        {profilePicture ? (
                          <Image
                            contentFit="cover"
                            source={{ uri: profilePicture.uri }}
                            style={styles.photoPreview}
                          />
                        ) : (
                          <View
                            style={[
                              styles.photoPlaceholder,
                              { backgroundColor: theme.backgroundSelected },
                            ]}
                          >
                            {isPickingPhoto ? (
                              <ActivityIndicator color={theme.primary} />
                            ) : (
                              <SymbolView
                                name={{
                                  ios: "camera.fill",
                                  android: "photo_camera",
                                  web: "photo_camera",
                                }}
                                size={24}
                                tintColor={theme.primary}
                              />
                            )}
                          </View>
                        )}
                        <View style={styles.photoPickerText}>
                          <Text
                            style={[styles.photoTitle, { color: theme.text }]}
                          >
                            Profile picture
                          </Text>
                          <Text
                            style={[
                              styles.photoSubtitle,
                              { color: theme.textSecondary },
                            ]}
                          >
                            {profilePicture
                              ? "Tap to choose a different photo"
                              : "Required to create your profile"}
                          </Text>
                        </View>
                      </Pressable>
                      <AuthInput
                        label="Name"
                        value={name}
                        onChangeText={setName}
                        autoCapitalize="words"
                        autoComplete="name"
                        textContentType="name"
                        returnKeyType="next"
                        onSubmitEditing={() => phoneInput.current?.focus()}
                      />
                      <AuthInput
                        ref={phoneInput}
                        label="Phone number"
                        value={phoneNumber}
                        onChangeText={setPhoneNumber}
                        autoComplete="tel"
                        keyboardType="phone-pad"
                        textContentType="telephoneNumber"
                        returnKeyType="next"
                        onSubmitEditing={() => emailInput.current?.focus()}
                      />
                    </>
                  ) : null}
                  <AuthInput
                    ref={emailInput}
                    label="Email"
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoComplete="email"
                    autoCorrect={false}
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordInput.current?.focus()}
                  />
                  <View style={styles.passwordField}>
                    <AuthInput
                      ref={passwordInput}
                      label="Password"
                      value={password}
                      onChangeText={setPassword}
                      autoCapitalize="none"
                      autoComplete={
                        isSignUp ? "new-password" : "current-password"
                      }
                      autoCorrect={false}
                      secureTextEntry={!showPassword}
                      textContentType={isSignUp ? "newPassword" : "password"}
                      returnKeyType="done"
                      onSubmitEditing={submit}
                    />
                    <Pressable
                      accessibilityLabel={
                        showPassword ? "Hide password" : "Show password"
                      }
                      accessibilityRole="button"
                      hitSlop={10}
                      onPress={() => setShowPassword((current) => !current)}
                      style={({ pressed }) => [
                        styles.passwordToggle,
                        pressed && styles.pressed,
                      ]}
                    >
                      <SymbolView
                        name={{
                          ios: showPassword ? "eye.slash" : "eye",
                          android: showPassword
                            ? "visibility_off"
                            : "visibility",
                          web: showPassword ? "visibility_off" : "visibility",
                        }}
                        size={20}
                        tintColor={theme.textSecondary}
                      />
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
                    accessibilityRole="button"
                    disabled={!canSubmit || isSubmitting || isGoogleSubmitting}
                    onPress={submit}
                    style={({ pressed }) => [
                      styles.submitButton,
                      { backgroundColor: theme.primary },
                      (!canSubmit || isSubmitting || isGoogleSubmitting) &&
                        styles.disabled,
                      pressed && canSubmit && styles.pressed,
                    ]}
                  >
                    {isSubmitting ? (
                      <ActivityIndicator color={theme.primaryForeground} />
                    ) : (
                      <Text
                        style={[
                          styles.submitLabel,
                          { color: theme.primaryForeground },
                        ]}
                      >
                        {isSignUp ? "Create account" : "Sign in"}
                      </Text>
                    )}
                  </Pressable>
                </View>

                <View style={styles.footer}>
                  <Text
                    style={[styles.footerText, { color: theme.textSecondary }]}
                  >
                    {isSignUp ? "Already have an account?" : "Need an account?"}
                  </Text>
                  <Pressable
                    accessibilityRole="link"
                    onPress={() =>
                      router.replace(isSignUp ? "/login" : "/sign-up")
                    }
                    style={({ pressed }) => pressed && styles.pressed}
                  >
                    <Text style={[styles.footerLink, { color: theme.primary }]}>
                      {isSignUp ? "Sign in" : "Create one"}
                    </Text>
                  </Pressable>
                </View>
              </View>

              <Text style={[styles.privacy, { color: theme.textSecondary }]}>
                Your progress stays private and securely tied to your account.
              </Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const AuthInput = forwardRef<
  TextInput,
  TextInputProps & {
    label: string;
  }
>(function AuthInput({ label, style, ...props }, ref) {
  const theme = useTheme();

  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
      <TextInput
        ref={ref}
        placeholderTextColor={theme.textSecondary}
        selectionColor={theme.primary}
        style={[
          styles.input,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.tabBorder,
            color: theme.text,
          },
          style,
        ]}
        {...props}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    overflow: "hidden",
  },
  glow: {
    position: "absolute",
    width: 330,
    height: 330,
    borderRadius: 165,
    opacity: 0.13,
  },
  glowTeal: {
    top: -145,
    left: -125,
    backgroundColor: "#4F8884",
  },
  glowBlush: {
    right: -175,
    bottom: -90,
    backgroundColor: "#B68084",
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
  brandMark: {
    width: 58,
    height: 58,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
    shadowColor: "#2C5352",
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.22,
    shadowRadius: 14,
    elevation: 6,
  },
  brandLetter: {
    fontSize: 29,
    lineHeight: 34,
    fontWeight: "800",
  },
  brandName: {
    fontSize: 16,
    letterSpacing: 0.5,
    fontWeight: "800",
  },
  card: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 28,
    padding: 24,
    gap: 24,
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
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "800",
    letterSpacing: -0.8,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 22,
    fontWeight: "500",
  },
  form: {
    gap: 16,
  },
  googleButton: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 17,
    paddingHorizontal: 16,
  },
  googleMark: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
  },
  googleMarkText: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "900",
  },
  googleLabel: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
  },
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
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
  photoPicker: {
    minHeight: 82,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    padding: 12,
  },
  photoPreview: {
    width: 56,
    height: 56,
    borderRadius: 18,
  },
  photoPlaceholder: {
    width: 56,
    height: 56,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 18,
  },
  photoPickerText: {
    minWidth: 0,
    flex: 1,
    gap: 2,
  },
  photoTitle: {
    fontSize: 15,
    lineHeight: 19,
    fontWeight: "700",
  },
  photoSubtitle: {
    fontSize: 12,
    lineHeight: 17,
    fontWeight: "500",
  },
  field: {
    gap: 7,
  },
  label: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  },
  input: {
    minHeight: 54,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 16,
    paddingHorizontal: 16,
    fontSize: 16,
    fontWeight: "500",
  },
  passwordField: {
    position: "relative",
  },
  passwordToggle: {
    position: "absolute",
    right: 16,
    bottom: 17,
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
  submitButton: {
    minHeight: 54,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 17,
    marginTop: 2,
    shadowColor: "#2C5352",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 4,
  },
  submitLabel: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: "800",
  },
  footer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  footerText: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "500",
  },
  footerLink: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: "800",
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
