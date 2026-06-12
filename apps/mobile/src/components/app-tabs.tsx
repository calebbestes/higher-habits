import { NativeTabs } from "expo-router/unstable-native-tabs";

import { useTheme } from "@/hooks/use-theme";

export default function AppTabs() {
  const theme = useTheme();

  return (
    <NativeTabs
      blurEffect="systemChromeMaterial"
      iconColor={{ default: theme.tabIcon, selected: theme.primary }}
      indicatorColor={theme.backgroundSelected}
      labelStyle={{
        default: { color: theme.tabIcon },
        selected: { color: theme.primary },
      }}
      labelVisibilityMode="labeled"
      minimizeBehavior="automatic"
      shadowColor={theme.tabBorder}
      tintColor={theme.primary}
    >
      <NativeTabs.Trigger name="plan-report">
        <NativeTabs.Trigger.Icon md="event_note" sf="calendar.badge.clock" />
        <NativeTabs.Trigger.Label>Plan/Report</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="journal">
        <NativeTabs.Trigger.Icon md="menu_book" sf="book.fill" />
        <NativeTabs.Trigger.Label>Journal</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Icon md="groups" sf="person.2.fill" />
        <NativeTabs.Trigger.Label>Collab</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="dashboard">
        <NativeTabs.Trigger.Icon
          md="speed"
          sf="gauge.with.dots.needle.50percent"
        />
        <NativeTabs.Trigger.Label>Dashboard</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon md="settings" sf="gearshape.fill" />
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
