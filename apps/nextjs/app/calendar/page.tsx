import { redirect } from "next/navigation";

type CalendarPageProps = {
  searchParams?: Promise<{
    dashboard?: string | string[];
  }>;
};

export default async function CalendarPage({
  searchParams,
}: CalendarPageProps) {
  const resolvedSearchParams = await searchParams;
  const dashboardParam = resolvedSearchParams?.dashboard;
  const shouldShowDashboard = Array.isArray(dashboardParam)
    ? dashboardParam.includes("1") || dashboardParam.includes("true")
    : dashboardParam === "1" || dashboardParam === "true";

  redirect(shouldShowDashboard ? "/dashboard" : "/calendar/day");
}
