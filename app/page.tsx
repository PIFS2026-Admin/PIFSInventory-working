"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";

type Role = "admin" | "customer";
type LocationType = "rack" | "zone";
type TransferMode = "all" | "partial";

type RackConfig = {
  id: string;
  label: string;
  capacity: number;
  sort_order: number;
};

type ZoneConfig = {
  id: string;
  name: string;
  code: string;
  sort_order: number;
};

type YardRecord = {
  id: string;
  name: string;
  code: string;
};

type InventoryRow = {
  id: string;
  companyId: string | null;
  yardId: string | null;
  rackDbId: string | null;
  zoneDbId: string | null;
  createdAt: string;
  inspectionDue: string;
  company: string;
  afe: string;
  partNumber: string;
  size: string;
  grade: string;
  connection: string;
  status: string;
  condition: string;
  locationType: LocationType;
  rackId: string | null;
  zoneId: string | null;
  bulkJoints: number;
  bulkFootage: number;
  talliedJoints: number;
  talliedFootage: number;
};

type ReceiveForm = {
  carrier: string;
  poNumber: string;
  truckNumber: string;
  customer: string;
  destination: string;
  afe: string;
  partNumber: string;
  size: string;
  grade: string;
  connection: string;
  condition: string;
  status: string;
  bulkJoints: string;
  bulkFootage: string;
  inspectionDue: string;
  notes: string;
};

type TransferForm = {
  destination: string;
  joints: string;
  footage: string;
  comment: string;
  backDate: string;
};

type ShipForm = {
  carrier: string;
  poNumber: string;
  truckNumber: string;
  bolNumber: string;
  shipTo: string;
  destination: string;
  notes: string;
};

type ReceivingTicket = {
  id: string;
  ticketNumber: string;
  company: string;
  carrier: string;
  poNumber: string;
  truckNumber: string;
  notes: string;
  createdAt: string;
};

type ShippingTicket = {
  id: string;
  ticketNumber: string;
  bolNumber: string;
  company: string;
  carrier: string;
  poNumber: string;
  truckNumber: string;
  shipTo: string;
  destination: string;
  notes: string;
  createdAt: string;
};

type TicketLine = {
  id: string;
  ticketId: string;
  company: string;
  afe: string;
  partNumber: string;
  condition: string;
  joints: number;
  footage: number;
};

type TransactionRow = {
  id: string;
  type: string;
  company: string;
  joints: number;
  footage: number;
  fromLocation: string;
  toLocation: string;
  comment: string;
  createdAt: string;
};

type ReportLine = {
  label: string;
  lines: number;
  joints: number;
  footage: number;
};

const today = new Date().toISOString().slice(0, 10);

const makeDefaultRacks = (): RackConfig[] => {
  const racks: RackConfig[] = [];

  for (let rack = 200; rack <= 300; rack += 1) {
    racks.push({
      id: `${rack}A`,
      label: `${rack}A`,
      capacity: 500,
      sort_order: racks.length + 1,
    });

    racks.push({
      id: `${rack}B`,
      label: `${rack}B`,
      capacity: 500,
      sort_order: racks.length + 1,
    });
  }

  return racks;
};

const defaultZones: ZoneConfig[] = [
  { id: "shipping", name: "Shipping", code: "shipping", sort_order: 10 },
  { id: "receiving", name: "Receiving", code: "receiving", sort_order: 20 },
  { id: "water_blaster", name: "Water Blaster", code: "water_blaster", sort_order: 30 },
  { id: "inspection", name: "Inspection", code: "inspection", sort_order: 40 },
  { id: "hardband", name: "Hardband", code: "hardband", sort_order: 50 },
  { id: "machine_shop", name: "Machine Shop", code: "machine_shop", sort_order: 60 },
];

const emptyReceiveForm: ReceiveForm = {
  carrier: "",
  poNumber: "",
  truckNumber: "",
  customer: "CP Energy",
  destination: "zone:receiving",
  afe: "",
  partNumber: "",
  size: "2 3/8",
  grade: "J55",
  connection: "8rd EUE",
  condition: "New",
  status: "Received",
  bulkJoints: "",
  bulkFootage: "",
  inspectionDue: "",
  notes: "",
};

const emptyTransferForm: TransferForm = {
  destination: "zone:inspection",
  joints: "",
  footage: "",
  comment: "",
  backDate: "",
};

const emptyShipForm: ShipForm = {
  carrier: "",
  poNumber: "",
  truckNumber: "",
  bolNumber: "",
  shipTo: "",
  destination: "",
  notes: "",
};

function formatDate(value: string) {
  if (!value) return "";
  return value.slice(0, 10);
}

function makeTicketNumber(prefix: string) {
  const stamp = new Date();
  const y = stamp.getFullYear();
  const m = String(stamp.getMonth() + 1).padStart(2, "0");
  const d = String(stamp.getDate()).padStart(2, "0");
  const time = String(stamp.getTime()).slice(-5);
  return `${prefix}-${y}${m}${d}-${time}`;
}

function buildReport(rows: InventoryRow[], getter: (row: InventoryRow) => string): ReportLine[] {
  const report = new Map<string, ReportLine>();

  for (const row of rows) {
    const label = getter(row) || "Unassigned";
    const current = report.get(label) ?? {
      label,
      lines: 0,
      joints: 0,
      footage: 0,
    };

    current.lines += 1;
    current.joints += row.bulkJoints + row.talliedJoints;
    current.footage += row.bulkFootage + row.talliedFootage;

    report.set(label, current);
  }

  return Array.from(report.values()).sort((a, b) => b.joints - a.joints);
}

