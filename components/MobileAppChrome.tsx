"use client";

import { useEffect, useState } from "react";
import NotificationCenter from "./NotificationCenter";

const appTabs = [
  { href: "/home", label: "Home", match: ["/home", "/dashboard"] },
  { href: "/inventory", label: "Inventory", match: ["/inventory", "/purchase-orders"], excludeView: "orders" },
  { href: "/communications", label: "Comms", match: ["/communications"] },
  { href: "/inventory?view=orders", label: "Store", match: ["/inventory"], view: "orders" },
  { href: "/admin", label: "Admin", match: ["/admin"] },
];

const hiddenRoutes = ["/login", "/print", "/ticket-print"];

export default function MobileAppChrome() {
  const [path, setPath] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const syncPath = () => {
      setPath(window.location.pathname);
      setSearch(window.location.search);
    };

    syncPath();
    window.addEventListener("popstate", syncPath);
    window.addEventListener("hashchange", syncPath);
    window.addEventListener("titan-route-change", syncPath);

    return () => {
      window.removeEventListener("popstate", syncPath);
      window.removeEventListener("hashchange", syncPath);
      window.removeEventListener("titan-route-change", syncPath);
    };
  }, []);

  if (!path || path.includes("/print") || hiddenRoutes.some((route) => path.startsWith(route))) return null;

  const showFloatingAlerts = !path.startsWith("/communications");

  return (
    <>
      {showFloatingAlerts && (
        <div className="mobile-app-alerts">
          <NotificationCenter />
        </div>
      )}
      <nav className="mobile-app-tabbar" aria-label="TITAN mobile navigation">
        {appTabs.map((tab) => {
          const viewParam = new URLSearchParams(search).get("view");
          const routeMatch = tab.match.some((route) => path === route || path.startsWith(`${route}/`));
          const active = routeMatch && (!tab.view || viewParam === tab.view) && (!tab.excludeView || viewParam !== tab.excludeView);

          return (
            <a key={tab.href} className={active ? "active" : ""} href={tab.href} aria-current={active ? "page" : undefined}>
              <span className="mobile-app-tabbar-dot" aria-hidden="true" />
              <span>{tab.label}</span>
            </a>
          );
        })}
      </nav>
    </>
  );
}
