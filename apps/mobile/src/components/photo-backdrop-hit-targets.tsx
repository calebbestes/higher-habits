import { Pressable, StyleSheet, type ViewStyle } from "react-native";

export type ImageNaturalSize = {
  width: number;
  height: number;
};

export type ContainedImageFrame = {
  left: number;
  top: number;
  width: number;
  height: number;
};

export function getContainedImageFrame(
  naturalSize: ImageNaturalSize | null | undefined,
  viewportWidth: number,
  viewportHeight: number,
): ContainedImageFrame | null {
  if (
    !naturalSize ||
    naturalSize.width <= 0 ||
    naturalSize.height <= 0 ||
    viewportWidth <= 0 ||
    viewportHeight <= 0
  ) {
    return null;
  }

  const scale = Math.min(
    viewportWidth / naturalSize.width,
    viewportHeight / naturalSize.height,
  );
  const width = naturalSize.width * scale;
  const height = naturalSize.height * scale;

  return {
    left: (viewportWidth - width) / 2,
    top: (viewportHeight - height) / 2,
    width,
    height,
  };
}

export function PhotoBackdropHitTargets({
  frame,
  viewportWidth,
  viewportHeight,
  onPress,
}: {
  frame: ContainedImageFrame | null;
  viewportWidth: number;
  viewportHeight: number;
  onPress: () => void;
}) {
  if (!frame) return null;

  const rightWidth = Math.max(0, viewportWidth - frame.left - frame.width);
  const bottomHeight = Math.max(0, viewportHeight - frame.top - frame.height);
  const regions: { key: string; style: ViewStyle }[] = [
    {
      key: "top",
      style: { top: 0, left: 0, width: viewportWidth, height: frame.top },
    },
    {
      key: "bottom",
      style: {
        top: frame.top + frame.height,
        left: 0,
        width: viewportWidth,
        height: bottomHeight,
      },
    },
    {
      key: "left",
      style: {
        top: frame.top,
        left: 0,
        width: frame.left,
        height: frame.height,
      },
    },
    {
      key: "right",
      style: {
        top: frame.top,
        left: frame.left + frame.width,
        width: rightWidth,
        height: frame.height,
      },
    },
  ];

  return (
    <>
      {regions.map((region) =>
        Number(region.style.width) > 0.5 &&
        Number(region.style.height) > 0.5 ? (
          <Pressable
            accessible={false}
            key={region.key}
            onPress={onPress}
            style={[styles.hitTarget, region.style]}
          />
        ) : null,
      )}
    </>
  );
}

const styles = StyleSheet.create({
  hitTarget: {
    position: "absolute",
    zIndex: 1,
  },
});
