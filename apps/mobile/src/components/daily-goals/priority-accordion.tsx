import { SymbolView } from "expo-symbols";
import type { ReactNode } from "react";
import { Pressable, Text, View } from "react-native";

import { withErrorTrace } from "@/components/component-error-boundary";
import { useTheme } from "@/hooks/use-theme";

import { styles, sym } from "./shared";

function PriorityAccordionImpl({
  color,
  completed,
  label,
  isOpen,
  total,
  onToggle,
  children,
}: {
  color: string;
  completed: number;
  label: string;
  isOpen: boolean;
  total: number;
  onToggle: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <View style={styles.priorityBlock}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          styles.priorityHeader,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
      >
        <View style={styles.priorityHeaderLabelRow}>
          <SymbolView
            name={sym(
              isOpen ? "chevron.down" : "chevron.right",
              isOpen ? "expand_more" : "chevron_right",
            )}
            size={13}
            weight="bold"
            tintColor={theme.textSecondary}
          />
          <Text style={[styles.priorityLabel, { color: theme.textSecondary }]}>
            {label.toUpperCase()}
          </Text>
          <Text
            style={[
              styles.priorityProgressCount,
              { color: theme.textSecondary },
            ]}
          >
            {completed}/{total}
          </Text>
        </View>
        <View
          accessibilityLabel={`${completed} of ${total} ${label} complete`}
          accessibilityRole="progressbar"
          accessibilityValue={{ max: total, min: 0, now: completed }}
          style={[
            styles.sectionProgressTrack,
            { backgroundColor: theme.backgroundElement },
          ]}
        >
          {completed > 0 ? (
            <View
              style={[
                styles.sectionProgressFill,
                { backgroundColor: color, width: `${percent}%` },
              ]}
            />
          ) : null}
        </View>
      </Pressable>
      {isOpen ? <View style={styles.priorityContent}>{children}</View> : null}
    </View>
  );
}

export const PriorityAccordion = withErrorTrace(
  PriorityAccordionImpl,
  "PriorityAccordion",
);
