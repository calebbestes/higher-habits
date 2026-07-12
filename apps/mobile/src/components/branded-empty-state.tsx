import { Image } from "expo-image";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/use-theme";

const logoSource = require("@/assets/images/abi-logo-no-background.png");

export function BrandedEmptyState({
  actionLabel,
  compact = false,
  description,
  onAction,
  title,
}: {
  actionLabel?: string;
  compact?: boolean;
  description?: string;
  onAction?: () => void;
  title: string;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.wrap, compact && styles.compactWrap]}>
      <Image
        source={logoSource}
        style={[styles.logo, compact && styles.compactLogo]}
        contentFit="contain"
      />
      <Text
        style={[
          styles.title,
          compact && styles.compactTitle,
          { color: theme.text },
        ]}
      >
        {title}
      </Text>
      {description ? (
        <Text style={[styles.description, { color: theme.textSecondary }]}>
          {description}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [
            styles.action,
            { backgroundColor: theme.primary },
            pressed && styles.pressed,
          ]}
        >
          <Text style={[styles.actionText, { color: theme.primaryForeground }]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 44,
  },
  compactWrap: {
    paddingVertical: 26,
  },
  logo: {
    width: 82,
    height: 82,
    marginBottom: 2,
  },
  compactLogo: {
    width: 54,
    height: 54,
  },
  title: {
    textAlign: "center",
    fontSize: 18,
    lineHeight: 23,
    fontWeight: "800",
  },
  compactTitle: {
    fontSize: 15,
    lineHeight: 20,
  },
  description: {
    maxWidth: 280,
    textAlign: "center",
    fontSize: 13,
    lineHeight: 19,
    fontWeight: "600",
  },
  action: {
    marginTop: 8,
    borderRadius: 14,
    paddingHorizontal: 18,
    paddingVertical: 11,
  },
  actionText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "800",
  },
  pressed: { opacity: 0.72 },
});
