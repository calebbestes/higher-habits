import { type MenuAction, MenuView } from "@expo/ui/community/menu";
import { BlurView } from "expo-blur";
import { GlassView, isGlassEffectAPIAvailable } from "expo-glass-effect";
import * as Haptics from "expo-haptics";
import { type Href, useRouter } from "expo-router";
import {
  TabList,
  TabSlot,
  TabTrigger,
  type TabTriggerSlotProps,
  Tabs,
} from "expo-router/ui";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTheme } from "@/hooks/use-theme";
import {
  COLLAB_SECTION_HREFS,
  PLAN_REPORT_VIEW_HREFS,
  type CollabSection,
  type PlanReportView,
  setCollabSection,
  setPlanReportView,
  useDefaultCollabSection,
  useDefaultPlanReportView,
} from "@/lib/tab-view-store";

const HOLD_HAPTIC_DELAY_MS = 220;
const HOLD_HAPTIC_INTERVAL_MS = 120;

type SubmenuItem = {
  label: string;
  href: Href;
  icon: SymbolViewProps["name"];
};

type TabItem = {
  name: string;
  href: Href;
  label: string;
  icon: SymbolViewProps["name"];
  center?: boolean;
  menu?: {
    alignment: "left" | "center" | "right";
    width: number;
    items: SubmenuItem[];
  };
};

const TABS: TabItem[] = [
  {
    name: "plan-report",
    href: "/plan-report",
    label: "Plan/Report",
    icon: {
      ios: "calendar.badge.clock",
      android: "event_note",
      web: "event_note",
    },
    menu: {
      alignment: "left",
      width: 196,
      items: [
        {
          label: "Day Plan",
          href: "/plan-report?view=day-plan",
          icon: {
            ios: "calendar.day.timeline.left",
            android: "view_day",
            web: "view_day",
          },
        },
        {
          label: "Habits",
          href: "/plan-report?view=habits",
          icon: {
            ios: "repeat",
            android: "repeat",
            web: "repeat",
          },
        },
        {
          label: "Goals",
          href: "/plan-report?view=goals",
          icon: {
            ios: "target",
            android: "target",
            web: "target",
          },
        },
        {
          label: "Tasks",
          href: "/plan-report?view=top-tasks",
          icon: {
            ios: "checklist",
            android: "checklist",
            web: "checklist",
          },
        },
      ],
    },
  },
  {
    name: "journal",
    href: "/journal",
    label: "Journal",
    icon: {
      ios: "book.fill",
      android: "menu_book",
      web: "menu_book",
    },
  },
  {
    name: "collab",
    href: "/",
    label: "Collab",
    icon: {
      ios: "person.2.fill",
      android: "groups",
      web: "groups",
    },
    menu: {
      alignment: "center",
      width: 220,
      items: [
        {
          label: "Feed",
          href: "/?section=feed",
          icon: {
            ios: "rectangle.stack",
            android: "feed",
            web: "feed",
          },
        },
        {
          label: "Incentives",
          href: "/?section=incentives",
          icon: {
            ios: "gift",
            android: "card_giftcard",
            web: "card_giftcard",
          },
        },
        {
          label: "Shared Goals",
          href: "/?section=shared-goals",
          icon: {
            ios: "person.3.fill",
            android: "groups",
            web: "groups",
          },
        },
        {
          label: "Friends",
          href: "/?section=friends",
          icon: {
            ios: "person.2.fill",
            android: "group",
            web: "group",
          },
        },
      ],
    },
  },
  {
    name: "dashboard",
    href: "/dashboard",
    label: "Dashboard",
    icon: {
      ios: "gauge.with.dots.needle.50percent",
      android: "speed",
      web: "speed",
    },
  },
  {
    name: "settings",
    href: "/settings",
    label: "Settings",
    icon: {
      ios: "gearshape.fill",
      android: "settings",
      web: "settings",
    },
  },
];