export default function Home() {
  const [role, setRole] = useState<Role>("admin");
  const [selectedYard, setSelectedYard] = useState<YardRecord | null>(null);
  const [rackLayout, setRackLayout] = useState<RackConfig[]>(makeDefaultRacks());
  const [zones, setZones] = useState<ZoneConfig[]>(defaultZones);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("200A");
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [layoutMode, setLayoutMode] = useState(false);
  const [draggedRack, setDraggedRack] = useState<string | null>(null);

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [ticketsOpen, setTicketsOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);

  const [transferMode, setTransferMode] = useState<TransferMode>("all");
  const [receiveForm, setReceiveForm] = useState<ReceiveForm>(emptyReceiveForm);
  const [transferForm, setTransferForm] = useState<TransferForm>(emptyTransferForm);
  const [shipForm, setShipForm] = useState<ShipForm>(emptyShipForm);

  const [receivingTickets, setReceivingTickets] = useState<ReceivingTicket[]>([]);
  const [shippingTickets, setShippingTickets] = useState<ShippingTicket[]>([]);
  const [ticketLines, setTicketLines] = useState<TicketLine[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);

  const [loadingSetup, setLoadingSetup] = useState(true);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [savingReceive, setSavingReceive] = useState(false);
  const [savingTransfer, setSavingTransfer] = useState(false);
  const [savingShip, setSavingShip] = useState(false);
  const [message, setMessage] = useState("");

  const selectedTransferRow = useMemo(() => {
    if (selectedRows.length !== 1) return null;
    return inventory.find((row) => row.id === selectedRows[0]) ?? null;
  }, [inventory, selectedRows]);

  const selectedShipRows = useMemo(() => {
    return inventory.filter((row) => selectedRows.includes(row.id));
  }, [inventory, selectedRows]);

  const activeInventory = useMemo(() => {
    return inventory.filter((row) => {
      const totalJoints = row.bulkJoints + row.talliedJoints;
      const totalFootage = row.bulkFootage + row.talliedFootage;
      return row.status !== "Shipped" && (totalJoints > 0 || totalFootage > 0);
    });
  }, [inventory]);

  const inventoryByCustomer = useMemo(() => {
    return buildReport(activeInventory, (row) => row.company);
  }, [activeInventory]);

  const inventoryByRack = useMemo(() => {
    return buildReport(activeInventory, (row) => row.rackId ?? row.zoneId ?? "Unassigned");
  }, [activeInventory]);

  const wipReport = useMemo(() => {
    const wipStatuses = ["WIP", "Awaiting Inspection", "Awaiting Ship", "On Hold"];
    return buildReport(
      activeInventory.filter((row) => wipStatuses.includes(row.status)),
      (row) => row.status
    );
  }, [activeInventory]);

  async function loadInventory(yardId: string, racks: RackConfig[], zoneList: ZoneConfig[]) {
    const { data, error } = await supabase
      .from("pipe_inventory")
      .select(`
        id,
        company_id,
        yard_id,
        afe,
        part_number,
        size,
        grade,
        connection,
        condition,
        status,
        inspection_due_date,
        bulk_joints,
        bulk_footage,
        tallied_joints,
        tallied_footage,
        created_at,
        rack_id,
        workflow_zone_id,
        companies(name),
        racks(rack_code),
        workflow_zones(code, name)
      `)
      .eq("yard_id", yardId)
      .order("created_at", { ascending: false });

    if (error) {
      setMessage(`Inventory load failed: ${error.message}`);
      return;
    }

    const mapped = (data ?? []).map((row: any) => {
      const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
      const rack = Array.isArray(row.racks) ? row.racks[0] : row.racks;
      const zone = Array.isArray(row.workflow_zones) ? row.workflow_zones[0] : row.workflow_zones;

      const rackCode =
        rack?.rack_code ??
        racks.find((item) => item.id === row.rack_id)?.label ??
        null;

      const zoneCode =
        zone?.code ??
        zoneList.find((item) => item.id === row.workflow_zone_id)?.code ??
        null;

      return {
        id: row.id,
        companyId: row.company_id,
        yardId: row.yard_id,
        rackDbId: row.rack_id,
        zoneDbId: row.workflow_zone_id,
        createdAt: formatDate(row.created_at),
        inspectionDue: formatDate(row.inspection_due_date),
        company: company?.name ?? "Unknown",
        afe: row.afe ?? "",
        partNumber: row.part_number ?? "",
        size: row.size ?? "",
        grade: row.grade ?? "",
        connection: row.connection ?? "",
        condition: row.condition ?? "",
        status: row.status ?? "",
        locationType: rackCode ? "rack" : "zone",
        rackId: rackCode,
        zoneId: zoneCode,
        bulkJoints: Number(row.bulk_joints ?? 0),
        bulkFootage: Number(row.bulk_footage ?? 0),
        talliedJoints: Number(row.tallied_joints ?? 0),
        talliedFootage: Number(row.tallied_footage ?? 0),
      };
    });

    setInventory(mapped);
  }

  async function loadYardSetup() {
    setLoadingSetup(true);
    setMessage("");

    const { data: sessionData } = await supabase.auth.getSession();

    if (!sessionData.session?.user) {
      window.location.href = "/login";
      return;
    }

    const { data: yard, error: yardError } = await supabase
      .from("yards")
      .select("id, name, code")
      .eq("code", "PIFS")
      .single();

    if (yardError || !yard) {
      setMessage("Could not load the PIFS yard from Supabase.");
      setLoadingSetup(false);
      return;
    }

    setSelectedYard(yard);

    const { data: dbRacks } = await supabase
      .from("racks")
      .select("id, rack_code, capacity_joints, sort_order")
      .eq("yard_id", yard.id)
      .order("sort_order", { ascending: true });

    const mappedRacks =
      dbRacks && dbRacks.length > 0
        ? dbRacks.map((rack: any) => ({
            id: rack.id,
            label: rack.rack_code,
            capacity: Number(rack.capacity_joints ?? 500),
            sort_order: Number(rack.sort_order ?? 0),
          }))
        : makeDefaultRacks();

    setRackLayout(mappedRacks);

    const { data: dbZones } = await supabase
      .from("workflow_zones")
      .select("id, name, code, sort_order")
      .eq("yard_id", yard.id)
      .neq("code", "warehouse")
      .order("sort_order", { ascending: true });

    const mappedZones =
      dbZones && dbZones.length > 0
        ? dbZones.map((zone: any) => ({
            id: zone.id,
            name: zone.name,
            code: zone.code,
            sort_order: Number(zone.sort_order ?? 0),
          }))
        : defaultZones;

    setZones(mappedZones);
    await loadInventory(yard.id, mappedRacks, mappedZones);
    setLoadingSetup(false);
  }
  async function loadTickets() {
    setLoadingTickets(true);
    setMessage("");

    const { data: receiveData, error: receiveError } = await supabase
      .from("receiving_tickets")
      .select(`
        id,
        ticket_number,
        carrier,
        po_number,
        truck_number,
        notes,
        created_at,
        companies(name)
      `)
      .order("created_at", { ascending: false })
      .limit(25);

    if (receiveError) {
      setMessage(`Receiving tickets failed: ${receiveError.message}`);
      setLoadingTickets(false);
      return;
    }

    const { data: shipData, error: shipError } = await supabase
      .from("shipping_tickets")
      .select(`
        id,
        ticket_number,
        bol_number,
        carrier,
        po_number,
        truck_number,
        ship_to,
        destination,
        notes,
        created_at,
        companies(name)
      `)
      .order("created_at", { ascending: false })
      .limit(25);

    if (shipError) {
      setMessage(`Shipping tickets failed: ${shipError.message}`);
      setLoadingTickets(false);
      return;
    }

    const { data: lineData, error: lineError } = await supabase
      .from("ticket_line_items")
      .select(`
        id,
        ticket_id,
        company_id,
        afe,
        part_number,
        condition,
        joints,
        footage,
        companies(name)
      `)
      .order("id", { ascending: false });

    if (lineError) {
      setMessage(`Ticket lines failed: ${lineError.message}`);
      setLoadingTickets(false);
      return;
    }

    setReceivingTickets(
      (receiveData ?? []).map((row: any) => {
        const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;

        return {
          id: row.id,
          ticketNumber: row.ticket_number ?? "",
          company: company?.name ?? "Unknown",
          carrier: row.carrier ?? "",
          poNumber: row.po_number ?? "",
          truckNumber: row.truck_number ?? "",
          notes: row.notes ?? "",
          createdAt: formatDate(row.created_at),
        };
      })
    );

    setShippingTickets(
      (shipData ?? []).map((row: any) => {
        const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;

        return {
          id: row.id,
          ticketNumber: row.ticket_number ?? "",
          bolNumber: row.bol_number ?? "",
          company: company?.name ?? "Unknown",
          carrier: row.carrier ?? "",
          poNumber: row.po_number ?? "",
          truckNumber: row.truck_number ?? "",
          shipTo: row.ship_to ?? "",
          destination: row.destination ?? "",
          notes: row.notes ?? "",
          createdAt: formatDate(row.created_at),
        };
      })
    );

    setTicketLines(
      (lineData ?? []).map((row: any) => {
        const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;

        return {
          id: row.id,
          ticketId: row.ticket_id ?? "",
          company: company?.name ?? "Unknown",
          afe: row.afe ?? "",
          partNumber: row.part_number ?? "",
          condition: row.condition ?? "",
          joints: Number(row.joints ?? 0),
          footage: Number(row.footage ?? 0),
        };
      })
    );

    setLoadingTickets(false);
  }

  async function loadReports() {
    setLoadingReports(true);
    setMessage("");

    const { data, error } = await supabase
      .from("pipe_transactions")
      .select(`
        id,
        transaction_type,
        quantity_joints,
        quantity_footage,
        from_location,
        to_location,
        comment,
        created_at,
        companies(name)
      `)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      setMessage(`Transaction history failed: ${error.message}`);
      setLoadingReports(false);
      return;
    }

    setTransactions(
      (data ?? []).map((row: any) => {
        const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;

        return {
          id: row.id,
          type: row.transaction_type ?? "",
          company: company?.name ?? "Unknown",
          joints: Number(row.quantity_joints ?? 0),
          footage: Number(row.quantity_footage ?? 0),
          fromLocation: row.from_location ?? "",
          toLocation: row.to_location ?? "",
          comment: row.comment ?? "",
          createdAt: formatDate(row.created_at),
        };
      })
    );

    setLoadingReports(false);
  }

  function openTickets() {
    setTicketsOpen(true);
    loadTickets();
  }

  function openReports() {
    setReportsOpen(true);
    loadReports();
  }

  useEffect(() => {
    loadYardSetup();
  }, []);

  const locationOptions = useMemo(() => {
    const rackOptions = rackLayout.map((rack) => ({
      value: `rack:${rack.label}`,
      label: `Rack ${rack.label}`,
    }));

    const zoneOptions = zones.map((zone) => ({
      value: `zone:${zone.code}`,
      label: zone.name,
    }));

    return [...rackOptions, ...zoneOptions];
  }, [rackLayout, zones]);

  const filteredInventory = useMemo(() => {
    const searchText = search.toLowerCase().trim();

    return inventory.filter((row) => {
      const rowLocation = row.locationType === "rack" ? row.rackId : row.zoneId;
      const matchesLocation = selectedLocation === "all" || rowLocation === selectedLocation;

      const matchesSearch =
        !searchText ||
        [
          row.company,
          row.afe,
          row.partNumber,
          row.status,
          row.condition,
          row.rackId ?? "",
          row.zoneId ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchText);

      return matchesLocation && matchesSearch;
    });
  }, [inventory, search, selectedLocation]);

  const selectedTotals = useMemo(() => {
    return selectedShipRows.reduce(
      (totals, row) => ({
        joints: totals.joints + row.bulkJoints + row.talliedJoints,
        footage: totals.footage + row.bulkFootage + row.talliedFootage,
      }),
      { joints: 0, footage: 0 }
    );
  }, [selectedShipRows]);

  function toggleRow(id: string) {
    setSelectedRows((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function openTransfer() {
    setMessage("");

    if (selectedRows.length !== 1) {
      setMessage("Select one inventory line before transferring.");
      return;
    }

    setTransferMode("all");
    setTransferForm(emptyTransferForm);
    setTransferOpen(true);
  }

  function openShip() {
    setMessage("");

    if (selectedRows.length < 1) {
      setMessage("Select at least one inventory line before shipping.");
      return;
    }

    const firstCompany = selectedShipRows[0]?.company;
    const mixedCompanies = selectedShipRows.some((row) => row.company !== firstCompany);

    if (mixedCompanies) {
      setMessage("Ship one customer's pipe at a time.");
      return;
    }

    setShipForm({
      ...emptyShipForm,
      shipTo: firstCompany ?? "",
      bolNumber: makeTicketNumber("BOL"),
    });
    setShipOpen(true);
  }

  function moveRack(targetRack: string) {
    if (!draggedRack || draggedRack === targetRack) return;

    const current = [...rackLayout];
    const fromIndex = current.findIndex((rack) => rack.label === draggedRack);
    const toIndex = current.findIndex((rack) => rack.label === targetRack);

    if (fromIndex < 0 || toIndex < 0) return;

    const [removed] = current.splice(fromIndex, 1);
    current.splice(toIndex, 0, removed);

    setRackLayout(
      current.map((rack, index) => ({
        ...rack,
        sort_order: index + 1,
      }))
    );
  }

  function renameRack(label: string) {
    const nextLabel = window.prompt("New rack number", label);

    if (!nextLabel || nextLabel === label) return;

    setRackLayout((current) =>
      current.map((rack) => (rack.label === label ? { ...rack, label: nextLabel } : rack))
    );

    setInventory((current) =>
      current.map((row) => (row.rackId === label ? { ...row, rackId: nextLabel } : row))
    );

    if (selectedLocation === label) {
      setSelectedLocation(nextLabel);
    }
  }

  async function findOrCreateCompany(name: string) {
    const cleanName = name.trim();

    const { data: existing } = await supabase
      .from("companies")
      .select("id, name")
      .eq("name", cleanName)
      .maybeSingle();

    if (existing?.id) return existing.id;

    const { data: created, error } = await supabase
      .from("companies")
      .insert({ name: cleanName })
      .select("id")
      .single();

    if (error) throw error;
    return created.id;
  }

  function getDestination(destination: string) {
    const [destinationType, destinationValue] = destination.split(":");

    const rack =
      destinationType === "rack"
        ? rackLayout.find((item) => item.label === destinationValue)
        : null;

    const zone =
      destinationType === "zone"
        ? zones.find((item) => item.code === destinationValue)
        : null;

    return {
      rack,
      zone,
      locationName: rack?.label ?? zone?.name ?? destinationValue,
    };
  }

  async function saveReceive() {
    if (!selectedYard) return;
  
    setMessage("");
  
    if (!receiveForm.customer.trim()) {
      setMessage("Customer is required.");
      return;
    }
  
    if (!receiveForm.partNumber.trim()) {
      setMessage("Part number is required.");
      return;
    }
  
    const joints = Number(receiveForm.bulkJoints || 0);
    const footage = Number(receiveForm.bulkFootage || 0);
  
    if (joints <= 0 && footage <= 0) {
      setMessage("Enter joints or footage before saving.");
      return;
    }
  
    setSavingReceive(true);
  
    try {
      const companyId = await findOrCreateCompany(receiveForm.customer);
      const { rack, zone } = getDestination(receiveForm.destination);
      const destinationName = rack?.label ?? zone?.name ?? receiveForm.destination;
      const ticketNumber = makeTicketNumber("REC");
  
      const { error: inventoryError } = await supabase.from("pipe_inventory").insert({
        company_id: companyId,
        yard_id: selectedYard.id,
        rack_id: rack?.id ?? null,
        workflow_zone_id: zone?.id ?? null,
        afe: receiveForm.afe || null,
        part_number: receiveForm.partNumber,
        size: receiveForm.size || null,
        grade: receiveForm.grade || null,
        connection: receiveForm.connection || null,
        condition: receiveForm.condition || "New",
        status: receiveForm.status || "Received",
        inspection_color: receiveForm.inspectionColor || "None",
        inspection_due_date: receiveForm.inspectionDueDate || null,
        bulk_joints: joints,
        bulk_footage: footage,
        tallied_joints: 0,
        tallied_footage: 0,
      });
  
      if (inventoryError) throw inventoryError;
  
      const { error: ticketError } = await supabase.from("receiving_tickets").insert({
        company_id: companyId,
        yard_id: selectedYard.id,
        ticket_number: ticketNumber,
        carrier: receiveForm.carrier || null,
        po_number: receiveForm.poNumber || null,
        truck_number: receiveForm.truckNumber || null,
        destination: destinationName,
        notes: receiveForm.notes || null,
        afe: receiveForm.afe || null,
        part_number: receiveForm.partNumber,
        size: receiveForm.size || null,
        grade: receiveForm.grade || null,
        connection: receiveForm.connection || null,
        condition: receiveForm.condition || "New",
        joints,
        footage,
      });
  
      if (ticketError) throw ticketError;
  
      await supabase.from("pipe_transactions").insert({
        company_id: companyId,
        yard_id: selectedYard.id,
        type: "receive",
        from_location: null,
        to_location: destinationName,
        quantity_joints: joints,
        quantity_footage: footage,
        comment: receiveForm.notes || `Received on ticket ${ticketNumber}`,
      });
  
      await loadInventory(selectedYard.id, rackLayout, zones);
      await loadTickets();
  
      setReceiveOpen(false);
      setReceiveForm(emptyReceiveForm);
      setMessage(`Receiving saved. Ticket ${ticketNumber}`);
    } catch (error: any) {
      setMessage(`Receive failed: ${error.message}`);
    } finally {
      setSavingReceive(false);
    }
  }
  
  async function saveTransfer() {
    if (!selectedYard || !selectedTransferRow) return;

    setMessage("");

    if (!transferForm.comment.trim()) {
      setMessage("Transfer comment is required.");
      return;
    }

    const { rack, zone, locationName } = getDestination(transferForm.destination);

    const currentLocation =
      selectedTransferRow.locationType === "rack"
        ? selectedTransferRow.rackId
        : selectedTransferRow.zoneId;

    if (currentLocation === rack?.label || currentLocation === zone?.code) {
      setMessage("Choose a different destination.");
      return;
    }

    const movingAll = transferMode === "all";
    const moveJoints = movingAll ? selectedTransferRow.bulkJoints : Number(transferForm.joints || 0);
    const moveFootage = movingAll ? selectedTransferRow.bulkFootage : Number(transferForm.footage || 0);

    if (!movingAll && moveJoints <= 0 && moveFootage <= 0) {
      setMessage("Enter joints or footage to transfer.");
      return;
    }

    if (moveJoints > selectedTransferRow.bulkJoints) {
      setMessage("You cannot transfer more bulk joints than this line has.");
      return;
    }

    if (moveFootage > selectedTransferRow.bulkFootage) {
      setMessage("You cannot transfer more bulk footage than this line has.");
      return;
    }

    setSavingTransfer(true);

    try {
      if (movingAll) {
        const { error: moveError } = await supabase
          .from("pipe_inventory")
          .update({
            rack_id: rack?.id ?? null,
            workflow_zone_id: zone?.id ?? null,
            status: zone?.code === "inspection" ? "Awaiting Inspection" : selectedTransferRow.status,
          })
          .eq("id", selectedTransferRow.id);

        if (moveError) throw moveError;
      } else {
        const remainingJoints = selectedTransferRow.bulkJoints - moveJoints;
        const remainingFootage = selectedTransferRow.bulkFootage - moveFootage;

        const { error: sourceError } = await supabase
          .from("pipe_inventory")
          .update({
            bulk_joints: remainingJoints,
            bulk_footage: remainingFootage,
          })
          .eq("id", selectedTransferRow.id);

        if (sourceError) throw sourceError;

        const { error: destinationError } = await supabase.from("pipe_inventory").insert({
          company_id: selectedTransferRow.companyId,
          yard_id: selectedYard.id,
          rack_id: rack?.id ?? null,
          workflow_zone_id: zone?.id ?? null,
          afe: selectedTransferRow.afe || null,
          part_number: selectedTransferRow.partNumber,
          size: selectedTransferRow.size || null,
          grade: selectedTransferRow.grade || null,
          connection: selectedTransferRow.connection || null,
          condition: selectedTransferRow.condition || null,
          status:
            zone?.code === "inspection"
              ? "Awaiting Inspection"
              : zone?.code === "shipping"
                ? "Awaiting Ship"
                : selectedTransferRow.status,
          inspection_due_date: selectedTransferRow.inspectionDue || null,
          bulk_joints: moveJoints,
          bulk_footage: moveFootage,
          tallied_joints: 0,
          tallied_footage: 0,
        });

        if (destinationError) throw destinationError;
      }

      await supabase.from("pipe_transactions").insert({
        pipe_inventory_id: selectedTransferRow.id,
        company_id: selectedTransferRow.companyId,
        yard_id: selectedYard.id,
        transaction_type: movingAll ? "transfer_all" : "transfer_partial",
        quantity_joints: moveJoints,
        quantity_footage: moveFootage,
        from_location: currentLocation,
        to_location: locationName,
        comment: transferForm.comment,
        transaction_date: transferForm.backDate || null,
      });

      await loadInventory(selectedYard.id, rackLayout, zones);

      setTransferOpen(false);
      setSelectedRows([]);
      setTransferForm(emptyTransferForm);
      setMessage(`Transferred ${moveJoints} joints / ${moveFootage.toLocaleString()} ft to ${locationName}.`);
    } catch (error: any) {
      setMessage(`Transfer failed: ${error.message}`);
    } finally {
      setSavingTransfer(false);
    }
  }

  async function saveShip() {
    if (!selectedYard || selectedShipRows.length === 0) return;

    setMessage("");

    if (!shipForm.carrier.trim()) {
      setMessage("Carrier is required.");
      return;
    }

    if (!shipForm.truckNumber.trim()) {
      setMessage("Truck number is required.");
      return;
    }

    if (!shipForm.shipTo.trim()) {
      setMessage("Ship To is required.");
      return;
    }

    setSavingShip(true);

    try {
      const ticketNumber = makeTicketNumber("SHIP");
      const firstRow = selectedShipRows[0];

      const { data: ticket, error: ticketError } = await supabase
        .from("shipping_tickets")
        .insert({
          company_id: firstRow.companyId,
          yard_id: selectedYard.id,
          ticket_number: ticketNumber,
          bol_number: shipForm.bolNumber || makeTicketNumber("BOL"),
          carrier: shipForm.carrier,
          po_number: shipForm.poNumber || null,
          truck_number: shipForm.truckNumber,
          ship_to: shipForm.shipTo,
          destination: shipForm.destination || null,
          notes: shipForm.notes || null,
        })
        .select("id")
        .single();

      if (ticketError) throw ticketError;

      const lineItems = selectedShipRows.map((row) => ({
        ticket_id: ticket.id,
        pipe_inventory_id: row.id,
        company_id: row.companyId,
        part_number: row.partNumber,
        afe: row.afe || null,
        size: row.size || null,
        grade: row.grade || null,
        connection: row.connection || null,
        condition: row.condition || null,
        joints: row.bulkJoints + row.talliedJoints,
        footage: row.bulkFootage + row.talliedFootage,
      }));

      const { error: lineError } = await supabase
        .from("ticket_line_items")
        .insert(lineItems);

      if (lineError) throw lineError;

      for (const row of selectedShipRows) {
        const { error: inventoryError } = await supabase
          .from("pipe_inventory")
          .update({
            status: "Shipped",
            bulk_joints: 0,
            bulk_footage: 0,
            tallied_joints: 0,
            tallied_footage: 0,
          })
          .eq("id", row.id);

        if (inventoryError) throw inventoryError;

        await supabase.from("pipe_transactions").insert({
          pipe_inventory_id: row.id,
          company_id: row.companyId,
          yard_id: selectedYard.id,
          transaction_type: "ship",
          quantity_joints: row.bulkJoints + row.talliedJoints,
          quantity_footage: row.bulkFootage + row.talliedFootage,
          from_location: row.rackId ?? row.zoneId,
          to_location: shipForm.destination || shipForm.shipTo,
          comment: shipForm.notes || `Shipped on ${ticketNumber}`,
        });
      }

      await loadInventory(selectedYard.id, rackLayout, zones);
      await loadTickets();
      await loadReports();

      setShipOpen(false);
      setSelectedRows([]);
      setShipForm(emptyShipForm);
      setMessage(`Shipping ticket ${ticketNumber} saved. BOL ${shipForm.bolNumber}`);
    } catch (error: any) {
      setMessage(`Ship failed: ${error.message}`);
    } finally {
      setSavingShip(false);
    }
  }

  if (loadingSetup) {
    return (
      <main className="app-shell">
        <section className="empty-state">
          <h1>PIFS Tubular Management</h1>
          <p>Loading yard setup...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="side-panel">
        <div className="brand">
          <div className="brand-mark">PF</div>
          <div>
            <div className="brand-title">PIFS Tubular Management</div>
            <div className="brand-subtitle">Modern pipe yard inventory</div>
          </div>
        </div>

        <select className="field" value={selectedYard?.id ?? ""} disabled>
          <option>{selectedYard?.name ?? "Pathfinder Yard"}</option>
        </select>

        <input
          className="field"
          placeholder="Search company, TU#, part number..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <select className="field" value={role} onChange={(event) => setRole(event.target.value as Role)}>
          <option value="admin">Admin</option>
          <option value="customer">Customer View</option>
        </select>

        <div className="button-grid">
          <button className="button">New Master Part</button>
          <button className="button">Save</button>
          <button className="button" onClick={() => window.print()}>
  Print
</button>
          <button className="button" onClick={loadYardSetup}>Refresh</button>
          <button className="button">Highlight</button>
          <button className="button">Complete</button>
          <button className="button" disabled={role === "customer"} onClick={openTransfer}>Transfer</button>
          <button className="button primary" disabled={role === "customer"} onClick={() => setReceiveOpen(true)}>Receive</button>
          <button className="button" disabled={role === "customer"} onClick={openShip}>Ship</button>
          <button className="button" disabled={role === "customer"}>Adjust</button>
          <button className="button" onClick={openTickets}>Tickets</button>
          <button className="button" onClick={openReports}>Reports</button>
          <button className="button" onClick={() => (window.location.href = "/admin")}>Admin</button>
        </div>

        {message && <div className="modal-message">{message}</div>}

        <section className="panel">
          <div className="panel-title">Work Zones</div>
          <div className="zone-list">
            {zones.map((zone) => (
              <button
                key={zone.id}
                className={`zone-card ${selectedLocation === zone.code ? "active" : ""}`}
                onClick={() => setSelectedLocation(zone.code)}
              >
                <span>{zone.name}</span>
                <small>{zone.code}</small>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div>
            <h1>Yard View</h1>
            <p>{selectedYard?.name} / {filteredInventory.length} visible line items</p>
          </div>

          <div className="topbar-actions">
            <button className="button" onClick={() => setSelectedLocation("all")}>Show All</button>
            <button className={`button ${layoutMode ? "primary" : ""}`} onClick={() => setLayoutMode((current) => !current)}>
              {layoutMode ? "Done Layout" : "Edit Layout"}
            </button>
          </div>
        </header>

        <section className="rack-section">
          <div className="section-heading">
            <h2>Rack Grid</h2>
            <p>{layoutMode ? "Drag racks to rearrange. Use Edit to rename rack numbers." : "Select a rack to view inventory."}</p>
          </div>

          <div className="rack-grid">
            {rackLayout.map((rack) => {
              const rackInventory = inventory.filter((row) => row.rackId === rack.label);
              const joints = rackInventory.reduce((sum, row) => sum + row.bulkJoints + row.talliedJoints, 0);
              const fill = Math.min(100, Math.round((joints / rack.capacity) * 100));

              return (
                <div
                  key={rack.id}
                  className={`rack-tile ${selectedLocation === rack.label ? "active" : ""} ${layoutMode ? "layout-mode" : ""}`}
                  draggable={layoutMode}
                  onDragStart={() => setDraggedRack(rack.label)}
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => moveRack(rack.label)}
                >
                  <button className="rack-tile-button" onClick={() => setSelectedLocation(rack.label)}>
                    <span className="rack-code">{rack.label}</span>
                    <span className="capacity">{joints}/{rack.capacity} joints</span>
                    <span className="rack-meter"><span style={{ width: `${fill}%` }} /></span>
                  </button>

                  {layoutMode && (
                    <button className="mini-button edit-rack" onClick={() => renameRack(rack.label)}>
                      Edit
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="inventory-panel">
          <div className="section-heading">
            <h2>Inventory at {selectedLocation === "all" ? "All Locations" : selectedLocation}</h2>
            <p>{selectedTotals.joints} selected joints / {selectedTotals.footage.toLocaleString()} selected footage</p>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Date Created</th>
                  <th>Inspection Due</th>
                  <th>Company</th>
                  <th>TU#</th>
                  <th>Part Number</th>
                  <th>Status</th>
                  <th>Condition</th>
                  <th>Rack/Location</th>
                  <th>Bulk Joints</th>
                  <th>Bulk Footage</th>
                  <th>Tallied Joint Count</th>
                  <th>Tallied Footage</th>
                  <th>Total Joint Count</th>
                  <th>Total Footage</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((row) => {
                  const totalJoints = row.bulkJoints + row.talliedJoints;
                  const totalFootage = row.bulkFootage + row.talliedFootage;
                  const location = row.locationType === "rack" ? row.rackId : row.zoneId;

                  return (
                    <tr key={row.id}>
                      <td>
                        <input type="checkbox" checked={selectedRows.includes(row.id)} onChange={() => toggleRow(row.id)} />
                      </td>
                      <td>{row.createdAt}</td>
                      <td>{row.inspectionDue}</td>
                      <td>{row.company}</td>
                      <td>{row.afe}</td>
                      <td>{row.partNumber}</td>
                      <td><span className="badge">{row.status}</span></td>
                      <td>{row.condition}</td>
                      <td>{location}</td>
                      <td>{row.bulkJoints}</td>
                      <td>{row.bulkFootage.toLocaleString()}</td>
                      <td>{row.talliedJoints}</td>
                      <td>{row.talliedFootage.toLocaleString()}</td>
                      <td>{totalJoints}</td>
                      <td>{totalFootage.toLocaleString()}</td>
                    </tr>
                  );
                })}

                {filteredInventory.length === 0 && (
                  <tr>
                    <td colSpan={15} className="empty-cell">No inventory found for this location.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      {receiveOpen && (
        <div className="modal-backdrop">
          <section className="slide-over">
            <div className="slide-header">
              <div>
                <h2>Receive Pipe</h2>
                <p>Create inventory and receiving record</p>
              </div>
              <button className="icon-button" onClick={() => setReceiveOpen(false)}>X</button>
            </div>

            {message && <div className="modal-message">{message}</div>}

            <div className="form-grid">
              <label>Carrier<input value={receiveForm.carrier} onChange={(event) => setReceiveForm({ ...receiveForm, carrier: event.target.value })} /></label>
              <label>PO Number<input value={receiveForm.poNumber} onChange={(event) => setReceiveForm({ ...receiveForm, poNumber: event.target.value })} /></label>
              <label>Truck Number<input value={receiveForm.truckNumber} onChange={(event) => setReceiveForm({ ...receiveForm, truckNumber: event.target.value })} /></label>
              <label>Customer<input value={receiveForm.customer} onChange={(event) => setReceiveForm({ ...receiveForm, customer: event.target.value })} /></label>

              <label>
                Receive Into
                <select value={receiveForm.destination} onChange={(event) => setReceiveForm({ ...receiveForm, destination: event.target.value })}>
                  {locationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>

              <label>TU#<input value={receiveForm.afe} onChange={(event) => setReceiveForm({ ...receiveForm, afe: event.target.value })} /></label>
              <label className="full">Part Number<input value={receiveForm.partNumber} onChange={(event) => setReceiveForm({ ...receiveForm, partNumber: event.target.value })} placeholder="2 3/8 J55 8rd EUE" /></label>
              <label>Size<input value={receiveForm.size} onChange={(event) => setReceiveForm({ ...receiveForm, size: event.target.value })} /></label>
              <label>Grade<input value={receiveForm.grade} onChange={(event) => setReceiveForm({ ...receiveForm, grade: event.target.value })} /></label>
              <label>Connection<input value={receiveForm.connection} onChange={(event) => setReceiveForm({ ...receiveForm, connection: event.target.value })} placeholder="PH6, NC50, 8rd EUE" /></label>

              <label>
                Condition
                <select value={receiveForm.condition} onChange={(event) => setReceiveForm({ ...receiveForm, condition: event.target.value })}>
                  <option>New</option>
                  <option>Premium</option>
                  <option>Used</option>
                  <option>Repair</option>
                  <option>Rejected</option>
                  <option>Scrap</option>
                </select>
              </label>

              <label>
                Status
                <select value={receiveForm.status} onChange={(event) => setReceiveForm({ ...receiveForm, status: event.target.value })}>
                  <option>Received</option>
                  <option>Available</option>
                  <option>Awaiting Inspection</option>
                  <option>WIP</option>
                  <option>On Hold</option>
                </select>
              </label>

              <label>Bulk Joints<input type="number" value={receiveForm.bulkJoints} onChange={(event) => setReceiveForm({ ...receiveForm, bulkJoints: event.target.value })} /></label>
              <label>Bulk Footage<input type="number" value={receiveForm.bulkFootage} onChange={(event) => setReceiveForm({ ...receiveForm, bulkFootage: event.target.value })} /></label>
              <label>Inspection Due<input type="date" value={receiveForm.inspectionDue} onChange={(event) => setReceiveForm({ ...receiveForm, inspectionDue: event.target.value })} min={today} /></label>
              <label className="full">Notes<textarea value={receiveForm.notes} onChange={(event) => setReceiveForm({ ...receiveForm, notes: event.target.value })} /></label>
            </div>

            <div className="slide-actions">
              <button className="button" onClick={() => setReceiveOpen(false)}>Cancel</button>
              <button className="button primary" onClick={saveReceive} disabled={savingReceive}>
                {savingReceive ? "Saving..." : "Save Receiving"}
              </button>
            </div>
          </section>
        </div>
      )}

      {transferOpen && selectedTransferRow && (
        <div className="modal-backdrop">
          <section className="slide-over">
            <div className="slide-header">
              <div>
                <h2>Transfer Pipe</h2>
                <p>{selectedTransferRow.company} / {selectedTransferRow.partNumber}</p>
              </div>
              <button className="icon-button" onClick={() => setTransferOpen(false)}>X</button>
            </div>

            {message && <div className="modal-message">{message}</div>}

            <div className="transfer-summary">
              <div><strong>Current Location</strong><span>{selectedTransferRow.rackId ?? selectedTransferRow.zoneId}</span></div>
              <div><strong>Available Joints</strong><span>{selectedTransferRow.bulkJoints}</span></div>
              <div><strong>Available Footage</strong><span>{selectedTransferRow.bulkFootage.toLocaleString()}</span></div>
            </div>

            <div className="mode-toggle">
              <button className={`button ${transferMode === "all" ? "primary" : ""}`} onClick={() => setTransferMode("all")}>Move All</button>
              <button className={`button ${transferMode === "partial" ? "primary" : ""}`} onClick={() => setTransferMode("partial")}>Move Partial</button>
            </div>

            <div className="form-grid">
              <label className="full">
                Destination
                <select value={transferForm.destination} onChange={(event) => setTransferForm({ ...transferForm, destination: event.target.value })}>
                  {locationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>

              {transferMode === "partial" && (
                <>
                  <label>Joints to Transfer<input type="number" value={transferForm.joints} onChange={(event) => setTransferForm({ ...transferForm, joints: event.target.value })} /></label>
                  <label>Feet to Transfer<input type="number" value={transferForm.footage} onChange={(event) => setTransferForm({ ...transferForm, footage: event.target.value })} /></label>
                </>
              )}

              <label>
                Back Date
                <input type="date" value={transferForm.backDate} onChange={(event) => setTransferForm({ ...transferForm, backDate: event.target.value })} />
              </label>

              <label className="full">
                Comment
                <textarea value={transferForm.comment} onChange={(event) => setTransferForm({ ...transferForm, comment: event.target.value })} placeholder="Required for transfer history" />
              </label>
            </div>

            <div className="slide-actions">
              <button className="button" onClick={() => setTransferOpen(false)}>Cancel</button>
              <button className="button primary" onClick={saveTransfer} disabled={savingTransfer}>
                {savingTransfer ? "Transferring..." : "Finish Transfer"}
              </button>
            </div>
          </section>
        </div>
      )}

      {shipOpen && (
        <div className="modal-backdrop">
          <section className="slide-over">
            <div className="slide-header">
              <div>
                <h2>Shipping Ticket / BOL</h2>
                <p>{selectedShipRows.length} selected line items</p>
              </div>
              <button className="icon-button" onClick={() => setShipOpen(false)}>X</button>
            </div>

            {message && <div className="modal-message">{message}</div>}

            <div className="transfer-summary">
              <div><strong>Ship To</strong><span>{shipForm.shipTo || "Required"}</span></div>
              <div><strong>Total Joints</strong><span>{selectedTotals.joints}</span></div>
              <div><strong>Total Footage</strong><span>{selectedTotals.footage.toLocaleString()}</span></div>
            </div>

            <div className="form-grid">
              <label>Carrier<input value={shipForm.carrier} onChange={(event) => setShipForm({ ...shipForm, carrier: event.target.value })} /></label>
              <label>PO Number<input value={shipForm.poNumber} onChange={(event) => setShipForm({ ...shipForm, poNumber: event.target.value })} /></label>
              <label>Truck Number<input value={shipForm.truckNumber} onChange={(event) => setShipForm({ ...shipForm, truckNumber: event.target.value })} /></label>
              <label>BOL Number<input value={shipForm.bolNumber} onChange={(event) => setShipForm({ ...shipForm, bolNumber: event.target.value })} /></label>
              <label className="full">Ship To<input value={shipForm.shipTo} onChange={(event) => setShipForm({ ...shipForm, shipTo: event.target.value })} /></label>
              <label className="full">Destination<input value={shipForm.destination} onChange={(event) => setShipForm({ ...shipForm, destination: event.target.value })} placeholder="Rig, yard, or delivery address" /></label>
              <label className="full">Notes<textarea value={shipForm.notes} onChange={(event) => setShipForm({ ...shipForm, notes: event.target.value })} /></label>
            </div>

            <div className="ticket-preview">
              <h3>Ticket Preview</h3>
              <table>
                <thead>
                  <tr>
                    <th>Company</th>
                    <th>TU#</th>
                    <th>Part Number</th>
                    <th>Condition</th>
                    <th>Joints</th>
                    <th>Footage</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedShipRows.map((row) => (
                    <tr key={row.id}>
                      <td>{row.company}</td>
                      <td>{row.afe}</td>
                      <td>{row.partNumber}</td>
                      <td>{row.condition}</td>
                      <td>{row.bulkJoints + row.talliedJoints}</td>
                      <td>{(row.bulkFootage + row.talliedFootage).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="slide-actions">
              <button className="button" onClick={() => setShipOpen(false)}>Cancel</button>
              <button className="button primary" onClick={saveShip} disabled={savingShip}>
                {savingShip ? "Saving..." : "Save Shipping Ticket / BOL"}
              </button>
            </div>
          </section>
        </div>
      )}

      {ticketsOpen && (
        <div className="modal-backdrop">
          <section className="slide-over wide-slide">
            <div className="slide-header">
              <div>
                <h2>Tickets</h2>
                <p>Receiving tickets, shipping tickets, and BOL records</p>
              </div>
              <button className="icon-button" onClick={() => setTicketsOpen(false)}>X</button>
            </div>

            {message && <div className="modal-message">{message}</div>}

            <div className="slide-actions top-actions">
              <button className="button" onClick={loadTickets}>
                {loadingTickets ? "Loading..." : "Refresh Tickets"}
              </button>
            </div>

            <div className="tickets-grid">
              <section className="ticket-card">
                <h3>Receiving Tickets</h3>
                {receivingTickets.length === 0 && <p className="muted-text">No receiving tickets found.</p>}

                {receivingTickets.map((ticket) => (
  <article key={ticket.id} className="ticket-row stacked">
    <div>
      <strong>{ticket.ticketNumber}</strong>
      <span>{ticket.company}</span>
    </div>
    <div>
      <span>{ticket.createdAt}</span>
      <span>{ticket.carrier || "No carrier"}</span>
    </div>
    <div>
      <span>PO {ticket.poNumber || "-"}</span>
      <span>Truck {ticket.truckNumber || "-"}</span>
    </div>
    <button
      className="button"
      onClick={() =>
        (window.location.href = `/ticket-print?type=receiving&id=${ticket.id}`)
      }
    >
      Print / PDF
    </button>
  </article>
))}
              </section>

              <section className="ticket-card">
                <h3>Shipping Tickets / BOL</h3>
                {shippingTickets.length === 0 && <p className="muted-text">No shipping tickets found.</p>}

                {shippingTickets.map((ticket) => {
                  const lines = ticketLines.filter((line) => line.ticketId === ticket.id);
                  const joints = lines.reduce((sum, line) => sum + line.joints, 0);
                  const footage = lines.reduce((sum, line) => sum + line.footage, 0);

                  return (
                    <article key={ticket.id} className="ticket-row stacked">
                      <div>
                        <strong>{ticket.ticketNumber}</strong>
                        <span>BOL {ticket.bolNumber || "-"}</span>
                      </div>
                      <div>
                        <span>{ticket.company}</span>
                        <span>{ticket.createdAt}</span>
                      </div>
                      <div>
                        <span>{ticket.carrier || "No carrier"}</span>
                        <span>Truck {ticket.truckNumber || "-"}</span>
                      </div>
                      <div>
                        <span>{joints} joints</span>
                        <span>{footage.toLocaleString()} ft</span>
                      </div>
                      <button
  className="button"
  onClick={() =>
    window.open(`/ticket-print?type=shipping&id=${ticket.id}`, "_blank")
  }
>
  Print / PDF
</button>
                      {lines.length > 0 && (
                        <div className="ticket-line-list">
                          {lines.map((line) => (
                            <span key={line.id}>
                              {line.partNumber} / {line.joints} joints / {line.footage.toLocaleString()} ft
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>
            </div>
          </section>
        </div>
      )}

      {reportsOpen && (
        <div className="modal-backdrop">
          <section className="slide-over wide-slide">
            <div className="slide-header">
              <div>
                <h2>Reports</h2>
                <p>Inventory summaries and recent transaction history</p>
              </div>
              <button className="icon-button" onClick={() => setReportsOpen(false)}>X</button>
            </div>

            {message && <div className="modal-message">{message}</div>}

            <div className="report-metrics">
              <div>
                <strong>{activeInventory.length}</strong>
                <span>Active Lines</span>
              </div>
              <div>
                <strong>{activeInventory.reduce((sum, row) => sum + row.bulkJoints + row.talliedJoints, 0)}</strong>
                <span>Total Joints</span>
              </div>
              <div>
                <strong>{activeInventory.reduce((sum, row) => sum + row.bulkFootage + row.talliedFootage, 0).toLocaleString()}</strong>
                <span>Total Footage</span>
              </div>
            </div>

            <div className="slide-actions top-actions">
              <button className="button" onClick={loadReports}>
                {loadingReports ? "Loading..." : "Refresh Reports"}
              </button>
            </div>

            <div className="reports-grid">
              <section className="ticket-card">
                <h3>Inventory by Customer</h3>
                {inventoryByCustomer.map((line) => (
                  <div key={line.label} className="report-row">
                    <span>{line.label}</span>
                    <strong>{line.joints} joints</strong>
                    <small>{line.footage.toLocaleString()} ft / {line.lines} lines</small>
                  </div>
                ))}
              </section>

              <section className="ticket-card">
                <h3>Inventory by Rack / Zone</h3>
                {inventoryByRack.map((line) => (
                  <div key={line.label} className="report-row">
                    <span>{line.label}</span>
                    <strong>{line.joints} joints</strong>
                    <small>{line.footage.toLocaleString()} ft / {line.lines} lines</small>
                  </div>
                ))}
              </section>

              <section className="ticket-card">
                <h3>WIP Report</h3>
                {wipReport.length === 0 && <p className="muted-text">No WIP inventory found.</p>}
                {wipReport.map((line) => (
                  <div key={line.label} className="report-row">
                    <span>{line.label}</span>
                    <strong>{line.joints} joints</strong>
                    <small>{line.footage.toLocaleString()} ft / {line.lines} lines</small>
                  </div>
                ))}
              </section>

              <section className="ticket-card">
                <h3>Transaction History</h3>
                {transactions.length === 0 && <p className="muted-text">No transactions found.</p>}
                {transactions.map((transaction) => (
                  <article key={transaction.id} className="history-row">
                    <div>
                      <strong>{transaction.type}</strong>
                      <span>{transaction.company}</span>
                    </div>
                    <div>
                      <span>{transaction.fromLocation || "-"} to {transaction.toLocation || "-"}</span>
                      <span>{transaction.joints} joints / {transaction.footage.toLocaleString()} ft</span>
                    </div>
                    <small>{transaction.createdAt} / {transaction.comment || "No comment"}</small>
                  </article>
                ))}
              </section>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

