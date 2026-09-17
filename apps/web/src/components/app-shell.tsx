"use client";

import { EnvironmentBadge, StatusBadge } from "@synesis/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";

import {
  isNavigationItemActive,
  navigationGroups,
  type NavigationItem,
} from "../lib/navigation";
import { BrandMark } from "./brand-mark";

const initialActivity = [
  {
    id: "proof",
    time: "12:04:18",
    label: "Proof bundle sealed",
    status: "VERIFIED",
    href: "/verify/PRF-1041",
  },
  {
    id: "receipt",
    time: "12:03:51",
    label: "KeeperHub receipt confirmed",
    status: "FINAL",
    href: "/app/executions/KH-8831",
  },
  {
    id: "quorum",
    time: "12:02:07",
    label: "Quorum reached 2 / 2",
    status: "PASSED",
    href: "/app/intents/SYN-1041",
  },
  {
    id: "olas",
    time: "11:59:42",
    label: "Olas deliveries normalized",
    status: "READY",
    href: "/app/mechs",
  },
] as const;

type ActivityEvent = (typeof initialActivity)[number];

function NavigationLink({ item }: { readonly item: NavigationItem }) {
  const pathname = usePathname();
  const active = isNavigationItemActive(pathname, item.href);
  return (
    <Link href={item.href} aria-current={active ? "page" : undefined}>
      <span aria-hidden="true">{item.code}</span>
      {item.label}
    </Link>
  );
}

function Navigation() {
  return (
    <nav className="app-navigation" aria-label="Primary navigation">
      {navigationGroups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h2>{group.label}</h2>
          <ul>
            {group.items.map((item) => (
              <li key={item.href}>
                <NavigationLink item={item} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );
}

export interface AppShellProps {
  readonly mode: "demo" | "live";
  readonly children: ReactNode;
}

export function AppShell({ mode, children }: AppShellProps) {
  const [activityOpen, setActivityOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [hydrated, setHydrated] = useState(false);
  const [activity, setActivity] =
    useState<readonly ActivityEvent[]>(initialActivity);
  const pathname = usePathname();
  const mobileMenu = useRef<HTMLDetailsElement>(null);
  const commandButton = useRef<HTMLButtonElement>(null);
  const commandInput = useRef<HTMLInputElement>(null);
  const commandWasOpen = useRef(false);
  const previousPathname = useRef(pathname);

  useEffect(() => {
    setHydrated(true);
    void fetch("/api/activity", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) return;
        const payload = (await response.json()) as {
          events?: readonly ActivityEvent[];
        };
        if (payload.events?.length) setActivity(payload.events);
      })
      .catch(() => undefined);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActivityOpen(false);
        setCommandOpen(false);
        mobileMenu.current?.removeAttribute("open");
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen(true);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, []);

  useEffect(() => {
    if (previousPathname.current === pathname) return;
    previousPathname.current = pathname;
    mobileMenu.current?.removeAttribute("open");
    setCommandOpen(false);
    setCommandQuery("");
  }, [pathname]);

  useEffect(() => {
    if (commandOpen) commandInput.current?.focus();
    else if (commandWasOpen.current) commandButton.current?.focus();
    commandWasOpen.current = commandOpen;
  }, [commandOpen]);

  return (
    <div className="app-frame">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <aside className="app-sidebar">
        <Link
          className="app-brand"
          href="/app"
          aria-label="Synesis command center"
        >
          <BrandMark size={38} />
          <strong>SYNESIS</strong>
          <small>Agent economy OS</small>
        </Link>
        <Navigation />
        <div className="sidebar-foot">
          <span>ORGANIZATION</span>
          <strong>Synesis Labs</strong>
          <small>owner access</small>
        </div>
      </aside>

      <div className="app-workspace">
        <header className="app-topbar">
          <details className="mobile-menu" ref={mobileMenu}>
            <summary aria-label="Open navigation">
              <span />
              Menu
            </summary>
            <div>
              <Navigation />
            </div>
          </details>
          <EnvironmentBadge mode={mode} />
          <div className="topbar-actions">
            <button
              ref={commandButton}
              className="command-button"
              disabled={!hydrated}
              type="button"
              aria-label="Open command palette"
              aria-expanded={commandOpen}
              onClick={() => setCommandOpen(true)}
            >
              <span>Search or jump</span>
              <kbd>⌘ K</kbd>
            </button>
            <button
              className="activity-button"
              type="button"
              aria-expanded={activityOpen}
              aria-controls="activity-drawer"
              onClick={() => setActivityOpen((open) => !open)}
            >
              Activity <i aria-hidden="true">4</i>
            </button>
            <span className="avatar" aria-label="Signed in as Alice">
              AL
            </span>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
      </div>

      {activityOpen ? (
        <button
          className="drawer-backdrop"
          type="button"
          aria-label="Close activity drawer"
          onClick={() => setActivityOpen(false)}
        />
      ) : null}
      <aside
        id="activity-drawer"
        className={`activity-drawer${activityOpen ? " is-open" : ""}`}
        aria-label="Global activity"
        aria-hidden={!activityOpen}
      >
        <header>
          <div>
            <span>LIVE FEED</span>
            <h2>System activity</h2>
          </div>
          <button
            type="button"
            onClick={() => setActivityOpen(false)}
            aria-label="Close activity drawer"
          >
            ×
          </button>
        </header>
        <ol>
          {activity.map((event) => (
            <li key={event.id}>
              <time>{event.time}</time>
              <div>
                <Link href={event.href} onClick={() => setActivityOpen(false)}>
                  <strong>{event.label}</strong>
                </Link>
                <StatusBadge tone="positive">{event.status}</StatusBadge>
              </div>
            </li>
          ))}
        </ol>
        <p>
          Activity boundaries are typed and will stream coordinator events when
          the live endpoint is enabled.
        </p>
      </aside>
      {commandOpen ? (
        <div className="command-overlay">
          <button
            className="command-backdrop"
            type="button"
            tabIndex={-1}
            aria-label="Close command palette"
            onClick={() => setCommandOpen(false)}
          />
          <section
            className="command-palette"
            role="dialog"
            aria-labelledby="command-title"
          >
            <header>
              <span id="command-title">Jump to a Synesis surface</span>
              <kbd>ESC</kbd>
            </header>
            <label>
              <span className="visually-hidden">Search navigation</span>
              <input
                ref={commandInput}
                type="search"
                placeholder="Type a destination…"
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.currentTarget.value)}
              />
            </label>
            <nav aria-label="Command destinations">
              {navigationGroups
                .flatMap((group) => group.items)
                .filter((item) =>
                  item.label
                    .toLowerCase()
                    .includes(commandQuery.trim().toLowerCase()),
                )
                .map((item) => (
                  <Link key={item.href} href={item.href}>
                    <span>{item.code}</span>
                    {item.label}
                    <i aria-hidden="true">↗</i>
                  </Link>
                ))}
            </nav>
          </section>
        </div>
      ) : null}
    </div>
  );
}
