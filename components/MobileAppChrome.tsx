"use client";

import { useEffect, useState } from "react";

type AppTab = {
  href: string;
  label: string;
  match: string[];
  view?: string | string[];
  excludeView?: string | string[];
};

const appTabs = [
  { href: "/home", label: "Home", match: ["/home", "/dashboard"] },
  { href: "/inventory", label: "Consumables", match: ["/inventory", "/purchase-orders"], excludeView: ["orders", "cart"] },
  { href: "/communications", label: "Comms", match: ["/communications"] },
  { href: "/inventory?view=orders", label: "Store", match: ["/inventory"], view: ["orders", "cart"] },
  { href: "/admin", label: "Admin", match: ["/admin"] },
] satisfies AppTab[];

function viewMatches(actual: string | null, expected?: string | string[]) {
  if (!expected) return true;
  return Array.isArray(expected) ? expected.includes(actual || "") : actual === expected;
}

function viewExcluded(actual: string | null, excluded?: string | string[]) {
  if (!excluded) return false;
  return Array.isArray(excluded) ? excluded.includes(actual || "") : actual === excluded;
}

const hiddenRoutes = ["/login", "/print", "/ticket-print"];

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

  if (isMobile || !path || path.includes("/print") || hiddenRoutes.some((route) => path.startsWith(route))) return null;

  return (
    <nav className="mobile-app-tabbar" aria-label="TITAN mobile navigation">
      {appTabs.map((tab) => {
        const viewParam = new URLSearchParams(search).get("view");
        const routeMatch = tab.match.some((route) => path === route || path.startsWith(`${route}/`));
        const active = routeMatch && viewMatches(viewParam, tab.view) && !viewExcluded(viewParam, tab.excludeView);

        return (
          <a key={tab.href} className={active ? "active" : ""} href={tab.href} aria-current={active ? "page" : undefined}>
            <span className="mobile-app-tabbar-dot" aria-hidden="true" />
            <span>{tab.label}</span>
          </a>
        );
      })}
    </nav>
  );
}
