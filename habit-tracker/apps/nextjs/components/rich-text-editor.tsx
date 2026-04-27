"use client";

import { Button } from "@heroui/react";
import { Icon } from "@iconify/react";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";

type RichTextEditorProps = {
  label?: string;
  value: string | null;
  onChange: (value: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  minHeight?: string;
};

type ToolbarButtonProps = {
  icon: string;
  title: string;
  onPress: () => void;
  isActive?: boolean;
  isDisabled?: boolean;
  fontSize?: number;
};

const DEFAULT_TOOLBAR_STATE = {
  isBold: false,
  canBold: false,
  isItalic: false,
  canItalic: false,
  isStrike: false,
  canStrike: false,
  isHeading2: false,
  canHeading2: false,
  isBulletList: false,
  canBulletList: false,
  isOrderedList: false,
  canOrderedList: false,
  isBlockquote: false,
  canBlockquote: false,
  canUndo: false,
  canRedo: false,
};

const ToolbarButton = ({
  icon,
  title,
  onPress,
  isActive = false,
  isDisabled = false,
  fontSize = 20,
}: ToolbarButtonProps) => {
  return (
    <Button
      type="button"
      isIconOnly
      size="sm"
      variant="light"
      onPress={onPress}
      isDisabled={isDisabled}
      className={`h-8 min-w-8 text-slate-600 data-[hover=true]:bg-slate-100 ${
        isActive ? "bg-slate-200 text-slate-950" : "bg-transparent"
      }`}
      title={title}
      aria-label={title}
    >
      <Icon icon={icon} fontSize={fontSize} />
    </Button>
  );
};

export const RichTextEditor = ({
  label,
  value,
  onChange,
  placeholder = "Write something...",
  disabled = false,
  minHeight = "120px",
}: RichTextEditorProps) => {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
    ],
    content: value ?? "",
    editable: !disabled,
    immediatelyRender: false,
    onUpdate: ({ editor: nextEditor }) => {
      onChange(nextEditor.isEmpty ? null : nextEditor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "tiptap min-h-[120px] px-3 py-3 text-sm leading-6 text-slate-800 focus:outline-none",
      },
    },
  });

  const toolbarState =
    useEditorState({
      editor,
      selector: ({ editor: nextEditor }) => {
        if (!nextEditor) {
          return DEFAULT_TOOLBAR_STATE;
        }

        return {
          isBold: nextEditor.isActive("bold"),
          canBold: nextEditor.can().chain().focus().toggleBold().run(),
          isItalic: nextEditor.isActive("italic"),
          canItalic: nextEditor.can().chain().focus().toggleItalic().run(),
          isStrike: nextEditor.isActive("strike"),
          canStrike: nextEditor.can().chain().focus().toggleStrike().run(),
          isHeading2: nextEditor.isActive("heading", { level: 2 }),
          canHeading2: nextEditor
            .can()
            .chain()
            .focus()
            .toggleHeading({ level: 2 })
            .run(),
          isBulletList: nextEditor.isActive("bulletList"),
          canBulletList: nextEditor
            .can()
            .chain()
            .focus()
            .toggleBulletList()
            .run(),
          isOrderedList: nextEditor.isActive("orderedList"),
          canOrderedList: nextEditor
            .can()
            .chain()
            .focus()
            .toggleOrderedList()
            .run(),
          isBlockquote: nextEditor.isActive("blockquote"),
          canBlockquote: nextEditor
            .can()
            .chain()
            .focus()
            .toggleBlockquote()
            .run(),
          canUndo: nextEditor.can().chain().focus().undo().run(),
          canRedo: nextEditor.can().chain().focus().redo().run(),
        };
      },
    }) ?? DEFAULT_TOOLBAR_STATE;

  useEffect(() => {
    if (!editor) {
      return;
    }

    const normalizedValue = value ?? "";
    const editorValue = editor.isEmpty ? "" : editor.getHTML();

    if (normalizedValue !== editorValue) {
      editor.commands.setContent(normalizedValue, { emitUpdate: false });
    }
  }, [value, editor]);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(!disabled);
  }, [disabled, editor]);

  if (!editor) {
    return null;
  }

  return (
    <div className="rich-text-editor flex flex-col gap-2">
      {label ? (
        <span className="text-sm font-medium text-slate-800">{label}</span>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm shadow-slate-200/40">
        {!disabled ? (
          <div className="flex flex-wrap gap-1 border-b border-slate-200 bg-slate-50/90 p-2">
            <ToolbarButton
              icon="fa7-solid:bold"
              title="Bold"
              onPress={() => editor.chain().focus().toggleBold().run()}
              isActive={toolbarState.isBold}
              isDisabled={!toolbarState.canBold}
            />
            <ToolbarButton
              icon="fa7-solid:italic"
              title="Italic"
              onPress={() => editor.chain().focus().toggleItalic().run()}
              isActive={toolbarState.isItalic}
              isDisabled={!toolbarState.canItalic}
            />
            <ToolbarButton
              icon="fa7-solid:strikethrough"
              title="Strikethrough"
              onPress={() => editor.chain().focus().toggleStrike().run()}
              isActive={toolbarState.isStrike}
              isDisabled={!toolbarState.canStrike}
            />
            <div className="mx-1 w-px bg-slate-200" />
            <ToolbarButton
              icon="fa7-solid:heading"
              title="Heading"
              onPress={() =>
                editor.chain().focus().toggleHeading({ level: 2 }).run()
              }
              isActive={toolbarState.isHeading2}
              isDisabled={!toolbarState.canHeading2}
            />
            <div className="mx-1 w-px bg-slate-200" />
            <ToolbarButton
              icon="fa7-solid:list-ul"
              title="Bullet List"
              onPress={() => editor.chain().focus().toggleBulletList().run()}
              isActive={toolbarState.isBulletList}
              isDisabled={!toolbarState.canBulletList}
            />
            <ToolbarButton
              icon="fa7-solid:list-ol"
              title="Numbered List"
              onPress={() => editor.chain().focus().toggleOrderedList().run()}
              isActive={toolbarState.isOrderedList}
              isDisabled={!toolbarState.canOrderedList}
            />
            <div className="mx-1 w-px bg-slate-200" />
            <ToolbarButton
              icon="fa7-solid:quote-left"
              title="Quote"
              onPress={() => editor.chain().focus().toggleBlockquote().run()}
              isActive={toolbarState.isBlockquote}
              isDisabled={!toolbarState.canBlockquote}
            />
            <div className="mx-1 w-px bg-slate-200" />
            <ToolbarButton
              icon="fa7-solid:rotate-left"
              title="Undo"
              onPress={() => editor.chain().focus().undo().run()}
              isDisabled={!toolbarState.canUndo}
              fontSize={18}
            />
            <ToolbarButton
              icon="fa7-solid:rotate-right"
              title="Redo"
              onPress={() => editor.chain().focus().redo().run()}
              isDisabled={!toolbarState.canRedo}
              fontSize={18}
            />
          </div>
        ) : null}

        <div style={{ minHeight }}>
          <EditorContent editor={editor} />
        </div>
      </div>

      <style jsx global>{`
        .rich-text-editor .ProseMirror p.is-editor-empty:first-child::before {
          color: #94a3b8;
          content: attr(data-placeholder);
          float: left;
          height: 0;
          pointer-events: none;
        }

        .rich-text-editor .ProseMirror p,
        .rich-text-editor .ProseMirror h2,
        .rich-text-editor .ProseMirror ul,
        .rich-text-editor .ProseMirror ol,
        .rich-text-editor .ProseMirror blockquote {
          margin: 0.55rem 0;
        }

        .rich-text-editor .ProseMirror > :first-child {
          margin-top: 0;
        }

        .rich-text-editor .ProseMirror > :last-child {
          margin-bottom: 0;
        }

        .rich-text-editor .ProseMirror h2 {
          font-size: 1rem;
          font-weight: 700;
          line-height: 1.5rem;
        }

        .rich-text-editor .ProseMirror ul,
        .rich-text-editor .ProseMirror ol {
          padding-left: 1.25rem;
        }

        .rich-text-editor .ProseMirror ul {
          list-style: disc;
        }

        .rich-text-editor .ProseMirror ol {
          list-style: decimal;
        }

        .rich-text-editor .ProseMirror blockquote {
          border-left: 3px solid #cbd5e1;
          color: #475569;
          padding-left: 0.9rem;
        }
      `}</style>
    </div>
  );
};
