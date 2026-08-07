import { type MenuAction, MenuView } from "@expo/ui/community/menu";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Platform, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/use-theme";

export type HistorySection = "dashboard" | "journal" | "profile";

const MENU_ITEMS: {
  id: HistorySection;
  title: string;
  href:
    | "/history?section=dashboard"
    | "/history?section=journal"
    | "/history?section=profile";
  image: "gauge.with.dots.needle.50percent" | "book.fill" | "person.crop.circle";
}[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    href: "/history?section=dashboard",
    image: "gauge.with.dots.needle.50percent",
  },
  {
    id: "journal",
    title: "Journal",
    href: "/history?section=journal",
    image: "book.fill",
  },
  {
    id: "profile",
    title: "Profile",
    href: "/history?section=profile",
    image: "person.crop.circle",
  },
];

export function HistoryHeaderMenu({
  currentSection,
}: {
  currentSection: HistorySection;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const selectedSection = isHistorySection(section) ? section : currentSection;
  const selectedItem =
    MENU_ITEMS.find((item) => item.id === selectedSection) ?? MENU_ITEMS[0];
  const triggerWidth = selectedSection === "dashboard" ? 150 : 112;
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
          router.navigate(selectedItem.href);
        }
      }}
      style={StyleSheet.flatten([styles.menu, { width: triggerWidth }])}
      title="History sections"
    >
      <View
        accessible
        accessibilityLabel="Switch History section"
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

function isHistorySection(
  section: string | undefined,
): section is HistorySection {
  return (
    section === "dashboard" || section === "journal" || section === "profile"
  );
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
