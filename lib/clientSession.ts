"use client";

import { supabase } from "./supabase";

export async function getValidAccessToken() {
  const { data, error } = await supabase.auth.getSession();
  if (error) return null;
  const session = data.session;
  const expiresSoon = !session?.expires_at || session.expires_at * 1000 <= Date.now() + 60_000;
  if (session?.access_token && !expiresSoon) return session.access_token;
  if (!session?.refresh_token) return null;
  const refreshed = await supabase.auth.refreshSession();
  return refreshed.data.session?.access_token ?? null;
}

export function redirectToLogin() {
  if (typeof window === "undefined") return;
  window.sessionStorage.setItem("titan:returnTo", `${window.location.pathname}${window.location.search}`);
  window.location.assign("/login");
}
