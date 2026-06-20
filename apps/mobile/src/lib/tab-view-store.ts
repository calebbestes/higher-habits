import { useSyncExternalStore } from "react";

/**
 * A tiny external store for remembering the last-selected sub-view of a tab,
 * so switching tabs and coming back restores where you were. Read with
 * useSyncExternalStore (no effects, no tearing) and written from event
 * handlers when the user picks a view.
 */
function createSelectionStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();

  const get = () => value;
  const set = (next: T) => {
    if (Object.is(next, value)) return;
    value = next;
    for (const listener of listeners) listener();
  };
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return { get, set, subscribe };
}

export type PlanReportView = "day-plan" | "habits" | "goals" | "top-tasks";
export type HabitsTab = "daily" | "monthly";
export type CollabSection = "feed" | "incentives" | "shared-goals" | "friends";

const planReportStore = createSelectionStore<PlanReportView>("habits");
const habitsTabStore = createSelectionStore<HabitsTab>("daily");
const collabStore = createSelectionStore<CollabSection>("feed");

export function usePlanReportView(): PlanReportView {
  return useSyncExternalStore(
    planReportStore.subscribe,
    planReportStore.get,
    planReportStore.get,
  );
}

export function setPlanReportView(view: PlanReportView): void {
  planReportStore.set(view);
}

export function useHabitsTab(): HabitsTab {
  return useSyncExternalStore(
    habitsTabStore.subscribe,
    habitsTabStore.get,
    habitsTabStore.get,
  );
}

export function setHabitsTab(tab: HabitsTab): void {
  habitsTabStore.set(tab);
}

export function useCollabSection(): CollabSection {
  return useSyncExternalStore(
    collabStore.subscribe,
    collabStore.get,
    collabStore.get,
  );
}

export function setCollabSection(section: CollabSection): void {
  collabStore.set(section);
}

export function isPlanReportView(value: unknown): value is PlanReportView {
  return (
    value === "day-plan" ||
    value === "habits" ||
    value === "goals" ||
    value === "top-tasks"
  );
}

export function isCollabSection(value: unknown): value is CollabSection {
  return (
    value === "feed" ||
    value === "incentives" ||
    value === "shared-goals" ||
    value === "friends"
  );
}