export default function AppTabs() {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const router = useRouter();
  const defaultPlanReportView = useDefaultPlanReportView();
  const defaultCollabSection = useDefaultCollabSection();
  const [openMenuName, setOpenMenuName] = useState<string | null>(null);
  const usesNativeAppleMenus = Platform.OS === "ios";
  const usesAppleTabBar = Platform.OS === "ios";
  const usesLiquidGlass = usesAppleTabBar && isGlassEffectAPIAvailable();
  const bottomInset = Math.max(insets.bottom, 6);
  const openMenu = TABS.find((tab) => tab.name === openMenuName)?.menu;

  return (
    <Tabs>
      <TabSlot style={styles.tabSlot} />
      <TabList asChild>
        <TabBarSurface
          style={StyleSheet.flatten([
            styles.tabList,
            usesAppleTabBar && styles.appleTabList,
            {
              backgroundColor: usesAppleTabBar ? "transparent" : theme.tabBar,
              borderTopColor: usesLiquidGlass ? "transparent" : theme.tabBorder,
              paddingBottom: bottomInset,
            },
          ])}
        >
          {TABS.map((tab) => {
            const href = getDefaultTabHref({
              defaultCollabSection,
              defaultPlanReportView,
              tab,
            });

            return (
              <TabTrigger key={tab.name} name={tab.name} href={href} asChild>
                <TabButton
                  item={tab}
                  isMenuOpen={
                    !usesNativeAppleMenus && openMenuName === tab.name
                  }
                  onDefaultPress={() => {
                    rememberSubmenuSelection(href);
                    router.navigate(href);
                  }}
                  onOpenMenu={() => {
                    setOpenMenuName((current) =>
                      current === tab.name ? null : tab.name,
                    );
                  }}
                  onSelectMenuItem={(href) => {
                    rememberSubmenuSelection(href);
                    router.navigate(href);
                  }}
                />
              </TabTrigger>
            );
          })}
        </TabBarSurface>
      </TabList>
      {!usesNativeAppleMenus && openMenu ? (
        <SubmenuPopover
          menu={openMenu}
          bottomInset={bottomInset}
          onClose={() => setOpenMenuName(null)}
          onSelect={(href) => {
            setOpenMenuName(null);
            rememberSubmenuSelection(href);
            router.navigate(href);
          }}
        />
      ) : null}
    </Tabs>
  );
}

function TabBarSurface(props: ViewProps) {
  if (Platform.OS !== "ios") {
    return <View {...props} />;
  }

  if (isGlassEffectAPIAvailable()) {
    return <GlassView {...props} glassEffectStyle="regular" />;
  }

  return <BlurView {...props} intensity={92} tint="systemChromeMaterial" />;
}

