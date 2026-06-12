import { FontAwesome6, MaterialCommunityIcons } from "@expo/vector-icons";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import type React from "react";

type SymbolName = SymbolViewProps["name"];
type MCIName = React.ComponentProps<typeof MaterialCommunityIcons>["name"];
type FA6Name = React.ComponentProps<typeof FontAwesome6>["name"];

const FALLBACK: SymbolName = { ios: "target", android: "target", web: "target" } as SymbolName;

export type GoalIconProps = {
  iconKey: string;
  size: number;
  color: string;
};

export function GoalIcon({ iconKey, size, color }: GoalIconProps) {
  if (iconKey.startsWith("mdi:")) {
    return (
      <MaterialCommunityIcons
        name={iconKey.slice(4) as MCIName}
        size={size}
        color={color}
      />
    );
  }
  if (iconKey.startsWith("fa7-solid:") || iconKey.startsWith("fa6-solid:")) {
    return (
      <FontAwesome6
        name={iconKey.slice(10) as FA6Name}
        size={size}
        color={color}
      />
    );
  }
  return <SymbolView name={FALLBACK} size={size} tintColor={color} />;
}
