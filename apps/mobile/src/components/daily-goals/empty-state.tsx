import { SymbolView } from "expo-symbols";
import { Text, View } from "react-native";

import { withErrorTrace } from "@/components/component-error-boundary";
import { useTheme } from "@/hooks/use-theme";

import { styles, sym } from "./shared";

function EmptyStateImpl() {
  const theme = useTheme();
  return (
    <View style={styles.centerState}>
      <View
        style={[styles.emptyIcon, { backgroundColor: theme.backgroundElement }]}
      >
        <SymbolView
          name={sym("calendar", "calendar_today")}
          size={28}
          tintColor={theme.primary}
        />
      </View>
      <Text style={[styles.emptyTitle, { color: theme.text }]}>
        No daily goals yet
      </Text>
      <Text style={[styles.emptyDescription, { color: theme.textSecondary }]}>
        Add daily goals from the Goals section to track them here.
      </Text>
    </View>
  );
}

export const EmptyState = withErrorTrace(EmptyStateImpl, "EmptyState");
