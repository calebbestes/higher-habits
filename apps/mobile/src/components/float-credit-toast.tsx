import { SymbolView } from "expo-symbols";
import { useEffect, useRef, useState } from "react";
import { Animated, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/hooks/use-theme";
import {
  type FloatCreditsEarnedEvent,
  subscribeToFloatCreditsEarned,
} from "@/lib/float-credit-events";

export function FloatCreditToast() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [event, setEvent] = useState<FloatCreditsEarnedEvent | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-8)).current;
  const dismissTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const clearDismissTimeout = () => {
      if (dismissTimeoutRef.current) {
        clearTimeout(dismissTimeoutRef.current);
        dismissTimeoutRef.current = null;
      }
    };

    const unsubscribe = subscribeToFloatCreditsEarned((nextEvent) => {
      clearDismissTimeout();
      setEvent(nextEvent);
      opacity.stopAnimation();
      translateY.stopAnimation();
      opacity.setValue(0);
      translateY.setValue(-8);
      Animated.parallel([
        Animated.timing(opacity, {
          duration: 180,
          toValue: 1,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          damping: 18,
          mass: 0.75,
          stiffness: 240,
          toValue: 0,
          useNativeDriver: true,
        }),
      ]).start();

      dismissTimeoutRef.current = setTimeout(() => {
        Animated.timing(opacity, {
          duration: 180,
          toValue: 0,
          useNativeDriver: true,
        }).start(() => setEvent(null));
      }, 2300);
    });

    return () => {
      clearDismissTimeout();
      unsubscribe();
    };
  }, [opacity, translateY]);

  if (!event) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.container,
        {
          opacity,
          top: insets.top + 8,
          transform: [{ translateY }],
        },
      ]}
    >
      <View
        style={[
          styles.toast,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.tabBorder,
          },
        ]}
      >
        <View style={[styles.icon, { backgroundColor: theme.primary }]}>
          <SymbolView
            name={{
              ios: "sparkles",
              android: "auto_awesome",
              web: "auto_awesome",
            }}
            size={18}
            weight="bold"
            tintColor={theme.primaryForeground}
          />
        </View>
        <View style={styles.textStack}>
          <Text style={[styles.title, { color: theme.text }]}>
            +{event.amount} credits
          </Text>
          <Text
            numberOfLines={1}
            style={[styles.description, { color: theme.textSecondary }]}
          >
            {event.description}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 1000,
  },
  toast: {
    alignItems: "center",
    borderRadius: 22,
    borderWidth: 1,
    flexDirection: "row",
    gap: 10,
    maxWidth: 340,
    paddingHorizontal: 12,
    paddingVertical: 10,
    shadowColor: "#000",
    shadowOffset: { height: 6, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
  },
  icon: {
    alignItems: "center",
    borderRadius: 18,
    height: 34,
    justifyContent: "center",
    width: 34,
  },
  textStack: {
    flexShrink: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "900",
    lineHeight: 18,
  },
  description: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 15,
  },
});
