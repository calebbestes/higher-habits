import { FontAwesome6, MaterialCommunityIcons } from "@expo/vector-icons";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import type React from "react";

type SymbolName = SymbolViewProps["name"];
type MCIName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
type FA6Name = React.ComponentProps<typeof FontAwesome6>["name"];

const FALLBACK: SymbolName = {
  ios: "target",
  android: "target",
  web: "target",
} as SymbolName;

// The bundled vector fonts ship a specific snapshot of each icon set, which can
// differ from Iconify's catalog (e.g. Iconify has `mdi:temple-outline` but the
// bundled MaterialCommunityIcons font does not). Validate the glyph name against
// the actual bundled glyph map — not just the prefix — so we never render the
// font's "missing glyph" (?) marker.
const MCI_GLYPHS = MaterialCommunityIcons.glyphMap as Record<string, number>;
const FA6_GLYPHS = FontAwesome6.glyphMap as Record<string, number>;

function mdiGlyph(iconKey: string): MCIName | null {
  if (!iconKey.startsWith("mdi:")) return null;
  const name = iconKey.slice(4);
  return name in MCI_GLYPHS ? (name as MCIName) : null;
}

function fa6Glyph(iconKey: string): FA6Name | null {
  if (!iconKey.startsWith("fa7-solid:") && !iconKey.startsWith("fa6-solid:")) {
    return null;
  }
  const name = iconKey.slice(10);
  return name in FA6_GLYPHS ? (name as FA6Name) : null;
}

export type GoalIconProps = {
  iconKey: string;
  size: number;
  color: string;
};

// True only when the icon will actually draw with the bundled fonts. Keep the
// icon picker's search filtered through this so users can't choose an icon that
// would fall back to the generic target or render as a "?".
export function isRenderableIconKey(iconKey: string): boolean {
  return mdiGlyph(iconKey) !== null || fa6Glyph(iconKey) !== null;
}

export function GoalIcon({ iconKey, size, color }: GoalIconProps) {
  const mdiName = mdiGlyph(iconKey);
  if (mdiName) {
    return (
      <MaterialCommunityIcons name={mdiName} size={size} color={color} />
    );
  }
  const fa6Name = fa6Glyph(iconKey);
  if (fa6Name) {
    return <FontAwesome6 name={fa6Name} size={size} color={color} />;
  }
  return <SymbolView name={FALLBACK} size={size} tintColor={color} />;
}
