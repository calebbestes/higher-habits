import { SymbolView, type SymbolViewProps } from "expo-symbols";
import { useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  RichEditor,
  RichToolbar,
  actions,
} from "react-native-pell-rich-editor";
import { SafeAreaView } from "react-native-safe-area-context";

import { useTheme } from "@/hooks/use-theme";

type SymbolName = SymbolViewProps["name"];

const EDITOR_ACTIONS = [
  actions.setBold,
  actions.setItalic,
  actions.setStrikethrough,
  actions.heading1,
  actions.insertBulletsList,
  actions.insertOrderedList,
  actions.blockquote,
  actions.undo,
  actions.redo,
];

function sym(ios: string, android: string): SymbolName {
  return { ios, android, web: android } as SymbolName;
}

function normalizeEditorHtml(html: string): string {
  const visibleText = html
    .replace(/<br\s*\/?>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#8203;/g, "")
    .trim();

  return visibleText ? html.trim() : "";
}

export function GoalNoteEditorModal({
  dateKey,
  goalName,
  initialValue,
  onClose,
  onSave,
}: {
  dateKey: string;
  goalName: string;
  initialValue: string | null;
  onClose: () => void;
  onSave: (html: string) => Promise<void>;
}) {
  const theme = useTheme();
  const editorRef = useRef<RichEditor>(null);
  const [value, setValue] = useState(initialValue ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorStyle = useMemo(
    () => ({
      backgroundColor: theme.tabBar,
      color: theme.text,
      caretColor: theme.primary,
      placeholderColor: theme.textSecondary,
      contentCSSText: `
        body {
          font-size: 16px;
          line-height: 1.55;
          padding: 14px;
        }
        p, h1, ul, ol, blockquote { margin: 0 0 0.7em; }
        h1 { font-size: 18px; line-height: 1.4; }
        ul, ol { padding-left: 1.4em; }
        blockquote {
          border-left: 3px solid ${theme.tabBorder};
          color: ${theme.textSecondary};
          padding-left: 0.8em;
        }
      `,
    }),
    [
      theme.primary,
      theme.tabBar,
      theme.tabBorder,
      theme.text,
      theme.textSecondary,
    ],
  );

  const save = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);

    try {
      await onSave(normalizeEditorHtml(value));
      onClose();
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Could not save note.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible
    >
      <SafeAreaView
        edges={["top", "bottom", "left", "right"]}
        style={[styles.screen, { backgroundColor: theme.background }]}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.screen}
        >
          <View style={[styles.header, { borderBottomColor: theme.tabBorder }]}>
            <Pressable
              accessibilityRole="button"
              disabled={isSaving}
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [
                styles.headerButton,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.cancelText, { color: theme.textSecondary }]}>
                Cancel
              </Text>
            </Pressable>
            <View style={styles.headerText}>
              <Text
                numberOfLines={1}
                style={[styles.title, { color: theme.text }]}
              >
                {goalName}
              </Text>
              <Text style={[styles.date, { color: theme.textSecondary }]}>
                {dateKey}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={isSaving}
              hitSlop={8}
              onPress={() => void save()}
              style={({ pressed }) => [
                styles.saveButton,
                { backgroundColor: theme.primary },
                isSaving && styles.disabled,
                pressed && styles.pressed,
              ]}
            >
              {isSaving ? (
                <ActivityIndicator
                  color={theme.primaryForeground}
                  size="small"
                />
              ) : (
                <Text
                  style={[styles.saveText, { color: theme.primaryForeground }]}
                >
                  Save
                </Text>
              )}
            </Pressable>
          </View>

          <ScrollView
            canCancelContentTouches
            contentContainerStyle={styles.content}
            keyboardShouldPersistTaps="handled"
          >
            <View>
              <Text style={[styles.sectionTitle, { color: theme.text }]}>
                Note
              </Text>
              <Text
                style={[
                  styles.sectionDescription,
                  { color: theme.textSecondary },
                ]}
              >
                Keep context, impressions, or follow-up thoughts for this day.
              </Text>
            </View>

            <View
              style={[
                styles.editorCard,
                { backgroundColor: theme.tabBar, borderColor: theme.tabBorder },
              ]}
            >
              <RichToolbar
                actions={EDITOR_ACTIONS}
                disabledIconTint={`${theme.tabIcon}55`}
                flatContainerStyle={styles.toolbarContent}
                getEditor={() => editorRef.current as RichEditor}
                iconTint={theme.tabIcon}
                selectedIconTint={theme.primary}
                style={[
                  styles.toolbar,
                  {
                    backgroundColor: theme.backgroundElement,
                    borderBottomColor: theme.tabBorder,
                  },
                ]}
              />
              <RichEditor
                ref={editorRef}
                autoCapitalize="sentences"
                autoCorrect
                defaultParagraphSeparator="p"
                editorStyle={editorStyle}
                initialContentHTML={initialValue ?? ""}
                initialHeight={280}
                onChange={setValue}
                placeholder="Write a note for this goal..."
                style={styles.editor}
                styleWithCSS={false}
              />
            </View>

            {error ? (
              <View style={styles.errorRow}>
                <SymbolView
                  name={sym("exclamationmark.circle.fill", "error")}
                  size={17}
                  tintColor="#9D474D"
                />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    minHeight: 66,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
  },
  headerButton: {
    minWidth: 58,
    minHeight: 40,
    justifyContent: "center",
  },
  cancelText: { fontSize: 15, lineHeight: 20, fontWeight: "700" },
  headerText: { flex: 1, alignItems: "center", gap: 1 },
  title: { maxWidth: "100%", fontSize: 16, lineHeight: 21, fontWeight: "800" },
  date: { fontSize: 11, lineHeight: 15, fontWeight: "600" },
  saveButton: {
    minWidth: 58,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 13,
    paddingHorizontal: 13,
  },
  saveText: { fontSize: 14, lineHeight: 18, fontWeight: "800" },
  content: { gap: 14, padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 17, lineHeight: 22, fontWeight: "800" },
  sectionDescription: {
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: "500",
  },
  editorCard: {
    minHeight: 340,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
  },
  toolbar: {
    minHeight: 48,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  toolbarContent: { paddingHorizontal: 4 },
  editor: { minHeight: 280 },
  errorRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  errorText: { flex: 1, color: "#9D474D", fontSize: 12, fontWeight: "600" },
  disabled: { opacity: 0.55 },
  pressed: { opacity: 0.72 },
});
