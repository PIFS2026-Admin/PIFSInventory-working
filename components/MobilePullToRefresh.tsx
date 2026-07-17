"use client";

import { useEffect, useRef, useState } from "react";

const hiddenRoutes = ["/login", "/print", "/ticket-print"];
const pullThreshold = 74;
const maxPull = 98;

function isHiddenPath(path: string) {
  return path.includes("/print") || hiddenRoutes.some((route) => path.startsWith(route));
}

function isInteractiveTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false;
  return Boolean(target.closest("a, button, input, textarea, select, [contenteditable='true'], [data-no-pull-refresh]"));
}

function nearestScrollableParent(target: EventTarget | null) {
  if (!(target instanceof Element)) return null;

  let element: HTMLElement | null = target instanceof HTMLElement ? target : target.parentElement;
  while (element && element !== document.body) {
    const style = window.getComputedStyle(element);
    const canScrollY = /(auto|scroll)/.test(style.overflowY) && element.scrollHeight > element.clientHeight;
    if (canScrollY) return element;
    element = element.parentElement;
  }

  return null;
}

export default function MobilePullToRefresh() {
  const startPoint = useRef({ x: 0, y: 0 });
  const tracking = useRef(false);
  const refreshing = useRef(false);
  const pullRef = useRef(0);
  const [path, setPath] = useState("");
  const [isMobile, setIsMobile] = useState(false);
  const [pull, setPull] = useState(0);
  const ready = pull >= pullThreshold;

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

  useEffect(() => {
    if (!isMobile || !path || isHiddenPath(path)) {
      setPull(0);
      return undefined;
    }

    const onTouchStart = (event: TouchEvent) => {
      if (refreshing.current || event.touches.length !== 1 || window.scrollY > 2 || isInteractiveTarget(event.target)) {
        tracking.current = false;
        return;
      }

      const scrollParent = nearestScrollableParent(event.target);
      if (scrollParent && scrollParent.scrollTop > 0) {
        tracking.current = false;
        return;
      }

      const touch = event.touches[0];
      startPoint.current = { x: touch.clientX, y: touch.clientY };
      tracking.current = true;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!tracking.current || event.touches.length !== 1) return;

      const touch = event.touches[0];
      const deltaY = touch.clientY - startPoint.current.y;
      const deltaX = Math.abs(touch.clientX - startPoint.current.x);

      if (deltaY <= 0 || deltaX > deltaY) {
        pullRef.current = 0;
        setPull(0);
        return;
      }

      if (window.scrollY > 2) {
        tracking.current = false;
        pullRef.current = 0;
        setPull(0);
        return;
      }

      if (deltaY > 8) event.preventDefault();
      const nextPull = Math.min(maxPull, deltaY * 0.58);
      pullRef.current = nextPull;
      setPull(nextPull);
    };

    const onTouchEnd = () => {
      if (!tracking.current) return;
      tracking.current = false;

      if (pullRef.current >= pullThreshold) {
        refreshing.current = true;
        pullRef.current = pullThreshold;
        setPull(pullThreshold);
        window.setTimeout(() => window.location.reload(), 140);
        return;
      }

      pullRef.current = 0;
      setPull(0);
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: false });
    window.addEventListener("touchend", onTouchEnd);
    window.addEventListener("touchcancel", onTouchEnd);

    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [isMobile, path]);

  if (!isMobile || !path || isHiddenPath(path)) return null;

  return (
    <div
      className={`mobile-pull-refresh ${pull > 0 ? "visible" : ""} ${ready ? "ready" : ""}`}
      style={{ transform: `translate(-50%, ${Math.max(-56, pull - 70)}px)` }}
      aria-live="polite"
    >
      <span className="mobile-pull-refresh-spinner" aria-hidden="true" />
      <span>{ready ? "Release to refresh" : "Pull to refresh"}</span>
    </div>
  );
}
