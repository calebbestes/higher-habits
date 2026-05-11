"use client";

import {
  Button,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  cn,
} from "@heroui/react";
import { Icon } from "@iconify/react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { authClient } from "@/lib/auth-client";

const NAV_SECTIONS = [
  {
    key: "habits",
    label: "My Habits",
    icon: "fa7-solid:seedling",
    items: [
      { label: "Calendar", icon: "fa7-solid:calendar", href: "/calendar" },
      { label: "Goals", icon: "fa7-solid:bullseye", href: "/goals" },
      { label: "Tasks", icon: "fa7-solid:list-check", href: "/tasks" },
      { label: "Journal", icon: "fa7-solid:book-open", href: "/journal" },
    ],
  },
  {
    key: "tables",
    label: "My Tables",
    icon: "fa7-solid:table-list",
    items: [
      { label: "Contacts", icon: "fa7-solid:address-book", href: "/contacts" },
    ],
  },
  {
    key: "friends",
    label: "My Friends",
    icon: "fa7-solid:user-group",
    items: [],
  },
] as const;

type NavSectionKey = (typeof NAV_SECTIONS)[number]["key"];

const DEFAULT_OPEN_SECTIONS: Record<NavSectionKey, boolean> = {
  friends: true,
  habits: true,
  tables: true,
};

function isNavActive(href: string, pathname: string): boolean {
  if (href === "/calendar")
    return pathname === "/" || pathname.startsWith("/calendar");
  return pathname.startsWith(href);
}

export function SidebarLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isDark, setIsDark] = useState(true);
  const [openSignOut, setOpenSignOut] = useState(false);
  const [openSections, setOpenSections] = useState(DEFAULT_OPEN_SECTIONS);
  const isAuthPage = pathname === "/login" || pathname === "/sign-up";

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
          <div className="space-y-2 px-2">
            {NAV_SECTIONS.map((section) => {
              const isOpen = openSections[section.key];

              return (
                <section key={section.key} className="space-y-1">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    title={isCollapsed ? section.label : undefined}
                    onClick={() =>
                      setOpenSections((current) => ({
                        ...current,
                        [section.key]: !current[section.key],
                      }))
                    }
                    className={cn(
                      "flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm font-semibold text-foreground-700 transition-colors hover:bg-default-100 hover:text-foreground",
                      isCollapsed && "lg:justify-center lg:px-0",
                    )}
                  >
                    <Icon icon={section.icon} className="h-4 w-4 shrink-0" />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate text-left",
                        isCollapsed && "lg:hidden",
                      )}
                    >
                      {section.label}
                    </span>
                    <Icon
                      icon="fa7-solid:chevron-down"
                      className={cn(
                        "h-3 w-3 shrink-0 text-foreground-400 transition-transform",
                        !isOpen && "-rotate-90",
                        isCollapsed && "lg:hidden",
                      )}
                    />
                  </button>

                  {isOpen && section.items.length > 0 && (
                    <ul
                      className={cn(
                        "ml-8 space-y-1 border-l border-divider pl-3",
                        isCollapsed && "lg:ml-0 lg:border-l-0 lg:pl-0",
                      )}
                    >
                      {section.items.map((item) => {
                        const isCurrent = isNavActive(item.href, pathname);

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
                              <Icon
                                icon={item.icon}
                                className="h-4 w-4 shrink-0"
                              />
                              <span className={cn(isCollapsed && "lg:hidden")}>
                                {item.label}
                              </span>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
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
        {/* Mobile-only top strip */}
        <div className="flex h-10 shrink-0 items-center border-b border-divider bg-content1/80 px-2 lg:hidden">
          <Button
            isIconOnly
            variant="light"
            size="sm"
            onPress={() => setIsMobileOpen((o) => !o)}
            aria-label="Open menu"
            className="h-8 w-8"
          >
            <Icon icon="fa7-solid:bars" className="h-4 w-4" />
          </Button>
        </div>

        <main className="flex min-h-0 flex-1 flex-col overflow-auto">
          {children}
        </main>
      </div>

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
