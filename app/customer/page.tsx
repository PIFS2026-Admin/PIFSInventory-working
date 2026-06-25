"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import ChangePasswordModal from "../../components/ChangePasswordModal";
import NotificationCenter from "../../components/NotificationCenter";

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
  yardId: string;
  rackId: string;
  afe: string;
  operator: string;
  rig: string;
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

type CustomerReleaseRequest = {
  id: string;
  requestNumber: string;
  rackLabel: string;
  yardName: string;
  quantityJoints: number;
  status: string;
  signatureName: string;
  notes: string;
  createdAt: string;
};

type ReleaseForm = {
  rackId: string;
  quantityJoints: string;
  signatureName: string;
  notes: string;
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

function csvValue(value: string | number) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

export default function CustomerPage() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [inventory, setInventory] = useState<CustomerInventory[]>([]);
  const [tickets, setTickets] = useState<CustomerTicket[]>([]);
  const [releaseRequests, setReleaseRequests] = useState<CustomerReleaseRequest[]>([]);
  const [releaseForm, setReleaseForm] = useState<ReleaseForm>({
    rackId: "",
    quantityJoints: "",
    signatureName: "",
    notes: "",
  });
  const [submittingRelease, setSubmittingRelease] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("Loading customer portal...");
  const [passwordOpen, setPasswordOpen] = useState(false);

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
        afe,
        operator,
        rig,
        part_number,
        size,
        grade,
        connection,
        pipe_range,
        status,
        condition,
        bulk_joints,
        racks(id, rack_code, yard_id),
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
            yardId: rack?.yard_id ?? "",
            rackId: rack?.id ?? "",
            afe: row.afe ?? "",
            operator: row.operator ?? "",
            rig: row.rig ?? "",
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
        .filter((row: CustomerInventory) => row.status !== "Shipped" && (row.joints > 0 || row.footage > 0))
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

    const accessToken = sessionData.session?.access_token;
    if (accessToken) {
      const response = await fetch("/api/tubular-release-requests", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const result = await response.json().catch(() => null);

      if (response.ok) {
        setReleaseRequests(
          (result?.requests ?? []).map((request: any) => ({
            id: request.id,
            requestNumber: request.request_number ?? "",
            rackLabel: request.rack_label ?? "",
            yardName: request.yard_name ?? "",
            quantityJoints: Number(request.quantity_joints ?? 0),
            status: request.status ?? "Submitted",
            signatureName: request.signature_name ?? "",
            notes: request.notes ?? "",
            createdAt: formatDate(request.created_at),
          }))
        );
      }
    }

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

  const releaseRackOptions = useMemo(() => {
    const racks = new Map<string, { rackId: string; yardId: string; label: string; joints: number }>();

    for (const row of inventory) {
      if (!row.rackId || !row.yardId) continue;

      const current = racks.get(row.rackId) ?? {
        rackId: row.rackId,
        yardId: row.yardId,
        label: row.rack || row.location,
        joints: 0,
      };

      current.joints += row.joints;
      racks.set(row.rackId, current);
    }

    return Array.from(racks.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    const searchText = search.toLowerCase().trim();

    return inventory.filter((row) => {
      const matchesLocation =
        selectedLocation === "all" || row.location === selectedLocation;

      const matchesSearch =
        !searchText ||
        [row.afe, row.operator, row.rig, row.partNumber, row.size, row.grade, row.connection, row.pipeRange, row.status, row.condition, row.location]
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

  function printInventoryReport() {
    window.print();
  }

  function exportInventoryCsv() {
    const headers = [
      "Date Created",
      "TU#",
      "Operator",
      "Rig",
      "Part Number",
      "Size",
      "Grade",
      "Connection",
      "Range",
      "Status",
      "Condition",
      "Rack/Location",
      "Joints",
      "Footage",
    ];

    const rows = filteredInventory.map((row) => [
      row.createdAt,
      row.afe,
      row.operator,
      row.rig,
      row.partNumber,
      row.size,
      row.grade,
      row.connection,
      row.pipeRange,
      row.status,
      row.condition,
      row.location,
      row.joints,
      row.footage,
    ]);

    const csv = [headers, ...rows]
      .map((row) => row.map(csvValue).join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const company = profile?.companyName.replace(/[^a-z0-9]+/gi, "-").toLowerCase() || "customer";

    link.href = url;
    link.download = `${company}-inventory-report.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function openTicketPrint(ticket: CustomerTicket) {
    const type = ticket.type === "Receiving" ? "receiving" : "shipping";
    window.location.href = `/ticket-print?type=${type}&id=${ticket.id}`;
  }

  async function submitReleaseRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const rack = releaseRackOptions.find((option) => option.rackId === releaseForm.rackId);
    const quantityJoints = Number(releaseForm.quantityJoints || 0);

    if (!rack) {
      setMessage("Select a rack before submitting the release request.");
      return;
    }

    if (!Number.isFinite(quantityJoints) || quantityJoints <= 0) {
      setMessage("Enter a release quantity greater than zero.");
      return;
    }

    if (quantityJoints > rack.joints) {
      setMessage(`This rack only shows ${rack.joints} available joints for your inventory.`);
      return;
    }

    if (!releaseForm.signatureName.trim()) {
      setMessage("Type your name to sign the release request.");
      return;
    }

    setSubmittingRelease(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        window.location.href = "/login";
        return;
      }

      const response = await fetch("/api/tubular-release-requests", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          yardId: rack.yardId,
          rackId: rack.rackId,
          rackLabel: rack.label,
          quantityJoints,
          notes: releaseForm.notes,
          signatureName: releaseForm.signatureName,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error ?? "Release request could not be submitted.");
      }

      setReleaseForm({ rackId: "", quantityJoints: "", signatureName: "", notes: "" });
      await loadCustomerPortal();
      setMessage(result?.warning ?? `Release request ${result?.request?.request_number ?? ""} submitted.`);
    } catch (error: any) {
      setMessage(`Release request failed: ${error.message}`);
    } finally {
      setSubmittingRelease(false);
    }
  }

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
              Customer inventory portal
            </div>
          </div>
        </div>

        <div className="customer-titan-logo-wrap" aria-label="TITAN">
          <img className="customer-titan-logo" src="/titan_logo.jpg" alt="TITAN" />
        </div>

        <div className="customer-actions">
          {profile && <NotificationCenter />}
          <button className="button" onClick={loadCustomerPortal}>Refresh</button>
          <button className="button" onClick={() => setPasswordOpen(true)}>Change Password</button>
          <button className="button" onClick={signOut}>Sign Out</button>
        </div>
      </header>

      {message && <div className="modal-message">{message}</div>}

      <section className="customer-welcome">
        <span>Welcome</span>
        <h1>{profile?.fullName || "Customer"}</h1>
        <p>{profile?.companyName ?? "Your inventory"} inventory, tickets, and rack locations.</p>
      </section>

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

      <section className="customer-section customer-location-section">
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

      <section className="customer-section customer-inventory-section">
        <div className="section-heading">
          <div>
            <h2>Inventory</h2>
            <p>{filteredInventory.length} lines / {totals.joints} joints / {totals.footage.toLocaleString()} ft</p>
          </div>
          <div className="customer-report-actions">
            <input
              className="field customer-search"
              placeholder="Search part number, TU#, status..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            <button className="button" onClick={printInventoryReport}>Print Report</button>
            <button className="button" onClick={exportInventoryCsv}>Export CSV</button>
          </div>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Date Created</th>
                <th>TU#</th>
                <th>Operator</th>
                <th>Rig</th>
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
                  <td>{row.afe}</td>
                  <td>{row.operator || "-"}</td>
                  <td>{row.rig || "-"}</td>
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
                  <td colSpan={14} className="empty-cell">
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
          <div>
            <h2>Tubular Release Request</h2>
            <p>Select a rack and quantity to request release from Pathfinder.</p>
          </div>
        </div>

        <form className="form-grid" onSubmit={submitReleaseRequest}>
          <label>
            Rack / Location
            <select
              value={releaseForm.rackId}
              onChange={(event) => setReleaseForm({ ...releaseForm, rackId: event.target.value })}
            >
              <option value="">Select rack</option>
              {releaseRackOptions.map((rack) => (
                <option key={rack.rackId} value={rack.rackId}>
                  {rack.label} / {rack.joints} joints available
                </option>
              ))}
            </select>
          </label>

          <label>
            Quantity to Release
            <input
              type="number"
              min="1"
              value={releaseForm.quantityJoints}
              onChange={(event) => setReleaseForm({ ...releaseForm, quantityJoints: event.target.value })}
            />
          </label>

          <label>
            Signature Name
            <input
              value={releaseForm.signatureName}
              onChange={(event) => setReleaseForm({ ...releaseForm, signatureName: event.target.value })}
              placeholder="Type your name to sign"
            />
          </label>

          <label className="full">
            Notes
            <textarea
              value={releaseForm.notes}
              onChange={(event) => setReleaseForm({ ...releaseForm, notes: event.target.value })}
              placeholder="Release notes, pickup timing, or special instructions"
            />
          </label>

          <div className="slide-actions full">
            <button className="button primary" disabled={submittingRelease || releaseRackOptions.length === 0}>
              {submittingRelease ? "Submitting..." : "Submit Release Request"}
            </button>
          </div>
        </form>
      </section>

      <section className="customer-section">
        <div className="section-heading">
          <div>
            <h2>Release Requests</h2>
            <p>Submitted tubular release forms.</p>
          </div>
        </div>

        <div className="tickets-grid">
          {releaseRequests.map((request) => (
            <article key={request.id} className="ticket-card customer-ticket">
              <h3>{request.requestNumber}</h3>
              <div className="ticket-row stacked">
                <div>
                  <strong>{request.rackLabel}</strong>
                  <span>{request.quantityJoints} joints requested</span>
                </div>
                <div>
                  <span>{request.yardName}</span>
                  <span>{request.createdAt}</span>
                </div>
                <div>
                  <span>Status: {request.status}</span>
                  <span>Signed by {request.signatureName}</span>
                </div>
                {request.notes && (
                  <div>
                    <span>{request.notes}</span>
                  </div>
                )}
              </div>
            </article>
          ))}

          {releaseRequests.length === 0 && (
            <div className="ticket-card">
              <p className="muted-text">No release requests submitted.</p>
            </div>
          )}
        </div>
      </section>

      <section className="customer-section customer-ticket-section">
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
              <div className="customer-ticket-actions">
                <button className="button" onClick={() => openTicketPrint(ticket)}>
                  Print / PDF
                </button>
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

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </main>
  );
}
