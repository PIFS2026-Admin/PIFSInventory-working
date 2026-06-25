"use client";

import { useEffect, useState } from "react";
import NotificationCenter from "../../components/NotificationCenter";
import { supabase } from "../../lib/supabase";
import {
  ModuleKey,
  defaultModulesForRole,
  moduleHrefToKey,
} from "../../lib/modulePermissions";

type Profile = {
  fullName: string;
  role: string;
  modules: ModuleKey[];
};

type LaunchCard = {
  title: string;
  description: string;
  href: string;
};

const launchCards: LaunchCard[] = [
  {
    title: "Yard View",
    description: "Inventory, racks, receiving, shipping, transfers, and tickets.",
    href: "/",
  },
  {
    title: "Inventory",
    description: "Standalone tools, parts, consumables, issue tickets, and stock adjustments.",
    href: "/inventory",
  },
  {
    title: "Purchase Orders",
    description: "Vendors, PO line items, receiving, invoices, and packing slips.",
    href: "/purchase-orders",
  },
  {
    title: "DTI",
    description: "Field inspection jobs, scorecards, red flags, and DTI reports.",
    href: "/dti",
  },
  {
    title: "DTI Daily Summary",
    description: "Paperless inspection summaries with email and print options.",
    href: "/dti-summary",
  },
  {
    title: "Hardbanding",
    description: "Hardband jobs, serial numbers, operators, closeout, and reports.",
    href: "/hardband",
  },
  {
    title: "Admin Controls",
    description: "Companies, users, racks, work zones, and part number setup.",
    href: "/admin",
  },
  {
    title: "Reports",
    description: "Inventory summaries, customer reports, tickets, and exports.",
    href: "/?open=reports",
  },
  {
    title: "Dashboard",
    description: "Weekly employee activity, transaction counts, and WIP overview.",
    href: "/dashboard",
  },
];

function canOpenLaunchCard(modules: ModuleKey[], card: LaunchCard) {
  const moduleKey = moduleHrefToKey(card.href);
  return !moduleKey || modules.includes(moduleKey);
}

function normalizeRole(role: unknown) {
  return typeof role === "string" ? role.toLowerCase() : "customer";
}

async function loadModuleAccess(role: string, token: string | undefined) {
  if (!token) return defaultModulesForRole(role);

  const response = await fetch("/api/my-module-permissions", {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  }).catch(() => null);

  if (!response?.ok) return defaultModulesForRole(role);

  const result = await response.json();
  return Array.isArray(result.moduleKeys)
    ? result.moduleKeys.map(String) as ModuleKey[]
    : defaultModulesForRole(role);
}

export default function InternalHomePage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("Loading TITAN...");

  useEffect(() => {
    loadProfile();
  }, []);

  async function loadProfile() {
    setLoading(true);
    setMessage("Loading TITAN...");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: profileData, error } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", user.id)
      .single();

    if (error || !profileData) {
      setMessage("Your profile is missing. Ask an admin to check your user setup.");
      setLoading(false);
      return;
    }

    const role = normalizeRole(profileData.role);

    if (role === "customer") {
      window.location.href = "/customer";
      return;
    }

    const modules = await loadModuleAccess(role, sessionData.session?.access_token);

    if (modules.length === 0) {
      setMessage("This user does not have any TITAN screen permissions assigned.");
      setLoading(false);
      return;
    }

    setProfile({
      fullName: profileData.full_name ?? user.email ?? "Team Member",
      role,
      modules,
    });
    setMessage("");
    setLoading(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  function openCard(card: LaunchCard) {
    window.location.href = card.href;
  }

  return (
    <main className="launch-shell">
      <section className="launch-header">
        <button className="brand compact brand-home-link" type="button" onClick={() => (window.location.href = "/home")}>
          <img className="brand-logo" src="/titan_logo.jpg" alt="TITAN" />
          <div>
            <div className="brand-title">TITAN</div>
            <div className="brand-subtitle">Tubular Inventory Tracking & Asset Navigation</div>
          </div>
        </button>

        <div className="launch-actions">
          {profile && <NotificationCenter />}
          <button className="button" onClick={loadProfile} disabled={loading}>
            Refresh
          </button>
          <button className="button" onClick={signOut}>
            Sign Out
          </button>
        </div>
      </section>

      <section className="launch-welcome">
        <span>Welcome</span>
        <h1>{profile?.fullName ?? "TITAN"}</h1>
        <p>Choose where you want to work.</p>
      </section>

      {message && <div className="modal-message launch-message">{message}</div>}

      <section className="launch-grid">
        {launchCards
          .filter((card) => {
            if (!profile) return true;
            return canOpenLaunchCard(profile.modules, card);
          })
          .map((card) => {
          return (
            <button
              key={card.title}
              className="launch-card"
              type="button"
              onClick={() => openCard(card)}
              disabled={loading}
            >
              <span>{card.title}</span>
              <small>{card.description}</small>
            </button>
          );
        })}
      </section>
    </main>
  );
}
