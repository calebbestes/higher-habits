import { Icon } from "@iconify/react";
import Link from "next/link";

import { SettingsLink } from "@/components/settings-link";

export const SETTINGS_SECTIONS = [
  {
    key: "profile",
    label: "Profile",
    icon: "mdi:account-outline",
  },
  {
    key: "appearance",
    label: "Appearance",
    icon: "mdi:palette-outline",
  },
  {
    key: "notifications",
    label: "Notifications",
    icon: "mdi:bell-outline",
  },
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["key"];

export function parseSettingsSection(
  value: string | undefined,
): SettingsSection {
  return (
    SETTINGS_SECTIONS.find((section) => section.key === value)?.key ?? "profile"
  );
}

export function SettingsPage({
  activeSection,
}: {
  activeSection: SettingsSection;
}) {
  const activeSectionDetails =
    SETTINGS_SECTIONS.find((section) => section.key === activeSection) ??
    SETTINGS_SECTIONS[0];

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-3 py-4 sm:p-6 lg:gap-8 lg:p-8">
      <header className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
          <Icon icon="mdi:cog-outline" className="h-5 w-5" />
        </div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          Settings
        </h1>
        <SettingsLink className="ml-auto" />
      </header>

      <div className="grid min-h-0 flex-1 gap-6 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
        <nav aria-label="Settings sections">
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:grid lg:gap-1 lg:overflow-visible lg:pb-0">
            {SETTINGS_SECTIONS.map((section) => {
              const isCurrent = section.key === activeSection;

              return (
                <li key={section.key} className="shrink-0 lg:shrink">
                  <Link
                    href={`/settings?section=${section.key}`}
                    aria-current={isCurrent ? "page" : undefined}
                    className={`flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-colors ${
                      isCurrent
                        ? "bg-primary/10 text-primary shadow-sm"
                        : "text-foreground-600 hover:bg-default-100 hover:text-foreground"
                    }`}
                  >
                    <Icon icon={section.icon} className="h-5 w-5 shrink-0" />
                    {section.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <section
          aria-labelledby="settings-section-title"
          className="min-h-64 rounded-2xl border border-divider bg-content1 p-5 sm:p-6"
        >
          <h2
            id="settings-section-title"
            className="text-xl font-semibold sm:text-2xl"
          >
            {activeSectionDetails.label}
          </h2>
        </section>
      </div>
    </div>
  );
}
