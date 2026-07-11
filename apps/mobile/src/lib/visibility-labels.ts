import type { HabitVisibility } from "@/lib/habits-client";

export const VISIBILITY_LABELS: Record<HabitVisibility, string> = {
  only_me: "Only me",
  goal_friends: "Linked friends",
  all_friends: "All friends",
};
