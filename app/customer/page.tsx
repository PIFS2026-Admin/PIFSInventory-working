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
  specLabel: string;
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
  createdAtRaw: string;
};

type CustomerReleaseRequest = {
  id: string;
  requestNumber: string;
  rackLabel: string;
  yardName: string;
  quantityJoints: number;
  releaseDate: string;
  releasedTo: string;
  shipDate: string;
  carrier: string;
  destination: string;
  partSummary: string;
  partLines: ReleasePartLine[];
  status: string;
  signatureName: string;
  notes: string;
  createdAt: string;
  createdAtRaw: string;
};

type ReleasePartLine = {
  afe: string;
  partNumber: string;
  size: string;
  grade: string;
  connection: string;
  pipeRange: "Range 2" | "Range 3";
  condition: string;
  joints: number;
  footage: number;
};

type ReleaseRackOption = {
  rackId: string;
  yardId: string;
  label: string;
  joints: number;
  partLines: ReleasePartLine[];
};

type ReleaseForm = {
  rackId: string;
  quantityJoints: string;
  releaseDate: string;
  releasedTo: string;
  shipDate: string;
  carrier: string;
  destination: string;
  signatureName: string;
  notes: string;
};

type LocationSummary = {
  label: string;
  lines: number;
  joints: number;
  footage: number;
};

type SupabaseRelation<T> = T | T[] | null;

type InventoryRackRelation = {
  id?: string | null;
  rack_code?: string | null;
  yard_id?: string | null;
};

type WorkflowZoneRelation = {
  name?: string | null;
  code?: string | null;
};

type CustomerInventoryRow = {
  id: string;
  created_at?: string | null;
  afe?: string | null;
  operator?: string | null;
  rig?: string | null;
  part_number?: string | null;
  size?: string | null;
  grade?: string | null;
  connection?: string | null;
  pipe_range?: string | null;
  status?: string | null;
  condition?: string | null;
  bulk_joints?: number | string | null;
  bulk_footage?: number | string | null;
  total_joints?: number | string | null;
  total_footage?: number | string | null;
  racks?: SupabaseRelation<InventoryRackRelation>;
  workflow_zones?: SupabaseRelation<WorkflowZoneRelation>;
};

type CustomerTicketRow = {
  id: string;
  ticket_number?: string | null;
  bol_number?: string | null;
  carrier?: string | null;
  truck_number?: string | null;
  destination?: string | null;
  created_at?: string | null;
};

type CustomerReleaseRequestRow = {
  id: string;
  request_number?: string | null;
  rack_label?: string | null;
  yard_name?: string | null;
  quantity_joints?: number | string | null;
  release_date?: string | null;
  released_to?: string | null;
  ship_date?: string | null;
  carrier?: string | null;
  destination?: string | null;
  part_summary?: string | null;
  part_lines?: unknown;
  status?: string | null;
  signature_name?: string | null;
  notes?: string | null;
  created_at?: string | null;
};

