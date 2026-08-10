import { type MenuAction, MenuView } from "@expo/ui/community/menu";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Platform, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/use-theme";
import { type CollabSection, setCollabSection } from "@/lib/tab-view-store";

export type { CollabSection };

const MENU_ITEMS: {
  id: Exclude<CollabSection, "friends">;
  title: string;
  image: "rectangle.stack" | "gift" | "person.3.fill";
}[] = [
  {
    id: "feed",
    title: "Feed",
    image: "rectangle.stack",
  },
  {
    id: "incentives",
    title: "Incentives",
    image: "gift",
  },
  {
    id: "shared-goals",
    title: "Shared Goals",
    image: "person.3.fill",
  },
];

export function CollabHeaderMenu({
  currentSection,
}: {
  currentSection: CollabSection;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const selectedSection = isCollabSection(section) ? section : currentSection;
  const selectedItem =
    MENU_ITEMS.find((item) => item.id === selectedSection) ?? MENU_ITEMS[0];
  const triggerWidth = getTriggerWidth(selectedItem.id);
  const actions: MenuAction[] = MENU_ITEMS.map((item) => ({
    id: item.id,
    title: item.title,
    image: item.image,
    state: item.id === selectedSection ? "on" : undefined,
  }));

  if (Platform.OS === "web") {
    return (
      <Text style={[styles.triggerLabel, { color: theme.text }]}>
        {selectedItem.title}
      </Text>
    );
  }

  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        const selectedItem = MENU_ITEMS.find(
          (item) => item.id === nativeEvent.event,
        );
        if (selectedItem) {
          setCollabSection(selectedItem.id);
          router.setParams({ section: selectedItem.id });
        }
      }}
      style={StyleSheet.flatten([styles.menu, { width: triggerWidth }])}
      title="Collab sections"
    >
      <View
        accessible
        accessibilityLabel="Switch Collab section"
        accessibilityRole="button"
        style={StyleSheet.flatten([styles.trigger, { width: triggerWidth }])}
      >
        <Text style={[styles.triggerLabel, { color: theme.text }]}>
          {selectedItem.title}
        </Text>
        <SymbolView
          name={{ ios: "chevron.down", android: "keyboard_arrow_down" }}
          size={14}
          weight="semibold"
          tintColor={theme.textSecondary}
        />
      </View>
    </MenuView>
  );
}

function isCollabSection(
  section: string | undefined,
): section is CollabSection {
  return (
    section === "feed" ||
    section === "incentives" ||
    section === "shared-goals"
  );
}

function getTriggerWidth(section: Exclude<CollabSection, "friends">): number {
  if (section === "shared-goals") return 190;
  if (section === "incentives") return 150;
  return 85;
}

const styles = StyleSheet.create({
  menu: {
    height: 32,
  },
  trigger: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: 7,
  },
  triggerLabel: {
    fontSize: 25,
    lineHeight: 29,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
});
