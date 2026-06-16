"use client";

import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import ChangePasswordModal from "../components/ChangePasswordModal";

type Role = "admin" | "customer" | "sales";
type LocationType = "rack" | "zone";
type TransferMode = "all" | "partial";
type PipeRange = "Range 2" | "Range 3";

type SignatureFields = {
  pathfinderName: string;
  pathfinderSignature: string;
  carrierName: string;
  carrierSignature: string;
};

type RackConfig = {
  id: string;
  label: string;
  capacity: number;
  sort_order: number;
  layoutX: number;
  layoutY: number;
  layoutGroup: string;
  rotation: number;
  enabled: boolean;
};

type ZoneConfig = {
  id: string;
  name: string;
  code: string;
  sort_order: number;
  isActive?: boolean;
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
  pipeRange: PipeRange;
  status: string;
  condition: string;
  locationType: LocationType;
  rackId: string | null;
  zoneId: string | null;
  joints: number;
  footage: number;
};

type ReceiveForm = SignatureFields & {
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
  pipeRange: PipeRange;
  condition: string;
  status: string;
  joints: string;
  missingBoxProtectors: string;
  missingPinProtectors: string;
  inspectionDue: string;
  notes: string;
};

type TransferForm = SignatureFields & {
  destination: string;
  joints: string;
  comment: string;
  backDate: string;
};

