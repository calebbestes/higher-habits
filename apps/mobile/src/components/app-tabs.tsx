import { NativeTabs } from "expo-router/unstable-native-tabs";
import { View } from "react-native";

import { FloatCreditToast } from "@/components/float-credit-toast";
import { useTheme } from "@/hooks/use-theme";

const TAB_LABEL_STYLE = {
  fontSize: 10,
  fontWeight: "600" as const,
};

export default function AppTabs() {
  const theme = useTheme();

  return (
    <View pointerEvents="box-none" style={{ flex: 1 }}>
      <NativeTabs
        blurEffect="systemChromeMaterial"
        iconColor={{ default: theme.tabIcon, selected: theme.primary }}
        indicatorColor={theme.backgroundSelected}
        labelStyle={{
          default: { ...TAB_LABEL_STYLE, color: theme.tabIcon },
          selected: { ...TAB_LABEL_STYLE, color: theme.primary },
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

        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon md="groups" sf="person.2.fill" />
          <NativeTabs.Trigger.Label>Collab</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="friends">
          <NativeTabs.Trigger.Icon md="feed" sf="rectangle.stack.fill" />
          <NativeTabs.Trigger.Label>Friends</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="history">
          <NativeTabs.Trigger.Icon
            md="speed"
            sf="gauge.with.dots.needle.50percent"
          />
          <NativeTabs.Trigger.Label>History</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>

        <NativeTabs.Trigger name="settings">
          <NativeTabs.Trigger.Icon md="settings" sf="gearshape.fill" />
          <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
      </NativeTabs>
      <FloatCreditToast />
    </View>
  );
}
