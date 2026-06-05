"use client";

import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  Popover,
  PopoverContent,
  PopoverTrigger,
  cn,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";

const MOBILE_NAV_ITEMS = [
  { label: "Calendar", icon: "fa7-solid:calendar", href: "/calendar" },
  { label: "Friends", icon: "fa7-solid:user-group", href: "/friends" },
  {
    label: "Dashboard",
    icon: "fa7-solid:gauge-high",
    href: "/calendar?dashboard=1",
  },
  { label: "Journal", icon: "fa7-solid:book-open", href: "/journal" },
] as const;

const MOBILE_ADD_ITEMS = [
  { label: "Goals", icon: "fa7-solid:bullseye", href: "/goals" },
  { label: "Tasks", icon: "fa7-solid:list-check", href: "/tasks" },
] as const;

const CONTACTS_NAV_ITEM = {
  label: "Contacts",
  icon: "fa7-solid:address-book",
  href: "/contacts",
} as const;

function isDashboardPath(pathname: string, dashboardParam: string | null) {
  return (
    pathname.startsWith("/calendar") &&
    (dashboardParam === "1" || dashboardParam === "true")
  );
}

function isNavActive(
  href: string,
  pathname: string,
  dashboardParam: string | null,
): boolean {
  const isDashboard = isDashboardPath(pathname, dashboardParam);

  if (href === "/calendar") {
    return (
      (pathname === "/" || pathname.startsWith("/calendar")) && !isDashboard
    );
  }

  if (href === "/calendar?dashboard=1") {
    return isDashboard;
  }

  return pathname.startsWith(href);
}

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dashboardParam = searchParams.get("dashboard");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [openSignOut, setOpenSignOut] = useState(false);
  const [isMobileAddOpen, setIsMobileAddOpen] = useState(false);
  const isAuthPage = pathname === "/login" || pathname === "/sign-up";
  const isAddRoute = MOBILE_ADD_ITEMS.some((item) =>
    isNavActive(item.href, pathname, dashboardParam),
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  const handleSignOut = async () => {
    setOpenSignOut(false);
    await authClient.signOut();
    router.replace("/login");
    router.refresh();
  };

  if (isAuthPage) {
    return <div className="min-h-dvh bg-background">{children}</div>;
  }

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* Mobile backdrop */}
      {isMobileOpen && (
        <div
          role="presentation"
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setIsMobileOpen(false)}
          onKeyDown={() => setIsMobileOpen(false)}
        />
      )}

      {/* ── Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex flex-col border-r border-divider bg-content1 transition-all duration-200",
          "lg:static lg:z-auto",
          isCollapsed ? "lg:w-14" : "lg:w-60",
          isMobileOpen
            ? "w-64 translate-x-0"
            : "-translate-x-full lg:translate-x-0",
        )}
      >
        {/* Sidebar.Header */}
        <div
          className={cn(
            "flex h-24 shrink-0 items-center justify-center border-b border-divider px-4",
            isCollapsed ? "lg:justify-center lg:px-0" : "px-4",
          )}
        >
          <img
            src={isDark ? "/abi_logo_dark.png" : "/abi_logo.png"}
            alt="ABI"
            className={cn(
              "h-auto w-full object-contain",
              isCollapsed ? "max-w-10" : "max-w-36",
            )}
          />
        </div>

        {/* Sidebar.Content */}
        <nav className="flex-1 overflow-y-auto py-3">
          <ul className="space-y-1 px-2">
            {MOBILE_NAV_ITEMS.slice(0, 2).map((item) => {
              const isCurrent = isNavActive(
                item.href,
                pathname,
                dashboardParam,
              );

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setIsMobileOpen(false)}
                    title={isCollapsed ? item.label : undefined}
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                      isCollapsed && "lg:justify-center lg:px-0",
                      isCurrent
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-foreground-600 hover:bg-default-100 hover:text-foreground",
                    )}
                  >
                    <Icon icon={item.icon} className="h-4 w-4 shrink-0" />
                    <span className={cn(isCollapsed && "lg:hidden")}>
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}

            <li>
              <Link
                href={CONTACTS_NAV_ITEM.href}
                onClick={() => setIsMobileOpen(false)}
                title={isCollapsed ? CONTACTS_NAV_ITEM.label : undefined}
                aria-current={
                  isNavActive(CONTACTS_NAV_ITEM.href, pathname, dashboardParam)
                    ? "page"
                    : undefined
                }
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                  isCollapsed && "lg:justify-center lg:px-0",
                  isNavActive(CONTACTS_NAV_ITEM.href, pathname, dashboardParam)
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-foreground-600 hover:bg-default-100 hover:text-foreground",
                )}
              >
                <Icon
                  icon={CONTACTS_NAV_ITEM.icon}
                  className="h-4 w-4 shrink-0"
                />
                <span className={cn(isCollapsed && "lg:hidden")}>
                  {CONTACTS_NAV_ITEM.label}
                </span>
              </Link>
            </li>

            <li className="space-y-1">
              <div
                title={isCollapsed ? "Add" : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold transition-colors",
                  isCollapsed && "lg:justify-center lg:px-0",
                  isAddRoute
                    ? "bg-primary/10 text-primary"
                    : "text-foreground-700",
                )}
              >
                <Icon icon="fa7-solid:plus" className="h-4 w-4 shrink-0" />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate",
                    isCollapsed && "lg:hidden",
                  )}
                >
                  Add
                </span>
              </div>

              <ul
                className={cn(
                  "ml-8 space-y-1 border-l border-divider pl-3",
                  isCollapsed && "lg:ml-0 lg:border-l-0 lg:pl-0",
                )}
              >
                {MOBILE_ADD_ITEMS.map((item) => {
                  const isCurrent = isNavActive(
                    item.href,
                    pathname,
                    dashboardParam,
                  );

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setIsMobileOpen(false)}
                        title={isCollapsed ? item.label : undefined}
                        aria-current={isCurrent ? "page" : undefined}
                        className={cn(
                          "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                          isCollapsed && "lg:justify-center lg:px-0",
                          isCurrent
                            ? "bg-primary text-primary-foreground shadow-sm"
                            : "text-foreground-600 hover:bg-default-100 hover:text-foreground",
                        )}
                      >
                        <Icon icon={item.icon} className="h-4 w-4 shrink-0" />
                        <span className={cn(isCollapsed && "lg:hidden")}>
                          {item.label}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </li>

            {MOBILE_NAV_ITEMS.slice(2).map((item) => {
              const isCurrent = isNavActive(
                item.href,
                pathname,
                dashboardParam,
              );

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={() => setIsMobileOpen(false)}
                    title={isCollapsed ? item.label : undefined}
                    aria-current={isCurrent ? "page" : undefined}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors",
                      isCollapsed && "lg:justify-center lg:px-0",
                      isCurrent
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-foreground-600 hover:bg-default-100 hover:text-foreground",
                    )}
                  >
                    <Icon icon={item.icon} className="h-4 w-4 shrink-0" />
                    <span className={cn(isCollapsed && "lg:hidden")}>
                      {item.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Sidebar.Footer */}
        <div className="shrink-0 border-t border-divider p-2">
          <ul className="space-y-0.5">
            <li>
              <button
                type="button"
                onClick={() => setIsDark((d) => !d)}
                title={
                  isCollapsed
                    ? isDark
                      ? "Light mode"
                      : "Dark mode"
                    : undefined
                }
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-foreground-600 transition-colors hover:bg-default-100 hover:text-foreground",
                  isCollapsed && "lg:justify-center lg:px-0",
                )}
              >
                <Icon
                  icon={isDark ? "lucide:sun" : "lucide:moon"}
                  className="h-4 w-4 shrink-0"
                />
                <span className={cn(isCollapsed && "lg:hidden")}>
                  {isDark ? "Light mode" : "Dark mode"}
                </span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => setOpenSignOut(true)}
                title={isCollapsed ? "Log Out" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium text-foreground-600 transition-colors hover:bg-danger-50 hover:text-danger",
                  isCollapsed && "lg:justify-center lg:px-0",
                )}
              >
                <Icon
                  icon="fa7-solid:arrow-right-from-bracket"
                  className="h-4 w-4 shrink-0"
                />
                <span className={cn(isCollapsed && "lg:hidden")}>Log Out</span>
              </button>
            </li>
          </ul>
        </div>

        {/* Sidebar rail — desktop collapse toggle */}
        <button
          type="button"
          onClick={() => setIsCollapsed((c) => !c)}
          aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-1/2 hidden h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-divider bg-content1 shadow-sm transition-colors hover:bg-default-100 lg:flex"
        >
          <Icon
            icon={
              isCollapsed ? "fa7-solid:chevron-right" : "fa7-solid:chevron-left"
            }
            className="h-2.5 w-2.5 text-foreground-400"
          />
        </button>
      </aside>

      {/* ── Main area ────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex min-h-0 flex-1 flex-col overflow-auto pb-20 lg:pb-0">
          {children}
        </main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-divider bg-content1/95 px-2 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] pt-2 shadow-lg backdrop-blur lg:hidden">
        <ul className="grid grid-cols-5 gap-1">
          {MOBILE_NAV_ITEMS.slice(0, 2).map((item) => {
            const isCurrent = isNavActive(item.href, pathname, dashboardParam);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  aria-current={isCurrent ? "page" : undefined}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[0.7rem] font-semibold leading-none transition-colors",
                    isCurrent
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground-500 hover:bg-default-100 hover:text-foreground",
                  )}
                >
                  <Icon icon={item.icon} className="h-5 w-5 shrink-0" />
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li>
            <Popover
              isOpen={isMobileAddOpen}
              onOpenChange={setIsMobileAddOpen}
              placement="top"
            >
              <PopoverTrigger>
                <button
                  type="button"
                  aria-label="Add"
                  className={cn(
                    "flex h-14 w-full flex-col items-center justify-center gap-1 rounded-xl text-[0.7rem] font-semibold leading-none transition-colors",
                    isMobileAddOpen || isAddRoute
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground-500 hover:bg-default-100 hover:text-foreground",
                  )}
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
                    <Icon icon="fa7-solid:plus" className="h-4 w-4" />
                  </span>
                  <span className="max-w-full truncate">Add</span>
                </button>
              </PopoverTrigger>
              <PopoverContent className="w-36 p-2">
                <div className="grid gap-1">
                  {MOBILE_ADD_ITEMS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => {
                        setIsMobileOpen(false);
                        setIsMobileAddOpen(false);
                      }}
                      className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold text-foreground-700 transition-colors hover:bg-default-100 hover:text-foreground"
                    >
                      <Icon icon={item.icon} className="h-4 w-4 shrink-0" />
                      {item.label}
                    </Link>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </li>
          {MOBILE_NAV_ITEMS.slice(2).map((item) => {
            const isCurrent = isNavActive(item.href, pathname, dashboardParam);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => {
                    setIsMobileOpen(false);
                    setIsMobileAddOpen(false);
                  }}
                  aria-current={isCurrent ? "page" : undefined}
                  className={cn(
                    "flex h-14 flex-col items-center justify-center gap-1 rounded-xl text-[0.7rem] font-semibold leading-none transition-colors",
                    isCurrent
                      ? "bg-primary text-primary-foreground shadow-sm"
                      : "text-foreground-500 hover:bg-default-100 hover:text-foreground",
                  )}
                >
                  <Icon icon={item.icon} className="h-5 w-5 shrink-0" />
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* ── Sign-out confirmation modal ──────────────────────────── */}
      <Modal
        isOpen={openSignOut}
        onOpenChange={(open) => !open && setOpenSignOut(false)}
        size="sm"
        backdrop="blur"
      >
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1">Log Out</ModalHeader>
          <ModalBody>
            <p className="text-sm text-foreground-600">
              Are you sure you want to log out?
            </p>
          </ModalBody>
          <ModalFooter>
            <Button variant="flat" onPress={() => setOpenSignOut(false)}>
              Cancel
            </Button>
            <Button color="danger" onPress={handleSignOut}>
              Log Out
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </div>
  );
}
