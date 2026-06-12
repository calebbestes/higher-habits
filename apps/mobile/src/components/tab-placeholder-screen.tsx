import { SymbolView, type SymbolViewProps } from "expo-symbols";
import type { ReactNode } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";

export function TabPlaceholderScreen({
  title,
  description,
  icon,
  headerAction,
}: {
  title: string;
  description: string;
  icon: SymbolViewProps["name"];
  headerAction?: ReactNode;
}) {
  const theme = useTheme();

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        {headerAction ? (
          <ThemedView style={styles.header}>{headerAction}</ThemedView>
        ) : null}
        <ThemedView style={styles.content}>
          <ThemedView type="backgroundElement" style={styles.iconContainer}>
            <SymbolView
              name={icon}
              size={32}
              weight="semibold"
              tintColor={theme.primary}
            />
          </ThemedView>
          {!headerAction ? (
            <ThemedText type="subtitle" style={styles.title}>
              {title}
            </ThemedText>
          ) : null}
          <ThemedText themeColor="textSecondary" style={styles.description}>
            {description}
          </ThemedText>
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    minHeight: 58,
    alignItems: "flex-start",
    justifyContent: "center",
    paddingHorizontal: Spacing.four,
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.four,
    paddingBottom: 58,
  },
  iconContainer: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 20,
    marginBottom: Spacing.three,
  },
  title: {
    textAlign: "center",
  },
  description: {
    maxWidth: 320,
    marginTop: Spacing.two,
    textAlign: "center",
  },
});
