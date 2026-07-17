"use client";

import { useEffect, useState } from "react";

type AppTab = {
  href: string;
  label: string;
  match: string[];
  icon: "home" | "inventory" | "chat" | "store" | "admin";
  view?: string | string[];
  excludeView?: string | string[];
};

const appTabs = [
  { href: "/home", label: "Home", icon: "home", match: ["/home", "/dashboard"] },
  { href: "/inventory", label: "Consumables", icon: "inventory", match: ["/inventory", "/purchase-orders"], excludeView: ["orders", "cart"] },
  { href: "/communications", label: "Comms", icon: "chat", match: ["/communications"] },
  { href: "/inventory?view=orders", label: "Store", icon: "store", match: ["/inventory"], view: ["orders", "cart"] },
  { href: "/admin", label: "Admin", icon: "admin", match: ["/admin"] },
] satisfies AppTab[];

function viewMatches(actual: string | null, expected?: string | string[]) {
  if (!expected) return true;
  return Array.isArray(expected) ? expected.includes(actual || "") : actual === expected;
}

function viewExcluded(actual: string | null, excluded?: string | string[]) {
  if (!excluded) return false;
  return Array.isArray(excluded) ? excluded.includes(actual || "") : actual === excluded;
}

const hiddenRoutes = ["/login", "/customer", "/print", "/ticket-print"];

function TabIcon({ icon }: { icon: AppTab["icon"] }) {
  if (icon === "home") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 10.8 12 3l9 7.8" />
        <path d="M5.5 9.5V21h13V9.5" />
        <path d="M9.5 21v-6h5v6" />
      </svg>
    );
  }

  if (icon === "inventory") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 4h14v16H5z" />
        <path d="M8 8h8" />
        <path d="M8 12h8" />
        <path d="M8 16h5" />
      </svg>
    );
  }

  if (icon === "chat") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6.5h16v10H9l-5 4v-14z" />
        <path d="M8 10h8" />
        <path d="M8 13h5" />
      </svg>
    );
  }

  if (icon === "store") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 7h15l-2 8H8z" />
        <path d="M6 7 5.2 4H3" />
        <circle cx="9" cy="20" r="1.4" />
        <circle cx="17.5" cy="20" r="1.4" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 3 5 6v5c0 4.6 3 8.3 7 10 4-1.7 7-5.4 7-10V6z" />
      <path d="M9 12h6" />
      <path d="M12 9v6" />
    </svg>
  );
}

export default function MobileAppChrome() {
  const [path, setPath] = useState("");
  const [search, setSearch] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const syncPath = () => {
      setPath(window.location.pathname);
      setSearch(window.location.search);
    };
    const syncViewport = () => setIsMobile(window.matchMedia("(max-width: 760px)").matches);

    syncPath();
    syncViewport();
    window.addEventListener("popstate", syncPath);
    window.addEventListener("hashchange", syncPath);
    window.addEventListener("titan-route-change", syncPath);
    window.addEventListener("resize", syncViewport);

    return () => {
      window.removeEventListener("popstate", syncPath);
      window.removeEventListener("hashchange", syncPath);
      window.removeEventListener("titan-route-change", syncPath);
      window.removeEventListener("resize", syncViewport);
    };
  }, []);

  if (!isMobile || !path || path.includes("/print") || hiddenRoutes.some((route) => path.startsWith(route))) return null;

  return (
    <nav className="mobile-app-tabbar" aria-label="TITAN mobile navigation">
      {appTabs.map((tab) => {
        const viewParam = new URLSearchParams(search).get("view");
        const routeMatch = tab.match.some((route) => path === route || path.startsWith(`${route}/`));
        const active = routeMatch && viewMatches(viewParam, tab.view) && !viewExcluded(viewParam, tab.excludeView);

        return (
          <a key={tab.href} className={active ? "active" : ""} href={tab.href} aria-current={active ? "page" : undefined}>
            <span className="mobile-app-tabbar-icon">
              <TabIcon icon={tab.icon} />
            </span>
            <span>{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
