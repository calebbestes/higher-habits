import { Image } from "expo-image";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

import { useTheme } from "@/hooks/use-theme";

type FloatingLogoLoaderProps = {
  /** Label rendered under the logo. Defaults to "Loading". */
  label?: string;
  /** Diameter of the logo in points. */
  size?: number;
};

const FLOAT_DISTANCE = 12;
const FLOAT_DURATION = 900;

export function FloatingLogoLoader({
  label = "Loading",
  size = 96,
}: FloatingLogoLoaderProps) {
  const theme = useTheme();
  const offset = useSharedValue(0);

  useEffect(() => {
    offset.value = withRepeat(
      withSequence(
        withTiming(-FLOAT_DISTANCE, {
          duration: FLOAT_DURATION,
          easing: Easing.inOut(Easing.quad),
        }),
        withTiming(0, {
          duration: FLOAT_DURATION,
          easing: Easing.inOut(Easing.quad),
        }),
      ),
      -1,
      false,
    );
  }, [offset]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
  }));

  return (
    <View style={styles.container}>
      <Animated.View style={animatedStyle}>
        <Image
          style={{ width: size, height: size }}
          contentFit="contain"
          source={require("@/assets/images/abi-logo-no-background.png")}
        />
      </Animated.View>
      {label ? (
        <Text style={[styles.label, { color: theme.textSecondary }]}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: "500",
  },
});
