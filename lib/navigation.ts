export function goBackOrFallback(fallbackHref = "/home") {
  if (typeof window === "undefined") return;

  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  window.location.href = fallbackHref;
}

export function goHome() {
  if (typeof window === "undefined") return;
  window.location.href = "/home";
}
