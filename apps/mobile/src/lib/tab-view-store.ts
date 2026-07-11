import { useSyncExternalStore } from "react";

/**
 * Tiny external stores for tab sub-view state and server-backed navigation
 * defaults. Read with useSyncExternalStore (no effects, no tearing) and
 * written from settings or tab/menu event handlers.
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
export type AppStartPage =
  | "plan-report"
  | "journal"
  | "collab"
  | "friends"
  | "dashboard"
  | "history"
  | "settings";

export const DEFAULT_PLAN_REPORT_VIEW: PlanReportView = "day-plan";
export const DEFAULT_COLLAB_SECTION: CollabSection = "shared-goals";
export const DEFAULT_APP_START_PAGE: AppStartPage = "collab";

export const PLAN_REPORT_VIEW_HREFS = {
  "day-plan": "/plan-report?view=day-plan",
  habits: "/plan-report?view=habits",
  goals: "/plan-report?view=goals",
  "top-tasks": "/plan-report?view=top-tasks",
} as const satisfies Record<PlanReportView, string>;

export const COLLAB_SECTION_HREFS = {
  feed: "/friends?section=feed",
  incentives: "/?section=incentives",
  "shared-goals": "/?section=shared-goals",
  friends: "/friends?section=friends",
} as const satisfies Record<CollabSection, string>;

const planReportStore = createSelectionStore<PlanReportView>(
  DEFAULT_PLAN_REPORT_VIEW,
);
const planReportDateStore = createSelectionStore<string | null>(null);
const habitsTabStore = createSelectionStore<HabitsTab>("daily");
const collabStore = createSelectionStore<CollabSection>(DEFAULT_COLLAB_SECTION);
const defaultPlanReportStore = createSelectionStore<PlanReportView>(
  DEFAULT_PLAN_REPORT_VIEW,
);
const defaultCollabStore = createSelectionStore<CollabSection>(
  DEFAULT_COLLAB_SECTION,
);
const defaultAppStartStore = createSelectionStore<AppStartPage>(
  DEFAULT_APP_START_PAGE,
);

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

export function usePlanReportDateKey(): string | null {
  return useSyncExternalStore(
    planReportDateStore.subscribe,
    planReportDateStore.get,
    planReportDateStore.get,
  );
}

export function setPlanReportDateKey(dateKey: string): void {
  planReportDateStore.set(dateKey);
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

export function useDefaultPlanReportView(): PlanReportView {
  return useSyncExternalStore(
    defaultPlanReportStore.subscribe,
    defaultPlanReportStore.get,
    defaultPlanReportStore.get,
  );
}

export function setDefaultPlanReportView(view: PlanReportView): void {
  defaultPlanReportStore.set(view);
}

export function useDefaultCollabSection(): CollabSection {
  return useSyncExternalStore(
    defaultCollabStore.subscribe,
    defaultCollabStore.get,
    defaultCollabStore.get,
  );
}

export function setDefaultCollabSection(section: CollabSection): void {
  defaultCollabStore.set(section);
}

export function useDefaultAppStartPage(): AppStartPage {
  return useSyncExternalStore(
    defaultAppStartStore.subscribe,
    defaultAppStartStore.get,
    defaultAppStartStore.get,
  );
}

export function setDefaultAppStartPage(page: AppStartPage): void {
  defaultAppStartStore.set(page);
}

export function applyNavigationDefaults({
  defaultAppStartPage,
  defaultCollabSection,
  defaultPlanReportView,
}: {
  defaultAppStartPage?: AppStartPage;
  defaultCollabSection?: CollabSection;
  defaultPlanReportView?: PlanReportView;
}): void {
  if (defaultPlanReportView) {
    setDefaultPlanReportView(defaultPlanReportView);
    setPlanReportView(defaultPlanReportView);
  }
  if (defaultCollabSection) {
    setDefaultCollabSection(defaultCollabSection);
    setCollabSection(defaultCollabSection);
  }
  if (defaultAppStartPage) setDefaultAppStartPage(defaultAppStartPage);
}

export function getAppStartHref({
  defaultAppStartPage,
  defaultCollabSection,
  defaultPlanReportView,
}: {
  defaultAppStartPage: AppStartPage;
  defaultCollabSection: CollabSection;
  defaultPlanReportView: PlanReportView;
}): string {
  if (defaultAppStartPage === "plan-report") {
    return PLAN_REPORT_VIEW_HREFS[defaultPlanReportView];
  }
  if (defaultAppStartPage === "collab") {
    return defaultCollabSection === "incentives"
      ? COLLAB_SECTION_HREFS.incentives
      : COLLAB_SECTION_HREFS["shared-goals"];
  }
  if (defaultAppStartPage === "friends") return "/friends?section=feed";
  if (defaultAppStartPage === "history") return "/history?section=dashboard";
  if (defaultAppStartPage === "journal") return "/journal";
  if (defaultAppStartPage === "dashboard") return "/dashboard";
  return "/settings";
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

export function isAppStartPage(value: unknown): value is AppStartPage {
  return (
    value === "plan-report" ||
    value === "journal" ||
    value === "collab" ||
    value === "friends" ||
    value === "dashboard" ||
    value === "history" ||
    value === "settings"
  );
}
