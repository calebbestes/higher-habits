import { type MenuAction, MenuView } from "@expo/ui/community/menu";
import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { StyleSheet, Text, View } from "react-native";

import { useTheme } from "@/hooks/use-theme";

type SymbolName = SymbolViewProps["name"];
type DateKeyParts = { year: number; month: number; day: number };
type DatePart = "year" | "month" | "day";

const DATE_KEY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const CLEAR_DATE_ACTION = "clear-date";
const MONTH_OPTIONS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function symbol(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function menuSelectedState(selected: boolean): MenuAction["state"] {
  return selected ? "on" : undefined;
}

function parseDateKeyParts(dateKey: string | null | undefined) {
  if (!dateKey || !DATE_KEY_REGEX.test(dateKey)) return null;

  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() + 1 !== month ||
    date.getDate() !== day
  ) {
    return null;
  }

  return { year, month, day };
}

function getTodayDateParts(): DateKeyParts {
  const date = new Date();
  return {
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
  };
}

function getDatePartsForPicker(dateKey: string | null | undefined) {
  return parseDateKeyParts(dateKey) ?? getTodayDateParts();
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function formatDateKey({ year, month, day }: DateKeyParts) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(
    2,
    "0",
  )}`;
}

function updateDatePart(
  dateKey: string | null | undefined,
  part: DatePart,
  value: number,
) {
  const base = getDatePartsForPicker(dateKey);
  const next = { ...base, [part]: value };
  const daysInMonth = getDaysInMonth(next.year, next.month);

  return formatDateKey({ ...next, day: Math.min(next.day, daysInMonth) });
}

function getYearOptions(selectedYear: number | undefined) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 26 }, (_, index) => currentYear + index);

  // Keep an already-selected past year visible when editing an older item.
  if (selectedYear && !years.includes(selectedYear)) years.push(selectedYear);

  return years.sort((left, right) => left - right);
}

export function DatePartPicker({
  compact,
  value,
  onChange,
}: {
  compact?: boolean;
  value: string | null | undefined;
  onChange: (value: string | null) => void;
}) {
  const selected = parseDateKeyParts(value);
  const pickerParts = getDatePartsForPicker(value);
  const daysInMonth = getDaysInMonth(pickerParts.year, pickerParts.month);

  const yearActions: MenuAction[] = [
    {
      id: CLEAR_DATE_ACTION,
      title: "No date",
      state: menuSelectedState(!selected),
    },
    ...getYearOptions(selected?.year).map((year) => ({
      id: String(year),
      title: String(year),
      state: menuSelectedState(selected?.year === year),
    })),
  ];
  const monthActions: MenuAction[] = [
    {
      id: CLEAR_DATE_ACTION,
      title: "No date",
      state: menuSelectedState(!selected),
    },
    ...MONTH_OPTIONS.map((month, index) => ({
      id: String(index + 1),
      title: month,
      state: menuSelectedState(selected?.month === index + 1),
    })),
  ];
  const dayActions: MenuAction[] = [
    {
      id: CLEAR_DATE_ACTION,
      title: "No date",
      state: menuSelectedState(!selected),
    },
    ...Array.from({ length: daysInMonth }, (_, index) => index + 1).map(
      (day) => ({
        id: String(day),
        title: String(day),
        state: menuSelectedState(selected?.day === day),
      }),
    ),
  ];

  const selectPart = (part: DatePart, actionId: string) => {
    if (actionId === CLEAR_DATE_ACTION) {
      onChange(null);
      return;
    }

    onChange(updateDatePart(value, part, Number(actionId)));
  };

  return (
    <View style={styles.row}>
      <DatePartSelect
        actions={yearActions}
        compact={compact}
        label="Year"
        onSelect={(actionId) => selectPart("year", actionId)}
        value={selected ? String(selected.year) : null}
      />
      <DatePartSelect
        actions={monthActions}
        compact={compact}
        label="Mon"
        menuTitle="month"
        onSelect={(actionId) => selectPart("month", actionId)}
        value={selected ? MONTH_OPTIONS[selected.month - 1].slice(0, 3) : null}
      />
      <DatePartSelect
        actions={dayActions}
        compact={compact}
        label="Day"
        onSelect={(actionId) => selectPart("day", actionId)}
        value={selected ? String(selected.day) : null}
      />
    </View>
  );
}

function DatePartSelect({
  actions,
  compact,
  label,
  menuTitle,
  value,
  onSelect,
}: {
  actions: MenuAction[];
  compact?: boolean;
  label: string;
  menuTitle?: string;
  value: string | null;
  onSelect: (actionId: string) => void;
}) {
  const theme = useTheme();
  const displayValue = value ?? label;

  return (
    <MenuView
      actions={actions}
      onPressAction={({ nativeEvent }) => onSelect(nativeEvent.event)}
      style={styles.menu}
      title={`Select ${menuTitle ?? label.toLowerCase()}`}
    >
      <View
        accessible
        accessibilityLabel={`Select ${menuTitle ?? label.toLowerCase()}`}
        accessibilityRole="button"
        style={[
          styles.select,
          compact && styles.selectCompact,
          {
            backgroundColor: theme.backgroundElement,
            borderColor: theme.tabBorder,
          },
        ]}
      >
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.78}
          style={[
            styles.selectText,
            compact && styles.selectTextCompact,
            { color: value ? theme.text : theme.textSecondary },
          ]}
        >
          {displayValue}
        </Text>
        <SymbolView
          name={symbol("chevron.down", "keyboard_arrow_down")}
          size={compact ? 11 : 13}
          weight="semibold"
          tintColor={theme.textSecondary}
        />
      </View>
    </MenuView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
  },
  menu: {
    flex: 1,
    minWidth: 0,
  },
  select: {
    minHeight: 49,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 5,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 15,
    paddingHorizontal: 10,
  },
  selectCompact: {
    minHeight: 44,
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  selectText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: "700",
  },
  selectTextCompact: {
    fontSize: 13,
    lineHeight: 17,
  },
});
