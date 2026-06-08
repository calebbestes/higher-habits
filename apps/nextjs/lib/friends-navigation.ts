export const FRIENDS_SECTIONS = [
  {
    key: "feed",
    label: "Feed",
    icon: "mdi:view-stream-outline",
    href: "/friends?section=feed",
  },
  {
    key: "messages",
    label: "Messages",
    icon: "mdi:message-text-outline",
    href: "/friends?section=messages",
  },
  {
    key: "incentives",
    label: "Incentives",
    icon: "mdi:gift-outline",
    href: "/friends?section=incentives",
  },
  {
    key: "shared-goals",
    label: "Shared Goals",
    icon: "mdi:account-group-outline",
    href: "/friends?section=shared-goals",
  },
  {
    key: "friends",
    label: "Friends",
    icon: "fa7-solid:user-group",
    href: "/friends?section=friends",
  },
] as const;

export type FriendsSection = (typeof FRIENDS_SECTIONS)[number]["key"];

export function parseFriendsSection(value: string | undefined): FriendsSection {
  return (
    FRIENDS_SECTIONS.find((section) => section.key === value)?.key ?? "messages"
  );
}
