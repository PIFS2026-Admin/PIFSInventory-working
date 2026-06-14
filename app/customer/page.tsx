"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type CustomerProfile = {
  id: string;
  fullName: string;
  role: string;
  companyId: string;
  companyName: string;
  companyLogoUrl: string;
};

type CustomerInventory = {
  id: string;
  createdAt: string;
  inspectionDue: string;
  afe: string;
  partNumber: string;
  size: string;
  grade: string;
  connection: string;
  pipeRange: "Range 2" | "Range 3";
  status: string;
  condition: string;
  rack: string;
  zone: string;
  location: string;
  joints: number;
  footage: number;
};

type CustomerTicket = {
  id: string;
  type: "Receiving" | "Shipping";
  ticketNumber: string;
  bolNumber: string;
  carrier: string;
  truckNumber: string;
  destination: string;
  createdAt: string;
};

type LocationSummary = {
  label: string;
  lines: number;
  joints: number;
  footage: number;
};

function formatDate(value: string) {
  if (!value) return "";
  return value.slice(0, 10);
}

function normalizePipeRange(value: unknown): "Range 2" | "Range 3" {
  return value === "Range 3" ? "Range 3" : "Range 2";
}

function calculateRangeFootage(joints: number, pipeRange: string) {
  return Math.round(Number(joints || 0) * (pipeRange === "Range 3" ? 43.5 : 31.5) * 100) / 100;
}

