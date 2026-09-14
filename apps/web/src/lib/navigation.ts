export interface NavigationItem {
  readonly label: string;
  readonly href: string;
  readonly code: string;
}

export interface NavigationGroup {
  readonly label: string;
  readonly items: readonly NavigationItem[];
}

export const navigationGroups: readonly NavigationGroup[] = [
  {
    label: "Overview",
    items: [{ label: "Command center", href: "/app", code: "CC" }],
  },
  {
    label: "Decision network",
    items: [
      { label: "Intents", href: "/app/intents", code: "IN" },
      { label: "New intent", href: "/app/intents/new", code: "+I" },
      { label: "Mech marketplace", href: "/app/mechs", code: "ME" },
      { label: "Policies", href: "/app/policies", code: "PO" },
    ],
  },
  {
    label: "Value & evidence",
    items: [
      { label: "Executions", href: "/app/executions", code: "EX" },
      { label: "Treasury", href: "/app/treasury", code: "TR" },
      { label: "Proof library", href: "/app/proofs", code: "PR" },
    ],
  },
  {
    label: "Control plane",
    items: [
      {
        label: "Integrations",
        href: "/app/settings/integrations",
        code: "IG",
      },
      {
        label: "Security",
        href: "/app/settings/security",
        code: "SC",
      },
    ],
  },
] as const;

export const navigationItems = navigationGroups.flatMap((group) => group.items);

export const isNavigationItemActive = (
  pathname: string,
  href: string,
): boolean =>
  href === "/app"
    ? pathname === href
    : href === "/app/intents" && pathname === "/app/intents/new"
      ? false
      : pathname === href || pathname.startsWith(`${href}/`);
