export {
  createCategory,
  createHabit as createGoal,
  deleteHabit as deleteGoal,
  fetchCategories,
  fetchHabits as fetchGoals,
  updateHabit as updateGoal,
} from "@/lib/habits-client";
export type {
  Category,
  CategoryInput,
  Habit as Goal,
  HabitInput as GoalInput,
  HabitPeriod as GoalPeriod,
  HabitPriority as GoalPriority,
  HabitRepeatMonthlyType as GoalRepeatMonthlyType,
  HabitVisibility as GoalVisibility,
} from "@/lib/habits-client";
