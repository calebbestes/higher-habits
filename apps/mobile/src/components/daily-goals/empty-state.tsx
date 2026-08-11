import { BrandedEmptyState } from "@/components/branded-empty-state";
import { withErrorTrace } from "@/components/component-error-boundary";

function EmptyStateImpl({ onAdd }: { onAdd: () => void }) {
  return (
    <BrandedEmptyState
      actionLabel="Add habit"
      title="No daily habits yet"
      description="Habits are actions you repeat to make progress."
      onAction={onAdd}
    />
  );
}

export const EmptyState = withErrorTrace(EmptyStateImpl, "EmptyState");
