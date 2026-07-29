"use client";

import { useEffect, useState } from "react";
import { goBackOrFallback, goHome } from "../lib/navigation";

const hiddenRoutes = ["/login", "/customer", "/print", "/ticket-print"];

function isHiddenRoute(path: string) {
  return path.includes("/print") || hiddenRoutes.some((route) => path === route || path.startsWith(`${route}/`));
}

export default function GlobalTitanNavigation() {
  const [path, setPath] = useState("");
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const syncPath = () => setPath(window.location.pathname);
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

  if (isMobile || !path || path === "/home" || isHiddenRoute(path)) return null;

  const showBack = path !== "/home";

  return (
    <nav className="global-titan-nav" aria-label="TITAN screen navigation">
      {showBack && (
        <button className="global-titan-nav-button" type="button" onClick={() => goBackOrFallback()}>
          <span aria-hidden="true">‹</span>
          <strong>Back</strong>
        </button>
      )}

      <button className="global-titan-nav-home" type="button" onClick={goHome}>
        <img src="/titan_logo.jpg" alt="" aria-hidden="true" />
        <strong>TITAN by Pathfinder Inspections</strong>
      </button>
    </nav>
  );
}
