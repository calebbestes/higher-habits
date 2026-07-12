import { BrandedEmptyState } from "@/components/branded-empty-state";
import { withErrorTrace } from "@/components/component-error-boundary";

function EmptyStateImpl() {
  return (
    <BrandedEmptyState
      title="No daily habits yet"
      description="Add daily habits from the Habits section to track them here."
    />
  );
}

export const EmptyState = withErrorTrace(EmptyStateImpl, "EmptyState");