export default function CustomerPage() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [inventory, setInventory] = useState<CustomerInventory[]>([]);
  const [tickets, setTickets] = useState<CustomerTicket[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("Loading customer portal...");

  async function signOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  async function loadCustomerPortal() {
    setMessage("Loading customer portal...");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) {
      window.location.href = "/login";
      return;
    }

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
      .select("id, full_name, role, company_id, companies(name, logo_url)")
      .eq("id", user.id)
      .single();

    if (profileError || !profileData) {
      setMessage("Customer profile was not found.");
      return;
    }

    const company = Array.isArray(profileData.companies)
      ? profileData.companies[0]
      : profileData.companies;

    if (profileData.role !== "customer" || !profileData.company_id) {
      setMessage("This login is not assigned to a customer account.");
      return;
    }

    setProfile({
      id: profileData.id,
      fullName: profileData.full_name ?? "Customer",
      role: profileData.role,
      companyId: profileData.company_id,
      companyName: company?.name ?? "Customer",
      companyLogoUrl: company?.logo_url ?? "",
    });

    const { data: inventoryData, error: inventoryError } = await supabase
      .from("pipe_inventory")
      .select(`
        id,
        created_at,
        inspection_due_date,
        afe,
        part_number,
        size,
        grade,
        connection,
        pipe_range,
        status,
        condition,
        bulk_joints,
        racks(rack_code),
        workflow_zones(name, code)
      `)
      .eq("company_id", profileData.company_id)
      .order("created_at", { ascending: false });

    if (inventoryError) {
      setMessage(`Inventory failed: ${inventoryError.message}`);
      return;
    }

    setInventory(
      (inventoryData ?? [])
        .map((row: any) => {
          const rack = Array.isArray(row.racks) ? row.racks[0] : row.racks;
          const zone = Array.isArray(row.workflow_zones)
            ? row.workflow_zones[0]
            : row.workflow_zones;

          const pipeRange = normalizePipeRange(row.pipe_range);
          const joints = Number(row.bulk_joints ?? 0);
          const footage = calculateRangeFootage(joints, pipeRange);
          const rackName = rack?.rack_code ?? "";
          const zoneName = zone?.name ?? zone?.code ?? "";

          return {
            id: row.id,
            createdAt: formatDate(row.created_at),
            inspectionDue: formatDate(row.inspection_due_date),
            afe: row.afe ?? "",
            partNumber: row.part_number ?? "",
            size: row.size ?? "",
            grade: row.grade ?? "",
            connection: row.connection ?? "",
            pipeRange,
            status: row.status ?? "",
            condition: row.condition ?? "",
            rack: rackName,
            zone: zoneName,
            location: rackName || zoneName || "Unassigned",
            joints,
            footage,
          };
        })
        .filter((row) => row.status !== "Shipped" && (row.joints > 0 || row.footage > 0))
    );

    const { data: receiveTickets } = await supabase
      .from("receiving_tickets")
      .select("id, ticket_number, carrier, truck_number, created_at")
      .eq("company_id", profileData.company_id)
      .order("created_at", { ascending: false })
      .limit(25);

    const { data: shipTickets } = await supabase
      .from("shipping_tickets")
      .select("id, ticket_number, bol_number, carrier, truck_number, destination, created_at")
      .eq("company_id", profileData.company_id)
      .order("created_at", { ascending: false })
      .limit(25);

    const mappedReceive: CustomerTicket[] = (receiveTickets ?? []).map((ticket: any) => ({
      id: ticket.id,
      type: "Receiving",
      ticketNumber: ticket.ticket_number ?? "",
      bolNumber: "",
      carrier: ticket.carrier ?? "",
      truckNumber: ticket.truck_number ?? "",
      destination: "",
      createdAt: formatDate(ticket.created_at),
    }));

    const mappedShip: CustomerTicket[] = (shipTickets ?? []).map((ticket: any) => ({
      id: ticket.id,
      type: "Shipping",
      ticketNumber: ticket.ticket_number ?? "",
      bolNumber: ticket.bol_number ?? "",
      carrier: ticket.carrier ?? "",
      truckNumber: ticket.truck_number ?? "",
      destination: ticket.destination ?? "",
      createdAt: formatDate(ticket.created_at),
    }));

    setTickets([...mappedReceive, ...mappedShip].sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    setMessage("");
  }

  useEffect(() => {
    loadCustomerPortal();
  }, []);

  const locationSummaries = useMemo(() => {
    const summaries = new Map<string, LocationSummary>();

    for (const row of inventory) {
      const current = summaries.get(row.location) ?? {
        label: row.location,
        lines: 0,
        joints: 0,
        footage: 0,
      };

      current.lines += 1;
      current.joints += row.joints;
      current.footage += row.footage;

      summaries.set(row.location, current);
    }

    return Array.from(summaries.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    const searchText = search.toLowerCase().trim();

    return inventory.filter((row) => {
      const matchesLocation =
        selectedLocation === "all" || row.location === selectedLocation;

      const matchesSearch =
        !searchText ||
        [row.afe, row.partNumber, row.size, row.grade, row.connection, row.pipeRange, row.status, row.condition, row.location]
          .join(" ")
          .toLowerCase()
          .includes(searchText);

      return matchesLocation && matchesSearch;
    });
  }, [inventory, search, selectedLocation]);

  const totals = useMemo(() => {
    return filteredInventory.reduce(
      (sum, row) => ({
        joints: sum.joints + row.joints,
        footage: sum.footage + row.footage,
      }),
      { joints: 0, footage: 0 }
    );
  }, [filteredInventory]);

  return (
    <main className="customer-shell">
      <header className="customer-topbar">
        <div className="brand customer-brand">
          {profile?.companyLogoUrl ? (
            <img
              className="customer-company-logo"
              src={profile.companyLogoUrl}
              alt={`${profile.companyName} logo`}
            />
          ) : (
            <div className="brand-mark">PF</div>
          )}
          <div>
            <div className="brand-title">{profile?.companyName ?? "Customer Portal"}</div>
            <div className="brand-subtitle">
              {profile?.fullName ? `Welcome, ${profile.fullName}` : "Customer inventory"}
            </div>
          </div>
        </div>

        <div className="customer-actions">
          <button className="button" onClick={loadCustomerPortal}>Refresh</button>
          <button className="button" onClick={signOut}>Sign Out</button>
        </div>
      </header>

      {message && <div className="modal-message">{message}</div>}

      <section className="report-metrics customer-metrics">
        <div>
          <strong>{filteredInventory.length}</strong>
          <span>Inventory Lines</span>
        </div>
        <div>
          <strong>{totals.joints}</strong>
          <span>Total Joints</span>
        </div>
        <div>
          <strong>{totals.footage.toLocaleString()}</strong>
          <span>Total Footage</span>
        </div>
      </section>

      <section className="customer-section">
        <div className="section-heading">
          <h2>Your Racks / Locations</h2>
          <p>Only locations with your company inventory are shown.</p>
        </div>

        <div className="customer-location-grid">
          <button
            className={`rack-tile-button ${selectedLocation === "all" ? "active-customer-location" : ""}`}
            onClick={() => setSelectedLocation("all")}
          >
            <span className="rack-code">All Locations</span>
            <span className="capacity">{inventory.length} lines</span>
          </button>

          {locationSummaries.map((location) => (
            <button
              key={location.label}
              className={`rack-tile-button ${selectedLocation === location.label ? "active-customer-location" : ""}`}
              onClick={() => setSelectedLocation(location.label)}
            >
              <span className="rack-code">{location.label}</span>
              <span className="capacity">{location.joints} joints</span>
              <span className="capacity">{location.footage.toLocaleString()} ft</span>
            </button>
          ))}
        </div>
      </section>

      <section className="customer-section">
        <div className="section-heading">
          <h2>Inventory</h2>
          <input
            className="field customer-search"
            placeholder="Search part number, TU#, status..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date Created</th>
                <th>Inspection Due</th>
                <th>TU#</th>
                <th>Part Number</th>
                <th>Size</th>
                <th>Grade</th>
                <th>Connection</th>
                <th>Range</th>
                <th>Status</th>
                <th>Condition</th>
                <th>Rack/Location</th>
                <th>Joints</th>
                <th>Footage</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map((row) => (
                <tr key={row.id}>
                  <td>{row.createdAt}</td>
                  <td>{row.inspectionDue}</td>
                  <td>{row.afe}</td>
                  <td>{row.partNumber}</td>
                  <td>{row.size}</td>
                  <td>{row.grade}</td>
                  <td>{row.connection}</td>
                  <td>{row.pipeRange}</td>
                  <td><span className="badge">{row.status}</span></td>
                  <td>{row.condition}</td>
                  <td>{row.location}</td>
                  <td>{row.joints}</td>
                  <td>{row.footage.toLocaleString()}</td>
                </tr>
              ))}

              {filteredInventory.length === 0 && (
                <tr>
                  <td colSpan={13} className="empty-cell">
                    No customer inventory found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="customer-section">
        <div className="section-heading">
          <h2>Tickets / BOL</h2>
          <p>Recent receiving and shipping records.</p>
        </div>

        <div className="tickets-grid">
          {tickets.map((ticket) => (
            <article key={`${ticket.type}-${ticket.id}`} className="ticket-card customer-ticket">
              <h3>{ticket.type} {ticket.ticketNumber}</h3>
              <div className="ticket-row stacked">
                <div>
                  <strong>{ticket.createdAt}</strong>
                  <span>{ticket.carrier || "No carrier"}</span>
                </div>
                <div>
                  <span>Truck {ticket.truckNumber || "-"}</span>
                  <span>{ticket.bolNumber ? `BOL ${ticket.bolNumber}` : "No BOL"}</span>
                </div>
                <div>
                  <span>{ticket.destination || "No destination"}</span>
                </div>
              </div>
            </article>
          ))}

          {tickets.length === 0 && (
            <div className="ticket-card">
              <p className="muted-text">No tickets found.</p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
