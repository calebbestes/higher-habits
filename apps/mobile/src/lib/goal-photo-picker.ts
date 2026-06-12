import { SaveFormat, manipulateAsync } from "expo-image-manipulator";
import * as ImagePicker from "expo-image-picker";
import { Platform } from "react-native";

import type { GoalPhotoUpload } from "@/lib/goal-photos-client";

export type GoalPhotoSource = "camera" | "library";

const MAX_IMAGE_DIMENSION = 2400;

function resizeAction(asset: ImagePicker.ImagePickerAsset) {
  const largestDimension = Math.max(asset.width, asset.height);
  if (largestDimension <= MAX_IMAGE_DIMENSION) return [];

  return [
    {
      resize:
        asset.width >= asset.height
          ? { width: MAX_IMAGE_DIMENSION }
          : { height: MAX_IMAGE_DIMENSION },
    },
  ];
}

async function requestPermission(source: GoalPhotoSource) {
  const permission =
    source === "camera"
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

  if (!permission.granted) {
    throw new Error(
      source === "camera"
        ? "Camera permission is required to take a photo."
        : "Photo library permission is required to add a photo.",
    );
  }
}

export async function pickGoalPhoto(
  source: GoalPhotoSource,
): Promise<GoalPhotoUpload | null> {
  await requestPermission(source);

  const options: ImagePicker.ImagePickerOptions = {
    allowsEditing: false,
    allowsMultipleSelection: false,
    mediaTypes: ["images"],
    quality: 0.8,
  };
  const result =
    source === "camera"
      ? await ImagePicker.launchCameraAsync(options)
      : await ImagePicker.launchImageLibraryAsync(options);

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  if (Platform.OS === "web" && asset.file) {
    return {
      uri: asset.uri,
      name: asset.file.name,
      type: asset.file.type || "image/jpeg",
      file: asset.file,
    };
  }

  const normalized = await manipulateAsync(asset.uri, resizeAction(asset), {
    compress: 0.72,
    format: SaveFormat.JPEG,
  });

  return {
    uri: normalized.uri,
    name: `goal-photo-${Date.now()}.jpg`,
    type: "image/jpeg",
  };
}