function TabButton({
  item,
  isFocused,
  isMenuOpen,
  onDefaultPress,
  onOpenMenu,
  onSelectMenuItem,
  onPress,
  onPressIn,
  onPressOut,
  onLongPress,
  ...props
}: TabTriggerSlotProps & {
  item: TabItem;
  isMenuOpen: boolean;
  onDefaultPress: () => void;
  onOpenMenu: () => void;
  onSelectMenuItem: (href: Href) => void;
}) {
  const theme = useTheme();
  const holdDelayRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const usesAppleTabStyle = Platform.OS === "ios";
  const isActive = Boolean(isFocused || isMenuOpen);
  const iconColor = isActive
    ? usesAppleTabStyle
      ? theme.primary
      : theme.primaryForeground
    : theme.tabIcon;
  const labelColor = item.center
    ? isActive
      ? theme.primary
      : theme.tabIcon
    : iconColor;
  const content = (
    <>
      <View
        style={[
          styles.iconContainer,
          usesAppleTabStyle && styles.appleIconContainer,
          item.center && !usesAppleTabStyle
            ? [styles.addIconContainer, { backgroundColor: theme.primary }]
            : null,
        ]}
      >
        <SymbolView
          name={item.icon}
          size={usesAppleTabStyle ? 24 : item.center ? 27 : 25}
          weight={usesAppleTabStyle || item.center ? "regular" : "semibold"}
          tintColor={
            item.center && !usesAppleTabStyle
              ? theme.primaryForeground
              : iconColor
          }
        />
      </View>
      <Text
        numberOfLines={1}
        style={[
          styles.label,
          usesAppleTabStyle && styles.appleLabel,
          { color: labelColor },
        ]}
      >
        {item.label}
      </Text>
    </>
  );
  const baseStyle = [
    styles.tabButton,
    usesAppleTabStyle && styles.appleTabButton,
    isActive && !item.center && !usesAppleTabStyle
      ? [styles.activeTab, { backgroundColor: theme.primary }]
      : null,
  ];
  const stopHoldHaptics = useCallback(() => {
    if (holdDelayRef.current) {
      clearTimeout(holdDelayRef.current);
      holdDelayRef.current = null;
    }
    if (holdIntervalRef.current) {
      clearInterval(holdIntervalRef.current);
      holdIntervalRef.current = null;
    }
  }, []);
  const startHoldHaptics = useCallback(() => {
    if (!item.menu) return;

    stopHoldHaptics();
    holdDelayRef.current = setTimeout(() => {
      playHoldHaptic();
      holdIntervalRef.current = setInterval(
        playHoldHaptic,
        HOLD_HAPTIC_INTERVAL_MS,
      );
    }, HOLD_HAPTIC_DELAY_MS);
  }, [item.menu, stopHoldHaptics]);

  useEffect(() => stopHoldHaptics, [stopHoldHaptics]);

  const button = (
    <Pressable
      {...props}
      accessibilityLabel={item.label}
      accessibilityRole="tab"
      accessibilityState={{
        selected: isActive,
        expanded: item.menu ? isMenuOpen : undefined,
      }}
      onPress={(e) => {
        if (item.menu) {
          e.preventDefault();
          onDefaultPress();
          return;
        }

        onPress?.(e);
      }}
      onPressIn={(e) => {
        onPressIn?.(e);
        startHoldHaptics();
      }}
      onPressOut={(e) => {
        stopHoldHaptics();
        onPressOut?.(e);
      }}
      onLongPress={(e) => {
        if (!item.menu) {
          onLongPress?.(e);
          return;
        }

        stopHoldHaptics();
        if (Platform.OS !== "ios" && !isMenuOpen) playMenuOpenHaptic();
        onOpenMenu();
      }}
      style={({ pressed }) => [baseStyle, pressed && styles.pressed]}
    >
      {content}
    </Pressable>
  );

  if (item.menu && Platform.OS === "ios") {
    const actions: MenuAction[] = item.menu.items.map((menuItem) => ({
      id: menuItem.label,
      title: menuItem.label,
      image:
        typeof menuItem.icon === "string" ? menuItem.icon : menuItem.icon.ios,
    }));

    return (
      <MenuView
        actions={actions}
        onPressAction={({ nativeEvent }) => {
          const selectedItem = item.menu?.items.find(
            (menuItem) => menuItem.label === nativeEvent.event,
          );
          if (selectedItem) onSelectMenuItem(selectedItem.href);
        }}
        shouldOpenOnLongPress
        style={StyleSheet.flatten([styles.nativeMenu, styles.appleNativeMenu])}
      >
        {button}
      </MenuView>
    );
  }

  return button;
}

function playHoldHaptic() {
  const haptic =
    Platform.OS === "android"
      ? Haptics.performAndroidHapticsAsync(
          Haptics.AndroidHaptics.Segment_Frequent_Tick,
        )
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft);

  void haptic.catch(() => undefined);
}

function playMenuOpenHaptic() {
  const haptic =
    Platform.OS === "android"
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Context_Click)
      : Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid);

  void haptic.catch(() => undefined);
}

