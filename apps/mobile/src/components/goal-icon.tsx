import { Lucide } from "@react-native-vector-icons/lucide";
import lucideGlyphMap from "@react-native-vector-icons/lucide/glyphmaps/Lucide.json";
import { MaterialDesignIcons } from "@react-native-vector-icons/material-design-icons";
import materialGlyphMap from "@react-native-vector-icons/material-design-icons/glyphmaps/MaterialDesignIcons.json";
import { isLoaded, loadAsync } from "expo-font";
import { type AndroidSymbol, type SFSymbol, SymbolView } from "expo-symbols";
import { type ComponentProps, useEffect, useState } from "react";

type PlatformSymbolName = {
  ios: SFSymbol;
  android: AndroidSymbol;
  web: AndroidSymbol;
};

type SymbolName = PlatformSymbolName;
type IconPack = "mdi" | "lucide";
type MaterialDesignIconName = ComponentProps<
  typeof MaterialDesignIcons
>["name"];
type LucideIconName = ComponentProps<typeof Lucide>["name"];

export type ExpoSymbolIconOption = {
  key: string;
  label: string;
  keywords: string[];
  symbol?: SymbolName;
};

const MATERIAL_GLYPHS = materialGlyphMap as Record<string, number>;
const LUCIDE_GLYPHS = lucideGlyphMap as Record<string, number>;
const VECTOR_GLYPHS: Record<IconPack, Record<string, number>> = {
  mdi: MATERIAL_GLYPHS,
  lucide: LUCIDE_GLYPHS,
};
const GOAL_ICON_FONT_MAP = {
  MaterialDesignIcons: require("@react-native-vector-icons/material-design-icons/fonts/MaterialDesignIcons.ttf"),
  Lucide: require("@react-native-vector-icons/lucide/fonts/Lucide.ttf"),
};
let goalIconFontsPromise: Promise<void> | null = null;

function symbol(ios: SFSymbol, android: AndroidSymbol): SymbolName {
  return { ios, android, web: android };
}

const FALLBACK = symbol("target", "target");

function areGoalIconFontsLoaded() {
  return isLoaded("MaterialDesignIcons") && isLoaded("Lucide");
}

function loadGoalIconFonts() {
  if (areGoalIconFontsLoaded()) return Promise.resolve();
  goalIconFontsPromise ??= loadAsync(GOAL_ICON_FONT_MAP).catch((error) => {
    goalIconFontsPromise = null;
    throw error;
  });
  return goalIconFontsPromise;
}

function useGoalIconFontsLoaded() {
  const [loaded, setLoaded] = useState(areGoalIconFontsLoaded);

  useEffect(() => {
    if (loaded) return;

    let mounted = true;
    loadGoalIconFonts()
      .then(() => {
        if (mounted) setLoaded(true);
      })
      .catch(() => {
        if (mounted) setLoaded(false);
      });

    return () => {
      mounted = false;
    };
  }, [loaded]);

  return loaded;
}

