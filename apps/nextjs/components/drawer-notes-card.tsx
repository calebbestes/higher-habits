"use client";

import { RichTextEditor } from "./rich-text-editor";
import { Card, CardBody, Chip } from "@heroui/react";
import { useEffect, useEffectEvent, useRef, useState } from "react";

type SaveState = "idle" | "saving" | "saved" | "error";

type DrawerNotesCardProps = {
  value: string | null;
  onSave: (nextValue: string | null) => Promise<void> | void;
  placeholder?: string;
};

const SAVE_STATE_LABELS: Record<SaveState, string> = {
  idle: "Autosaves",
  saving: "Saving...",
  saved: "Saved",
  error: "Retrying failed",
};

export const DrawerNotesCard = ({
  value,
  onSave,
  placeholder = "Add notes for this day...",
}: DrawerNotesCardProps) => {
  const normalizedValue = value ?? null;
  const [draftValue, setDraftValue] = useState<string | null>(normalizedValue);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const syncedValueRef = useRef<string | null>(normalizedValue);

  const persistDraft = useEffectEvent(async (nextValue: string | null) => {
    try {
      await onSave(nextValue);
      syncedValueRef.current = nextValue;
      setSaveState("saved");
    } catch {
      setSaveState("error");
    }
  });

  useEffect(() => {
    if (normalizedValue === syncedValueRef.current) {
      return;
    }

    syncedValueRef.current = normalizedValue;
    setDraftValue(normalizedValue);
    setSaveState("idle");
  }, [normalizedValue]);

  useEffect(() => {
    if (draftValue === syncedValueRef.current) {
      return;
    }

    setSaveState("saving");

    const timeoutId = window.setTimeout(() => {
      void persistDraft(draftValue);
    }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [draftValue, persistDraft]);

  useEffect(() => {
    if (saveState !== "saved") {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      setSaveState("idle");
    }, 1200);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [saveState]);

  return (
    <Card shadow="none" className="border border-slate-200/80 bg-white/90">
      <CardBody className="gap-3 p-3 sm:p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-slate-900">Notes</p>
            <p className="text-sm text-slate-500">
              Keep context, impressions, or follow-up thoughts for this day.
            </p>
          </div>
          <Chip
            size="sm"
            variant="flat"
            className="shrink-0 border border-slate-200 bg-slate-50 text-slate-600"
          >
            {SAVE_STATE_LABELS[saveState]}
          </Chip>
        </div>

        <RichTextEditor
          value={draftValue}
          onChange={setDraftValue}
          placeholder={placeholder}
          minHeight="140px"
        />
      </CardBody>
    </Card>
  );
};
