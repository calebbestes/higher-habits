import * as Haptics from "expo-haptics";
import LottieView from "lottie-react-native";
import { type ComponentProps, useEffect, useRef } from "react";
import { Animated, Easing, Platform, StyleSheet, View } from "react-native";

type LottieSource = ComponentProps<typeof LottieView>["source"];

// Full-screen celebration animations. Swap these files for any licensed Lottie
// (same path/filename) to change the effect.
export const confettiSource: LottieSource = require("@/assets/animations/celebration.json");
export const fireSource: LottieSource = require("@/assets/animations/Fire.json");
const logoSource = require("@/assets/images/abi-logo-no-background.png");

// One impact, mapped to the closest feedback on each platform.
function fireImpact(
  iosStyle: Haptics.ImpactFeedbackStyle,
  androidHaptic: Haptics.AndroidHaptics,
) {
  if (Platform.OS === "android") {
    void Haptics.performAndroidHapticsAsync(androidHaptic).catch(() => {});
  } else {
    void Haptics.impactAsync(iosStyle).catch(() => {});
  }
}

// Confetti haptics: a strong initial pop, then a decaying train of taps that
// fades out like the confetti settling. Returns a cancel fn so pending taps are
// cleared if the celebration is dismissed early.
function playCelebrationHaptics(): () => void {
  // Initial pop.
  if (Platform.OS === "android") {
    void Haptics.performAndroidHapticsAsync(
      Haptics.AndroidHaptics.Confirm,
    ).catch(() => {});
  } else {
    void Haptics.notificationAsync(
      Haptics.NotificationFeedbackType.Success,
    ).catch(() => {});
  }

  // Persisting, decaying rumble.
  const steps: Array<{
    delay: number;
    ios: Haptics.ImpactFeedbackStyle;
    android: Haptics.AndroidHaptics;
  }> = [
    {
      delay: 130,
      ios: Haptics.ImpactFeedbackStyle.Heavy,
      android: Haptics.AndroidHaptics.Context_Click,
    },
    {
      delay: 260,
      ios: Haptics.ImpactFeedbackStyle.Medium,
      android: Haptics.AndroidHaptics.Context_Click,
    },
    {
      delay: 400,
      ios: Haptics.ImpactFeedbackStyle.Medium,
      android: Haptics.AndroidHaptics.Segment_Tick,
    },
    {
      delay: 550,
      ios: Haptics.ImpactFeedbackStyle.Light,
      android: Haptics.AndroidHaptics.Segment_Tick,
    },
    {
      delay: 710,
      ios: Haptics.ImpactFeedbackStyle.Light,
      android: Haptics.AndroidHaptics.Segment_Frequent_Tick,
    },
    {
      delay: 880,
      ios: Haptics.ImpactFeedbackStyle.Soft,
      android: Haptics.AndroidHaptics.Segment_Frequent_Tick,
    },
    {
      delay: 1060,
      ios: Haptics.ImpactFeedbackStyle.Soft,
      android: Haptics.AndroidHaptics.Segment_Frequent_Tick,
    },
  ];

  const timers = steps.map((step) =>
    setTimeout(() => fireImpact(step.ios, step.android), step.delay),
  );

  return () => {
    for (const timer of timers) clearTimeout(timer);
  };
}

export function CelebrationOverlay({
  visible,
  source,
  withLogo = false,
  withHaptics = true,
  onDone,
}: {
  visible: boolean;
  source: LottieSource;
  withLogo?: boolean;
  withHaptics?: boolean;
  onDone: () => void;
}) {
  const floatProgress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible || !withHaptics) return;
    return playCelebrationHaptics();
  }, [visible, withHaptics]);

  useEffect(() => {
    if (!visible || !withLogo) return;

    floatProgress.setValue(0);
    const animation = Animated.timing(floatProgress, {
      toValue: 1,
      duration: 1350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    animation.start();
    return () => animation.stop();
  }, [floatProgress, visible, withLogo]);

  if (!visible) return null;

  return (
    <View pointerEvents="none" style={styles.overlay}>
      <LottieView
        autoPlay
        loop={false}
        resizeMode="cover"
        source={source}
        style={styles.animation}
        onAnimationFinish={onDone}
      />
      {withLogo ? (
        <Animated.Image
          source={logoSource}
          style={[
            styles.logo,
            {
              opacity: floatProgress.interpolate({
                inputRange: [0, 0.15, 0.82, 1],
                outputRange: [0, 1, 1, 0],
              }),
              transform: [
                {
                  translateY: floatProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [260, -380],
                  }),
                },
                {
                  scale: floatProgress.interpolate({
                    inputRange: [0, 0.2, 1],
                    outputRange: [0.72, 1, 0.88],
                  }),
                },
                {
                  rotate: floatProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: ["-5deg", "8deg"],
                  }),
                },
              ],
            },
          ]}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 100,
    elevation: 100,
  },
  animation: {
    width: "100%",
    height: "100%",
  },
  logo: {
    position: "absolute",
    width: 104,
    height: 104,
  },
});
