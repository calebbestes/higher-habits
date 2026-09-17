import { HStack, Spacer, Text, VStack } from "@expo/ui/swift-ui";
import {
  background,
  cornerRadius,
  font,
  foregroundStyle,
  padding,
} from "@expo/ui/swift-ui/modifiers";
import { type WidgetEnvironment, createWidget } from "expo-widgets";

export type TodayPlanWidgetItem = {
  id: string;
  title: string;
  time: string;
  accent: string;
};

export type TodayPlanWidgetProps = {
  dateLabel: string;
  items: TodayPlanWidgetItem[];
  remainingCount: number;
};

const TodayPlanWidget = (
  props: TodayPlanWidgetProps,
  _environment: WidgetEnvironment,
) => {
  "widget";

  const visibleItems = props.items.slice(0, 3);

  return (
    <VStack
      alignment="leading"
      spacing={8}
      modifiers={[
        background("#FFFFFF"),
        cornerRadius(22),
        padding({ all: 16 }),
      ]}
    >
      <HStack alignment="firstTextBaseline" spacing={6}>
        <Text
          modifiers={[
            font({ weight: "bold", size: 16 }),
            foregroundStyle("#111111"),
          ]}
        >
          TODAY'S PLAN
        </Text>
        <Spacer />
        <Text modifiers={[font({ size: 12 }), foregroundStyle("#6B7280")]}>
          {props.dateLabel}
        </Text>
      </HStack>
      {visibleItems.length === 0 ? (
        <Text modifiers={[font({ size: 15 }), foregroundStyle("#6B7280")]}>
          Nothing scheduled today
        </Text>
      ) : (
        <VStack alignment="leading" spacing={7}>
          {visibleItems.map((item) => (
            <HStack key={item.id} alignment="firstTextBaseline" spacing={8}>
              <Text
                modifiers={[
                  font({ weight: "bold", size: 13 }),
                  foregroundStyle(item.accent),
                ]}
              >
                {item.time}
              </Text>
              <Text
                modifiers={[
                  font({ weight: "semibold", size: 15 }),
                  foregroundStyle("#111111"),
                ]}
              >
                {item.title}
              </Text>
            </HStack>
          ))}
          {props.remainingCount > 0 ? (
            <Text modifiers={[font({ size: 12 }), foregroundStyle("#6B7280")]}>
              +{props.remainingCount} more
            </Text>
          ) : null}
        </VStack>
      )}
    </VStack>
  );
};

export default createWidget("TodayPlanWidget", TodayPlanWidget);
