export {
  createCategory,
  createHabit as createGoal,
  deleteManyHabits as deleteManyGoals,
  fetchCategories,
  fetchHabits as fetchGoals,
  updateHabit as updateGoal,
} from "@/lib/habits-client";
export type {
  Category,
  CategoryInput,
  Habit as Goal,
  HabitInput as GoalInput,
  HabitVisibility as GoalVisibility,
} from "@/lib/habits-client";
