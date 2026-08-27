import { Image } from "expo-image";
import { useMemo, useRef, useState } from "react";
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  type TextStyle,
  View,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/hooks/use-theme";

export type MentionInputFriend = {
  id: string;
  name: string;
  image?: string | null;
};

type MentionInputProps = Omit<
  TextInputProps,
  "onChangeText" | "onSelectionChange" | "selection" | "value"
> & {
  friends: MentionInputFriend[];
  inputStyle?: StyleProp<TextStyle>;
  onChangeText: (value: string) => void;
  onSelectionChange?: TextInputProps["onSelectionChange"];
  value: string;
  containerStyle?: StyleProp<ViewStyle>;
};

export function MentionInput({
  containerStyle,
  friends,
  inputStyle,
  onChangeText,
  onSelectionChange,
  value,
  ...textInputProps
}: MentionInputProps) {
  const theme = useTheme();
  const inputRef = useRef<TextInput>(null);
  const [selection, setSelection] = useState({
    start: value.length,
    end: value.length,
  });

  const suggestions = useMemo(() => {
    const cursor = Math.min(selection.end, value.length);
    const beforeCursor = value.slice(0, cursor);
    const match = beforeCursor.match(/(?:^|\s)@([^\s@]*)$/);
    if (!match) return [];

    const query = match[1].toLocaleLowerCase();
    return friends
      .filter((friend) => {
        const name = friend.name.toLocaleLowerCase();
        return !query || name.includes(query);
      })
      .slice(0, 6);
  }, [friends, selection.end, value]);

  const selectMention = (friend: MentionInputFriend) => {
    const cursor = Math.min(selection.end, value.length);
    const match = value.slice(0, cursor).match(/(?:^|\s)@([^\s@]*)$/);
    if (!match || match.index === undefined) return;

    const mentionStart = match.index + match[0].lastIndexOf("@");
    const nextValue = `${value.slice(0, mentionStart)}@${friend.name} ${value.slice(cursor)}`;
    const nextCursor = mentionStart + friend.name.length + 2;
    setSelection({ start: nextCursor, end: nextCursor });
    onChangeText(nextValue);
    inputRef.current?.focus();
  };

  return (
    <View style={[styles.container, containerStyle]}>
      {suggestions.length > 0 ? (
        <View
          style={[
            styles.suggestions,
            {
              backgroundColor: theme.background,
              borderColor: theme.tabBorder,
              shadowColor: theme.text,
            },
          ]}
        >
          {suggestions.map((friend) => (
            <Pressable
              key={friend.id}
              onPress={() => selectMention(friend)}
              style={({ pressed }) => [
                styles.suggestion,
                pressed && { backgroundColor: theme.backgroundElement },
              ]}
            >
              {friend.image ? (
                <Image
                  contentFit="cover"
                  source={{ uri: friend.image }}
                  style={styles.avatar}
                />
              ) : (
                <View
                  style={[
                    styles.avatar,
                    { backgroundColor: `${theme.primary}22` },
                  ]}
                >
                  <Text style={[styles.avatarText, { color: theme.primary }]}>
                    {friend.name.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
              )}
              <Text
                numberOfLines={1}
                style={[styles.name, { color: theme.text }]}
              >
                {friend.name}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}
      <TextInput
        {...textInputProps}
        ref={inputRef}
        selection={selection}
        style={inputStyle}
        value={value}
        onChangeText={onChangeText}
        onSelectionChange={(event) => {
          setSelection(event.nativeEvent.selection);
          onSelectionChange?.(event);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: "relative" },
  suggestions: {
    position: "absolute",
    bottom: "100%",
    left: 0,
    right: 0,
    zIndex: 20,
    maxHeight: 220,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    overflow: "hidden",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 8,
  },
  suggestion: {
    minHeight: 42,
    paddingHorizontal: 12,
    paddingVertical: 7,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { fontSize: 13, fontWeight: "700" },
  name: { flex: 1, fontSize: 15, fontWeight: "600" },
});