type EditForm = {
  customer: string;
  destination: string;
  afe: string;
  partNumber: string;
  size: string;
  grade: string;
  connection: string;
  pipeRange: PipeRange;
  condition: string;
  status: string;
  joints: string;
  inspectionDue: string;
  comment: string;
};
type ShipForm = SignatureFields & {
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
  missingBoxProtectors: number;
  missingPinProtectors: number;
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

type TransferDocument = {
  id: string;
  documentNumber: string;
  documentType: string;
  company: string;
  afe: string;
  partNumber: string;
  condition: string;
  joints: number;
  footage: number;
  fromLocation: string;
  toLocation: string;
  comment: string;
  createdAt: string;
  workOrderFiles: TicketAttachment[];
};

type HardbandJob = {
  id: string;
  jobNumber: string;
  company: string;
  companyId: string | null;
  inventoryId: string | null;
  afe: string;
  partNumber: string;
  size: string;
  grade: string;
  connection: string;
  pipeRange: PipeRange;
  condition: string;
  totalJoints: number;
  totalFootage: number;
  fromLocation: string;
  toLocation: string;
  wireType: string;
  operatorName: string;
  operatorSignature: string;
  status: string;
  notes: string;
  createdAt: string;
};

type HardbandLineItem = {
  id: string;
  hardbandJobId: string;
  lineNumber: number;
  serialNumber: string;
  flushGrindBox: boolean;
  flushGrindPin: boolean;
  grindOutBox: boolean;
  grindOutPin: boolean;
  hardbandBox: boolean;
  hardbandPin: boolean;
  wireType: string;
  operatorName: string;
  operatorSignature: string;
  notes: string;
  createdAt: string;
};

type HardbandLineForm = {
  serialNumber: string;
  flushGrindBox: boolean;
  flushGrindPin: boolean;
  grindOutBox: boolean;
  grindOutPin: boolean;
  hardbandBox: boolean;
  hardbandPin: boolean;
  wireType: string;
  operatorName: string;
  operatorSignature: string;
  notes: string;
};

type TicketLine = {
  id: string;
  ticketId: string;
  company: string;
  afe: string;
  partNumber: string;
  pipeRange: PipeRange;
  condition: string;
  joints: number;
  footage: number;
};

type TicketAttachment = {
  id: string;
  receivingTicketId: string;
  shippingTicketId: string;
  documentType: string;
  fileName: string;
  fileUrl: string;
  filePath: string;
  createdAt: string;
};

type TransactionRow = {
  id: string;
  inventoryId: string;
  type: string;
  company: string;
  afe: string;
  partNumber: string;
  joints: number;
  footage: number;
  fromLocation: string;
  toLocation: string;
  comment: string;
  createdAt: string;
};

type PartNumberRecord = {
  id: string;
  companyId: string | null;
  company: string;
  partNumber: string;
  description: string;
  size: string;
  grade: string;
  connection: string;
  pipeRange: PipeRange;
};

type CompanyOption = {
  id: string;
  name: string;
};

type ReportLine = {
  label: string;
  lines: number;
  joints: number;
  footage: number;
};

const today = new Date().toISOString().slice(0, 10);
const ticketAttachmentBucket = "ticket-attachments";
const pipeRangeOptions: PipeRange[] = ["Range 2", "Range 3"];

function getRangeAverageFootage(pipeRange: string) {
  return pipeRange === "Range 3" ? 43.5 : 31.5;
}

function calculateRangeFootage(joints: number, pipeRange: string) {
  return Math.round(Number(joints || 0) * getRangeAverageFootage(pipeRange) * 100) / 100;
}

function normalizePipeRange(value: unknown): PipeRange {
  return value === "Range 3" ? "Range 3" : "Range 2";
}

const rackLetters = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K"];
const rackNumbers = Array.from({ length: 16 }, (_, index) => 16 - index);
const yardRackCodes = rackLetters.flatMap((letter) =>
  rackNumbers.map((number) => `${letter}${number}`)
);

function parseRackCode(code: string) {
  const clean = String(code ?? "").trim().toUpperCase();
  const letterNumber = clean.match(/^([A-Z])(\d+)$/);

  if (letterNumber) {
    return {
      letter: letterNumber[1],
      number: Number(letterNumber[2]),
    };
  }

  const numberLetter = clean.match(/^(\d+)([A-Z])$/);

  if (numberLetter) {
    return {
      letter: numberLetter[2],
      number: Number(numberLetter[1]),
    };
  }

  return null;
}

function normalizeRackCode(code: string) {
  const parsed = parseRackCode(code);
  if (!parsed) return String(code ?? "").trim().toUpperCase();
  return `${parsed.letter}${parsed.number}`;
}

function defaultRackPosition(rackCode: string) {
  const parsed = parseRackCode(rackCode);

  if (!parsed) {
    return { x: 26, y: 70 };
  }

  const numberIndex = 16 - parsed.number;
  const letterIndex = rackLetters.indexOf(parsed.letter);
  const safeColumn = numberIndex >= 0 ? numberIndex : 0;
  const safeRow = letterIndex >= 0 ? letterIndex : 0;

  return {
    x: 26 + safeColumn * 74,
    y: 70 + safeRow * 74,
  };
}

const makeDefaultRacks = (): RackConfig[] => {
  return yardRackCodes.map((label, index) => {
    const position = defaultRackPosition(label);
    const parsed = parseRackCode(label);

    return {
      id: label,
      label,
      capacity: 500,
      sort_order: index + 1,
      layoutX: position.x,
      layoutY: position.y,
      layoutGroup: parsed?.letter ?? "A",
      rotation: 0,
      enabled: true,
    };
  });
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
  pipeRange: "Range 2",
  condition: "New",
  status: "Received",
  joints: "",
  missingBoxProtectors: "0",
  missingPinProtectors: "0",
  inspectionDue: "",
  pathfinderName: "",
  pathfinderSignature: "",
  carrierName: "",
  carrierSignature: "",
  notes: "",
};

const emptyTransferForm: TransferForm = {
  destination: "zone:inspection",
  joints: "",
  comment: "",
  backDate: "",
  pathfinderName: "",
  pathfinderSignature: "",
  carrierName: "",
  carrierSignature: "",
};

const emptyHardbandLineForm: HardbandLineForm = {
  serialNumber: "",
  flushGrindBox: false,
  flushGrindPin: false,
  grindOutBox: false,
  grindOutPin: false,
  hardbandBox: false,
  hardbandPin: false,
  wireType: "",
  operatorName: "",
  operatorSignature: "",
  notes: "",
};

const emptyEditForm: EditForm = {
  customer: "",
  destination: "zone:receiving",
  afe: "",
  partNumber: "",
  size: "",
  grade: "",
  connection: "",
  pipeRange: "Range 2",
  condition: "New",
  status: "Available",
  joints: "0",
  inspectionDue: "",
  comment: "",
};
const emptyShipForm: ShipForm = {
  carrier: "",
  poNumber: "",
  truckNumber: "",
  bolNumber: "",
  shipTo: "",
  destination: "",
  pathfinderName: "",
  pathfinderSignature: "",
  carrierName: "",
  carrierSignature: "",
  notes: "",
};

function formatDate(value: string) {
  if (!value) return "";
  return value.slice(0, 10);
}

function ticketDateStamp() {
  const stamp = new Date();
  const m = String(stamp.getMonth() + 1).padStart(2, "0");
  const d = String(stamp.getDate()).padStart(2, "0");
  const y = String(stamp.getFullYear()).slice(-2);
  return `${m}-${d}-${y}`;
}

function sequenceToLetters(sequence: number) {
  let value = Math.max(1, sequence);
  let letters = "";

  while (value > 0) {
    value -= 1;
    letters = String.fromCharCode(65 + (value % 26)) + letters;
    value = Math.floor(value / 26);
  }

  return letters;
}

function lettersToSequence(letters: string) {
  return letters.split("").reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
}

function nextTicketNumberFromExisting(prefix: string, existingNumbers: string[]) {
  const base = `${prefix}-${ticketDateStamp()}`;
  const matcher = new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([A-Z]+)$`);
  const usedSequences = existingNumbers
    .map((number) => number.match(matcher)?.[1] ?? "")
    .filter(Boolean)
    .map(lettersToSequence);

  const nextSequence = usedSequences.length ? Math.max(...usedSequences) + 1 : 1;
  return `${base}${sequenceToLetters(nextSequence)}`;
}

async function makeTicketNumber(prefix: string, source: "receiving" | "shipping" | "bol" | "documents") {
  const base = `${prefix}-${ticketDateStamp()}`;

  if (source === "receiving") {
    const { data } = await supabase
      .from("receiving_tickets")
      .select("ticket_number")
      .ilike("ticket_number", `${base}%`);

    return nextTicketNumberFromExisting(prefix, (data ?? []).map((row: any) => row.ticket_number ?? ""));
  }

  if (source === "shipping") {
    const { data } = await supabase
      .from("shipping_tickets")
      .select("ticket_number")
      .ilike("ticket_number", `${base}%`);

    return nextTicketNumberFromExisting(prefix, (data ?? []).map((row: any) => row.ticket_number ?? ""));
  }

  if (source === "bol") {
    const { data } = await supabase
      .from("shipping_tickets")
      .select("bol_number")
      .ilike("bol_number", `${base}%`);

    return nextTicketNumberFromExisting(prefix, (data ?? []).map((row: any) => row.bol_number ?? ""));
  }

  const { data } = await supabase
    .from("documents")
    .select("file_url")
    .ilike("file_url", `%${base}%`);

  return nextTicketNumberFromExisting(
    prefix,
    (data ?? []).map((row: any) => {
      try {
        return JSON.parse(row.file_url || "{}").documentNumber ?? "";
      } catch {
        return "";
      }
    })
  );
}

async function makeHardbandJobNumber() {
  const prefix = "HB";
  const base = `${prefix}-${ticketDateStamp()}`;
  const { data } = await supabase
    .from("hardband_jobs")
    .select("job_number")
    .ilike("job_number", `${base}%`);

  return nextTicketNumberFromExisting(prefix, (data ?? []).map((row: any) => row.job_number ?? ""));
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
    current.joints += row.joints;
    current.footage += row.footage;

    report.set(label, current);
  }

  return Array.from(report.values()).sort((a, b) => b.joints - a.joints);
}

function csvEscape(value: string | number | null | undefined) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const csv = [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => row.map(csvEscape).join(",")),
  ].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function safeFileName(fileName: string) {
  return fileName
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 120) || "attachment";
}

function SignaturePad({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const context = canvas.getContext("2d");
    if (!context) return;

    context.lineCap = "round";
    context.lineJoin = "round";
    context.lineWidth = 2.5;
    context.strokeStyle = "#f4f6f8";

    if (!value) {
      context.clearRect(0, 0, canvas.width, canvas.height);
    }
  }, [value]);

  function getPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const bounds = canvas.getBoundingClientRect();

    return {
      x: ((event.clientX - bounds.left) / bounds.width) * canvas.width,
      y: ((event.clientY - bounds.top) / bounds.height) * canvas.height,
    };
  }

  function startDrawing(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    drawingRef.current = true;
    canvas.setPointerCapture(event.pointerId);

    const point = getPoint(event);
    context.beginPath();
    context.moveTo(point.x, point.y);
  }

  function draw(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;

    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;

    const point = getPoint(event);
    context.lineTo(point.x, point.y);
    context.stroke();
  }

  function stopDrawing() {
    if (!drawingRef.current) return;

    drawingRef.current = false;
    const canvas = canvasRef.current;
    if (canvas) onChange(canvas.toDataURL("image/png"));
  }

  function clearSignature() {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
    onChange("");
  }

  return (
    <div className="signature-pad">
      <div className="signature-pad-header">
        <strong>{label}</strong>
        <button type="button" onClick={clearSignature}>Clear</button>
      </div>
      <canvas
        ref={canvasRef}
        width={520}
        height={150}
        onPointerDown={startDrawing}
        onPointerMove={draw}
        onPointerUp={stopDrawing}
        onPointerCancel={stopDrawing}
        onPointerLeave={stopDrawing}
      />
    </div>
  );
}

export default function Home() {
  const [role, setRole] = useState<Role>("admin");
  const [profileRole, setProfileRole] = useState<string>("admin");
  const [currentUserName, setCurrentUserName] = useState("User");
  const [selectedYard, setSelectedYard] = useState<YardRecord | null>(null);
  const [rackLayout, setRackLayout] = useState<RackConfig[]>(makeDefaultRacks());
  const [zones, setZones] = useState<ZoneConfig[]>(defaultZones);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [partNumbers, setPartNumbers] = useState<PartNumberRecord[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [conditionFilter, setConditionFilter] = useState("all");
  const [layoutMode, setLayoutMode] = useState(false);
  const [draggedRack, setDraggedRack] = useState<string | null>(null);

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [initialInventoryOpen, setInitialInventoryOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [ticketsOpen, setTicketsOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [hardbandOpen, setHardbandOpen] = useState(false);
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketFilter, setTicketFilter] = useState<"all" | "receiving" | "shipping">("all");
  const [ticketDate, setTicketDate] = useState("");
  const [activitySearch, setActivitySearch] = useState("");
  const [activityType, setActivityType] = useState("all");
  const [activityDate, setActivityDate] = useState("");
  const [rackDetailOpen, setRackDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const [transferMode, setTransferMode] = useState<TransferMode>("all");
  const [receiveForm, setReceiveForm] = useState<ReceiveForm>(emptyReceiveForm);
  const [transferForm, setTransferForm] = useState<TransferForm>(emptyTransferForm);
  const [shipForm, setShipForm] = useState<ShipForm>(emptyShipForm);
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm);
  const [receiveFiles, setReceiveFiles] = useState<File[]>([]);
  const [shipFiles, setShipFiles] = useState<File[]>([]);
  const [transferFiles, setTransferFiles] = useState<File[]>([]);

  const [receivingTickets, setReceivingTickets] = useState<ReceivingTicket[]>([]);
  const [shippingTickets, setShippingTickets] = useState<ShippingTicket[]>([]);
  const [transferDocuments, setTransferDocuments] = useState<TransferDocument[]>([]);
  const [ticketLines, setTicketLines] = useState<TicketLine[]>([]);
  const [ticketAttachments, setTicketAttachments] = useState<TicketAttachment[]>([]);
  const [transactions, setTransactions] = useState<TransactionRow[]>([]);
  const [hardbandJobs, setHardbandJobs] = useState<HardbandJob[]>([]);
  const [hardbandLines, setHardbandLines] = useState<HardbandLineItem[]>([]);
  const [selectedHardbandJobId, setSelectedHardbandJobId] = useState("");
  const [hardbandLineForm, setHardbandLineForm] = useState<HardbandLineForm>(emptyHardbandLineForm);

  const [loadingSetup, setLoadingSetup] = useState(true);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [loadingHardbandJobs, setLoadingHardbandJobs] = useState(false);
  const [savingReceive, setSavingReceive] = useState(false);
  const [savingInitialInventory, setSavingInitialInventory] = useState(false);
  const [savingTransfer, setSavingTransfer] = useState(false);
  const [savingShip, setSavingShip] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [savingHardbandLine, setSavingHardbandLine] = useState(false);
  const [message, setMessage] = useState("");
  const isReadOnlyRole = profileRole === "sales" || role === "customer";
  const canUseAdminTools = profileRole === "admin" || profileRole === "employee";

  const selectedTransferRow = useMemo(() => {
    if (selectedRows.length !== 1) return null;
    return inventory.find((row) => row.id === selectedRows[0]) ?? null;
  }, [inventory, selectedRows]);

  const selectedShipRows = useMemo(() => {
    return inventory.filter((row) => selectedRows.includes(row.id));
  }, [inventory, selectedRows]);
  const selectedEditRow = useMemo(() => {
    if (selectedRows.length !== 1) return null;
    return inventory.find((row) => row.id === selectedRows[0]) ?? null;
  }, [inventory, selectedRows]);

  const editBeforeTotals = useMemo(() => {
    if (!selectedEditRow) return { joints: 0, footage: 0 };

    return {
      joints: selectedEditRow.joints,
      footage: selectedEditRow.footage,
    };
  }, [selectedEditRow]);

  const editAfterTotals = useMemo(() => {
    const joints = Number(editForm.joints || 0);

    return {
      joints,
      footage: calculateRangeFootage(joints, editForm.pipeRange),
    };
  }, [editForm.joints, editForm.pipeRange]);

  const selectedHardbandJob = useMemo(() => {
    return hardbandJobs.find((job) => job.id === selectedHardbandJobId) ?? hardbandJobs[0] ?? null;
  }, [hardbandJobs, selectedHardbandJobId]);

  const selectedHardbandLines = useMemo(() => {
    if (!selectedHardbandJob) return [];
    return hardbandLines
      .filter((line) => line.hardbandJobId === selectedHardbandJob.id)
      .sort((a, b) => a.lineNumber - b.lineNumber);
  }, [hardbandLines, selectedHardbandJob]);


  const filteredReceivingTickets = useMemo(() => {
    const searchText = ticketSearch.toLowerCase().trim();

    return receivingTickets.filter((ticket) => {
      if (ticketFilter === "shipping") return false;
      if (ticketDate && ticket.createdAt !== ticketDate) return false;
      if (!searchText) return true;

      return [
        ticket.ticketNumber,
        ticket.company,
        ticket.carrier,
        ticket.poNumber,
        ticket.truckNumber,
        ticket.notes,
        ticket.createdAt,
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchText);
    });
  }, [receivingTickets, ticketDate, ticketFilter, ticketSearch]);

  const filteredShippingTickets = useMemo(() => {
    const searchText = ticketSearch.toLowerCase().trim();

    return shippingTickets.filter((ticket) => {
      if (ticketFilter === "receiving") return false;
      if (ticketDate && ticket.createdAt !== ticketDate) return false;

      const lines = ticketLines.filter((line) => line.ticketId === ticket.id);
      const lineText = lines
        .map((line) => [line.company, line.afe, line.partNumber, line.pipeRange, line.condition].join(" "))
        .join(" ");

      if (!searchText) return true;

      return [
        ticket.ticketNumber,
        ticket.bolNumber,
        ticket.company,
        ticket.carrier,
        ticket.poNumber,
        ticket.truckNumber,
        ticket.shipTo,
        ticket.destination,
        ticket.notes,
        ticket.createdAt,
        lineText,
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchText);
    });
  }, [shippingTickets, ticketDate, ticketFilter, ticketLines, ticketSearch]);

  const filteredTransferDocuments = useMemo(() => {
    const searchText = ticketSearch.toLowerCase().trim();

    return transferDocuments.filter((document) => {
      if (ticketFilter !== "all") return false;
      if (ticketDate && document.createdAt !== ticketDate) return false;
      if (!searchText) return true;

      return [
        document.documentNumber,
        document.company,
        document.afe,
        document.partNumber,
        document.condition,
        document.fromLocation,
        document.toLocation,
        document.comment,
        ...document.workOrderFiles.map((file) => file.fileName),
        document.createdAt,
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchText);
    });
  }, [ticketDate, ticketFilter, ticketSearch, transferDocuments]);

  const activityTypes = useMemo(() => {
    return Array.from(new Set(transactions.map((transaction) => transaction.type).filter(Boolean))).sort();
  }, [transactions]);

  const filteredActivity = useMemo(() => {
    const searchText = activitySearch.toLowerCase().trim();

    return transactions.filter((transaction) => {
      if (activityType !== "all" && transaction.type !== activityType) return false;
      if (activityDate && transaction.createdAt !== activityDate) return false;
      if (!searchText) return true;

      return [
        transaction.type,
        transaction.company,
        transaction.inventoryId,
        transaction.afe,
        transaction.partNumber,
        transaction.fromLocation,
        transaction.toLocation,
        transaction.comment,
        transaction.createdAt,
        transaction.joints,
        transaction.footage,
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchText);
    });
  }, [activityDate, activitySearch, activityType, transactions]);

  const activeInventory = useMemo(() => {
    return inventory.filter((row) => {
      return row.status !== "Shipped" && (row.joints > 0 || row.footage > 0);
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

  const selectedRackDetail = useMemo(() => {
    if (selectedLocation === "all") return null;
    return rackLayout.find((rack) => rack.label === selectedLocation) ?? null;
  }, [rackLayout, selectedLocation]);

  const selectedRackInventory = useMemo(() => {
    if (!selectedRackDetail) return [];
    return inventory.filter((row) => row.locationType === "rack" && row.rackId === selectedRackDetail.label);
  }, [inventory, selectedRackDetail]);

  const selectedRackTotals = useMemo(() => {
    return selectedRackInventory.reduce(
      (totals, row) => ({
        lines: totals.lines + 1,
        joints: totals.joints + row.joints,
        footage: totals.footage + row.footage,
      }),
      { lines: 0, joints: 0, footage: 0 }
    );
  }, [selectedRackInventory]);

  const selectedRackCustomerSummary = useMemo(() => {
    return buildReport(selectedRackInventory, (row) => row.company);
  }, [selectedRackInventory]);

  const selectedRackStatusSummary = useMemo(() => {
    return buildReport(selectedRackInventory, (row) => row.status);
  }, [selectedRackInventory]);

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
        pipe_range,
        condition,
        status,
        inspection_due_date,
        bulk_joints,
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

    const mapped: InventoryRow[] = (data ?? []).map((row: any) => {
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
      const pipeRange = normalizePipeRange(row.pipe_range);
      const joints = Number(row.bulk_joints ?? 0);

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
        pipeRange,
        condition: row.condition ?? "",
        status: row.status ?? "",
        locationType: rackCode ? ("rack" as const) : ("zone" as const),
        rackId: rackCode,
        zoneId: zoneCode,
        joints,
        footage: calculateRangeFootage(joints, pipeRange),
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

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, role")
      .eq("id", sessionData.session.user.id)
      .single();

    setCurrentUserName(profile?.full_name || sessionData.session.user.email || "User");
    setProfileRole(profile?.role ?? "admin");
    if (profile?.role === "customer") setRole("customer");
    if (profile?.role === "sales") setRole("sales");
    if (profile?.role === "operator") {
      window.location.href = "/hardband";
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
      .select("id, rack_code, capacity_joints, sort_order, layout_x, layout_y, layout_group, rotation, is_active")
      .eq("yard_id", yard.id)
      .order("sort_order", { ascending: true });

    const savedRackMap = new Map<string, RackConfig>();

    for (const rack of dbRacks ?? []) {
      const normalizedLabel = normalizeRackCode(rack.rack_code ?? "");
      if (!yardRackCodes.includes(normalizedLabel)) continue;

      const fallback = defaultRackPosition(normalizedLabel);
      const parsed = parseRackCode(normalizedLabel);
      const rawLayoutGroup = String(rack.layout_group ?? parsed?.letter ?? "A");
      const enabled = rack.is_active !== false && !rawLayoutGroup.startsWith("disabled:");
      const layoutGroup = rawLayoutGroup.replace(/^disabled:/, "") || parsed?.letter || "A";

      savedRackMap.set(normalizedLabel, {
        id: rack.id,
        label: normalizedLabel,
        capacity: Number(rack.capacity_joints ?? 500),
        sort_order: Number(rack.sort_order ?? yardRackCodes.indexOf(normalizedLabel) + 1),
        layoutX: Number(rack.layout_x ?? fallback.x),
        layoutY: Number(rack.layout_y ?? fallback.y),
        layoutGroup,
        rotation: Number(rack.rotation ?? 0),
        enabled,
      });
    }

    const mappedRacks = makeDefaultRacks().map((rack) => savedRackMap.get(rack.label) ?? rack);
    setRackLayout(mappedRacks);

    const { data: dbZones } = await supabase
      .from("workflow_zones")
      .select("id, name, code, sort_order, is_active")
      .eq("yard_id", yard.id)
      .neq("code", "warehouse")
      .order("sort_order", { ascending: true });

    const mappedZones =
      dbZones && dbZones.length > 0
        ? dbZones.filter((zone: any) => zone.is_active !== false).map((zone: any) => ({
            id: zone.id,
            name: zone.name,
            code: zone.code,
            sort_order: Number(zone.sort_order ?? 0),
            isActive: zone.is_active !== false,
          }))
        : defaultZones;

    setZones(mappedZones);
    await loadCompanies();
    await loadPartNumbers();
    await loadInventory(yard.id, mappedRacks, mappedZones);
    setLoadingSetup(false);
  }

  async function loadCompanies() {
    const { data, error } = await supabase
      .from("companies")
      .select("id, name")
      .order("name", { ascending: true });

    if (error) {
      setCompanies([]);
      return;
    }

    setCompanies(
      (data ?? [])
        .map((row: any) => ({
          id: row.id,
          name: row.name ?? "",
        }))
        .filter((company) => company.name.trim())
    );
  }

  async function loadPartNumbers() {
    const { data, error } = await supabase
      .from("part_numbers")
      .select("id, company_id, part_number, description, size, grade, connection, pipe_range, companies(name)")
      .order("part_number", { ascending: true });

    if (error) {
      setPartNumbers([]);
      return;
    }

    setPartNumbers(
      (data ?? []).map((row: any) => {
        const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;

        return {
          id: row.id,
          companyId: row.company_id ?? null,
          company: company?.name ?? "Global",
          partNumber: row.part_number ?? "",
          description: row.description ?? "",
          size: row.size ?? "",
          grade: row.grade ?? "",
          connection: row.connection ?? "",
          pipeRange: normalizePipeRange(row.pipe_range),
        };
      })
    );
  }

  function partOptionLabel(part: PartNumberRecord) {
    return [
      part.partNumber,
      part.size,
      part.grade,
      part.connection,
      part.pipeRange,
      part.company !== "Global" ? part.company : "",
    ].filter(Boolean).join(" / ");
  }

  function applyPartToReceive(partId: string) {
    const part = partNumbers.find((item) => item.id === partId);
    if (!part) return;

    setReceiveForm((form) => ({
      ...form,
      customer: part.company !== "Global" ? part.company : form.customer,
      partNumber: part.partNumber,
      size: part.size || form.size,
      grade: part.grade || form.grade,
      connection: part.connection || form.connection,
      pipeRange: part.pipeRange,
    }));
  }

  function applyPartToEdit(partId: string) {
    const part = partNumbers.find((item) => item.id === partId);
    if (!part) return;

    setEditForm((form) => ({
      ...form,
      customer: part.company !== "Global" ? part.company : form.customer,
      partNumber: part.partNumber,
      size: part.size || form.size,
      grade: part.grade || form.grade,
      connection: part.connection || form.connection,
      pipeRange: part.pipeRange,
    }));
  }

  async function saveTicketAttachments({
    files,
    companyId,
    inventoryId,
    receivingTicketId,
    shippingTicketId,
    ticketNumber,
    folder,
    documentType,
  }: {
    files: File[];
    companyId: string | null;
    inventoryId?: string | null;
    receivingTicketId?: string | null;
    shippingTicketId?: string | null;
    ticketNumber: string;
    folder: "receiving" | "shipping" | "transfer";
    documentType?: string;
  }) {
    if (files.length === 0) return;
    if (!companyId) throw new Error("A company is required before attachments can be saved.");

    const { data: userData } = await supabase.auth.getUser();
    const createdBy = userData.user?.id ?? null;

    for (const file of files) {
      const fileName = safeFileName(file.name);
      const filePath = `${folder}/${ticketNumber}/${Date.now()}-${Math.random().toString(36).slice(2)}-${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from(ticketAttachmentBucket)
        .upload(filePath, file, {
          cacheControl: "3600",
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from(ticketAttachmentBucket)
        .getPublicUrl(filePath);

      const { error: documentError } = await supabase.from("documents").insert({
        company_id: companyId,
        pipe_inventory_id: inventoryId ?? null,
        receiving_ticket_id: receivingTicketId ?? null,
        shipping_ticket_id: shippingTicketId ?? null,
        document_type: documentType ?? `${folder}_attachment`,
        file_url: publicUrlData.publicUrl,
        file_name: file.name,
        file_path: filePath,
        mime_type: file.type || null,
        file_size: file.size,
        created_by: createdBy,
      });

      if (documentError) throw documentError;
    }
  }

  async function loadHardbandJobs() {
    setLoadingHardbandJobs(true);
    setMessage("");

    const { data: jobData, error: jobError } = await supabase
      .from("hardband_jobs")
      .select(`
        id,
        job_number,
        company_id,
        pipe_inventory_id,
        afe,
        part_number,
        size,
        grade,
        connection,
        pipe_range,
        condition,
        total_joints,
        total_footage,
        from_location,
        to_location,
        wire_type,
        operator_name,
        operator_signature,
        status,
        notes,
        created_at,
        companies(name)
      `)
      .order("created_at", { ascending: false })
      .limit(100);

    if (jobError) {
      setMessage(`Hardband jobs failed: ${jobError.message}`);
      setLoadingHardbandJobs(false);
      return;
    }

    const jobIds = (jobData ?? []).map((row: any) => row.id);
    const { data: lineData, error: lineError } = jobIds.length
      ? await supabase
          .from("hardband_job_line_items")
          .select(`
            id,
            hardband_job_id,
            line_number,
            serial_number,
            flush_grind_box,
            flush_grind_pin,
            grind_out_box,
            grind_out_pin,
            hardband_box,
            hardband_pin,
            wire_type,
            operator_name,
            operator_signature,
            notes,
            created_at
          `)
          .in("hardband_job_id", jobIds)
          .order("line_number", { ascending: true })
      : { data: [], error: null };

    if (lineError) {
      setMessage(`Hardband line items failed: ${lineError.message}`);
      setLoadingHardbandJobs(false);
      return;
    }

    const mappedJobs = (jobData ?? []).map((row: any) => {
      const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
      const pipeRange = normalizePipeRange(row.pipe_range);
      const totalJoints = Number(row.total_joints ?? 0);

      return {
        id: row.id,
        jobNumber: row.job_number ?? "",
        company: company?.name ?? "Unknown",
        companyId: row.company_id ?? null,
        inventoryId: row.pipe_inventory_id ?? null,
        afe: row.afe ?? "",
        partNumber: row.part_number ?? "",
        size: row.size ?? "",
        grade: row.grade ?? "",
        connection: row.connection ?? "",
        pipeRange,
        condition: row.condition ?? "",
        totalJoints,
        totalFootage: Number(row.total_footage ?? calculateRangeFootage(totalJoints, pipeRange)),
        fromLocation: row.from_location ?? "",
        toLocation: row.to_location ?? "",
        wireType: row.wire_type ?? "",
        operatorName: row.operator_name ?? "",
        operatorSignature: row.operator_signature ?? "",
        status: row.status ?? "Open",
        notes: row.notes ?? "",
        createdAt: formatDate(row.created_at),
      };
    });

    setHardbandJobs(mappedJobs);
    setHardbandLines(
      (lineData ?? []).map((row: any) => ({
        id: row.id,
        hardbandJobId: row.hardband_job_id ?? "",
        lineNumber: Number(row.line_number ?? 0),
        serialNumber: row.serial_number ?? "",
        flushGrindBox: Boolean(row.flush_grind_box),
        flushGrindPin: Boolean(row.flush_grind_pin),
        grindOutBox: Boolean(row.grind_out_box),
        grindOutPin: Boolean(row.grind_out_pin),
        hardbandBox: Boolean(row.hardband_box),
        hardbandPin: Boolean(row.hardband_pin),
        wireType: row.wire_type ?? "",
        operatorName: row.operator_name ?? "",
        operatorSignature: row.operator_signature ?? "",
        notes: row.notes ?? "",
        createdAt: formatDate(row.created_at),
      }))
    );

    if (!selectedHardbandJobId && mappedJobs[0]) {
      setSelectedHardbandJobId(mappedJobs[0].id);
    }

    setLoadingHardbandJobs(false);
  }

  async function openHardbandJobs() {
    window.location.href = "/hardband";
  }

  async function createHardbandJobFromTransfer({
    row,
    fromLocation,
    toLocation,
    joints,
    footage,
    comment,
    machineShopWorkOrder,
  }: {
    row: InventoryRow;
    fromLocation: string;
    toLocation: string;
    joints: number;
    footage: number;
    comment: string;
    machineShopWorkOrder: string;
  }) {
    if (!selectedYard || !row.companyId) return null;

    const jobNumber = await makeHardbandJobNumber();
    const { data, error } = await supabase
      .from("hardband_jobs")
      .insert({
        job_number: jobNumber,
        company_id: row.companyId,
        yard_id: selectedYard.id,
        pipe_inventory_id: row.id,
        afe: row.afe || null,
        part_number: row.partNumber,
        size: row.size || null,
        grade: row.grade || null,
        connection: row.connection || null,
        pipe_range: row.pipeRange,
        condition: row.condition || null,
        total_joints: joints,
        total_footage: footage,
        from_location: fromLocation,
        to_location: toLocation,
        machine_shop_work_order: machineShopWorkOrder || null,
        status: "Open",
        notes: comment || null,
      })
      .select("id, job_number")
      .single();

    if (error) throw error;
    return data?.job_number ?? jobNumber;
  }

  async function saveHardbandLineItem() {
    if (!selectedHardbandJob) return;

    if (!hardbandLineForm.serialNumber.trim()) {
      setMessage("Serial number is required.");
      return;
    }

    setSavingHardbandLine(true);
    setMessage("");

    try {
      const nextLineNumber =
        selectedHardbandLines.length > 0
          ? Math.max(...selectedHardbandLines.map((line) => line.lineNumber)) + 1
          : 1;

      const { error } = await supabase.from("hardband_job_line_items").insert({
        hardband_job_id: selectedHardbandJob.id,
        line_number: nextLineNumber,
        serial_number: hardbandLineForm.serialNumber.trim(),
        flush_grind_box: hardbandLineForm.flushGrindBox,
        flush_grind_pin: hardbandLineForm.flushGrindPin,
        grind_out_box: hardbandLineForm.grindOutBox,
        grind_out_pin: hardbandLineForm.grindOutPin,
        hardband_box: hardbandLineForm.hardbandBox,
        hardband_pin: hardbandLineForm.hardbandPin,
        wire_type: hardbandLineForm.wireType || selectedHardbandJob.wireType || null,
        operator_name: hardbandLineForm.operatorName || null,
        operator_signature: hardbandLineForm.operatorSignature || null,
        notes: hardbandLineForm.notes || null,
      });

      if (error) throw error;

      setHardbandLineForm(emptyHardbandLineForm);
      await loadHardbandJobs();
      setMessage(`Hardband line item added to ${selectedHardbandJob.jobNumber}.`);
    } catch (error: any) {
      setMessage(`Hardband line failed: ${error.message}`);
    } finally {
      setSavingHardbandLine(false);
    }
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
        missing_box_protectors,
        missing_pin_protectors,
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
        pipe_range,
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

    const { data: documentData, error: documentError } = await supabase
      .from("documents")
      .select(`
        id,
        document_type,
        file_url,
        created_at,
        companies(name)
      `)
      .in("document_type", ["transfer", "transfer_to_machine_shop", "transfer_from_machine_shop"])
      .order("created_at", { ascending: false })
      .limit(50);

    if (documentError) {
      setMessage(`Transfer documents failed: ${documentError.message}`);
      setLoadingTickets(false);
      return;
    }

    const { data: attachmentData, error: attachmentError } = await supabase
      .from("documents")
      .select(`
        id,
        receiving_ticket_id,
        shipping_ticket_id,
        pipe_inventory_id,
        document_type,
        file_url,
        file_name,
        file_path,
        created_at
      `)
      .in("document_type", ["receiving_attachment", "shipping_attachment", "machine_shop_work_order", "transfer_attachment"])
      .order("created_at", { ascending: false })
      .limit(250);

    if (attachmentError) {
      setMessage(`Ticket attachments failed: ${attachmentError.message}`);
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
          missingBoxProtectors: Number(row.missing_box_protectors ?? 0),
          missingPinProtectors: Number(row.missing_pin_protectors ?? 0),
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
        const pipeRange = normalizePipeRange(row.pipe_range);
        const joints = Number(row.joints ?? 0);

        return {
          id: row.id,
          ticketId: row.ticket_id ?? "",
          company: company?.name ?? "Unknown",
          afe: row.afe ?? "",
          partNumber: row.part_number ?? "",
          pipeRange,
          condition: row.condition ?? "",
          joints,
          footage: calculateRangeFootage(joints, pipeRange),
        };
      })
    );

    setTransferDocuments(
      (documentData ?? []).map((row: any) => {
        const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
        let details: any = {};

        try {
          details = JSON.parse(row.file_url || "{}");
        } catch {
          details = {};
        }

        const documentNumber = details.documentNumber ?? row.id;
        const workOrderFiles = (attachmentData ?? [])
          .filter((attachment: any) => {
            const filePath = String(attachment.file_path ?? "");
            return (
              ["machine_shop_work_order", "transfer_attachment"].includes(attachment.document_type ?? "") &&
              filePath.includes(`/${documentNumber}/`)
            );
          })
          .map((attachment: any) => ({
            id: attachment.id,
            receivingTicketId: attachment.receiving_ticket_id ?? "",
            shippingTicketId: attachment.shipping_ticket_id ?? "",
            documentType: attachment.document_type ?? "",
            fileName: attachment.file_name ?? "Machine shop work order",
            fileUrl: attachment.file_url ?? "",
            filePath: attachment.file_path ?? "",
            createdAt: formatDate(attachment.created_at),
          }));

        return {
          id: row.id,
          documentNumber,
          documentType: row.document_type ?? "",
          company: details.company ?? company?.name ?? "Unknown",
          afe: details.afe ?? "",
          partNumber: details.partNumber ?? "",
          condition: details.condition ?? "",
          joints: Number(details.joints ?? 0),
          footage: Number(details.footage ?? 0),
          fromLocation: details.fromLocation ?? "",
          toLocation: details.toLocation ?? "",
          comment: details.comment ?? "",
          createdAt: formatDate(row.created_at),
          workOrderFiles,
        };
      })
    );

    setTicketAttachments(
      (attachmentData ?? []).map((row: any) => ({
        id: row.id,
        receivingTicketId: row.receiving_ticket_id ?? "",
        shippingTicketId: row.shipping_ticket_id ?? "",
        documentType: row.document_type ?? "",
        fileName: row.file_name ?? "Attachment",
        fileUrl: row.file_url ?? "",
        filePath: row.file_path ?? "",
        createdAt: formatDate(row.created_at),
      }))
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
        companies(name),
        pipe_inventory_id
      `)
      .order("created_at", { ascending: false })
      .limit(250);

    if (error) {
      setMessage(`Transaction history failed: ${error.message}`);
      setLoadingReports(false);
      return;
    }

    setTransactions(
      (data ?? []).map((row: any) => {
        const company = Array.isArray(row.companies) ? row.companies[0] : row.companies;
        const inventoryLine = inventory.find((line) => line.id === row.pipe_inventory_id);

        return {
          id: row.id,
          inventoryId: row.pipe_inventory_id ?? "",
          type: row.transaction_type ?? "",
          company: company?.name ?? "Unknown",
          afe: inventoryLine?.afe ?? "",
          partNumber: inventoryLine?.partNumber ?? "",
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
    setTicketSearch("");
    setTicketFilter("all");
    setTicketDate("");
    loadTickets();
  }

  function openReports() {
    setReportsOpen(true);
    loadReports();
  }

  function openActivity() {
    setActivityOpen(true);
    setActivitySearch("");
    setActivityType("all");
    setActivityDate("");
    loadReports();
  }

  async function refreshYardView() {
    await loadYardSetup();
    await loadTickets();
    await loadReports();
    setMessage("Yard view refreshed.");
  }

  async function completeSelectedRows() {
    if (!selectedYard) return;

    setMessage("");
    if (isReadOnlyRole) {
      setMessage("Sales and customer users can view and print, but cannot complete inventory.");
      return;
    }

    if (selectedRows.length === 0) {
      setMessage("Select one or more inventory lines before completing.");
      return;
    }

    const selectedInventoryRows = inventory.filter((row) => selectedRows.includes(row.id));

    if (selectedInventoryRows.length === 0) {
      setMessage("No selected inventory lines were found.");
      return;
    }

    const { error } = await supabase
      .from("pipe_inventory")
      .update({ status: "Available" })
      .in("id", selectedRows);

    if (error) {
      setMessage(`Complete failed: ${error.message}`);
      return;
    }

    await Promise.all(
      selectedInventoryRows.map((row) =>
        supabase.from("pipe_transactions").insert({
          pipe_inventory_id: row.id,
          company_id: row.companyId,
          yard_id: selectedYard.id,
          transaction_type: "complete",
          quantity_joints: row.joints,
          quantity_footage: row.footage,
          from_location: row.rackId ?? row.zoneId,
          to_location: row.rackId ?? row.zoneId,
          comment: "Marked complete and available",
        })
      )
    );

    await loadInventory(selectedYard.id, rackLayout, zones);
    await loadReports();
    setSelectedRows([]);
    setMessage(`${selectedInventoryRows.length} inventory line${selectedInventoryRows.length === 1 ? "" : "s"} marked Available.`);
  }

  useEffect(() => {
    loadYardSetup();
  }, []);

  const locationOptions = useMemo(() => {
    const rackOptions = rackLayout
      .filter((rack) => rack.enabled)
      .map((rack) => ({
        value: `rack:${rack.label}`,
        label: `Rack ${rack.label}`,
      }));

    const zoneOptions = zones.map((zone) => ({
      value: `zone:${zone.code}`,
      label: zone.name,
    }));

    return [...rackOptions, ...zoneOptions];
  }, [rackLayout, zones]);


  const normalizeFilter = (value: string | null | undefined) => String(value ?? "").trim().toLowerCase();

  const customerOptions = useMemo(() => {
    return Array.from(new Set(inventory.map((row) => row.company).filter(Boolean))).sort();
  }, [inventory]);

  const customerNameOptions = useMemo(() => {
    return Array.from(
      new Set([
        ...companies.map((company) => company.name),
        ...inventory.map((row) => row.company),
        ...partNumbers
          .filter((part) => part.company !== "Global")
          .map((part) => part.company),
      ].filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
  }, [companies, inventory, partNumbers]);

  const statusOptions = useMemo(() => {
    return Array.from(new Set(inventory.map((row) => row.status).filter(Boolean))).sort();
  }, [inventory]);

  const conditionOptions = useMemo(() => {
    return Array.from(new Set(inventory.map((row) => row.condition).filter(Boolean))).sort();
  }, [inventory]);

  function rowMatchesQuickFilters(row: InventoryRow) {
    const matchesCustomer = customerFilter === "all" || normalizeFilter(row.company) === normalizeFilter(customerFilter);
    const matchesStatus = statusFilter === "all" || normalizeFilter(row.status) === normalizeFilter(statusFilter);
    const matchesCondition = conditionFilter === "all" || normalizeFilter(row.condition) === normalizeFilter(conditionFilter);

    return matchesCustomer && matchesStatus && matchesCondition;
  }
  const filteredInventory = useMemo(() => {
    const searchText = search.toLowerCase().trim();

    return inventory.filter((row) => {
      const rowLocation = row.locationType === "rack" ? row.rackId : row.zoneId;
      const matchesLocation = selectedLocation === "all" || rowLocation === selectedLocation;
      const matchesQuickFilters = rowMatchesQuickFilters(row);

      const matchesSearch =
        !searchText ||
        [
          row.company,
          row.afe,
          row.partNumber,
          row.size,
          row.grade,
          row.connection,
          row.status,
          row.condition,
          row.rackId ?? "",
          row.zoneId ?? "",
        ]
          .join(" ")
          .toLowerCase()
          .includes(searchText);

      return matchesLocation && matchesQuickFilters && matchesSearch;
    });
  }, [conditionFilter, customerFilter, inventory, search, selectedLocation, statusFilter]);

  const selectedTotals = useMemo(() => {
    return selectedShipRows.reduce(
      (totals, row) => ({
        joints: totals.joints + row.joints,
        footage: totals.footage + row.footage,
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

    if (isReadOnlyRole) {
      setMessage("Sales and customer users can view and print, but cannot transfer inventory.");
      return;
    }

    if (selectedRows.length !== 1) {
      setMessage("Select one inventory line before transferring.");
      return;
    }

    setTransferMode("all");
    setTransferForm(emptyTransferForm);
    setTransferFiles([]);
    setTransferOpen(true);
  }

  function quickTransfer(row: InventoryRow) {
    if (isReadOnlyRole) return;
    setMessage("");
    setSelectedRows([row.id]);
    setTransferMode("all");
    setTransferForm(emptyTransferForm);
    setTransferFiles([]);
    setTransferOpen(true);
  }

  async function openShip() {
    setMessage("");

    if (isReadOnlyRole) {
      setMessage("Sales and customer users can view and print, but cannot ship inventory.");
      return;
    }

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
      bolNumber: await makeTicketNumber("BOL", "bol"),
    });
    setShipOpen(true);
  }

  function buildEditForm(row: InventoryRow): EditForm {
    const destination =
      row.locationType === "rack" && row.rackId
        ? `rack:${row.rackId}`
        : `zone:${row.zoneId ?? "receiving"}`;

    return {
      customer: row.company,
      destination,
      afe: row.afe,
      partNumber: row.partNumber,
      size: row.size,
      grade: row.grade,
      connection: row.connection,
      pipeRange: row.pipeRange,
      condition: row.condition || "New",
      status: row.status || "Available",
      joints: String(row.joints),
      inspectionDue: row.inspectionDue,
      comment: "",
    };
  }

  function openEdit() {
    setMessage("");

    if (isReadOnlyRole) {
      setMessage("Sales and customer users can view and print, but cannot adjust inventory.");
      return;
    }

    if (selectedRows.length !== 1 || !selectedEditRow) {
      setMessage("Select one inventory line before editing.");
      return;
    }

    setEditForm(buildEditForm(selectedEditRow));
    setEditOpen(true);
  }

  async function quickShip(row: InventoryRow) {
    if (isReadOnlyRole) return;
    setMessage("");
    setSelectedRows([row.id]);
    setShipForm({
      ...emptyShipForm,
      shipTo: row.company,
      bolNumber: await makeTicketNumber("BOL", "bol"),
    });
    setShipOpen(true);
  }

  function quickAdjust(row: InventoryRow) {
    if (isReadOnlyRole) return;
    setMessage("");
    setSelectedRows([row.id]);
    setEditForm(buildEditForm(row));
    setEditOpen(true);
  }

  function quickActivity(row: InventoryRow) {
    setMessage("");
    setActivityOpen(true);
    setActivityType("all");
    setActivityDate("");
    setActivitySearch([row.id, row.company, row.afe, row.partNumber].filter(Boolean).join(" "));
    loadReports();
  }

  function quickTickets(row: InventoryRow) {
    setMessage("");
    setTicketsOpen(true);
    setTicketFilter("all");
    setTicketDate("");
    setTicketSearch([row.company, row.afe, row.partNumber].filter(Boolean).join(" "));
    loadTickets();
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

  async function ensureAllYardRacks() {
    if (!selectedYard) return;

    setMessage("");

    const rows = makeDefaultRacks().map((rack) => ({
      yard_id: selectedYard.id,
      rack_code: rack.label,
      capacity_joints: rack.capacity,
      sort_order: rack.sort_order,
      layout_x: rack.layoutX,
      layout_y: rack.layoutY,
      layout_group: rack.enabled === false ? `disabled:${rack.layoutGroup}` : rack.layoutGroup,
      rotation: rack.rotation,
      is_active: rack.enabled !== false,
    }));

    const { error } = await supabase
      .from("racks")
      .upsert(rows, { onConflict: "yard_id,rack_code" });

    if (error) {
      setMessage(`Rack grid repair failed: ${error.message}`);
      return;
    }

    await loadYardSetup();
    setSelectedLocation("all");
    setMessage("A-K rack grid loaded with 16 racks per row.");
  }
  function moveRackOnMap(event: any) {
    if (!layoutMode || !draggedRack) return;

    event.preventDefault();

    const bounds = event.currentTarget.getBoundingClientRect();
    const x = Math.max(8, Math.round(event.clientX - bounds.left - 32));
    const y = Math.max(8, Math.round(event.clientY - bounds.top - 21));

    setRackLayout((current) =>
      current.map((rack) =>
        rack.label === draggedRack
          ? { ...rack, layoutX: x, layoutY: y }
          : rack
      )
    );

    setDraggedRack(null);
  }

  async function saveRackLayout() {
    if (!selectedYard) return;

    setMessage("");

    try {
      const rows = rackLayout.map((rack, index) => ({
        yard_id: selectedYard.id,
        rack_code: rack.label,
        capacity_joints: rack.capacity,
        sort_order: index + 1,
        layout_x: rack.layoutX,
        layout_y: rack.layoutY,
        layout_group: rack.enabled === false ? `disabled:${rack.layoutGroup}` : rack.layoutGroup,
        rotation: rack.rotation,
        is_active: rack.enabled !== false,
      }));

      const { error } = await supabase
        .from("racks")
        .upsert(rows, { onConflict: "yard_id,rack_code" });

      if (error) throw error;

      await loadYardSetup();
      setLayoutMode(false);
      setMessage("Yard rack layout saved.");
    } catch (error: any) {
      setMessage(`Layout save failed: ${error.message}`);
    }
  }
  function renameRack(label: string) {
    const nextLabel = normalizeRackCode(window.prompt("New rack label, example A1 or K16", label) ?? "");

    if (!nextLabel || nextLabel === label) return;

    if (!yardRackCodes.includes(nextLabel)) {
      setMessage("Use rack labels A1 through K16.");
      return;
    }

    if (rackLayout.some((rack) => rack.label === nextLabel && rack.label !== label)) {
      setMessage(`Rack ${nextLabel} already exists.`);
      return;
    }

    const parsed = parseRackCode(nextLabel);

    setRackLayout((current) =>
      current.map((rack) =>
        rack.label === label
          ? { ...rack, label: nextLabel, layoutGroup: parsed?.letter ?? rack.layoutGroup }
          : rack
      )
    );

    setInventory((current) =>
      current.map((row) => (row.rackId === label ? { ...row, rackId: nextLabel } : row))
    );

    if (selectedLocation === label) {
      setSelectedLocation(nextLabel);
    }
  }

  function editRackCapacity(label: string) {
    const rack = rackLayout.find((item) => item.label === label);
    if (!rack) return;

    const nextCapacityText = window.prompt(`Capacity for rack ${label}`, String(rack.capacity));
    if (nextCapacityText === null) return;

    const nextCapacity = Number(nextCapacityText);

    if (!Number.isFinite(nextCapacity) || nextCapacity <= 0) {
      setMessage("Rack capacity must be a number greater than zero.");
      return;
    }

    setRackLayout((current) =>
      current.map((item) =>
        item.label === label ? { ...item, capacity: Math.round(nextCapacity) } : item
      )
    );

    setMessage(`Rack ${label} capacity set to ${Math.round(nextCapacity)} joints. Click Save Layout when you are done.`);
  }

  function toggleRackEnabled(label: string) {
    const rack = rackLayout.find((item) => item.label === label);
    if (!rack) return;

    const hasInventory = inventory.some((row) => row.rackId === label && row.status !== "Shipped");

    if (rack.enabled && hasInventory) {
      setMessage(`Rack ${label} has inventory. Move the pipe before disabling it.`);
      return;
    }

    setRackLayout((current) =>
      current.map((item) =>
        item.label === label ? { ...item, enabled: !item.enabled } : item
      )
    );

    if (selectedLocation === label && rack.enabled) {
      setSelectedLocation("all");
    }

    setMessage(
      `Rack ${label} ${rack.enabled ? "disabled" : "enabled"}. Click Save Layout when you are done.`
    );
  }

  function openRackDetail(label: string) {
    setSelectedLocation(label);
    setSelectedRows([]);
    setRackDetailOpen(true);
  }

  function closeRackDetail() {
    setRackDetailOpen(false);
  }

  async function deleteRack(label: string) {
    const rack = rackLayout.find((item) => item.label === label);
    if (!rack) return;

    const hasInventory = inventory.some((row) => row.rackId === label && row.status !== "Shipped");
    if (hasInventory) {
      setMessage(`Move inventory out of rack ${label} before deleting it.`);
      return;
    }

    if (!window.confirm(`Delete rack ${label}?`)) return;

    if (rack.id !== rack.label) {
      const { error } = await supabase.from("racks").delete().eq("id", rack.id);

      if (error) {
        setMessage(`Delete rack failed: ${error.message}`);
        return;
      }
    }

    setRackLayout((current) => current.filter((item) => item.label !== label));

    if (selectedLocation === label) {
      setSelectedLocation("all");
    }

    setMessage(`Rack ${label} deleted. Click Save Layout when you are done.`);
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

  async function createTransferDocument({
    row,
    fromLocation,
    toLocation,
    joints,
    footage,
    comment,
    signatures,
  }: {
    row: InventoryRow;
    fromLocation: string;
    toLocation: string;
    joints: number;
    footage: number;
    comment: string;
    signatures: SignatureFields;
  }) {
    if (!row.companyId) return null;

    const documentNumber = await makeTicketNumber("TRF", "documents");
    const payload = {
      documentNumber,
      company: row.company,
      afe: row.afe,
      partNumber: row.partNumber,
      pipeRange: row.pipeRange,
      condition: row.condition,
      joints,
      footage,
      fromLocation,
      toLocation,
      comment,
      pathfinderName: signatures.pathfinderName,
      pathfinderSignature: signatures.pathfinderSignature,
      carrierName: signatures.carrierName,
      carrierSignature: signatures.carrierSignature,
      createdAt: new Date().toISOString(),
    };

    const { error } = await supabase.from("documents").insert({
      company_id: row.companyId,
      pipe_inventory_id: row.id,
      document_type: "transfer",
      file_url: JSON.stringify(payload),
    });

    if (error) throw error;
    return documentNumber;
  }

  async function saveEdit() {
    if (!selectedYard || !selectedEditRow) return;

    setMessage("");
    if (isReadOnlyRole) {
      setMessage("Sales and customer users can view and print, but cannot adjust inventory.");
      return;
    }

    if (!editForm.customer.trim()) {
      setMessage("Customer is required.");
      return;
    }

    if (!editForm.partNumber.trim()) {
      setMessage("Part number is required.");
      return;
    }

    if (!editForm.comment.trim()) {
      setMessage("Edit comment is required. Add the reason for this adjustment.");
      return;
    }

    const newTotalJoints = Number(editForm.joints || 0);
    const newTotalFootage = calculateRangeFootage(newTotalJoints, editForm.pipeRange);

    if (newTotalJoints < 0) {
      setMessage("Inventory quantities cannot be negative.");
      return;
    }

    setSavingEdit(true);

    try {
      const companyId = await findOrCreateCompany(editForm.customer);
      const { rack, zone, locationName } = getDestination(editForm.destination);

      const previousLocation =
        selectedEditRow.locationType === "rack"
          ? selectedEditRow.rackId
          : selectedEditRow.zoneId;

      const { error: updateError } = await supabase
        .from("pipe_inventory")
        .update({
          company_id: companyId,
          rack_id: rack?.id ?? null,
          workflow_zone_id: zone?.id ?? null,
          afe: editForm.afe || null,
          part_number: editForm.partNumber,
          size: editForm.size || null,
          grade: editForm.grade || null,
          connection: editForm.connection || null,
          pipe_range: editForm.pipeRange,
          condition: editForm.condition || null,
          status: editForm.status || null,
          inspection_due_date: editForm.inspectionDue || null,
          bulk_joints: newTotalJoints,
          bulk_footage: newTotalFootage,
          tallied_joints: 0,
          tallied_footage: 0,
        })
        .eq("id", selectedEditRow.id);

      if (updateError) throw updateError;

      await supabase.from("pipe_transactions").insert({
        pipe_inventory_id: selectedEditRow.id,
        company_id: companyId,
        yard_id: selectedYard.id,
        transaction_type: "edit_inventory",
        quantity_joints: newTotalJoints,
        quantity_footage: newTotalFootage,
        from_location: previousLocation,
        to_location: locationName,
        comment: `${editForm.comment.trim()} | Before: ${editBeforeTotals.joints} joints / ${editBeforeTotals.footage.toLocaleString()} ft. After: ${newTotalJoints} joints / ${newTotalFootage.toLocaleString()} ft.`,
      });

      await loadInventory(selectedYard.id, rackLayout, zones);
      await loadReports();

      setEditOpen(false);
      setSelectedRows([]);
      setEditForm(emptyEditForm);
      setMessage("Inventory line updated.");
    } catch (error: any) {
      setMessage(`Edit failed: ${error.message}`);
    } finally {
      setSavingEdit(false);
    }
  }
  async function saveReceive() {
    if (!selectedYard) return;
  
    setMessage("");
    if (isReadOnlyRole) {
      setMessage("Sales and customer users can view and print, but cannot receive inventory.");
      return;
    }
  
    if (!receiveForm.customer.trim()) {
      setMessage("Customer is required.");
      return;
    }
  
    if (!receiveForm.partNumber.trim()) {
      setMessage("Part number is required.");
      return;
    }
  
    const joints = Number(receiveForm.joints || 0);
    const footage = calculateRangeFootage(joints, receiveForm.pipeRange);
    const missingBoxProtectors = Math.max(0, Number(receiveForm.missingBoxProtectors || 0));
    const missingPinProtectors = Math.max(0, Number(receiveForm.missingPinProtectors || 0));
  
    if (joints <= 0) {
      setMessage("Enter joints before saving.");
      return;
    }
  
    setSavingReceive(true);
  
    try {
      const companyId = await findOrCreateCompany(receiveForm.customer);
      const { rack, zone } = getDestination(receiveForm.destination);
      const destinationName = rack?.label ?? zone?.name ?? receiveForm.destination;
      const ticketNumber = await makeTicketNumber("REC", "receiving");
  
      const { data: inventoryLine, error: inventoryError } = await supabase
        .from("pipe_inventory")
        .insert({
          company_id: companyId,
          yard_id: selectedYard.id,
          rack_id: rack?.id ?? null,
          workflow_zone_id: zone?.id ?? null,
          afe: receiveForm.afe || null,
          part_number: receiveForm.partNumber,
          size: receiveForm.size || null,
          grade: receiveForm.grade || null,
          connection: receiveForm.connection || null,
          pipe_range: receiveForm.pipeRange,
          condition: receiveForm.condition || "New",
          status: receiveForm.status || "Received",
          inspection_color: "None",
          inspection_due_date: receiveForm.inspectionDue || null,
          bulk_joints: joints,
          bulk_footage: footage,
          tallied_joints: 0,
          tallied_footage: 0,
        })
        .select("id")
        .single();
  
      if (inventoryError) throw inventoryError;
      if (!inventoryLine?.id) throw new Error("Receiving saved inventory but did not return an inventory id.");
  
      const { data: receivingTicket, error: ticketError } = await supabase
        .from("receiving_tickets")
        .insert({
          company_id: companyId,
          yard_id: selectedYard.id,
          ticket_number: ticketNumber,
          carrier: receiveForm.carrier || null,
          po_number: receiveForm.poNumber || null,
          truck_number: receiveForm.truckNumber || null,
          destination: destinationName,
          missing_box_protectors: missingBoxProtectors,
          missing_pin_protectors: missingPinProtectors,
          pathfinder_name: receiveForm.pathfinderName || null,
          pathfinder_signature: receiveForm.pathfinderSignature || null,
          carrier_name: receiveForm.carrierName || null,
          carrier_signature: receiveForm.carrierSignature || null,
          notes: receiveForm.notes || null,
          afe: receiveForm.afe || null,
          part_number: receiveForm.partNumber,
          size: receiveForm.size || null,
          grade: receiveForm.grade || null,
          connection: receiveForm.connection || null,
          pipe_range: receiveForm.pipeRange,
          condition: receiveForm.condition || "New",
          joints,
          footage,
        })
        .select("id")
        .single();
  
      if (ticketError) throw ticketError;
      if (!receivingTicket?.id) throw new Error("Receiving ticket was saved but did not return a ticket id.");

      await saveTicketAttachments({
        files: receiveFiles,
        companyId,
        inventoryId: inventoryLine.id,
        receivingTicketId: receivingTicket.id,
        ticketNumber,
        folder: "receiving",
      });
  
      await supabase.from("pipe_transactions").insert({
        pipe_inventory_id: inventoryLine.id,
        company_id: companyId,
        yard_id: selectedYard.id,
        transaction_type: "receive",
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
      setReceiveFiles([]);
      setMessage(`Receiving saved. Ticket ${ticketNumber}${receiveFiles.length ? ` with ${receiveFiles.length} attachment(s)` : ""}`);
    } catch (error: any) {
      setMessage(`Receive failed: ${error.message}`);
    } finally {
      setSavingReceive(false);
    }
  }

  async function saveInitialInventory() {
    if (!selectedYard) return;

    setMessage("");
    if (isReadOnlyRole) {
      setMessage("Sales and customer users can view and print, but cannot add inventory.");
      return;
    }

    if (!receiveForm.customer.trim()) {
      setMessage("Customer is required.");
      return;
    }

    if (!receiveForm.partNumber.trim()) {
      setMessage("Part number is required.");
      return;
    }

    const joints = Number(receiveForm.joints || 0);
    const footage = calculateRangeFootage(joints, receiveForm.pipeRange);

    if (joints <= 0) {
      setMessage("Enter joints before saving.");
      return;
    }

    setSavingInitialInventory(true);

    try {
      const companyId = await findOrCreateCompany(receiveForm.customer);
      const { rack, zone } = getDestination(receiveForm.destination);
      const destinationName = rack?.label ?? zone?.name ?? receiveForm.destination;

      const { data: inventoryLine, error: inventoryError } = await supabase
        .from("pipe_inventory")
        .insert({
          company_id: companyId,
          yard_id: selectedYard.id,
          rack_id: rack?.id ?? null,
          workflow_zone_id: zone?.id ?? null,
          afe: receiveForm.afe || null,
          part_number: receiveForm.partNumber,
          size: receiveForm.size || null,
          grade: receiveForm.grade || null,
          connection: receiveForm.connection || null,
          pipe_range: receiveForm.pipeRange,
          condition: receiveForm.condition || "Used",
          status: receiveForm.status || "Available",
          inspection_color: "None",
          inspection_due_date: null,
          bulk_joints: joints,
          bulk_footage: footage,
          tallied_joints: 0,
          tallied_footage: 0,
        })
        .select("id")
        .single();

      if (inventoryError) throw inventoryError;
      if (!inventoryLine?.id) throw new Error("Inventory was saved but did not return an inventory id.");

      const { error: transactionError } = await supabase.from("pipe_transactions").insert({
        pipe_inventory_id: inventoryLine.id,
        company_id: companyId,
        yard_id: selectedYard.id,
        transaction_type: "initial_inventory",
        from_location: null,
        to_location: destinationName,
        quantity_joints: joints,
        quantity_footage: footage,
        comment: receiveForm.notes || "Initial inventory entry",
      });

      if (transactionError) throw transactionError;

      await loadInventory(selectedYard.id, rackLayout, zones);
      await loadReports();

      setInitialInventoryOpen(false);
      setReceiveForm(emptyReceiveForm);
      setMessage(`Initial inventory added to ${destinationName}. No receiving ticket was created.`);
    } catch (error: any) {
      setMessage(`Initial inventory failed: ${error.message}`);
    } finally {
      setSavingInitialInventory(false);
    }
  }
  
  async function saveTransfer() {
    if (!selectedYard || !selectedTransferRow) return;

    setMessage("");
    if (isReadOnlyRole) {
      setMessage("Sales and customer users can view and print, but cannot transfer inventory.");
      return;
    }

    if (!transferForm.comment.trim()) {
      setMessage("Transfer comment is required.");
      return;
    }

    const { rack, zone, locationName } = getDestination(transferForm.destination);

    const currentLocation =
      selectedTransferRow.locationType === "rack"
        ? selectedTransferRow.rackId
        : selectedTransferRow.zoneId;
    const currentLocationName =
      selectedTransferRow.locationType === "rack"
        ? selectedTransferRow.rackId ?? "Unknown"
        : zones.find((item) => item.code === selectedTransferRow.zoneId)?.name ?? selectedTransferRow.zoneId ?? "Unknown";

    if (currentLocation === rack?.label || currentLocation === zone?.code) {
      setMessage("Choose a different destination.");
      return;
    }

    const movingAll = transferMode === "all";
    const moveJoints = movingAll ? selectedTransferRow.joints : Number(transferForm.joints || 0);
    const moveFootage = calculateRangeFootage(moveJoints, selectedTransferRow.pipeRange);

    if (!movingAll && moveJoints <= 0) {
      setMessage("Enter joints to transfer.");
      return;
    }

    if (moveJoints > selectedTransferRow.joints) {
      setMessage("You cannot transfer more joints than this line has.");
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
            status:
              zone?.code === "inspection"
                ? "Awaiting Inspection"
                : zone?.code === "hardband"
                  ? "WIP"
                  : selectedTransferRow.status,
          })
          .eq("id", selectedTransferRow.id);

        if (moveError) throw moveError;
      } else {
        const remainingJoints = selectedTransferRow.joints - moveJoints;
        const remainingFootage = calculateRangeFootage(remainingJoints, selectedTransferRow.pipeRange);

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
          pipe_range: selectedTransferRow.pipeRange,
          condition: selectedTransferRow.condition || null,
          status:
            zone?.code === "inspection"
              ? "Awaiting Inspection"
              : zone?.code === "hardband"
                ? "WIP"
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
      });

      const transferDocumentNumber = await createTransferDocument({
        row: selectedTransferRow,
        fromLocation: currentLocationName,
        toLocation: locationName,
        joints: moveJoints,
        footage: moveFootage,
        comment: transferForm.comment,
        signatures: transferForm,
      });

      if (zone?.code === "hardband" && transferDocumentNumber && transferFiles.length > 0) {
        await saveTicketAttachments({
          files: transferFiles,
          companyId: selectedTransferRow.companyId,
          inventoryId: selectedTransferRow.id,
          ticketNumber: transferDocumentNumber,
          folder: "transfer",
          documentType: "machine_shop_work_order",
        });
      }

      const hardbandJobNumber =
        zone?.code === "hardband"
          ? await createHardbandJobFromTransfer({
              row: selectedTransferRow,
              fromLocation: currentLocationName,
              toLocation: locationName,
              joints: moveJoints,
              footage: moveFootage,
              comment: transferForm.comment,
              machineShopWorkOrder: transferFiles.map((file) => file.name).join(", "),
            })
          : null;

      await loadInventory(selectedYard.id, rackLayout, zones);
      await loadTickets();
      if (hardbandJobNumber) await loadHardbandJobs();

      setTransferOpen(false);
      setSelectedRows([]);
      setTransferForm(emptyTransferForm);
      setTransferFiles([]);
      setMessage(
        `Transferred ${moveJoints} joints / ${moveFootage.toLocaleString()} ft to ${locationName}.` +
          (transferDocumentNumber ? ` Transfer document ${transferDocumentNumber} created.` : "") +
          (hardbandJobNumber ? ` Hardband job ${hardbandJobNumber} created.` : "")
      );
    } catch (error: any) {
      setMessage(`Transfer failed: ${error.message}`);
    } finally {
      setSavingTransfer(false);
    }
  }

  async function saveShip() {
    if (!selectedYard || selectedShipRows.length === 0) return;

    setMessage("");
    if (isReadOnlyRole) {
      setMessage("Sales and customer users can view and print, but cannot ship inventory.");
      return;
    }

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
      const ticketNumber = await makeTicketNumber("SHP", "shipping");
      const bolNumber = shipForm.bolNumber || (await makeTicketNumber("BOL", "bol"));
      const firstRow = selectedShipRows[0];

      const { data: ticket, error: ticketError } = await supabase
        .from("shipping_tickets")
        .insert({
          company_id: firstRow.companyId,
          yard_id: selectedYard.id,
          ticket_number: ticketNumber,
          bol_number: bolNumber,
          carrier: shipForm.carrier,
          po_number: shipForm.poNumber || null,
          truck_number: shipForm.truckNumber,
          ship_to: shipForm.shipTo,
          destination: shipForm.destination || null,
          pathfinder_name: shipForm.pathfinderName || null,
          pathfinder_signature: shipForm.pathfinderSignature || null,
          carrier_name: shipForm.carrierName || null,
          carrier_signature: shipForm.carrierSignature || null,
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
        pipe_range: row.pipeRange,
        condition: row.condition || null,
        joints: row.joints,
        footage: row.footage,
      }));

      const { error: lineError } = await supabase
        .from("ticket_line_items")
        .insert(lineItems);

      if (lineError) throw lineError;

      await saveTicketAttachments({
        files: shipFiles,
        companyId: firstRow.companyId,
        inventoryId: firstRow.id,
        shippingTicketId: ticket.id,
        ticketNumber,
        folder: "shipping",
      });

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
          quantity_joints: row.joints,
          quantity_footage: row.footage,
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
      setShipFiles([]);
      setMessage(`Shipping ticket ${ticketNumber} saved. BOL ${bolNumber}${shipFiles.length ? ` with ${shipFiles.length} attachment(s)` : ""}`);
    } catch (error: any) {
      setMessage(`Ship failed: ${error.message}`);
    } finally {
      setSavingShip(false);
    }
  }


  function exportInventoryCsv() {
    if (filteredInventory.length === 0) {
      setMessage("No inventory rows to export.");
      return;
    }

    const headers = [
      "Date Created",
      "Company",
      "TU#",
      "Part Number",
      "Size",
      "Grade",
      "Connection",
      "Range",
      "Status",
      "Condition",
      "Rack/Location",
      "Joints",
      "Calculated Footage",
    ];

    const rows = filteredInventory.map((row) => {
      const location = row.locationType === "rack" ? row.rackId : row.zoneId;

      return [
        row.createdAt,
        row.company,
        row.afe,
        row.partNumber,
        row.size,
        row.grade,
        row.connection,
        row.pipeRange,
        row.status,
        row.condition,
        location ?? "",
        row.joints,
        row.footage,
      ];
    });

    const locationName = selectedLocation === "all" ? "all-locations" : selectedLocation;

    downloadCsv(`titan-inventory-${locationName}-${today}.csv`, headers, rows);

    setMessage(`Exported ${filteredInventory.length} inventory rows.`);
  }

  function exportReportsCsv() {
    const headers = [
      "Report",
      "Label / Type",
      "Company",
      "TU#",
      "Part Number",
      "Lines",
      "Joints",
      "Footage",
      "From",
      "To",
      "Date",
      "Comment",
    ];

    const summaryRows = [
      ...inventoryByCustomer.map((line) => [
        "Inventory by Customer",
        line.label,
        line.label,
        "",
        "",
        line.lines,
        line.joints,
        line.footage,
        "",
        "",
        today,
        "",
      ]),
      ...inventoryByRack.map((line) => [
        "Inventory by Rack / Zone",
        line.label,
        "",
        "",
        "",
        line.lines,
        line.joints,
        line.footage,
        "",
        "",
        today,
        "",
      ]),
      ...wipReport.map((line) => [
        "WIP Report",
        line.label,
        "",
        "",
        "",
        line.lines,
        line.joints,
        line.footage,
        "",
        "",
        today,
        "",
      ]),
    ];

    const transactionRows = transactions.map((transaction) => [
      "Transaction History",
      transaction.type,
      transaction.company,
      transaction.afe,
      transaction.partNumber,
      "",
      transaction.joints,
      transaction.footage,
      transaction.fromLocation,
      transaction.toLocation,
      transaction.createdAt,
      transaction.comment,
    ]);

    const rows = [...summaryRows, ...transactionRows];

    if (rows.length === 0) {
      setMessage("No report data to export.");
      return;
    }

    downloadCsv(`titan-reports-${today}.csv`, headers, rows);
    setMessage(`Exported ${rows.length} report rows.`);
  }

  function exportActivityCsv() {
    if (filteredActivity.length === 0) {
      setMessage("No activity rows to export.");
      return;
    }

    downloadCsv(
      `titan-activity-log-${today}.csv`,
      ["Date", "Type", "Company", "TU#", "Part Number", "Joints", "Footage", "From", "To", "Comment"],
      filteredActivity.map((transaction) => [
        transaction.createdAt,
        transaction.type,
        transaction.company,
        transaction.afe,
        transaction.partNumber,
        transaction.joints,
        transaction.footage,
        transaction.fromLocation,
        transaction.toLocation,
        transaction.comment,
      ])
    );

    setMessage(`Exported ${filteredActivity.length} activity rows.`);
  }

  if (loadingSetup) {
    return (
      <main className="app-shell">
        <section className="empty-state">
          <h1>TITAN</h1>
          <p>Loading yard setup...</p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <datalist id="customer-name-options">
        {customerNameOptions.map((customer) => (
          <option key={customer} value={customer} />
        ))}
      </datalist>

      <aside className="side-panel">
        <div className="brand">
          <div className="brand-mark">PF</div>
          <div>
            <div className="brand-title">TITAN</div>
            <div className="brand-subtitle">Tubular Inventory Tracking & Asset Navigation</div>
          </div>
        </div>

        <select className="field" value={selectedYard?.id ?? ""} disabled>
          <option>{selectedYard?.name ?? "Pathfinder Yard"}</option>
        </select>

        <input
          className="field"
          placeholder="Search company, TU#, part number..."
          value={search}
          onChange={(event) => { setSearch(event.target.value); if (event.target.value.trim()) setSelectedLocation("all"); }}
        />

        <select className="field" value={customerFilter} onChange={(event) => { setCustomerFilter(event.target.value); setSelectedLocation("all"); }}>
          <option value="all">All Customers</option>
          {customerOptions.map((customer) => (
            <option key={customer} value={customer}>{customer}</option>
          ))}
        </select>

        <select className="field" value={statusFilter} onChange={(event) => { setStatusFilter(event.target.value); setSelectedLocation("all"); }}>
          <option value="all">All Statuses</option>
          {statusOptions.map((status) => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>

        <select className="field" value={conditionFilter} onChange={(event) => { setConditionFilter(event.target.value); setSelectedLocation("all"); }}>
          <option value="all">All Conditions</option>
          {conditionOptions.map((condition) => (
            <option key={condition} value={condition}>{condition}</option>
          ))}
        </select>

        <button
          className="button"
          onClick={() => {
            setSearch("");
            setCustomerFilter("all");
            setStatusFilter("all");
            setConditionFilter("all");
          }}
        >
          Clear Filters
        </button>

        <select
          className="field"
          value={role}
          disabled={profileRole === "sales" || profileRole === "customer"}
          onChange={(event) => setRole(event.target.value as Role)}
        >
          <option value="admin">Admin</option>
          <option value="customer">Customer View</option>
          <option value="sales">Sales View</option>
        </select>

        <div className="button-grid">
          <button className="button" onClick={() => window.print()}>Print</button>
          <button className="button" onClick={exportInventoryCsv}>Export CSV</button>
          <button className="button" onClick={refreshYardView}>Refresh</button>
          <button className="button" disabled={isReadOnlyRole || selectedRows.length === 0} onClick={completeSelectedRows}>Complete</button>
          <button className="button" disabled={isReadOnlyRole} onClick={openTransfer}>Transfer</button>
          <button className="button primary" disabled={isReadOnlyRole} onClick={() => setReceiveOpen(true)}>Receive</button>
          <button
            className="button"
            disabled={isReadOnlyRole}
            onClick={() => {
              setReceiveForm({
                ...emptyReceiveForm,
                status: "Available",
                condition: "Used",
                destination: selectedRackDetail ? `rack:${selectedRackDetail.label}` : emptyReceiveForm.destination,
                notes: "Initial inventory entry",
              });
              setInitialInventoryOpen(true);
            }}
          >
            Initial Inventory
          </button>
          <button className="button" disabled={isReadOnlyRole} onClick={openShip}>Ship</button>
          <button className="button" disabled={isReadOnlyRole || selectedRows.length !== 1} onClick={openEdit}>Adjust</button>
          <button className="button" onClick={openTickets}>Tickets</button>
          <button className="button" disabled={!canUseAdminTools} onClick={openHardbandJobs}>Hardband Jobs</button>
          <button className="button" onClick={openReports}>Reports</button>
          <button className="button" disabled={role === "customer"} onClick={() => (window.location.href = "/dashboard")}>Dashboard</button>
          <button className="button" disabled={role === "customer"} onClick={openActivity}>Activity</button>
          <button className="button" onClick={() => setPasswordOpen(true)}>Password</button>
          <button className="button" disabled={!canUseAdminTools} onClick={() => (window.location.href = "/admin")}>Admin</button>
        </div>

        {message && <div className="modal-message">{message}</div>}

        <section className="panel">
          <div className="panel-title">Work Zones</div>
          <div className="zone-list">
            {zones.map((zone) => (
              <button
                key={zone.id}
                className={`zone-card ${selectedLocation === zone.code ? "active" : ""}`}
              onClick={() => {
                setSelectedLocation(zone.code);
                setRackDetailOpen(false);
              }}
              >
                <span>{zone.name}</span>
                <small>{zone.code}</small>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <section className="main-panel">
        <section className="customer-welcome">
          <span>Welcome</span>
          <h1>{currentUserName}</h1>
          <p>{selectedYard?.name ?? "Pathfinder Yard"} inventory, rack map, tickets, and activity.</p>
        </section>

        <header className="topbar">
          <div>
            <h1>Yard View</h1>
            <p>{selectedYard?.name} / {filteredInventory.length} visible line items</p>
          </div>

          <div className="topbar-actions">
            <button className="button" onClick={() => { setSelectedLocation("all"); setRackDetailOpen(false); }}>Show All</button>
            {layoutMode && <button className="button" onClick={ensureAllYardRacks}>Add Missing A-K Racks</button>}
            {layoutMode && <button className="button primary" onClick={saveRackLayout}>Save Layout</button>}
            <button className={`button ${layoutMode ? "primary" : ""}`} onClick={() => setLayoutMode((current) => !current)}>
              {layoutMode ? "Done Layout" : "Edit Layout"}
            </button>
          </div>
        </header>

        <section className="rack-section">
          <div className="section-heading">
            <h2>Yard Map</h2>
            <p>{layoutMode ? "Click a rack to enable or disable it. Drag racks into position, then Save Layout." : "Select a rack to view inventory. Orange racks have matching inventory."}</p>
          </div>

          <div
            className="yard-map"
            onDragOver={(event) => event.preventDefault()}
            onDrop={moveRackOnMap}
            style={{
              position: "relative",
              minHeight: "900px",
              width: "100%",
              overflow: "auto",
              border: "1px solid #303846",
              borderRadius: "10px",
              background: "linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px)",
              backgroundSize: "74px 74px",
              padding: "12px",
            }}
          >
            <div
              style={{
                position: "absolute",
                left: 26,
                top: 18,
                display: "grid",
                gridTemplateColumns: "repeat(16, 64px)",
                columnGap: "10px",
                color: "#f4f6f8",
                fontSize: 12,
                fontWeight: 900,
                textAlign: "center",
                pointerEvents: "none",
              }}
            >
              {rackNumbers.map((number) => (
                <span key={number}>{number}</span>
              ))}
            </div>

            <div
              style={{
                position: "absolute",
                left: 0,
                top: 70,
                display: "grid",
                gridTemplateRows: "repeat(11, 38px)",
                rowGap: "36px",
                color: "#8a8b8b",
                fontSize: 12,
                fontWeight: 900,
                textAlign: "center",
                pointerEvents: "none",
              }}
            >
              {rackLetters.map((letter) => (
                <span key={letter}>{letter}</span>
              ))}
            </div>

            {rackLayout.filter((rack) => layoutMode || rack.enabled).map((rack) => {
              const rackInventory = inventory.filter((row) => {
                const searchText = search.toLowerCase().trim();
                const matchesSearch =
                  !searchText ||
                  [row.company, row.afe, row.partNumber, row.size, row.grade, row.connection, row.status, row.condition, row.rackId ?? "", row.zoneId ?? ""]
                    .join(" ")
                    .toLowerCase()
                    .includes(searchText);

                return row.rackId === rack.label && rowMatchesQuickFilters(row) && matchesSearch;
              });
              const joints = rackInventory.reduce((sum, row) => sum + row.joints, 0);
              const fill = rack.capacity > 0 ? Math.min(100, Math.round((joints / rack.capacity) * 100)) : 0;

              return (
                <div
                  key={rack.id}
                  className={`rack-tile compact-rack ${selectedLocation === rack.label ? "active" : ""} ${joints > 0 ? "has-inventory" : ""} ${layoutMode ? "layout-mode" : ""} ${!rack.enabled ? "disabled-rack" : ""}`}
                  draggable={layoutMode}
                  onDragStart={() => setDraggedRack(rack.label)}
                  title={`${rack.label} / ${joints}/${rack.capacity} joints`}
                  style={{
                    position: "absolute",
                    left: rack.layoutX,
                    top: rack.layoutY,
                    width: "64px",
                    minHeight: "38px",
                    height: "38px",
                    cursor: layoutMode ? "grab" : "pointer",
                    borderColor: !rack.enabled ? "#7f1d1d" : selectedLocation === rack.label ? "#f97316" : joints > 0 ? "#f97316" : "#303846",
                    background: !rack.enabled ? "rgba(127, 29, 29, 0.25)" : joints > 0 ? "rgba(249, 115, 22, 0.18)" : "#1b2027",
                    opacity: !rack.enabled ? 0.45 : 1,
                    transform: `rotate(${rack.rotation}deg)`,
                    zIndex: selectedLocation === rack.label ? 3 : 2,
                  }}
                >
                  <button
                    className="rack-tile-button compact-rack-button"
                    onClick={() => (layoutMode ? toggleRackEnabled(rack.label) : openRackDetail(rack.label))}
                    style={{
                      minHeight: "36px",
                      height: "36px",
                      padding: "5px 7px",
                      gap: "3px",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span className="rack-code" style={{ fontSize: "13px", lineHeight: "1", textAlign: "center" }}>{rack.label}</span>
                    <span className="rack-meter" style={{ height: "3px", marginTop: "2px", width: "100%" }}>
                      <span style={{ width: `${fill}%`, background: joints > 0 ? "#f97316" : "#303846" }} />
                    </span>
                  </button>

                  {layoutMode && (
                    <div className="layout-rack-actions">
                      <button className="mini-button edit-rack" onClick={() => renameRack(rack.label)}>
                        Edit
                      </button>
                      <button className="mini-button capacity-rack" onClick={() => editRackCapacity(rack.label)}>
                        Cap
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="inventory-panel">
          <div className="section-heading">
            <h2>Inventory at {selectedLocation === "all" ? "All Locations" : selectedLocation}</h2>
            <p>{filteredInventory.length} visible lines / {selectedTotals.joints} selected joints / {selectedTotals.footage.toLocaleString()} selected footage</p>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Actions</th>
                  <th>Date Created</th>
                  <th>Company</th>
                  <th>TU#</th>
                  <th>Part Number</th>
                  <th>Range</th>
                  <th>Status</th>
                  <th>Condition</th>
                  <th>Rack/Location</th>
                  <th>Joints</th>
                  <th>Calculated Footage</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((row) => {
                  const location = row.locationType === "rack" ? row.rackId : row.zoneId;

                  return (
                    <tr key={row.id}>
                      <td>
                        <input type="checkbox" checked={selectedRows.includes(row.id)} onChange={() => toggleRow(row.id)} />
                      </td>
                      <td>
                        <div className="quick-actions">
                          <button className="mini-action" disabled={isReadOnlyRole} onClick={() => quickTransfer(row)}>Transfer</button>
                          <button className="mini-action" disabled={isReadOnlyRole} onClick={() => quickShip(row)}>Ship</button>
                          <button className="mini-action" disabled={isReadOnlyRole} onClick={() => quickAdjust(row)}>Adjust</button>
                          <button className="mini-action" onClick={() => quickTickets(row)}>Tickets</button>
                          <button className="mini-action" onClick={() => quickActivity(row)}>History</button>
                        </div>
                      </td>
                      <td>{row.createdAt}</td>
                      <td>{row.company}</td>
                      <td>{row.afe}</td>
                      <td>{row.partNumber}</td>
                      <td>{row.pipeRange}</td>
                      <td><span className="badge">{row.status}</span></td>
                      <td>{row.condition}</td>
                      <td>{location}</td>
                      <td>{row.joints}</td>
                      <td>{row.footage.toLocaleString()}</td>
                    </tr>
                  );
                })}

                {filteredInventory.length === 0 && (
                  <tr>
                    <td colSpan={12} className="empty-cell">No inventory found for this location.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </section>

      {rackDetailOpen && selectedRackDetail && (
        <div className="modal-backdrop rack-detail-backdrop">
          <section className="rack-detail-screen">
            <div className="slide-header">
              <div>
                <h2>Rack {selectedRackDetail.label}</h2>
                <p>
                  {selectedRackTotals.lines} line items / {selectedRackTotals.joints} joints / {selectedRackTotals.footage.toLocaleString()} ft
                </p>
              </div>
              <button className="icon-button" onClick={closeRackDetail}>X</button>
            </div>

            <div className="rack-detail-actions">
              <button className="button" onClick={closeRackDetail}>Back to Yard</button>
              <button className="button" onClick={exportInventoryCsv}>Export Rack CSV</button>
              <button
                className="button primary"
                disabled={isReadOnlyRole}
                onClick={() => {
                  setReceiveForm({ ...emptyReceiveForm, destination: `rack:${selectedRackDetail.label}` });
                  setReceiveOpen(true);
                }}
              >
                Receive Into Rack
              </button>
              <button
                className="button"
                disabled={isReadOnlyRole}
                onClick={() => {
                  setReceiveForm({
                    ...emptyReceiveForm,
                    destination: `rack:${selectedRackDetail.label}`,
                    status: "Available",
                    condition: "Used",
                    notes: "Initial inventory entry",
                  });
                  setInitialInventoryOpen(true);
                }}
              >
                Add Initial Inventory
              </button>
            </div>

            <div className="rack-detail-metrics">
              <div>
                <span>Capacity</span>
                <strong>{selectedRackDetail.capacity}</strong>
                <small>joints</small>
              </div>
              <div>
                <span>Current Load</span>
                <strong>{selectedRackTotals.joints}</strong>
                <small>{selectedRackDetail.capacity > 0 ? Math.round((selectedRackTotals.joints / selectedRackDetail.capacity) * 100) : 0}% full</small>
              </div>
              <div>
                <span>Footage</span>
                <strong>{selectedRackTotals.footage.toLocaleString()}</strong>
                <small>total ft</small>
              </div>
              <div>
                <span>Range Mix</span>
                <strong>
                  {selectedRackInventory.filter((row) => row.pipeRange === "Range 2").reduce((sum, row) => sum + row.joints, 0)}
                  {" / "}
                  {selectedRackInventory.filter((row) => row.pipeRange === "Range 3").reduce((sum, row) => sum + row.joints, 0)}
                </strong>
                <small>R2 / R3 joints</small>
              </div>
            </div>

            <div className="rack-detail-grid">
              <section className="ticket-card">
                <h3>Inventory By Customer</h3>
                {selectedRackCustomerSummary.length === 0 && <p className="muted-text">No customer inventory in this rack.</p>}
                {selectedRackCustomerSummary.map((line) => (
                  <div key={line.label} className="report-row">
                    <span>{line.label}</span>
                    <strong>{line.joints} joints</strong>
                    <small>{line.footage.toLocaleString()} ft / {line.lines} lines</small>
                  </div>
                ))}
              </section>

              <section className="ticket-card">
                <h3>Inventory By Status</h3>
                {selectedRackStatusSummary.length === 0 && <p className="muted-text">No status totals in this rack.</p>}
                {selectedRackStatusSummary.map((line) => (
                  <div key={line.label} className="report-row">
                    <span>{line.label}</span>
                    <strong>{line.joints} joints</strong>
                    <small>{line.footage.toLocaleString()} ft / {line.lines} lines</small>
                  </div>
                ))}
              </section>
            </div>

            <section className="ticket-card rack-detail-lines">
              <h3>Rack Line Items</h3>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Actions</th>
                      <th>Company</th>
                      <th>TU#</th>
                      <th>Part Number</th>
                      <th>Size</th>
                      <th>Grade</th>
                      <th>Connection</th>
                      <th>Range</th>
                      <th>Status</th>
                      <th>Condition</th>
                      <th>Joints</th>
                      <th>Footage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRackInventory.map((row) => {
                      return (
                        <tr key={row.id}>
                          <td>
                            <input type="checkbox" checked={selectedRows.includes(row.id)} onChange={() => toggleRow(row.id)} />
                          </td>
                          <td>
                            <div className="quick-actions">
                              <button className="mini-action" disabled={isReadOnlyRole} onClick={() => quickTransfer(row)}>Transfer</button>
                              <button className="mini-action" disabled={isReadOnlyRole} onClick={() => quickShip(row)}>Ship</button>
                              <button className="mini-action" disabled={isReadOnlyRole} onClick={() => quickAdjust(row)}>Adjust</button>
                            </div>
                          </td>
                          <td>{row.company}</td>
                          <td>{row.afe}</td>
                          <td>{row.partNumber}</td>
                          <td>{row.size}</td>
                          <td>{row.grade}</td>
                          <td>{row.connection}</td>
                          <td>{row.pipeRange}</td>
                          <td><span className="badge">{row.status}</span></td>
                          <td>{row.condition}</td>
                          <td>{row.joints}</td>
                          <td>{row.footage.toLocaleString()}</td>
                        </tr>
                      );
                    })}

                    {selectedRackInventory.length === 0 && (
                      <tr>
                        <td colSpan={13} className="empty-cell">No inventory found in rack {selectedRackDetail.label}.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        </div>
      )}

      {editOpen && selectedEditRow && (
        <div className="modal-backdrop">
          <section className="slide-over">
            <div className="slide-header">
              <div>
                <h2>Edit Inventory Line</h2>
                <p>{selectedEditRow.company} / {selectedEditRow.partNumber}</p>
              </div>
              <button className="icon-button" onClick={() => setEditOpen(false)}>X</button>
            </div>

            {message && <div className="modal-message">{message}</div>}

            <div className="form-grid">
              <label>
                Customer
                <input
                  list="customer-name-options"
                  value={editForm.customer}
                  onChange={(event) => setEditForm({ ...editForm, customer: event.target.value })}
                  placeholder="Choose or type customer"
                />
              </label>

              <label>
                Location
                <select value={editForm.destination} onChange={(event) => setEditForm({ ...editForm, destination: event.target.value })}>
                  {locationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>

              <label>TU#<input value={editForm.afe} onChange={(event) => setEditForm({ ...editForm, afe: event.target.value })} /></label>
              <label>
                Saved Part
                <select value="" onChange={(event) => applyPartToEdit(event.target.value)}>
                  <option value="">Choose saved part...</option>
                  {partNumbers.map((part) => (
                    <option key={part.id} value={part.id}>
                      {partOptionLabel(part)}
                    </option>
                  ))}
                </select>
              </label>
              <label>Part Number<input value={editForm.partNumber} onChange={(event) => setEditForm({ ...editForm, partNumber: event.target.value })} /></label>
              <label>Size<input value={editForm.size} onChange={(event) => setEditForm({ ...editForm, size: event.target.value })} /></label>
              <label>Grade<input value={editForm.grade} onChange={(event) => setEditForm({ ...editForm, grade: event.target.value })} /></label>
              <label>Connection<input value={editForm.connection} onChange={(event) => setEditForm({ ...editForm, connection: event.target.value })} /></label>
              <label>
                Range
                <select value={editForm.pipeRange} onChange={(event) => setEditForm({ ...editForm, pipeRange: normalizePipeRange(event.target.value) })}>
                  {pipeRangeOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>

              <label>
                Condition
                <select value={editForm.condition} onChange={(event) => setEditForm({ ...editForm, condition: event.target.value })}>
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
                <select value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>
                  <option>Received</option>
                  <option>Available</option>
                  <option>Awaiting Inspection</option>
                  <option>Awaiting Ship</option>
                  <option>WIP</option>
                  <option>On Hold</option>
                  <option>Shipped</option>
                </select>
              </label>

              <label>Joints<input type="number" value={editForm.joints} onChange={(event) => setEditForm({ ...editForm, joints: event.target.value })} /></label>
              <label>Calculated Footage<input readOnly value={editAfterTotals.footage.toLocaleString()} /></label>
              <label className="full">Edit Comment<textarea value={editForm.comment} onChange={(event) => setEditForm({ ...editForm, comment: event.target.value })} placeholder="Reason for edit" /></label>
            </div>

            <div className="adjust-summary">
              <div>
                <span>Before</span>
                <strong>{editBeforeTotals.joints} joints</strong>
                <small>{editBeforeTotals.footage.toLocaleString()} ft</small>
              </div>
              <div>
                <span>After</span>
                <strong>{editAfterTotals.joints} joints</strong>
                <small>{editAfterTotals.footage.toLocaleString()} ft</small>
              </div>
              <div>
                <span>Change</span>
                <strong>{editAfterTotals.joints - editBeforeTotals.joints} joints</strong>
                <small>{(editAfterTotals.footage - editBeforeTotals.footage).toLocaleString()} ft</small>
              </div>
            </div>

            <div className="slide-actions">
              <button className="button" onClick={() => setEditOpen(false)}>Cancel</button>
              <button className="button primary" onClick={saveEdit} disabled={savingEdit || isReadOnlyRole}>{savingEdit ? "Saving..." : "Save Inventory Edit"}</button>
            </div>
          </section>
        </div>
      )}
      {initialInventoryOpen && (
        <div className="modal-backdrop">
          <section className="slide-over">
            <div className="slide-header">
              <div>
                <h2>Initial Inventory</h2>
                <p>Add existing yard inventory directly to a rack or location. No receiving ticket will be created.</p>
              </div>
              <button className="icon-button" onClick={() => { setInitialInventoryOpen(false); setReceiveForm(emptyReceiveForm); }}>X</button>
            </div>

            {message && <div className="modal-message">{message}</div>}

            <div className="form-grid">
              <label>
                Customer
                <input
                  list="customer-name-options"
                  value={receiveForm.customer}
                  onChange={(event) => setReceiveForm({ ...receiveForm, customer: event.target.value })}
                  placeholder="Choose or type customer"
                />
              </label>
              <label>
                Location
                <select value={receiveForm.destination} onChange={(event) => setReceiveForm({ ...receiveForm, destination: event.target.value })}>
                  {locationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>

              <label>TU#<input value={receiveForm.afe} onChange={(event) => setReceiveForm({ ...receiveForm, afe: event.target.value })} /></label>
              <label>
                Saved Part
                <select value="" onChange={(event) => applyPartToReceive(event.target.value)}>
                  <option value="">Choose saved part...</option>
                  {partNumbers.map((part) => (
                    <option key={part.id} value={part.id}>
                      {partOptionLabel(part)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="full">Part Number<input value={receiveForm.partNumber} onChange={(event) => setReceiveForm({ ...receiveForm, partNumber: event.target.value })} placeholder="5.000 DRILL PIPE NC50 19.50 LB" /></label>
              <label>Size<input value={receiveForm.size} onChange={(event) => setReceiveForm({ ...receiveForm, size: event.target.value })} /></label>
              <label>Grade<input value={receiveForm.grade} onChange={(event) => setReceiveForm({ ...receiveForm, grade: event.target.value })} /></label>
              <label>Connection<input value={receiveForm.connection} onChange={(event) => setReceiveForm({ ...receiveForm, connection: event.target.value })} placeholder="PH6, NC50, 8rd EUE" /></label>

              <label>
                Range
                <select value={receiveForm.pipeRange} onChange={(event) => setReceiveForm({ ...receiveForm, pipeRange: normalizePipeRange(event.target.value) })}>
                  {pipeRangeOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>

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
                  <option>Available</option>
                  <option>Received</option>
                  <option>Awaiting Inspection</option>
                  <option>WIP</option>
                  <option>On Hold</option>
                </select>
              </label>

              <label>Joints<input type="number" min="0" value={receiveForm.joints} onChange={(event) => setReceiveForm({ ...receiveForm, joints: event.target.value })} /></label>
              <label>Calculated Footage<input readOnly value={calculateRangeFootage(Number(receiveForm.joints || 0), receiveForm.pipeRange).toLocaleString()} /></label>
              <label className="full">Notes<textarea value={receiveForm.notes} onChange={(event) => setReceiveForm({ ...receiveForm, notes: event.target.value })} /></label>
            </div>

            <div className="slide-actions">
              <button className="button" onClick={() => { setInitialInventoryOpen(false); setReceiveForm(emptyReceiveForm); }}>Cancel</button>
              <button className="button primary" onClick={saveInitialInventory} disabled={savingInitialInventory || isReadOnlyRole}>
                {savingInitialInventory ? "Saving..." : "Add Inventory"}
              </button>
            </div>
          </section>
        </div>
      )}

      {receiveOpen && (
        <div className="modal-backdrop">
          <section className="slide-over">
            <div className="slide-header">
              <div>
                <h2>Receive Pipe</h2>
                <p>Create inventory and receiving record</p>
              </div>
              <button className="icon-button" onClick={() => { setReceiveOpen(false); setReceiveFiles([]); }}>X</button>
            </div>

            {message && <div className="modal-message">{message}</div>}

            <div className="form-grid">
              <label>Carrier<input value={receiveForm.carrier} onChange={(event) => setReceiveForm({ ...receiveForm, carrier: event.target.value })} /></label>
              <label>PO Number<input value={receiveForm.poNumber} onChange={(event) => setReceiveForm({ ...receiveForm, poNumber: event.target.value })} /></label>
              <label>Truck Number<input value={receiveForm.truckNumber} onChange={(event) => setReceiveForm({ ...receiveForm, truckNumber: event.target.value })} /></label>
              <label>
                Customer
                <input
                  list="customer-name-options"
                  value={receiveForm.customer}
                  onChange={(event) => setReceiveForm({ ...receiveForm, customer: event.target.value })}
                  placeholder="Choose or type customer"
                />
              </label>

              <label>
                Receive Into
                <select value={receiveForm.destination} onChange={(event) => setReceiveForm({ ...receiveForm, destination: event.target.value })}>
                  {locationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>

              <label>TU#<input value={receiveForm.afe} onChange={(event) => setReceiveForm({ ...receiveForm, afe: event.target.value })} /></label>
              <label>
                Saved Part
                <select value="" onChange={(event) => applyPartToReceive(event.target.value)}>
                  <option value="">Choose saved part...</option>
                  {partNumbers.map((part) => (
                    <option key={part.id} value={part.id}>
                      {partOptionLabel(part)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="full">Part Number<input value={receiveForm.partNumber} onChange={(event) => setReceiveForm({ ...receiveForm, partNumber: event.target.value })} placeholder="2 3/8 J55 8rd EUE" /></label>
              <label>Size<input value={receiveForm.size} onChange={(event) => setReceiveForm({ ...receiveForm, size: event.target.value })} /></label>
              <label>Grade<input value={receiveForm.grade} onChange={(event) => setReceiveForm({ ...receiveForm, grade: event.target.value })} /></label>
              <label>Connection<input value={receiveForm.connection} onChange={(event) => setReceiveForm({ ...receiveForm, connection: event.target.value })} placeholder="PH6, NC50, 8rd EUE" /></label>
              <label>
                Range
                <select value={receiveForm.pipeRange} onChange={(event) => setReceiveForm({ ...receiveForm, pipeRange: normalizePipeRange(event.target.value) })}>
                  {pipeRangeOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>

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

              <label>Joints<input type="number" value={receiveForm.joints} onChange={(event) => setReceiveForm({ ...receiveForm, joints: event.target.value })} /></label>
              <label>Calculated Footage<input readOnly value={calculateRangeFootage(Number(receiveForm.joints || 0), receiveForm.pipeRange).toLocaleString()} /></label>
              <label>Missing Box Protectors<input type="number" min="0" value={receiveForm.missingBoxProtectors} onChange={(event) => setReceiveForm({ ...receiveForm, missingBoxProtectors: event.target.value })} /></label>
              <label>Missing Pin Protectors<input type="number" min="0" value={receiveForm.missingPinProtectors} onChange={(event) => setReceiveForm({ ...receiveForm, missingPinProtectors: event.target.value })} /></label>
              <label>
                Snap Photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => {
                    setReceiveFiles((files) => [...files, ...Array.from(event.target.files ?? [])]);
                    event.target.value = "";
                  }}
                />
              </label>
              <label>
                Upload Photos / Paperwork
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={(event) => {
                    setReceiveFiles((files) => [...files, ...Array.from(event.target.files ?? [])]);
                    event.target.value = "";
                  }}
                />
              </label>
              {receiveFiles.length > 0 && (
                <div className="full attachment-list">
                  {receiveFiles.map((file, index) => (
                    <span key={`${file.name}-${index}`}>
                      {file.name}
                      <button type="button" onClick={() => setReceiveFiles((files) => files.filter((_, fileIndex) => fileIndex !== index))}>Remove</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="full signature-pad-grid">
                <label>
                  Pathfinder Representative Name
                  <input
                    value={receiveForm.pathfinderName}
                    onChange={(event) => setReceiveForm({ ...receiveForm, pathfinderName: event.target.value })}
                    placeholder="Printed name"
                  />
                </label>
                <SignaturePad
                  label="Pathfinder Representative"
                  value={receiveForm.pathfinderSignature}
                  onChange={(value) => setReceiveForm({ ...receiveForm, pathfinderSignature: value })}
                />
                <label>
                  Carrier / Driver Name
                  <input
                    value={receiveForm.carrierName}
                    onChange={(event) => setReceiveForm({ ...receiveForm, carrierName: event.target.value })}
                    placeholder="Printed name"
                  />
                </label>
                <SignaturePad
                  label="Carrier / Driver Signature"
                  value={receiveForm.carrierSignature}
                  onChange={(value) => setReceiveForm({ ...receiveForm, carrierSignature: value })}
                />
              </div>
              <label className="full">Notes<textarea value={receiveForm.notes} onChange={(event) => setReceiveForm({ ...receiveForm, notes: event.target.value })} /></label>
            </div>

            <div className="slide-actions">
              <button className="button" onClick={() => { setReceiveOpen(false); setReceiveFiles([]); }}>Cancel</button>
              <button className="button primary" onClick={saveReceive} disabled={savingReceive || isReadOnlyRole}>
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
              <button
                className="icon-button"
                onClick={() => {
                  setTransferOpen(false);
                  setTransferFiles([]);
                }}
              >
                X
              </button>
            </div>

            {message && <div className="modal-message">{message}</div>}

            <div className="transfer-summary">
              <div><strong>Current Location</strong><span>{selectedTransferRow.rackId ?? selectedTransferRow.zoneId}</span></div>
              <div><strong>Available Joints</strong><span>{selectedTransferRow.joints}</span></div>
              <div><strong>Available Footage</strong><span>{selectedTransferRow.footage.toLocaleString()}</span></div>
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
                  <label>Calculated Footage<input readOnly value={calculateRangeFootage(Number(transferForm.joints || 0), selectedTransferRow.pipeRange).toLocaleString()} /></label>
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

              {transferForm.destination === "zone:hardband" && (
                <label className="full">
                  Machine Shop Work Order
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                    onChange={(event) => setTransferFiles(Array.from(event.target.files ?? []))}
                  />
                  {transferFiles.length > 0 && (
                    <div className="attachment-list">
                      {transferFiles.map((file) => (
                        <span key={`${file.name}-${file.size}`}>{file.name}</span>
                      ))}
                    </div>
                  )}
                </label>
              )}

              <div className="full signature-pad-grid">
                <label>
                  Pathfinder Representative Name
                  <input
                    value={transferForm.pathfinderName}
                    onChange={(event) => setTransferForm({ ...transferForm, pathfinderName: event.target.value })}
                    placeholder="Printed name"
                  />
                </label>
                <SignaturePad
                  label="Pathfinder Representative"
                  value={transferForm.pathfinderSignature}
                  onChange={(value) => setTransferForm({ ...transferForm, pathfinderSignature: value })}
                />
                <label>
                  Carrier / Driver Name
                  <input
                    value={transferForm.carrierName}
                    onChange={(event) => setTransferForm({ ...transferForm, carrierName: event.target.value })}
                    placeholder="Printed name"
                  />
                </label>
                <SignaturePad
                  label="Carrier / Driver Signature"
                  value={transferForm.carrierSignature}
                  onChange={(value) => setTransferForm({ ...transferForm, carrierSignature: value })}
                />
              </div>
            </div>

            <div className="slide-actions">
              <button
                className="button"
                onClick={() => {
                  setTransferOpen(false);
                  setTransferFiles([]);
                }}
              >
                Cancel
              </button>
              <button className="button primary" onClick={saveTransfer} disabled={savingTransfer || isReadOnlyRole}>
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
              <button className="icon-button" onClick={() => { setShipOpen(false); setShipFiles([]); }}>X</button>
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
              <label>
                Snap Photo
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(event) => {
                    setShipFiles((files) => [...files, ...Array.from(event.target.files ?? [])]);
                    event.target.value = "";
                  }}
                />
              </label>
              <label>
                Upload Photos / Paperwork
                <input
                  type="file"
                  multiple
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                  onChange={(event) => {
                    setShipFiles((files) => [...files, ...Array.from(event.target.files ?? [])]);
                    event.target.value = "";
                  }}
                />
              </label>
              {shipFiles.length > 0 && (
                <div className="full attachment-list">
                  {shipFiles.map((file, index) => (
                    <span key={`${file.name}-${index}`}>
                      {file.name}
                      <button type="button" onClick={() => setShipFiles((files) => files.filter((_, fileIndex) => fileIndex !== index))}>Remove</button>
                    </span>
                  ))}
                </div>
              )}
              <div className="full signature-pad-grid">
                <label>
                  Pathfinder Representative Name
                  <input
                    value={shipForm.pathfinderName}
                    onChange={(event) => setShipForm({ ...shipForm, pathfinderName: event.target.value })}
                    placeholder="Printed name"
                  />
                </label>
                <SignaturePad
                  label="Pathfinder Representative"
                  value={shipForm.pathfinderSignature}
                  onChange={(value) => setShipForm({ ...shipForm, pathfinderSignature: value })}
                />
                <label>
                  Carrier / Driver Name
                  <input
                    value={shipForm.carrierName}
                    onChange={(event) => setShipForm({ ...shipForm, carrierName: event.target.value })}
                    placeholder="Printed name"
                  />
                </label>
                <SignaturePad
                  label="Carrier / Driver Signature"
                  value={shipForm.carrierSignature}
                  onChange={(value) => setShipForm({ ...shipForm, carrierSignature: value })}
                />
              </div>
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
                    <th>Range</th>
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
                      <td>{row.pipeRange}</td>
                      <td>{row.condition}</td>
                      <td>{row.joints}</td>
                      <td>{row.footage.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="slide-actions">
              <button className="button" onClick={() => { setShipOpen(false); setShipFiles([]); }}>Cancel</button>
              <button className="button primary" onClick={saveShip} disabled={savingShip || isReadOnlyRole}>
                {savingShip ? "Saving..." : "Save Shipping Ticket / BOL"}
              </button>
            </div>
          </section>
        </div>
      )}

      {hardbandOpen && (
        <div className="modal-backdrop">
          <section className="slide-over wide-slide">
            <div className="slide-header">
              <div>
                <h2>Hardband Jobs</h2>
                <p>Track pipe sent to Hardband by job number and serial-number line item.</p>
              </div>
              <button className="icon-button" onClick={() => setHardbandOpen(false)}>X</button>
            </div>

            {message && <div className="modal-message">{message}</div>}

            <div className="slide-actions top-actions">
              <button className="button" onClick={loadHardbandJobs}>
                {loadingHardbandJobs ? "Loading..." : "Refresh Jobs"}
              </button>
            </div>

            {hardbandJobs.length === 0 ? (
              <section className="ticket-card">
                <h3>No Hardband jobs yet</h3>
                <p className="muted-text">Transfer pipe to the Hardband work zone and TITAN will create the job number automatically.</p>
              </section>
            ) : (
              <div className="hardband-layout">
                <section className="ticket-card">
                  <h3>Open Jobs</h3>
                  <div className="hardband-job-list">
                    {hardbandJobs.map((job) => {
                      const lineCount = hardbandLines.filter((line) => line.hardbandJobId === job.id).length;

                      return (
                        <button
                          key={job.id}
                          className={`hardband-job-button ${selectedHardbandJob?.id === job.id ? "active" : ""}`}
                          onClick={() => setSelectedHardbandJobId(job.id)}
                        >
                          <strong>{job.jobNumber}</strong>
                          <span>{job.company}</span>
                          <small>{job.partNumber}</small>
                          <small>{lineCount} line items / {job.totalJoints} joints</small>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="ticket-card hardband-detail-card">
                  {selectedHardbandJob && (
                    <>
                      <div className="section-heading">
                        <div>
                          <h3>{selectedHardbandJob.jobNumber}</h3>
                          <p>{selectedHardbandJob.company} / {selectedHardbandJob.createdAt}</p>
                        </div>
                      </div>

                      <div className="transfer-summary">
                        <div><strong>TU#</strong><span>{selectedHardbandJob.afe || "-"}</span></div>
                        <div><strong>Part Number</strong><span>{selectedHardbandJob.partNumber || "-"}</span></div>
                        <div><strong>Size</strong><span>{selectedHardbandJob.size || "-"}</span></div>
                        <div><strong>Grade</strong><span>{selectedHardbandJob.grade || "-"}</span></div>
                        <div><strong>Connection</strong><span>{selectedHardbandJob.connection || "-"}</span></div>
                        <div><strong>Range</strong><span>{selectedHardbandJob.pipeRange}</span></div>
                        <div><strong>Condition</strong><span>{selectedHardbandJob.condition || "-"}</span></div>
                        <div><strong>Moved From</strong><span>{selectedHardbandJob.fromLocation || "-"}</span></div>
                        <div><strong>Moved To</strong><span>{selectedHardbandJob.toLocation || "Hardband"}</span></div>
                        <div><strong>Total Joints</strong><span>{selectedHardbandJob.totalJoints}</span></div>
                        <div><strong>Total Footage</strong><span>{selectedHardbandJob.totalFootage.toLocaleString()}</span></div>
                        <div><strong>Status</strong><span>{selectedHardbandJob.status}</span></div>
                      </div>

                      <div className="table-wrap">
                        <table>
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Serial Number</th>
                              <th>Flush Box</th>
                              <th>Flush Pin</th>
                              <th>Grind Box</th>
                              <th>Grind Pin</th>
                              <th>Hardband Box</th>
                              <th>Hardband Pin</th>
                              <th>Wire</th>
                              <th>Operator</th>
                            </tr>
                          </thead>
                          <tbody>
                            {selectedHardbandLines.map((line) => (
                              <tr key={line.id}>
                                <td>{line.lineNumber}</td>
                                <td>{line.serialNumber}</td>
                                <td>{line.flushGrindBox ? "Yes" : "-"}</td>
                                <td>{line.flushGrindPin ? "Yes" : "-"}</td>
                                <td>{line.grindOutBox ? "Yes" : "-"}</td>
                                <td>{line.grindOutPin ? "Yes" : "-"}</td>
                                <td>{line.hardbandBox ? "Yes" : "-"}</td>
                                <td>{line.hardbandPin ? "Yes" : "-"}</td>
                                <td>{line.wireType || "-"}</td>
                                <td>{line.operatorName || "-"}</td>
                              </tr>
                            ))}

                            {selectedHardbandLines.length === 0 && (
                              <tr>
                                <td colSpan={10} className="empty-cell">No serial-number line items have been added to this job yet.</td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>

                      <section className="ticket-card nested-card">
                        <h3>Add Joint Line Item</h3>
                        <div className="form-grid">
                          <label>
                            Serial Number
                            <input
                              value={hardbandLineForm.serialNumber}
                              onChange={(event) => setHardbandLineForm({ ...hardbandLineForm, serialNumber: event.target.value })}
                            />
                          </label>
                          <label>
                            Type of Wire Used
                            <input
                              value={hardbandLineForm.wireType}
                              onChange={(event) => setHardbandLineForm({ ...hardbandLineForm, wireType: event.target.value })}
                              placeholder="Example: Arnco 350XT"
                            />
                          </label>
                          <label>
                            Operator Name
                            <input
                              value={hardbandLineForm.operatorName}
                              onChange={(event) => setHardbandLineForm({ ...hardbandLineForm, operatorName: event.target.value })}
                              placeholder="Printed name"
                            />
                          </label>

                          <div className="full checkbox-grid">
                            <label><input type="checkbox" checked={hardbandLineForm.flushGrindBox} onChange={(event) => setHardbandLineForm({ ...hardbandLineForm, flushGrindBox: event.target.checked })} /> Flush Grind Box</label>
                            <label><input type="checkbox" checked={hardbandLineForm.flushGrindPin} onChange={(event) => setHardbandLineForm({ ...hardbandLineForm, flushGrindPin: event.target.checked })} /> Flush Grind Pin</label>
                            <label><input type="checkbox" checked={hardbandLineForm.grindOutBox} onChange={(event) => setHardbandLineForm({ ...hardbandLineForm, grindOutBox: event.target.checked })} /> Grind Out Box</label>
                            <label><input type="checkbox" checked={hardbandLineForm.grindOutPin} onChange={(event) => setHardbandLineForm({ ...hardbandLineForm, grindOutPin: event.target.checked })} /> Grind Out Pin</label>
                            <label><input type="checkbox" checked={hardbandLineForm.hardbandBox} onChange={(event) => setHardbandLineForm({ ...hardbandLineForm, hardbandBox: event.target.checked })} /> Hardband Box</label>
                            <label><input type="checkbox" checked={hardbandLineForm.hardbandPin} onChange={(event) => setHardbandLineForm({ ...hardbandLineForm, hardbandPin: event.target.checked })} /> Hardband Pin</label>
                          </div>

                          <div className="full">
                            <SignaturePad
                              label="Operator Signature"
                              value={hardbandLineForm.operatorSignature}
                              onChange={(value) => setHardbandLineForm({ ...hardbandLineForm, operatorSignature: value })}
                            />
                          </div>

                          <label className="full">
                            Notes
                            <textarea
                              value={hardbandLineForm.notes}
                              onChange={(event) => setHardbandLineForm({ ...hardbandLineForm, notes: event.target.value })}
                            />
                          </label>
                        </div>

                        <div className="slide-actions">
                          <button className="button" onClick={() => setHardbandLineForm(emptyHardbandLineForm)}>Clear</button>
                          <button className="button primary" onClick={saveHardbandLineItem} disabled={savingHardbandLine}>
                            {savingHardbandLine ? "Saving..." : "Add Line Item"}
                          </button>
                        </div>
                      </section>
                    </>
                  )}
                </section>
              </div>
            )}
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


            <div className="form-grid ticket-filter-grid">
              <label className="full">
                Search tickets
                <input
                  value={ticketSearch}
                  onChange={(event) => setTicketSearch(event.target.value)}
                  placeholder="Ticket, BOL, customer, carrier, PO, truck, part number, TU#"
                />
              </label>

              <label>
                Ticket Type
                <select value={ticketFilter} onChange={(event) => setTicketFilter(event.target.value as "all" | "receiving" | "shipping")}>
                  <option value="all">All Tickets</option>
                  <option value="receiving">Receiving Only</option>
                  <option value="shipping">Shipping / BOL Only</option>
                </select>
              </label>

              <label>
                Date
                <input type="date" value={ticketDate} onChange={(event) => setTicketDate(event.target.value)} />
              </label>

              <button className="button" onClick={() => { setTicketSearch(""); setTicketFilter("all"); setTicketDate(""); }}>
                Clear Filters
              </button>
            </div>

            <div className="ticket-filter-summary">
              Showing {filteredReceivingTickets.length} receiving tickets, {filteredShippingTickets.length} shipping/BOL tickets, and {filteredTransferDocuments.length} transfer documents
            </div>
            <div className="tickets-grid">
              <section className="ticket-card">
                <h3>Receiving Tickets</h3>
                {filteredReceivingTickets.length === 0 && <p className="muted-text">No receiving tickets found.</p>}

                {filteredReceivingTickets.map((ticket) => {
                  const attachments = ticketAttachments.filter((attachment) => attachment.receivingTicketId === ticket.id);

                  return (
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
                      <div>
                        <span>Missing box protectors: {ticket.missingBoxProtectors}</span>
                        <span>Missing pin protectors: {ticket.missingPinProtectors}</span>
                      </div>
                      <button
                        className="button"
                        onClick={() =>
                          (window.location.href = `/ticket-print?type=receiving&id=${ticket.id}`)
                        }
                      >
                        Print / PDF
                      </button>
                      {attachments.length > 0 && (
                        <div className="ticket-line-list">
                          {attachments.map((attachment) => (
                            <a key={attachment.id} href={attachment.fileUrl} target="_blank" rel="noreferrer">
                              {attachment.fileName}
                            </a>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>

              <section className="ticket-card">
                <h3>Shipping Tickets / BOL</h3>
                {filteredShippingTickets.length === 0 && <p className="muted-text">No shipping tickets found.</p>}

                {filteredShippingTickets.map((ticket) => {
                  const lines = ticketLines.filter((line) => line.ticketId === ticket.id);
                  const attachments = ticketAttachments.filter((attachment) => attachment.shippingTicketId === ticket.id);
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
    (window.location.href = `/ticket-print?type=shipping&id=${ticket.id}`)
  }
>
  Print / PDF
</button>
                      {lines.length > 0 && (
                        <div className="ticket-line-list">
                          {lines.map((line) => (
                            <span key={line.id}>
                              {line.partNumber} / {line.pipeRange} / {line.joints} joints / {line.footage.toLocaleString()} ft
                            </span>
                          ))}
                        </div>
                      )}
                      {attachments.length > 0 && (
                        <div className="ticket-line-list">
                          {attachments.map((attachment) => (
                            <a key={attachment.id} href={attachment.fileUrl} target="_blank" rel="noreferrer">
                              {attachment.fileName}
                            </a>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </section>

              <section className="ticket-card">
                <h3>Transfer Documents</h3>
                {filteredTransferDocuments.length === 0 && <p className="muted-text">No transfer documents found.</p>}

                {filteredTransferDocuments.map((document) => (
                  <article key={document.id} className="ticket-row stacked">
                    <div>
                      <strong>{document.documentNumber}</strong>
                      <span>Workstation Transfer</span>
                    </div>
                    <div>
                      <span>{document.company}</span>
                      <span>{document.createdAt}</span>
                    </div>
                    <div>
                      <span>{document.fromLocation || "-"} to {document.toLocation || "-"}</span>
                      <span>{document.partNumber || "No part number"}</span>
                    </div>
                    <div>
                      <span>{document.joints} joints</span>
                      <span>{document.footage.toLocaleString()} ft</span>
                    </div>
                    {document.workOrderFiles.length > 0 && (
                      <div className="ticket-attachments">
                        <strong>Machine Shop W/O</strong>
                        {document.workOrderFiles.map((file) => (
                          <a key={file.id} href={file.fileUrl} target="_blank" rel="noreferrer">
                            {file.fileName}
                          </a>
                        ))}
                      </div>
                    )}
                    <button
                      className="button"
                      onClick={() =>
                        (window.location.href = `/ticket-print?type=transfer&id=${document.id}`)
                      }
                    >
                      Print / PDF
                    </button>
                  </article>
                ))}
              </section>
            </div>
          </section>
        </div>
      )}

      {activityOpen && (
        <div className="modal-backdrop">
          <section className="slide-over wide-slide">
            <div className="slide-header">
              <div>
                <h2>Activity Log</h2>
                <p>Recent receiving, shipping, transfer, completion, and adjustment history</p>
              </div>
              <button className="icon-button" onClick={() => setActivityOpen(false)}>X</button>
            </div>

            {message && <div className="modal-message">{message}</div>}

            <div className="slide-actions top-actions">
              <button className="button" onClick={loadReports}>
                {loadingReports ? "Loading..." : "Refresh Activity"}
              </button>
              <button className="button" onClick={exportActivityCsv}>
                Export Activity CSV
              </button>
            </div>

            <div className="form-grid ticket-filter-grid">
              <label className="full">
                Search activity
                <input
                  value={activitySearch}
                  onChange={(event) => setActivitySearch(event.target.value)}
                  placeholder="Customer, TU#, part, type, rack, zone, comment..."
                />
              </label>

              <label>
                Activity Type
                <select value={activityType} onChange={(event) => setActivityType(event.target.value)}>
                  <option value="all">All Activity</option>
                  {activityTypes.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>

              <label>
                Date
                <input type="date" value={activityDate} onChange={(event) => setActivityDate(event.target.value)} />
              </label>

              <button className="button" onClick={() => { setActivitySearch(""); setActivityType("all"); setActivityDate(""); }}>
                Clear Filters
              </button>
            </div>

            <div className="ticket-filter-summary">
              Showing {filteredActivity.length} of {transactions.length} activity records
            </div>

            <section className="ticket-card">
              {filteredActivity.length === 0 && <p className="muted-text">No activity found.</p>}

              {filteredActivity.map((transaction) => (
                <article key={transaction.id} className="activity-row">
                  <div className="activity-main">
                    <strong>{transaction.type || "transaction"}</strong>
                    <span>{transaction.company}</span>
                    {(transaction.afe || transaction.partNumber) && (
                      <small>{transaction.afe || "No TU#"} / {transaction.partNumber || "No part number"}</small>
                    )}
                    <small>{transaction.createdAt}</small>
                  </div>

                  <div className="activity-move">
                    <span>{transaction.fromLocation || "-"}</span>
                    <span>to</span>
                    <span>{transaction.toLocation || "-"}</span>
                  </div>

                  <div className="activity-qty">
                    <strong>{transaction.joints} joints</strong>
                    <span>{transaction.footage.toLocaleString()} ft</span>
                  </div>

                  <p>{transaction.comment || "No comment"}</p>
                </article>
              ))}
            </section>
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
                <strong>{activeInventory.reduce((sum, row) => sum + row.joints, 0)}</strong>
                <span>Total Joints</span>
              </div>
              <div>
                <strong>{activeInventory.reduce((sum, row) => sum + row.footage, 0).toLocaleString()}</strong>
                <span>Total Footage</span>
              </div>
            </div>

            <div className="slide-actions top-actions">
              <button className="button" onClick={loadReports}>
                {loadingReports ? "Loading..." : "Refresh Reports"}
              </button>
              <button className="button" onClick={exportReportsCsv}>
                Export Reports CSV
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

      <ChangePasswordModal open={passwordOpen} onClose={() => setPasswordOpen(false)} />
    </main>
  );
}



