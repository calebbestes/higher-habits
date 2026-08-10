import { type MenuAction, MenuView } from "@expo/ui/community/menu";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Platform, StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/use-theme";
import { type CreateSection, setCreateSection } from "@/lib/tab-view-store";

export type { CreateSection };

const MENU_ITEMS: {
  id: CreateSection;
  title: string;
  image: "repeat" | "target" | "checklist";
}[] = [
  {
    id: "habits",
    title: "Habits",
    image: "repeat",
  },
  {
    id: "goals",
    title: "Goals",
    image: "target",
  },
  {
    id: "tasks",
    title: "Tasks",
    image: "checklist",
  },
];

export function CreateHeaderMenu({
  currentSection,
}: {
  currentSection: CreateSection;
}) {
  const theme = useTheme();
  const router = useRouter();
  const { type } = useLocalSearchParams<{ type?: string }>();
  const selectedSection = isCreateSection(type) ? type : currentSection;
  const selectedItem =
    MENU_ITEMS.find((item) => item.id === selectedSection) ?? MENU_ITEMS[0];
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
          setCreateSection(selectedItem.id);
          router.setParams({ type: selectedItem.id });
        }
      }}
      style={StyleSheet.flatten([
        styles.menu,
        { width: selectedSection === "habits" ? 120 : 105 },
      ])}
      title="Create sections"
    >
      <View
        accessible
        accessibilityLabel="Switch Create section"
        accessibilityRole="button"
        style={styles.trigger}
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

function isCreateSection(
  section: string | undefined,
): section is CreateSection {
  return section === "habits" || section === "goals" || section === "tasks";
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
