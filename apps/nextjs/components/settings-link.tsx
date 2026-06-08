"use client";

import { Tooltip, cn } from "@heroui/react";
import { Icon } from "@iconify/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function SettingsLink({ className }: { className?: string }) {
  const pathname = usePathname();

  return (
    <Tooltip content="Settings" color="foreground">
      <Link
        href="/settings"
        aria-label="Settings"
        aria-current={pathname === "/settings" ? "page" : undefined}
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-divider bg-content1 text-foreground-500 shadow-sm transition-colors hover:bg-default-100 hover:text-foreground",
          pathname === "/settings" &&
            "border-primary/30 bg-primary/10 text-primary",
          className,
        )}
      >
        <Icon icon="mdi:cog-outline" className="h-5 w-5" />
      </Link>
    </Tooltip>
  );
}