function rememberSubmenuSelection(href: Href) {
  if (typeof href !== "string") return;

  const planReportViews: Record<string, PlanReportView> = {
    "/plan-report?view=day-plan": "day-plan",
    "/plan-report?view=habits": "habits",
    "/plan-report?view=goals": "goals",
    "/plan-report?view=top-tasks": "top-tasks",
  };
  const collabSections: Record<string, CollabSection> = {
    "/?section=feed": "feed",
    "/?section=incentives": "incentives",
    "/?section=shared-goals": "shared-goals",
    "/?section=friends": "friends",
  };

  const planReportView = planReportViews[href];
  if (planReportView) setPlanReportView(planReportView);

  const collabSection = collabSections[href];
  if (collabSection) setCollabSection(collabSection);
}

function getDefaultTabHref({
  defaultCollabSection,
  defaultPlanReportView,
  tab,
}: {
  defaultCollabSection: CollabSection;
  defaultPlanReportView: PlanReportView;
  tab: TabItem;
}): Href {
  if (tab.name === "plan-report") {
    return PLAN_REPORT_VIEW_HREFS[defaultPlanReportView] as Href;
  }
  if (tab.name === "collab") {
    return COLLAB_SECTION_HREFS[defaultCollabSection] as Href;
  }
  return tab.href;
}

function SubmenuPopover({
  menu,
  bottomInset,
  onClose,
  onSelect,
}: {
  menu: NonNullable<TabItem["menu"]>;
  bottomInset: number;
  onClose: () => void;
  onSelect: (href: Href) => void;
}) {
  const theme = useTheme();

  return (
    <View style={[StyleSheet.absoluteFill, styles.popoverOverlay]}>
      <Pressable
        accessibilityLabel="Close submenu"
        style={StyleSheet.absoluteFill}
        onPress={onClose}
      />
      <View
        style={[
          styles.submenu,
          menu.alignment === "left" && styles.submenuLeft,
          menu.alignment === "center" && styles.submenuCenter,
          menu.alignment === "right" && styles.submenuRight,
          {
            bottom: bottomInset + 80,
            width: menu.width,
            backgroundColor: theme.tabBar,
            borderColor: theme.tabBorder,
          },
        ]}
      >
        {menu.items.map((item) => (
          <Pressable
            key={item.label}
            accessibilityRole="button"
            onPress={() => onSelect(item.href)}
            style={({ pressed }) => [
              styles.submenuItem,
              pressed && { backgroundColor: theme.backgroundElement },
            ]}
          >
            <SymbolView
              name={item.icon}
              size={21}
              weight="semibold"
              tintColor={theme.tabIcon}
            />
            <Text style={[styles.submenuLabel, { color: theme.tabIcon }]}>
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabSlot: {
    flex: 1,
  },
  tabList: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 4,
    paddingTop: 6,
  },
  appleTabList: {
    paddingHorizontal: 0,
    paddingTop: 0,
  },
  tabButton: {
    flex: 1,
    minWidth: 0,
    height: 66,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: 18,
    paddingHorizontal: 2,
  },
  appleTabButton: {
    height: 49,
    gap: 0,
    borderRadius: 0,
    paddingHorizontal: 0,
    paddingTop: 3,
  },
  activeTab: {
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  iconContainer: {
    height: 29,
    alignItems: "center",
    justifyContent: "center",
  },
  appleIconContainer: {
    height: 29,
  },
  addIconContainer: {
    width: 43,
    height: 43,
    borderRadius: 22,
    marginTop: -14,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 5,
  },
  label: {
    maxWidth: "100%",
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "700",
  },
  appleLabel: {
    fontSize: 10,
    lineHeight: 12,
    fontWeight: "500",
  },
  pressed: {
    opacity: 0.7,
  },
  nativeMenu: {
    flex: 1,
    minWidth: 0,
    height: 66,
  },
  appleNativeMenu: {
    height: 49,
  },
  popoverOverlay: {
    zIndex: 999,
    elevation: 999,
  },
  submenu: {
    position: "absolute",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 22,
    padding: 8,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 10,
  },
  submenuLeft: {
    left: 10,
  },
  submenuCenter: {
    left: "50%",
    transform: [{ translateX: -85 }],
  },
  submenuRight: {
    right: 10,
  },
  submenuItem: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  submenuLabel: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "700",
  },
});
