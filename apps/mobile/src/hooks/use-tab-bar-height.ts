import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const TAB_BUTTON_HEIGHT = Platform.OS === "ios" ? 49 : 66;
const TAB_PADDING_TOP = Platform.OS === "ios" ? 0 : 6;
const MIN_BOTTOM_INSET = 6;

export function useTabBarHeight() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, MIN_BOTTOM_INSET);
  return TAB_PADDING_TOP + TAB_BUTTON_HEIGHT + bottomInset;
}
