import { type MenuAction, MenuView } from "@expo/ui/community/menu";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Platform, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/use-theme";
import { type CollabSection, setCollabSection } from "@/lib/tab-view-store";

export type { CollabSection };

const MENU_ITEMS: {
  id: CollabSection;
  title: string;
  href:
    | "/?section=incentives"
    | "/?section=shared-goals"
    | "/friends?section=feed"
    | "/friends?section=friends";
  image: "rectangle.stack" | "gift" | "person.3.fill" | "person.2.fill";
}[] = [
  {
    id: "shared-goals",
    title: "Shared Goals",
    href: "/?section=shared-goals",
    image: "person.3.fill",
  },
  {
    id: "incentives",
    title: "Incentives",
    href: "/?section=incentives",
    image: "gift",
  },
  {
    id: "feed",
    title: "Feed",
    href: "/friends?section=feed",
    image: "rectangle.stack",
  },
  {
    id: "friends",
    title: "Friends",
    href: "/friends?section=friends",
    image: "person.2.fill",
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
  const menuItems =
    currentSection === "feed" || currentSection === "friends"
      ? MENU_ITEMS.filter((item) => item.id === "feed" || item.id === "friends")
      : MENU_ITEMS.filter(
          (item) => item.id === "shared-goals" || item.id === "incentives",
        );
  const selectedSection =
    isCollabSection(section) && menuItems.some((item) => item.id === section)
      ? section
      : currentSection;
  const selectedItem =
    menuItems.find((item) => item.id === selectedSection) ?? menuItems[0];
  const triggerWidth = getTriggerWidth(selectedSection);
  const actions: MenuAction[] = menuItems.map((item) => ({
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
          router.navigate(selectedItem.href);
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
    section === "shared-goals" ||
    section === "friends"
  );
}

function getTriggerWidth(section: CollabSection): number {
  if (section === "shared-goals") return 190;
  if (section === "incentives") return 150;
  if (section === "friends") return 115;
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