function firstRelation<T>(value: SupabaseRelation<T> | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function normalizePipeRange(value: unknown): "Range 2" | "Range 3" {
  return value === "Range 3" ? "Range 3" : "Range 2";
}

function calculateRangeFootage(joints: number, pipeRange: string) {
  return Math.round(Number(joints || 0) * (pipeRange === "Range 3" ? 43.5 : 31.5) * 100) / 100;
}

function formatNumber(value: number) {
  return Math.round(Number(value || 0)).toLocaleString();
}

function fullSpecLabel(row: Pick<CustomerInventory, "size" | "grade" | "connection" | "partNumber" | "condition">) {
  return [row.size, row.grade, row.connection, row.partNumber, row.condition].filter(Boolean).join(" / ");
}

function dateIsInRange(value: string, start: string, end: string) {
  if (!value) return false;
  const date = value.slice(0, 10);
  return (!start || date >= start) && (!end || date <= end);
}

function isOpenReleaseStatus(status: string) {
  return !["complete", "completed", "closed", "cancelled", "canceled"].includes(status.toLowerCase());
}

function releaseStepIndex(status: string) {
  const key = status.toLowerCase();
  if (["complete", "completed", "closed"].includes(key)) return 4;
  if (["shipped", "released"].includes(key)) return 3;
  if (["scheduled", "sent", "approved"].includes(key)) return 2;
  if (["review", "in review", "pending"].includes(key)) return 1;
  return 0;
}

function csvValue(value: string | number) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function summarizeReleasePartLines(lines: ReleasePartLine[]) {
  const summaries = new Map<string, ReleasePartLine>();

  for (const line of lines) {
    const key = [
      line.afe,
      line.partNumber,
      line.size,
      line.grade,
      line.connection,
      line.pipeRange,
      line.condition,
    ].join("|");
    const current = summaries.get(key);

    if (current) {
      current.joints += line.joints;
      current.footage += line.footage;
    } else {
      summaries.set(key, { ...line });
    }
  }

  return Array.from(summaries.values()).sort((a, b) =>
    `${a.partNumber} ${a.afe}`.localeCompare(`${b.partNumber} ${b.afe}`)
  );
}

function scaleReleasePartLines(lines: ReleasePartLine[], requestedJoints: number) {
  let remaining = Math.max(0, Number(requestedJoints || 0));
  const scaled: ReleasePartLine[] = [];

  for (const line of lines) {
    const availableJoints = Number(line.joints || 0);
    if (remaining <= 0 || availableJoints <= 0) continue;

    const releasedJoints = Math.min(availableJoints, remaining);
    const storedFootage = Number(line.footage || 0);
    const footagePerJoint =
      availableJoints > 0 && storedFootage > 0
        ? storedFootage / availableJoints
        : line.pipeRange === "Range 3"
          ? 43.5
          : 31.5;

    remaining -= releasedJoints;
    scaled.push({
      ...line,
      joints: releasedJoints,
      footage: Math.round(releasedJoints * footagePerJoint * 100) / 100,
    });
  }

  return summarizeReleasePartLines(scaled);
}

function normalizeReleasePartLineRecords(value: unknown): ReleasePartLine[] {
  const rows = Array.isArray(value) ? value : [];

  return rows
    .map((line) => {
      const row = line && typeof line === "object" ? (line as Record<string, unknown>) : {};
      const pipeRange = normalizePipeRange(row.pipeRange ?? row.pipe_range);

      return {
        afe: String(row.afe ?? row.tu ?? ""),
        partNumber: String(row.partNumber ?? row.part_number ?? ""),
        size: String(row.size ?? ""),
        grade: String(row.grade ?? ""),
        connection: String(row.connection ?? ""),
        pipeRange,
        condition: String(row.condition ?? ""),
        joints: Number(row.joints ?? 0),
        footage: Number(row.footage ?? 0),
      };
    })
    .filter((line) => line.joints > 0);
}

function releasePartSummary(lines: ReleasePartLine[]) {
  return lines
    .map((line) => `${line.partNumber || "Part"} (${line.joints.toLocaleString()} joints)`)
    .join(", ");
}

export default function CustomerPage() {
  const [profile, setProfile] = useState<CustomerProfile | null>(null);
  const [inventory, setInventory] = useState<CustomerInventory[]>([]);
  const [tickets, setTickets] = useState<CustomerTicket[]>([]);
  const [releaseRequests, setReleaseRequests] = useState<CustomerReleaseRequest[]>([]);
  const [releaseForm, setReleaseForm] = useState<ReleaseForm>({
    rackId: "",
    quantityJoints: "",
    releaseDate: new Date().toISOString().slice(0, 10),
    releasedTo: "",
    shipDate: "",
    carrier: "",
    destination: "",
    signatureName: "",
    notes: "",
  });
  const [submittingRelease, setSubmittingRelease] = useState(false);
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [conditionFilter, setConditionFilter] = useState("all");
  const [rangeFilter, setRangeFilter] = useState("all");
  const [historySearch, setHistorySearch] = useState("");
  const [historyType, setHistoryType] = useState("all");
  const [historyStartDate, setHistoryStartDate] = useState("");
  const [historyEndDate, setHistoryEndDate] = useState("");
  const [message, setMessage] = useState("Loading customer portal...");
  const [passwordOpen, setPasswordOpen] = useState(false);

  async function signOut() {
    await supabase.auth.signOut();
    window.location.assign("/login");
  }

  async function loadCustomerPortal() {
    setMessage("Loading customer portal...");

    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData.session?.user;

    if (!user) {
      window.location.assign("/login");
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
        bulk_footage,
        total_joints,
        total_footage,
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
      ((inventoryData ?? []) as CustomerInventoryRow[])
        .map((row) => {
          const rack = firstRelation(row.racks);
          const zone = firstRelation(row.workflow_zones);

          const pipeRange = normalizePipeRange(row.pipe_range);
          const joints = Number(row.total_joints ?? row.bulk_joints ?? 0);
          const storedFootage = Number(row.total_footage ?? row.bulk_footage ?? 0);
          const footage = storedFootage > 0 ? storedFootage : calculateRangeFootage(joints, pipeRange);
          const rackName = rack?.rack_code ?? "";
          const zoneName = zone?.name ?? zone?.code ?? "";
          const specLabel = fullSpecLabel({
            size: row.size ?? "",
            grade: row.grade ?? "",
            connection: row.connection ?? "",
            partNumber: row.part_number ?? "",
            condition: row.condition ?? "",
          });

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
            specLabel,
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

    const mappedReceive: CustomerTicket[] = ((receiveTickets ?? []) as CustomerTicketRow[]).map((ticket) => ({
      id: ticket.id,
      type: "Receiving",
      ticketNumber: ticket.ticket_number ?? "",
      bolNumber: "",
      carrier: ticket.carrier ?? "",
      truckNumber: ticket.truck_number ?? "",
      destination: "",
      createdAt: formatDate(ticket.created_at),
      createdAtRaw: ticket.created_at ?? "",
    }));

    const mappedShip: CustomerTicket[] = ((shipTickets ?? []) as CustomerTicketRow[]).map((ticket) => ({
      id: ticket.id,
      type: "Shipping",
      ticketNumber: ticket.ticket_number ?? "",
      bolNumber: ticket.bol_number ?? "",
      carrier: ticket.carrier ?? "",
      truckNumber: ticket.truck_number ?? "",
      destination: ticket.destination ?? "",
      createdAt: formatDate(ticket.created_at),
      createdAtRaw: ticket.created_at ?? "",
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
          ((result?.requests ?? []) as CustomerReleaseRequestRow[]).map((request) => ({
            id: request.id,
            requestNumber: request.request_number ?? "",
            rackLabel: request.rack_label ?? "",
            yardName: request.yard_name ?? "",
            quantityJoints: Number(request.quantity_joints ?? 0),
            releaseDate: formatDate(request.release_date ?? ""),
            releasedTo: request.released_to ?? "",
            shipDate: formatDate(request.ship_date ?? ""),
            carrier: request.carrier ?? "",
            destination: request.destination ?? "",
            partSummary: request.part_summary ?? "",
            partLines: normalizeReleasePartLineRecords(request.part_lines),
            status: request.status ?? "Submitted",
            signatureName: request.signature_name ?? "",
            notes: request.notes ?? "",
            createdAt: formatDate(request.created_at),
            createdAtRaw: request.created_at ?? "",
          }))
        );
      }
    }

    setMessage("");
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCustomerPortal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    const racks = new Map<string, ReleaseRackOption>();

    for (const row of inventory) {
      if (!row.rackId || !row.yardId) continue;

      const current = racks.get(row.rackId) ?? {
        rackId: row.rackId,
        yardId: row.yardId,
        label: row.rack || row.location,
        joints: 0,
        partLines: [],
      };

      current.joints += row.joints;
      current.partLines.push({
        afe: row.afe,
        partNumber: row.partNumber,
        size: row.size,
        grade: row.grade,
        connection: row.connection,
        pipeRange: row.pipeRange,
        condition: row.condition,
        joints: row.joints,
        footage: row.footage,
      });
      racks.set(row.rackId, current);
    }

    return Array.from(racks.values())
      .map((rack) => ({
        ...rack,
        partLines: summarizeReleasePartLines(rack.partLines),
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [inventory]);

  const selectedReleaseRack = useMemo(() => {
    return releaseRackOptions.find((option) => option.rackId === releaseForm.rackId) ?? null;
  }, [releaseForm.rackId, releaseRackOptions]);

  const requestedReleaseJoints = Number(releaseForm.quantityJoints || 0);
  const selectedReleasePartLines = useMemo(() => {
    if (!selectedReleaseRack) return [];
    if (!Number.isFinite(requestedReleaseJoints) || requestedReleaseJoints <= 0) {
      return selectedReleaseRack.partLines;
    }

    return scaleReleasePartLines(selectedReleaseRack.partLines, requestedReleaseJoints);
  }, [requestedReleaseJoints, selectedReleaseRack]);

  const statusOptions = useMemo(() => {
    return Array.from(new Set(inventory.map((row) => row.status).filter(Boolean))).sort();
  }, [inventory]);

  const conditionOptions = useMemo(() => {
    return Array.from(new Set(inventory.map((row) => row.condition).filter(Boolean))).sort();
  }, [inventory]);

  const rangeOptions = useMemo(() => {
    return Array.from(new Set(inventory.map((row) => row.pipeRange).filter(Boolean))).sort();
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    const searchText = search.toLowerCase().trim();

    return inventory.filter((row) => {
      const matchesLocation =
        selectedLocation === "all" || row.location === selectedLocation;
      const matchesStatus = statusFilter === "all" || row.status === statusFilter;
      const matchesCondition = conditionFilter === "all" || row.condition === conditionFilter;
      const matchesRange = rangeFilter === "all" || row.pipeRange === rangeFilter;

      const matchesSearch =
        !searchText ||
        [
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
          row.specLabel,
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchText);

      return matchesLocation && matchesStatus && matchesCondition && matchesRange && matchesSearch;
    });
  }, [conditionFilter, inventory, rangeFilter, search, selectedLocation, statusFilter]);

  const totals = useMemo(() => {
    return filteredInventory.reduce(
      (sum, row) => ({
        joints: sum.joints + row.joints,
        footage: sum.footage + row.footage,
      }),
      { joints: 0, footage: 0 }
    );
  }, [filteredInventory]);

  const allInventoryTotals = useMemo(() => {
    return inventory.reduce(
      (sum, row) => ({
        lines: sum.lines + 1,
        joints: sum.joints + row.joints,
        footage: sum.footage + row.footage,
      }),
      { lines: 0, joints: 0, footage: 0 }
    );
  }, [inventory]);

  const topLocations = useMemo(() => {
    return [...locationSummaries].sort((a, b) => b.joints - a.joints).slice(0, 5);
  }, [locationSummaries]);

  const statusBreakdown = useMemo(() => {
    const map = new Map<string, LocationSummary>();

    for (const row of inventory) {
      const label = row.status || "Unknown";
      const current = map.get(label) ?? { label, lines: 0, joints: 0, footage: 0 };
      current.lines += 1;
      current.joints += row.joints;
      current.footage += row.footage;
      map.set(label, current);
    }

    return Array.from(map.values()).sort((a, b) => b.joints - a.joints).slice(0, 6);
  }, [inventory]);

  const activeReleaseRequests = useMemo(() => {
    return releaseRequests.filter((request) => isOpenReleaseStatus(request.status));
  }, [releaseRequests]);

  const lastTicket = tickets[0] ?? null;

  const filteredTickets = useMemo(() => {
    const searchText = historySearch.toLowerCase().trim();
    return tickets.filter((ticket) => {
      const matchesType = historyType === "all" || historyType === "tickets" || ticket.type.toLowerCase() === historyType;
      const matchesDate = dateIsInRange(ticket.createdAtRaw || ticket.createdAt, historyStartDate, historyEndDate);
      const matchesSearch =
        !searchText ||
        [ticket.type, ticket.ticketNumber, ticket.bolNumber, ticket.carrier, ticket.truckNumber, ticket.destination, ticket.createdAt]
          .join(" ")
          .toLowerCase()
          .includes(searchText);

      return matchesType && matchesDate && matchesSearch;
    });
  }, [historyEndDate, historySearch, historyStartDate, historyType, tickets]);

  const filteredReleaseRequests = useMemo(() => {
    const searchText = historySearch.toLowerCase().trim();
    return releaseRequests.filter((request) => {
      const matchesType = historyType === "all" || historyType === "release";
      const matchesDate = dateIsInRange(request.createdAtRaw || request.createdAt, historyStartDate, historyEndDate);
      const matchesSearch =
        !searchText ||
        [
          request.requestNumber,
          request.rackLabel,
          request.yardName,
          request.status,
          request.releasedTo,
          request.carrier,
          request.destination,
          request.partSummary,
          request.notes,
          request.createdAt,
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchText);

      return matchesType && matchesDate && matchesSearch;
    });
  }, [historyEndDate, historySearch, historyStartDate, historyType, releaseRequests]);

  const hasInventoryFilters =
    selectedLocation !== "all" || statusFilter !== "all" || conditionFilter !== "all" || rangeFilter !== "all" || search.trim() !== "";

  function clearInventoryFilters() {
    setSelectedLocation("all");
    setStatusFilter("all");
    setConditionFilter("all");
    setRangeFilter("all");
    setSearch("");
  }

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
    window.location.assign(`/ticket-print?type=${type}&id=${ticket.id}`);
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

    if (!releaseForm.releaseDate) {
      setMessage("Release date is required.");
      return;
    }

    if (!releaseForm.releasedTo.trim()) {
      setMessage("Released to is required.");
      return;
    }

    if (!releaseForm.shipDate) {
      setMessage("Ship date is required.");
      return;
    }

    if (!releaseForm.carrier.trim()) {
      setMessage("Carrier is required.");
      return;
    }

    if (!releaseForm.destination.trim()) {
      setMessage("Destination is required.");
      return;
    }

    if (!releaseForm.signatureName.trim()) {
      setMessage("Type your name to sign the release request.");
      return;
    }

    const releasePartLines = scaleReleasePartLines(rack.partLines, quantityJoints);

    if (releasePartLines.length === 0) {
      setMessage("No pipe details were found for the requested release quantity.");
      return;
    }

    setSubmittingRelease(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      if (!accessToken) {
        window.location.assign("/login");
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
          releaseDate: releaseForm.releaseDate,
          releasedTo: releaseForm.releasedTo,
          shipDate: releaseForm.shipDate,
          carrier: releaseForm.carrier,
          destination: releaseForm.destination,
          partSummary: releasePartSummary(releasePartLines),
          partLines: releasePartLines,
          notes: releaseForm.notes,
          signatureName: releaseForm.signatureName,
        }),
      });

      const result = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(result?.error ?? "Release request could not be submitted.");
      }

      setReleaseForm({
        rackId: "",
        quantityJoints: "",
        releaseDate: new Date().toISOString().slice(0, 10),
        releasedTo: "",
        shipDate: "",
        carrier: "",
        destination: "",
        signatureName: "",
        notes: "",
      });
      await loadCustomerPortal();
      setMessage(result?.warning ?? `Release request ${result?.request?.request_number ?? ""} submitted.`);
    } catch (error: unknown) {
      setMessage(`Release request failed: ${error instanceof Error ? error.message : "Unknown error."}`);
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
          <a className="button primary customer-release-button" href="#release-request">Release Request</a>
          <button className="button" onClick={loadCustomerPortal}>Refresh</button>
          <button className="button" onClick={() => setPasswordOpen(true)}>Change Password</button>
          <button className="button" onClick={signOut}>Sign Out</button>
        </div>
      </header>

      {message && <div className="modal-message">{message}</div>}

      <section className="customer-hero">
        <div className="customer-welcome">
          <span>Customer Portal</span>
          <h1>{profile?.companyName ?? "Your Inventory"}</h1>
          <p>Live pipe inventory, rack locations, release requests, tickets, and BOL documents.</p>
        </div>
        <div className="customer-quick-actions">
          <a className="button primary" href="#release-request">Request Release</a>
          <a className="button" href="#customer-history">Tickets / BOL</a>
          <button className="button" onClick={printInventoryReport}>Print Inventory</button>
          <button className="button" onClick={exportInventoryCsv}>Export CSV</button>
        </div>
      </section>

      <section className="report-metrics customer-metrics customer-metrics-five">
        <div>
          <strong>{formatNumber(allInventoryTotals.lines)}</strong>
          <span>Inventory Lines</span>
        </div>
        <div>
          <strong>{formatNumber(allInventoryTotals.joints)}</strong>
          <span>Total Joints</span>
        </div>
        <div>
          <strong>{formatNumber(allInventoryTotals.footage)}</strong>
          <span>Total Footage</span>
        </div>
        <div>
          <strong>{formatNumber(activeReleaseRequests.length)}</strong>
          <span>Open Releases</span>
        </div>
        <div>
          <strong>{lastTicket?.createdAt || "-"}</strong>
          <span>Last Ticket</span>
        </div>
      </section>

      <section className="customer-section customer-snapshot-grid">
        <article className="customer-insight-card">
          <span>Largest Locations</span>
          {topLocations.length > 0 ? (
            topLocations.map((location) => (
              <button
                key={location.label}
                className="customer-insight-row"
                onClick={() => setSelectedLocation(location.label)}
              >
                <strong>{location.label}</strong>
                <span>{formatNumber(location.joints)} joints</span>
              </button>
            ))
          ) : (
            <p className="muted-text">No active inventory found.</p>
          )}
        </article>

        <article className="customer-insight-card">
          <span>Status Breakdown</span>
          {statusBreakdown.length > 0 ? (
            statusBreakdown.map((line) => (
              <button key={line.label} className="customer-insight-row" onClick={() => setStatusFilter(line.label)}>
                <strong>{line.label}</strong>
                <span>{formatNumber(line.joints)} joints</span>
              </button>
            ))
          ) : (
            <p className="muted-text">No status data found.</p>
          )}
        </article>

        <article className="customer-insight-card customer-next-card">
          <span>Next Best Action</span>
          <h3>{activeReleaseRequests.length > 0 ? "Track open releases" : "Request pipe release"}</h3>
          <p>
            {activeReleaseRequests.length > 0
              ? `${activeReleaseRequests.length} release request${activeReleaseRequests.length === 1 ? "" : "s"} still open.`
              : "Select a rack, request the quantity, and TITAN will notify Pathfinder."}
          </p>
          <a className="button primary" href={activeReleaseRequests.length > 0 ? "#customer-history" : "#release-request"}>
            {activeReleaseRequests.length > 0 ? "View Releases" : "Start Release"}
          </a>
        </article>
      </section>

      <section className="customer-section customer-location-section">
        <div className="section-heading">
          <h2>Rack / Location Lookup</h2>
        </div>

        <div className="customer-location-grid">
          <button
            className={`rack-tile-button ${selectedLocation === "all" ? "active-customer-location" : ""}`}
            onClick={() => setSelectedLocation("all")}
          >
            <span className="rack-code">All Locations</span>
            <span className="capacity">{formatNumber(inventory.length)} lines</span>
            <span className="capacity">{formatNumber(allInventoryTotals.joints)} joints</span>
          </button>

          {locationSummaries.map((location) => (
            <button
              key={location.label}
              className={`rack-tile-button ${selectedLocation === location.label ? "active-customer-location" : ""}`}
              onClick={() => setSelectedLocation(location.label)}
            >
              <span className="rack-code">{location.label}</span>
              <span className="capacity">{formatNumber(location.joints)} joints</span>
              <span className="capacity">{formatNumber(location.footage)} ft</span>
            </button>
          ))}
        </div>
      </section>

      <section className="customer-section customer-inventory-section">
        <div className="section-heading customer-section-heading-tight">
          <div>
            <h2>Current Inventory</h2>
          </div>
          <div className="customer-report-actions">
            <button className="button" disabled={!hasInventoryFilters} onClick={clearInventoryFilters}>Clear Filters</button>
            <button className="button" onClick={printInventoryReport}>Print</button>
            <button className="button" onClick={exportInventoryCsv}>Export CSV</button>
          </div>
        </div>

        <div className="customer-filter-panel">
          <label>
            Lookup
            <input
              className="field customer-search"
              placeholder="Search TU#, part, rack, status, rig..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            Status
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All statuses</option>
              {statusOptions.map((status) => (
                <option key={status} value={status}>{status}</option>
              ))}
            </select>
          </label>
          <label>
            Condition
            <select value={conditionFilter} onChange={(event) => setConditionFilter(event.target.value)}>
              <option value="all">All conditions</option>
              {conditionOptions.map((condition) => (
                <option key={condition} value={condition}>{condition}</option>
              ))}
            </select>
          </label>
          <label>
            Range
            <select value={rangeFilter} onChange={(event) => setRangeFilter(event.target.value)}>
              <option value="all">All ranges</option>
              {rangeOptions.map((range) => (
                <option key={range} value={range}>{range}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="customer-filter-summary">
          <strong>{formatNumber(filteredInventory.length)} lines</strong>
          <span>{formatNumber(totals.joints)} joints</span>
          <span>{formatNumber(totals.footage)} ft</span>
        </div>

        <div className="customer-inventory-cards">
          {filteredInventory.map((row) => (
            <article key={row.id} className="customer-inventory-card">
              <div>
                <h3>{row.location}</h3>
                <span className="badge">{row.status}</span>
              </div>
              <strong>{formatNumber(row.joints)} joints</strong>
              <p>{row.specLabel || row.partNumber || "Pipe inventory"}</p>
              <div className="customer-card-meta">
                <span>TU# {row.afe || "-"}</span>
                <span>{formatNumber(row.footage)} ft</span>
                <span>{row.pipeRange}</span>
              </div>
            </article>
          ))}
        </div>

        <div className="table-wrap customer-inventory-table">
          <table>
            <thead>
              <tr>
                <th>Rack</th>
                <th>TU#</th>
                <th>Part Number</th>
                <th>Spec</th>
                <th>Range</th>
                <th>Status</th>
                <th>Condition</th>
                <th>Joints</th>
                <th>Footage</th>
                <th>Operator</th>
                <th>Rig</th>
                <th>Date Created</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map((row) => (
                <tr key={row.id}>
                  <td><strong>{row.location}</strong></td>
                  <td>{row.afe || "-"}</td>
                  <td>{row.partNumber || "-"}</td>
                  <td>{row.specLabel || "-"}</td>
                  <td>{row.pipeRange}</td>
                  <td><span className="badge">{row.status}</span></td>
                  <td>{row.condition || "-"}</td>
                  <td>{formatNumber(row.joints)}</td>
                  <td>{formatNumber(row.footage)}</td>
                  <td>{row.operator || "-"}</td>
                  <td>{row.rig || "-"}</td>
                  <td>{row.createdAt}</td>
                </tr>
              ))}

              {filteredInventory.length === 0 && (
                <tr>
                  <td colSpan={12} className="empty-cell">
                    No inventory matches this view.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="customer-section customer-release-section" id="release-request">
        <div className="section-heading">
          <div>
            <h2>Tubular Release Request</h2>
          </div>
        </div>

        <form className="customer-release-form" onSubmit={submitReleaseRequest}>
          <div className="customer-release-step">
            <span>01</span>
            <h3>Select Pipe</h3>
            <div className="form-grid">
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
            </div>

            {selectedReleaseRack && (
              <div className="release-part-preview">
                <div className="customer-release-preview-title">
                  <strong>{selectedReleaseRack.label}</strong>
                  <span>{formatNumber(selectedReleaseRack.joints)} joints available</span>
                </div>
                <div className="table-wrap compact-table">
                  <table>
                    <thead>
                      <tr>
                        <th>TU#</th>
                        <th>Part Number</th>
                        <th>Spec</th>
                        <th>Range</th>
                        <th>Condition</th>
                        <th>Joints</th>
                        <th>Footage</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedReleasePartLines.map((line, index) => (
                        <tr key={`${line.afe}-${line.partNumber}-${index}`}>
                          <td>{line.afe || "-"}</td>
                          <td>{line.partNumber || "-"}</td>
                          <td>{[line.size, line.grade, line.connection].filter(Boolean).join(" / ") || "-"}</td>
                          <td>{line.pipeRange}</td>
                          <td>{line.condition || "-"}</td>
                          <td>{formatNumber(line.joints)}</td>
                          <td>{formatNumber(line.footage)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <div className="customer-release-step">
            <span>02</span>
            <h3>Shipping Details</h3>
            <div className="form-grid">
              <label>
                Release Date
                <input
                  type="date"
                  value={releaseForm.releaseDate}
                  onChange={(event) => setReleaseForm({ ...releaseForm, releaseDate: event.target.value })}
                />
              </label>
              <label>
                Released To
                <input
                  value={releaseForm.releasedTo}
                  onChange={(event) => setReleaseForm({ ...releaseForm, releasedTo: event.target.value })}
                  placeholder="Person, company, or representative"
                />
              </label>
              <label>
                Ship Date
                <input
                  type="date"
                  value={releaseForm.shipDate}
                  onChange={(event) => setReleaseForm({ ...releaseForm, shipDate: event.target.value })}
                />
              </label>
              <label>
                Carrier
                <input
                  value={releaseForm.carrier}
                  onChange={(event) => setReleaseForm({ ...releaseForm, carrier: event.target.value })}
                  placeholder="Carrier name"
                />
              </label>
              <label className="full">
                Destination
                <input
                  value={releaseForm.destination}
                  onChange={(event) => setReleaseForm({ ...releaseForm, destination: event.target.value })}
                  placeholder="Destination yard, rig, or delivery location"
                />
              </label>
            </div>
          </div>

          <div className="customer-release-step">
            <span>03</span>
            <h3>Review & Sign</h3>
            <div className="form-grid">
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
            </div>
            <div className="slide-actions">
              <button className="button primary" disabled={submittingRelease || releaseRackOptions.length === 0}>
                {submittingRelease ? "Submitting..." : "Submit Release Request"}
              </button>
            </div>
          </div>
        </form>
      </section>

      <section className="customer-section" id="customer-history">
        <div className="section-heading">
          <div>
            <h2>History & Documents</h2>
          </div>
        </div>

        <div className="customer-filter-panel customer-history-filters">
          <label>
            Lookup
            <input
              className="field"
              placeholder="Search ticket, BOL, carrier, rack, request..."
              value={historySearch}
              onChange={(event) => setHistorySearch(event.target.value)}
            />
          </label>
          <label>
            Type
            <select value={historyType} onChange={(event) => setHistoryType(event.target.value)}>
              <option value="all">All history</option>
              <option value="release">Release requests</option>
              <option value="tickets">All tickets</option>
              <option value="receiving">Receiving tickets</option>
              <option value="shipping">Shipping tickets</option>
            </select>
          </label>
          <label>
            Start Date
            <input type="date" value={historyStartDate} onChange={(event) => setHistoryStartDate(event.target.value)} />
          </label>
          <label>
            End Date
            <input type="date" value={historyEndDate} onChange={(event) => setHistoryEndDate(event.target.value)} />
          </label>
        </div>

        <div className="customer-history-grid">
          <div>
            <h3>Release Requests</h3>
            <div className="tickets-grid">
              {filteredReleaseRequests.map((request) => {
                const activeStep = releaseStepIndex(request.status);
                return (
                  <article key={request.id} className="ticket-card customer-ticket customer-release-card">
                    <div className="customer-ticket-title">
                      <h3>{request.requestNumber}</h3>
                      <span className="badge">{request.status}</span>
                    </div>
                    <div className="customer-release-timeline">
                      {["Submitted", "Review", "Scheduled", "Shipped", "Complete"].map((step, index) => (
                        <span key={step} className={index <= activeStep ? "active" : ""}>{step}</span>
                      ))}
                    </div>
                    <div className="ticket-row stacked">
                      <div>
                        <strong>{request.rackLabel}</strong>
                        <span>{formatNumber(request.quantityJoints)} joints requested</span>
                      </div>
                      <div>
                        <span>Release Date: {request.releaseDate || "-"}</span>
                        <span>Ship Date: {request.shipDate || "-"}</span>
                      </div>
                      <div>
                        <span>Released To: {request.releasedTo || "-"}</span>
                        <span>Carrier: {request.carrier || "-"}</span>
                      </div>
                      <div>
                        <span>Destination: {request.destination || "-"}</span>
                      </div>
                      {request.partSummary && (
                        <div>
                          <span>Parts: {request.partSummary}</span>
                        </div>
                      )}
                    </div>
                    <div className="customer-ticket-actions">
                      <button className="button" onClick={() => window.location.assign(`/ticket-print?type=release&id=${request.id}`)}>
                        Print / PDF
                      </button>
                    </div>
                  </article>
                );
              })}

              {filteredReleaseRequests.length === 0 && (
                <div className="ticket-card">
                  <p className="muted-text">No release requests match this search.</p>
                </div>
              )}
            </div>
          </div>

          <div className="customer-ticket-section">
            <h3>Tickets / BOL</h3>
            <div className="tickets-grid">
              {filteredTickets.map((ticket) => (
                <article key={`${ticket.type}-${ticket.id}`} className="ticket-card customer-ticket">
                  <div className="customer-ticket-title">
                    <h3>{ticket.type} {ticket.ticketNumber}</h3>
                    <span>{ticket.createdAt}</span>
                  </div>
                  <div className="ticket-row stacked">
                    <div>
                      <strong>{ticket.carrier || "No carrier"}</strong>
                      <span>Truck {ticket.truckNumber || "-"}</span>
                    </div>
                    <div>
                      <span>{ticket.bolNumber ? `BOL ${ticket.bolNumber}` : "No BOL"}</span>
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

              {filteredTickets.length === 0 && (
                <div className="ticket-card">
                  <p className="muted-text">No tickets match this search.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </main>
  );
}
