import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const ACTIVE_OFFSET_X = 36;
const FAIL_OFFSET_Y = 22;
const SWIPE_DISTANCE = 88;
const SWIPE_VELOCITY = 720;

function clamp(value: number, min: number, max: number) {
  "worklet";
  return Math.min(Math.max(value, min), max);
}

export function SwipePageTransition<T extends string>({
  activeKey,
  children,
  disabled = false,
  onChange,
  orderedKeys,
}: {
  activeKey: T;
  children: ReactNode;
  disabled?: boolean;
  onChange: (key: T) => void;
  orderedKeys: readonly T[];
}) {
  const { width } = useWindowDimensions();
  const activeIndex = Math.max(orderedKeys.indexOf(activeKey), 0);
  const entryOffset = useSharedValue(0);
  const gestureOffset = useSharedValue(0);
  const opacity = useSharedValue(1);
  const previousIndexRef = useRef(activeIndex);
  const maxDrag = Math.min(width * 0.18, 72);

  const goToPage = useCallback(
    (key: T) => {
      if (key !== activeKey) onChange(key);
    },
    [activeKey, onChange],
  );

  useEffect(() => {
    const previousIndex = previousIndexRef.current;
    previousIndexRef.current = activeIndex;
    if (previousIndex === activeIndex) return;

    const direction = activeIndex > previousIndex ? 1 : -1;
    entryOffset.value = direction * Math.min(width * 0.12, 52);
    opacity.value = 0.94;
    entryOffset.value = withSpring(0, {
      damping: 25,
      mass: 0.85,
      stiffness: 260,
    });
    opacity.value = withTiming(1, { duration: 150 });
  }, [activeIndex, entryOffset, opacity, width]);

  const panGesture = Gesture.Pan()
    .enabled(!disabled)
    .activeOffsetX([-ACTIVE_OFFSET_X, ACTIVE_OFFSET_X])
    .failOffsetY([-FAIL_OFFSET_Y, FAIL_OFFSET_Y])
    .onUpdate((event) => {
      const canGoPrevious = activeIndex > 0;
      const canGoNext = activeIndex < orderedKeys.length - 1;
      const isBlockedEdge =
        (event.translationX > 0 && !canGoPrevious) ||
        (event.translationX < 0 && !canGoNext);
      const resistance = isBlockedEdge ? 0.14 : 0.42;

      gestureOffset.value = clamp(
        event.translationX * resistance,
        -maxDrag,
        maxDrag,
      );
    })
    .onEnd((event) => {
      const canGoPrevious = activeIndex > 0;
      const canGoNext = activeIndex < orderedKeys.length - 1;
      const shouldGoPrevious =
        canGoPrevious &&
        (event.translationX > SWIPE_DISTANCE ||
          event.velocityX > SWIPE_VELOCITY);
      const shouldGoNext =
        canGoNext &&
        (event.translationX < -SWIPE_DISTANCE ||
          event.velocityX < -SWIPE_VELOCITY);

      gestureOffset.value = withSpring(0, {
        damping: 24,
        mass: 0.75,
        stiffness: 280,
      });

      if (shouldGoPrevious) {
        runOnJS(goToPage)(orderedKeys[activeIndex - 1]);
      } else if (shouldGoNext) {
        runOnJS(goToPage)(orderedKeys[activeIndex + 1]);
      }
    })
    .onFinalize(() => {
      gestureOffset.value = withSpring(0, {
        damping: 24,
        mass: 0.75,
        stiffness: 280,
      });
    });

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: entryOffset.value + gestureOffset.value }],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[styles.page, animatedStyle]}>
        {children}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
});
