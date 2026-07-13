import * as Haptics from "expo-haptics";
import { Platform } from "react-native";

export function playSelectionHaptic() {
  if (Platform.OS === "web") return;
  void (
    Platform.OS === "android"
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick)
      : Haptics.selectionAsync()
  ).catch(() => {});
}

export function playSuccessHaptic() {
  if (Platform.OS === "web") return;
  void (
    Platform.OS === "android"
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  ).catch(() => {});
}

export function playWarningHaptic() {
  if (Platform.OS === "web") return;
  void (
    Platform.OS === "android"
      ? Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Reject)
      : Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
  ).catch(() => {});
}
