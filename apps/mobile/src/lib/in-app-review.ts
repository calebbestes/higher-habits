import * as SecureStore from "expo-secure-store";

export type ReviewMilestone = "goal" | "habit" | "post" | "task";

const MILESTONE_KEYS: Record<ReviewMilestone, string> = {
  goal: "float_review_milestone_goal",
  habit: "float_review_milestone_habit",
  post: "float_review_milestone_post",
  task: "float_review_milestone_task",
};
const REVIEW_REQUESTED_KEY = "float_review_requested_after_core_loop";
const REVIEW_DELAY_MS = 900;

let isCheckingReview = false;

export async function recordReviewMilestone(milestone: ReviewMilestone) {
  try {
    await SecureStore.setItemAsync(MILESTONE_KEYS[milestone], "1");
    setTimeout(() => {
      void maybeRequestReview();
    }, REVIEW_DELAY_MS);
  } catch {
    // Review prompts are nice-to-have; never interrupt the user's create flow.
  }
}

async function maybeRequestReview() {
  if (isCheckingReview) return;
  isCheckingReview = true;

  try {
    const wasRequested = await SecureStore.getItemAsync(REVIEW_REQUESTED_KEY);
    if (wasRequested === "1") return;

    const milestoneValues = await Promise.all(
      Object.values(MILESTONE_KEYS).map((key) => SecureStore.getItemAsync(key)),
    );
    if (milestoneValues.some((value) => value !== "1")) return;

    const StoreReview = await import("expo-store-review");
    const canRequestReview = await StoreReview.hasAction();
    if (!canRequestReview) return;

    await SecureStore.setItemAsync(REVIEW_REQUESTED_KEY, "1");
    await StoreReview.requestReview();
  } catch {
    // Apple decides whether to show the prompt; failures should stay invisible.
  } finally {
    isCheckingReview = false;
  }
}
