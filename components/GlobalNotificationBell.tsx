"use client";

import { useEffect, useState } from "react";
import NotificationCenter from "./NotificationCenter";

const hiddenRoutes = ["/login", "/print", "/ticket-print"];
const pageOwnedBellRoutes = ["/communications", "/home", "/customer"];

export default function GlobalNotificationBell() {
  const [path, setPath] = useState("");

  useEffect(() => {
    const syncPath = () => setPath(window.location.pathname);

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

  if (
    !path ||
    path.includes("/print") ||
    hiddenRoutes.some((route) => path.startsWith(route)) ||
    pageOwnedBellRoutes.some((route) => path === route || path.startsWith(`${route}/`))
  ) {
    return null;
  }

  return (
    <div className="global-notification-bell">
      <NotificationCenter />
    </div>
  );
}