function toTitleCase(value: string) {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function iconNameKeywords(name: string) {
  return name.split(/[-_]/).filter(Boolean);
}

function vectorOption(
  pack: IconPack,
  name: string,
  label = toTitleCase(name),
  keywords: string[] = [],
): ExpoSymbolIconOption {
  return {
    key: `${pack}:${name}`,
    label,
    keywords: [...keywords, pack, name, ...iconNameKeywords(name)],
  };
}

function generatedOptionsForPack(pack: IconPack) {
  return Object.keys(VECTOR_GLYPHS[pack])
    .sort()
    .map((name) => vectorOption(pack, name));
}

function uniqueOptions(options: ExpoSymbolIconOption[]) {
  const seen = new Set<string>();
  return options.filter((option) => {
    if (seen.has(option.key)) return false;
    seen.add(option.key);
    return true;
  });
}

const CURATED_ICON_OPTIONS: ExpoSymbolIconOption[] = [
  vectorOption("mdi", "target", "Target", [
    "goal",
    "bullseye",
    "focus",
    "shared",
  ]),
  vectorOption("mdi", "heart-outline", "Heart", [
    "heart",
    "love",
    "date",
    "health",
  ]),
  vectorOption("mdi", "dumbbell", "Fitness", [
    "physical",
    "gym",
    "workout",
    "weight",
    "lift",
    "strength",
  ]),
  vectorOption("mdi", "book-open-page-variant-outline", "Reading", [
    "book",
    "read",
    "scripture",
    "study",
  ]),
  vectorOption("mdi", "briefcase-outline", "Work", [
    "job",
    "career",
    "business",
  ]),
  vectorOption("mdi", "account-group-outline", "Social", [
    "friends",
    "people",
    "group",
    "hobbies",
    "shared",
  ]),
  vectorOption("mdi", "hands-pray", "Spiritual", [
    "pray",
    "prayer",
    "spiritual",
    "meditate",
    "church",
  ]),
  vectorOption("mdi", "soccer", "Soccer", ["sport", "sports", "ball"]),
  vectorOption("mdi", "basketball", "Basketball", ["sport", "sports", "ball"]),
  vectorOption("mdi", "football", "Football", ["sport", "sports", "ball"]),
  vectorOption("mdi", "run", "Running", ["run", "jog", "cardio", "race"]),
  vectorOption("mdi", "walk", "Walk", ["steps", "outside", "walking"]),
  vectorOption("mdi", "bike", "Cycling", ["bicycle", "cycle", "cardio"]),
  vectorOption("mdi", "swim", "Swimming", ["pool", "water", "cardio"]),
  vectorOption("mdi", "hiking", "Hiking", ["climb", "trail", "mountain"]),
  vectorOption("mdi", "meditation", "Meditation", [
    "mindfulness",
    "calm",
    "yoga",
  ]),
  vectorOption("mdi", "food-apple", "Food", [
    "nutrition",
    "calories",
    "fruit",
    "diet",
  ]),
  vectorOption("mdi", "water", "Water", ["drink", "hydrate", "hydration"]),
  vectorOption("mdi", "sleep", "Sleep", ["bed", "rest", "night"]),
  vectorOption("mdi", "pill", "Pill", [
    "medicine",
    "supplement",
    "protein",
    "creatine",
  ]),
  vectorOption("mdi", "cash", "Money", ["finance", "dollar", "budget", "cash"]),
  vectorOption("mdi", "chart-line", "Chart", [
    "planning",
    "finance",
    "progress",
    "growth",
  ]),
  vectorOption("mdi", "email-outline", "Email", [
    "mail",
    "message",
    "outreach",
  ]),
  vectorOption("mdi", "phone", "Phone", ["call", "contact"]),
  vectorOption("mdi", "phone-off", "No Phone", ["disconnect", "focus"]),
  vectorOption("mdi", "linkedin", "LinkedIn", ["work", "career", "outreach"]),
  vectorOption("mdi", "code-braces", "Code", [
    "coding",
    "programming",
    "study",
  ]),
  vectorOption("mdi", "laptop", "Laptop", ["computer", "work", "study"]),
  vectorOption("mdi", "school-outline", "School", ["learn", "class", "study"]),
  vectorOption("mdi", "broom", "Clean", ["room", "chores", "cleaning"]),
  vectorOption("mdi", "home-heart", "Home", ["family", "ministering", "house"]),
  vectorOption("mdi", "handshake-outline", "Service", [
    "volunteer",
    "help",
    "serve",
  ]),
  vectorOption("mdi", "church", "Church", ["spiritual", "worship", "religion"]),
  vectorOption("mdi", "music", "Music", ["song", "practice", "instrument"]),
  vectorOption("mdi", "piano", "Piano", ["music", "practice"]),
  vectorOption("mdi", "guitar-acoustic", "Guitar", ["music", "practice"]),
  vectorOption("mdi", "palette-outline", "Art", ["draw", "paint", "creative"]),
  vectorOption("mdi", "chef-hat", "Cook", ["kitchen", "meal", "chef"]),
  vectorOption("mdi", "silverware-fork-knife", "Meal", [
    "lunch",
    "dinner",
    "food",
  ]),
  vectorOption("mdi", "party-popper", "Party", ["celebrate", "host", "fun"]),
  vectorOption("mdi", "tent", "Camp", ["outdoors", "camping"]),
  vectorOption("mdi", "earth", "World", ["global", "friend", "language"]),
  vectorOption("mdi", "image-filter-hdr", "Climb", [
    "mountain",
    "hike",
    "outdoors",
  ]),
  vectorOption("mdi", "tennis-ball", "Tennis", ["sport", "sports", "ball"]),
  vectorOption("mdi", "trophy-outline", "Trophy", [
    "win",
    "competition",
    "award",
  ]),
  vectorOption("mdi", "shield-check", "Shield", [
    "protect",
    "resist",
    "safety",
  ]),
  vectorOption("lucide", "sparkles", "Sparkles", [
    "spiritual",
    "clean",
    "magic",
  ]),
  vectorOption("lucide", "notebook-pen", "Journal", ["write", "note", "plan"]),
  vectorOption("lucide", "calendar-check", "Plan", [
    "calendar",
    "schedule",
    "complete",
  ]),
  vectorOption("lucide", "smile", "Smile", ["happy", "mood", "joy"]),
];

const EXPO_SYMBOL_FALLBACK_OPTIONS: ExpoSymbolIconOption[] = [
  {
    key: "expo:target",
    label: "Target",
    keywords: ["goal", "bullseye", "focus"],
    symbol: symbol("target", "target"),
  },
];

export const EXPO_SYMBOL_ICON_OPTIONS: ExpoSymbolIconOption[] = uniqueOptions([
  ...CURATED_ICON_OPTIONS,
  ...generatedOptionsForPack("lucide"),
  ...generatedOptionsForPack("mdi"),
  ...EXPO_SYMBOL_FALLBACK_OPTIONS,
]);

const ICON_ALIASES: Record<string, string> = {
  target: "mdi:target",
  tent: "mdi:tent",
  heart: "mdi:heart-outline",
  party: "mdi:party-popper",
  lunch: "mdi:silverware-fork-knife",
  phone: "mdi:phone",
  financialPlanning: "mdi:chart-line",
  firstAid: "mdi:pill",
  temple: "mdi:hands-pray",
  book: "mdi:book-open-page-variant-outline",
  walk: "mdi:walk",
  group: "mdi:account-group-outline",
  climb: "mdi:image-filter-hdr",
  tennis: "mdi:tennis-ball",
  cook: "mdi:chef-hat",
  piano: "mdi:piano",
  ministering: "mdi:home-heart",
  czechCall: "mdi:earth",
  "fa6-solid:bullseye": "mdi:target",
  "fa7-solid:bullseye": "mdi:target",
  "fa7-solid:hands-praying": "mdi:hands-pray",
  "fa6-solid:hands-praying": "mdi:hands-pray",
  "fa7-solid:dumbbell": "mdi:dumbbell",
  "fa6-solid:dumbbell": "mdi:dumbbell",
  "fa7-solid:briefcase": "mdi:briefcase-outline",
  "fa6-solid:briefcase": "mdi:briefcase-outline",
  "fa7-solid:star": "mdi:star-outline",
  "fa6-solid:star": "mdi:star-outline",
  "fa7-solid:user-group": "mdi:account-group-outline",
  "fa6-solid:user-group": "mdi:account-group-outline",
  "mdi:heart": "mdi:heart-outline",
  "mdi:book-open-page-variant": "mdi:book-open-page-variant-outline",
  "mdi:book-open-variant": "mdi:book-open-page-variant-outline",
  "mdi:briefcase": "mdi:briefcase-outline",
  "mdi:account-group": "mdi:account-group-outline",
  "mdi:account-multiple": "mdi:account-group-outline",
  "mdi:currency-usd": "mdi:cash",
  "mdi:star": "mdi:star-outline",
  "mdi:food-apple-outline": "mdi:food-apple",
  "mdi:phone-outline": "mdi:phone",
  "mdi:temple-hindu": "mdi:hands-pray",
  "mdi:fruit-watermelon": "mdi:food-apple",
  "mdi:circle": "mdi:target",
};

const SYMBOLS_BY_KEY = new Map(
  EXPO_SYMBOL_FALLBACK_OPTIONS.flatMap((option) =>
    option.symbol ? [[option.key, option.symbol] as const] : [],
  ),
);

export type GoalIconProps = {
  iconKey: string;
  size: number;
  color: string;
  filled?: boolean;
};

function normalizeIconKey(iconKey: string) {
  const aliased = ICON_ALIASES[iconKey] ?? iconKey;
  if (aliased.includes(":")) return aliased;
  if (aliased in MATERIAL_GLYPHS) return `mdi:${aliased}`;
  if (aliased in LUCIDE_GLYPHS) return `lucide:${aliased}`;
  return aliased;
}

function parseVectorIconKey(iconKey: string) {
  const separatorIndex = iconKey.indexOf(":");
  if (separatorIndex === -1) return null;

  const pack = iconKey.slice(0, separatorIndex);
  const name = iconKey.slice(separatorIndex + 1);
  if ((pack === "mdi" || pack === "lucide") && name in VECTOR_GLYPHS[pack]) {
    return { pack, name };
  }

  return null;
}

export function getSymbolForIconKey(iconKey: string): SymbolName {
  const key = normalizeIconKey(iconKey);
  return SYMBOLS_BY_KEY.get(key) ?? FALLBACK;
}

export function GoalIcon({ iconKey, size, color, filled }: GoalIconProps) {
  const fontsLoaded = useGoalIconFontsLoaded();
  const key = normalizeIconKey(iconKey);
  const vectorIcon = parseVectorIconKey(key);

  if (vectorIcon && !fontsLoaded) {
    return (
      <SymbolView
        name={getSymbolForIconKey(key)}
        size={size}
        tintColor={color}
        weight={filled ? "bold" : "semibold"}
      />
    );
  }

  if (vectorIcon?.pack === "mdi") {
    return (
      <MaterialDesignIcons
        name={vectorIcon.name as MaterialDesignIconName}
        size={size}
        color={color}
      />
    );
  }

  if (vectorIcon?.pack === "lucide") {
    return (
      <Lucide
        name={vectorIcon.name as LucideIconName}
        size={size}
        color={color}
      />
    );
  }

  return (
    <SymbolView
      name={getSymbolForIconKey(key)}
      size={size}
      tintColor={color}
      weight={filled ? "bold" : "semibold"}
    />
  );
}
