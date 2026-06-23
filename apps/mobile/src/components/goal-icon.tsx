import { FontAwesome6, MaterialCommunityIcons } from "@expo/vector-icons";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import type React from "react";

type SymbolName = SymbolViewProps["name"];
type MCIName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
type FA6Name = React.ComponentProps<typeof FontAwesome6>["name"];
type GlyphMap = Record<string, number | string>;
type GlyphSource = {
  glyphMap?: unknown;
  getRawGlyphMap?: () => unknown;
};

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
function getGlyphMap(source: GlyphSource): GlyphMap {
  const rawGlyphMap = source.glyphMap ?? source.getRawGlyphMap?.();
  return rawGlyphMap && typeof rawGlyphMap === "object"
    ? (rawGlyphMap as GlyphMap)
    : {};
}

function hasGlyph(glyphMap: GlyphMap, name: string) {
  return Object.prototype.hasOwnProperty.call(glyphMap, name);
}

const MCI_GLYPHS = getGlyphMap(MaterialCommunityIcons);
const FA6_GLYPHS = getGlyphMap(FontAwesome6);

function mdiGlyph(iconKey: string, filled = false): MCIName | null {
  if (!iconKey.startsWith("mdi:")) return null;
  const name = iconKey.slice(4);
  if (filled && name.endsWith("-outline")) {
    const filledName = name.replace(/-outline$/, "");
    if (hasGlyph(MCI_GLYPHS, filledName)) return filledName as MCIName;
  }
  return hasGlyph(MCI_GLYPHS, name) ? (name as MCIName) : null;
}

function fa6Glyph(iconKey: string): FA6Name | null {
  if (!iconKey.startsWith("fa7-solid:") && !iconKey.startsWith("fa6-solid:")) {
    return null;
  }
  const name = iconKey.slice(10);
  return hasGlyph(FA6_GLYPHS, name) ? (name as FA6Name) : null;
}

export type GoalIconProps = {
  iconKey: string;
  size: number;
  color: string;
  filled?: boolean;
};

// True only when the icon will actually draw with the bundled fonts. Keep the
// icon picker's search filtered through this so users can't choose an icon that
// would fall back to the generic target or render as a "?".
export function isRenderableIconKey(iconKey: string): boolean {
  return mdiGlyph(iconKey) !== null || fa6Glyph(iconKey) !== null;
}

export function GoalIcon({ iconKey, size, color, filled }: GoalIconProps) {
  const mdiName = mdiGlyph(iconKey, filled);
  if (mdiName) {
    return <MaterialCommunityIcons name={mdiName} size={size} color={color} />;
  }
  const fa6Name = fa6Glyph(iconKey);
  if (fa6Name) {
    return <FontAwesome6 name={fa6Name} size={size} color={color} />;
  }
  return <SymbolView name={FALLBACK} size={size} tintColor={color} />;
}
