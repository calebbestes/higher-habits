import {
  SymbolView,
  type AndroidSymbol,
  type SFSymbol,
} from "expo-symbols";

type PlatformSymbolName = {
  ios: SFSymbol;
  android: AndroidSymbol;
  web: AndroidSymbol;
};

type SymbolName = PlatformSymbolName;

export type ExpoSymbolIconOption = {
  key: string;
  label: string;
  keywords: string[];
  symbol: SymbolName;
};

function symbol(ios: SFSymbol, android: AndroidSymbol): SymbolName {
  return { ios, android, web: android };
}

const FALLBACK = symbol("target", "target");

export const EXPO_SYMBOL_ICON_OPTIONS: ExpoSymbolIconOption[] = [
  {
    key: "fa7-solid:bullseye",
    label: "Target",
    keywords: ["goal", "bullseye", "focus", "shared"],
    symbol: symbol("target", "target"),
  },
  {
    key: "mdi:heart-outline",
    label: "Heart",
    keywords: ["heart", "love", "date", "health"],
    symbol: symbol("heart", "favorite"),
  },
  {
    key: "mdi:dumbbell",
    label: "Fitness",
    keywords: ["physical", "gym", "workout", "weight", "lift", "dumbbell"],
    symbol: symbol("dumbbell", "fitness_center"),
  },
  {
    key: "mdi:book-open-page-variant-outline",
    label: "Reading",
    keywords: ["book", "read", "scripture", "study"],
    symbol: symbol("book", "menu_book"),
  },
  {
    key: "mdi:briefcase-outline",
    label: "Work",
    keywords: ["job", "career", "briefcase", "business"],
    symbol: symbol("briefcase", "work"),
  },
  {
    key: "mdi:account-group-outline",
    label: "Social",
    keywords: ["friends", "people", "group", "hobbies", "shared"],
    symbol: symbol("person.2", "groups"),
  },
  {
    key: "mdi:hands-pray",
    label: "Spiritual",
    keywords: ["pray", "prayer", "spiritual", "meditate"],
    symbol: symbol("hands.sparkles", "self_improvement"),
  },
  {
    key: "mdi:cash",
    label: "Money",
    keywords: ["cash", "money", "finance", "dollar"],
    symbol: symbol("dollarsign.circle", "paid"),
  },
  {
    key: "mdi:star-outline",
    label: "Star",
    keywords: ["star", "favorite", "important"],
    symbol: symbol("star", "star"),
  },
  {
    key: "mdi:alarm",
    label: "Alarm",
    keywords: ["alarm", "wake", "time", "morning"],
    symbol: symbol("alarm", "alarm"),
  },
  {
    key: "mdi:walk",
    label: "Walk",
    keywords: ["walk", "steps", "outside"],
    symbol: symbol("figure.walk", "directions_walk"),
  },
  {
    key: "mdi:yoga",
    label: "Yoga",
    keywords: ["yoga", "stretch", "meditate", "mindfulness"],
    symbol: symbol("figure.mind.and.body", "self_improvement"),
  },
  {
    key: "mdi:food-apple",
    label: "Food",
    keywords: ["food", "apple", "calories", "nutrition", "fruit"],
    symbol: symbol("fork.knife", "restaurant"),
  },
  {
    key: "mdi:pill",
    label: "Pill",
    keywords: ["pill", "medicine", "supplement", "protein", "creatine"],
    symbol: symbol("pills", "pill"),
  },
  {
    key: "mdi:email-outline",
    label: "Email",
    keywords: ["email", "mail", "message", "outreach"],
    symbol: symbol("envelope", "mail"),
  },
  {
    key: "mdi:phone",
    label: "Phone",
    keywords: ["phone", "call", "contact"],
    symbol: symbol("phone", "call"),
  },
  {
    key: "mdi:phone-off",
    label: "No Phone",
    keywords: ["phone", "off", "disconnect"],
    symbol: symbol("phone.down", "phone_disabled"),
  },
  {
    key: "mdi:code-braces",
    label: "Code",
    keywords: ["code", "coding", "programming", "study"],
    symbol: symbol("curlybraces", "code"),
  },
  {
    key: "mdi:broom",
    label: "Clean",
    keywords: ["clean", "room", "broom", "chores"],
    symbol: symbol("sparkles", "cleaning_services"),
  },
  {
    key: "mdi:shield-check",
    label: "Shield",
    keywords: ["shield", "protect", "resist"],
    symbol: symbol("shield", "shield"),
  },
  {
    key: "mdi:handshake-outline",
    label: "Service",
    keywords: ["service", "volunteer", "handshake", "help"],
    symbol: symbol("hands.sparkles", "handshake"),
  },
  {
    key: "mdi:home-heart",
    label: "Home",
    keywords: ["home", "family", "ministering"],
    symbol: symbol("house", "home"),
  },
  {
    key: "mdi:chart-line",
    label: "Chart",
    keywords: ["chart", "planning", "finance", "progress"],
    symbol: symbol("chart.line.uptrend.xyaxis", "show_chart"),
  },
  {
    key: "mdi:party-popper",
    label: "Party",
    keywords: ["party", "celebrate", "host"],
    symbol: symbol("party.popper", "celebration"),
  },
  {
    key: "mdi:silverware-fork-knife",
    label: "Meal",
    keywords: ["lunch", "meal", "fork", "knife"],
    symbol: symbol("fork.knife", "restaurant"),
  },
  {
    key: "mdi:chef-hat",
    label: "Cook",
    keywords: ["cook", "chef", "kitchen"],
    symbol: symbol("frying.pan", "chef_hat"),
  },
  {
    key: "mdi:piano",
    label: "Piano",
    keywords: ["piano", "music"],
    symbol: symbol("pianokeys", "piano"),
  },
  {
    key: "mdi:tent",
    label: "Camp",
    keywords: ["camp", "tent", "outdoors"],
    symbol: symbol("tent", "camping"),
  },
  {
    key: "mdi:earth",
    label: "World",
    keywords: ["earth", "world", "friend", "global"],
    symbol: symbol("globe.americas", "public"),
  },
  {
    key: "mdi:image-filter-hdr",
    label: "Climb",
    keywords: ["climb", "mountain", "hike"],
    symbol: symbol("mountain.2", "landscape"),
  },
  {
    key: "mdi:tennis-ball",
    label: "Tennis",
    keywords: ["tennis", "sport", "ball"],
    symbol: symbol("tennisball", "sports_tennis"),
  },
  {
    key: "mdi:trophy-outline",
    label: "Trophy",
    keywords: ["trophy", "win", "competition"],
    symbol: symbol("trophy", "emoji_events"),
  },
];

