"use client";

import { useEffect, useState } from "react";

const appTabs = [
  { href: "/home", label: "Home", match: ["/home", "/dashboard"] },
  { href: "/inventory", label: "Inventory", match: ["/inventory", "/purchase-orders"] },
  { href: "/communications", label: "Comms", match: ["/communications"] },
  { href: "/dti", label: "DTI", match: ["/dti", "/dti-summary"] },
  { href: "/admin", label: "Admin", match: ["/admin"] },
];

const hiddenRoutes = ["/login", "/print", "/ticket-print"];

export default function MobileAppChrome() {
  const [path, setPath] = useState("");

  useEffect(() => {
    const syncPath = () => setPath(window.location.pathname);

    syncPath();
    window.addEventListener("popstate", syncPath);
    window.addEventListener("hashchange", syncPath);

    return () => {
      window.removeEventListener("popstate", syncPath);
      window.removeEventListener("hashchange", syncPath);
    };
  }, []);

  if (!path || path.includes("/print") || hiddenRoutes.some((route) => path.startsWith(route))) return null;

  return (
    <nav className="mobile-app-tabbar" aria-label="TITAN mobile navigation">
      {appTabs.map((tab) => {
        const active = tab.match.some((route) => path === route || path.startsWith(`${route}/`));

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