const ICON_ALIASES: Record<string, string> = {
  target: "fa7-solid:bullseye",
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
  "fa6-solid:bullseye": "fa7-solid:bullseye",
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
  "mdi:calendar-check": "mdi:calendar-check-outline",
  "mdi:calendar-check-outline": "fa7-solid:bullseye",
  "mdi:temple-hindu": "mdi:hands-pray",
  "mdi:fruit-watermelon": "mdi:food-apple",
  "mdi:linkedin": "mdi:briefcase-outline",
  "mdi:circle": "fa7-solid:bullseye",
};

const SYMBOLS_BY_KEY = new Map(
  EXPO_SYMBOL_ICON_OPTIONS.map((option) => [option.key, option.symbol]),
);

export type GoalIconProps = {
  iconKey: string;
  size: number;
  color: string;
  filled?: boolean;
};

export function getSymbolForIconKey(iconKey: string): SymbolName {
  const key = ICON_ALIASES[iconKey] ?? iconKey;
  return SYMBOLS_BY_KEY.get(key) ?? FALLBACK;
}

export function GoalIcon({ iconKey, size, color, filled }: GoalIconProps) {
  return (
    <SymbolView
      name={getSymbolForIconKey(iconKey)}
      size={size}
      tintColor={color}
      weight={filled ? "bold" : "semibold"}
    />
  );
}
