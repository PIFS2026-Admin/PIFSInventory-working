"use client";

import { type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import ChangePasswordModal from "../components/ChangePasswordModal";
import { defaultModulesForRole } from "../lib/modulePermissions";
import styles from "./yard-view.module.css";

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
  layoutWidth: number;
  layoutHeight: number;
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

async function loadYardViewPermission(role: string, token: string) {
  try {
    const response = await fetch("/api/my-module-permissions", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !Array.isArray(result.moduleKeys)) {
      return defaultModulesForRole(role).includes("yard_view");
    }

    return result.moduleKeys.includes("yard_view");
  } catch {
    return defaultModulesForRole(role).includes("yard_view");
  }
}

type InventoryRow = {
  id: string;
  companyId: string | null;
  yardId: string | null;
  rackDbId: string | null;
  zoneDbId: string | null;
  createdAt: string;
  inspectionDue: string;
  company: string;
  operator: string;
  rig: string;
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
  operator: string;
  rig: string;
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

type ReceiveTruckLine = {
  id: string;
  carrier: string;
  poNumber: string;
  truckNumber: string;
  joints: string;
  missingBoxProtectors: string;
  missingPinProtectors: string;
};

type TransferForm = SignatureFields & {
  destination: string;
  joints: string;
  comment: string;
  backDate: string;
};

type EditForm = {
  customer: string;
  operator: string;
  rig: string;
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
  destination: string;
  afe: string;
  partNumber: string;
  size: string;
  grade: string;
  connection: string;
  pipeRange: PipeRange;
  condition: string;
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

type TubularReleaseRequest = {
  id: string;
  requestNumber: string;
  companyName: string;
  customerName: string;
  customerEmail: string;
  yardName: string;
  rackLabel: string;
  quantityJoints: number;
  releaseDate: string;
  releasedTo: string;
  shipDate: string;
  carrier: string;
  destination: string;
  partSummary: string;
  partLines: any[];
  status: string;
  notes: string;
  signatureName: string;
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
  receivingTicketId: string;
  shippingTicketId: string;
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

type InventoryOption = {
  id: string;
  optionType: "status" | "condition";
  label: string;
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
const rackMapOrigin = { x: 26, y: 70 };
const rackMapCell = { x: 74, y: 74 };
const rackFreeMoveStep = 10;
const rackTileSize = { width: 64, height: 38 };
const defaultStatusOptions = ["Received", "Available", "WIP", "Awaiting Inspection", "Awaiting Ship", "Shipped", "Rejected", "Scrap", "On Hold"];
const defaultConditionOptions = ["New", "Used", "Premium", "Inspected", "Repair", "Rejected", "Scrap", "On Hold"];

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
  const clean = String(code ?? "").trim();
  const parsed = parseRackCode(clean);
  if (!parsed) return clean;
  return `${parsed.letter}${parsed.number}`;
}

function defaultRackPosition(rackCode: string) {
  const parsed = parseRackCode(rackCode);

  if (!parsed) {
    return { x: rackMapOrigin.x, y: rackMapOrigin.y };
  }

  const numberIndex = 16 - parsed.number;
  const letterIndex = rackLetters.indexOf(parsed.letter);
  const safeColumn = numberIndex >= 0 ? numberIndex : 0;
  const safeRow = letterIndex >= 0 ? letterIndex : 0;

  return {
    x: rackMapOrigin.x + safeColumn * rackMapCell.x,
    y: rackMapOrigin.y + safeRow * rackMapCell.y,
  };
}

function snapRackPosition(x: number, y: number, maxX?: number, maxY?: number) {
  const snappedX = Math.round(x / rackFreeMoveStep) * rackFreeMoveStep;
  const snappedY = Math.round(y / rackFreeMoveStep) * rackFreeMoveStep;

  return {
    x: Math.max(0, Math.min(maxX ?? Number.POSITIVE_INFINITY, snappedX)),
    y: Math.max(0, Math.min(maxY ?? Number.POSITIVE_INFINITY, snappedY)),
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
      layoutWidth: rackTileSize.width,
      layoutHeight: rackTileSize.height,
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
  operator: "",
  rig: "",
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

const emptyReceiveTruckLine: ReceiveTruckLine = {
  id: "",
  carrier: "",
  poNumber: "",
  truckNumber: "",
  joints: "",
  missingBoxProtectors: "0",
  missingPinProtectors: "0",
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
  operator: "",
  rig: "",
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

function normalizeSearchText(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function customerMatchesTerm(customer: string, term: string) {
  const normalizedTerm = normalizeSearchText(term);
  if (!normalizedTerm) return true;
  return normalizeSearchText(customer).includes(normalizedTerm);
}

function rackCustomerSummaryText(rows: InventoryRow[]) {
  if (rows.length === 0) return "Empty rack";

  const summary = buildReport(rows, (row) => row.company)
    .slice(0, 2)
    .map((line) => `${line.label.replace(" Energy", "")} ${line.joints.toLocaleString()}`);

  const extra = buildReport(rows, (row) => row.company).length - summary.length;
  return `${summary.join(" / ")}${extra > 0 ? ` +${extra}` : ""}`;
}

function rackCustomerMatchLabel(rows: InventoryRow[], term: string) {
  if (!term) return "";

  const matches = buildReport(
    rows.filter((row) => customerMatchesTerm(row.company, term)),
    (row) => row.company
  );

  if (matches.length === 0) return "";
  return `${matches[0].label.replace(" Energy", "")} ${matches.reduce((sum, line) => sum + line.joints, 0).toLocaleString()} jts`;
}

function rackPipeDescription(row: InventoryRow) {
  return [row.size, row.grade, row.connection].filter(Boolean).join(" ") || row.partNumber || "Pipe";
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

function signatureToBlackDataUrl(canvas: HTMLCanvasElement) {
  const output = document.createElement("canvas");
  output.width = canvas.width;
  output.height = canvas.height;

  const outputContext = output.getContext("2d");
  const sourceContext = canvas.getContext("2d");

  if (!outputContext || !sourceContext) return canvas.toDataURL("image/png");

  outputContext.drawImage(canvas, 0, 0);
  const imageData = outputContext.getImageData(0, 0, output.width, output.height);

  for (let index = 0; index < imageData.data.length; index += 4) {
    const alpha = imageData.data[index + 3];

    if (alpha > 8) {
      imageData.data[index] = 0;
      imageData.data[index + 1] = 0;
      imageData.data[index + 2] = 0;
      imageData.data[index + 3] = 255;
    }
  }

  outputContext.putImageData(imageData, 0, 0);
  return output.toDataURL("image/png");
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
    if (canvas) onChange(signatureToBlackDataUrl(canvas));
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
  const [yardOptions, setYardOptions] = useState<YardRecord[]>([]);
  const [rackLayout, setRackLayout] = useState<RackConfig[]>(makeDefaultRacks());
  const [zones, setZones] = useState<ZoneConfig[]>(defaultZones);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [partNumbers, setPartNumbers] = useState<PartNumberRecord[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [inventoryOptions, setInventoryOptions] = useState<InventoryOption[]>([
    ...defaultStatusOptions.map((label) => ({ id: `default-status-${label}`, optionType: "status" as const, label })),
    ...defaultConditionOptions.map((label) => ({ id: `default-condition-${label}`, optionType: "condition" as const, label })),
  ]);
  const [selectedLocation, setSelectedLocation] = useState("all");
  const [selectedRows, setSelectedRows] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [customerFilter, setCustomerFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [conditionFilter, setConditionFilter] = useState("all");
  const [layoutMode, setLayoutMode] = useState(false);
  const [draggedRack, setDraggedRack] = useState<string | null>(null);
  const [selectedLayoutRackLabel, setSelectedLayoutRackLabel] = useState("A1");

  const [receiveOpen, setReceiveOpen] = useState(false);
  const [initialInventoryOpen, setInitialInventoryOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [ticketsOpen, setTicketsOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [hardbandOpen, setHardbandOpen] = useState(false);
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketFilter, setTicketFilter] = useState<"all" | "receiving" | "shipping" | "release">("all");
  const [ticketDate, setTicketDate] = useState("");
  const [activitySearch, setActivitySearch] = useState("");
  const [activityType, setActivityType] = useState("all");
  const [activityDate, setActivityDate] = useState("");
  const [rackDetailOpen, setRackDetailOpen] = useState(false);
  const [zoneDetailOpen, setZoneDetailOpen] = useState(false);
  const [selectedZoneDetailCode, setSelectedZoneDetailCode] = useState("");
  const [inventoryRegisterOpen, setInventoryRegisterOpen] = useState(false);
  const [inventoryRegisterScope, setInventoryRegisterScope] = useState("all");
  const [editOpen, setEditOpen] = useState(false);
  const [passwordOpen, setPasswordOpen] = useState(false);

  const [transferMode, setTransferMode] = useState<TransferMode>("all");
  const [receiveForm, setReceiveForm] = useState<ReceiveForm>(emptyReceiveForm);
  const [transferForm, setTransferForm] = useState<TransferForm>(emptyTransferForm);
  const [shipForm, setShipForm] = useState<ShipForm>(emptyShipForm);
  const [editForm, setEditForm] = useState<EditForm>(emptyEditForm);
  const [receiveTruckLines, setReceiveTruckLines] = useState<ReceiveTruckLine[]>([]);
  const [activeReceiveTicketId, setActiveReceiveTicketId] = useState("");
  const [activeReceiveTicketNumber, setActiveReceiveTicketNumber] = useState("");
  const [shipQuantities, setShipQuantities] = useState<Record<string, string>>({});
  const [receiveFiles, setReceiveFiles] = useState<File[]>([]);
  const [shipFiles, setShipFiles] = useState<File[]>([]);
  const [transferFiles, setTransferFiles] = useState<File[]>([]);

  const [receivingTickets, setReceivingTickets] = useState<ReceivingTicket[]>([]);
  const [shippingTickets, setShippingTickets] = useState<ShippingTicket[]>([]);
  const [releaseRequests, setReleaseRequests] = useState<TubularReleaseRequest[]>([]);
  const [transferDocuments, setTransferDocuments] = useState<TransferDocument[]>([]);
  const [ticketLines, setTicketLines] = useState<TicketLine[]>([]);
  const [ticketAttachments, setTicketAttachments] = useState<TicketAttachment[]>([]);
  const [editingTicketCountId, setEditingTicketCountId] = useState("");
  const [ticketCountDrafts, setTicketCountDrafts] = useState<Record<string, { joints: string; footage: string }>>({});
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
  const [savingTicketCounts, setSavingTicketCounts] = useState(false);
  const [savingHardbandLine, setSavingHardbandLine] = useState(false);
  const [message, setMessage] = useState("");
  const isReadOnlyRole = profileRole === "sales" || role === "customer";
  const canUseAdminTools = profileRole === "admin" || profileRole === "employee";
  const mapShellRef = useRef<HTMLDivElement | null>(null);
  const [yardMapScale, setYardMapScale] = useState(1);

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

  const selectedInventoryRows = useMemo(() => {
    return inventory.filter((row) => selectedRows.includes(row.id));
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
      if (ticketFilter === "shipping" || ticketFilter === "release") return false;
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
      if (ticketFilter === "receiving" || ticketFilter === "release") return false;
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

  const filteredReleaseRequests = useMemo(() => {
    const searchText = ticketSearch.toLowerCase().trim();

    return releaseRequests.filter((request) => {
      if (ticketFilter !== "all" && ticketFilter !== "release") return false;
      if (ticketDate && request.createdAt !== ticketDate) return false;
      if (!searchText) return true;

      return [
        request.requestNumber,
        request.companyName,
        request.customerName,
        request.customerEmail,
        request.yardName,
        request.rackLabel,
        request.status,
        request.notes,
        request.signatureName,
        request.createdAt,
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchText);
    });
  }, [releaseRequests, ticketDate, ticketFilter, ticketSearch]);

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

  const selectedLayoutRack = useMemo(() => {
    return rackLayout.find((rack) => rack.label === selectedLayoutRackLabel) ?? rackLayout[0] ?? null;
  }, [rackLayout, selectedLayoutRackLabel]);

  const yardMapSize = useMemo(() => {
    const visibleRacks = rackLayout.filter((rack) => layoutMode || rack.enabled);

    return visibleRacks.reduce(
      (size, rack) => {
        const position = snapRackPosition(rack.layoutX, rack.layoutY);
        const width = rack.layoutWidth ?? rackTileSize.width;
        const height = rack.layoutHeight ?? rackTileSize.height;

        return {
          width: Math.max(size.width, position.x + width + 80),
          height: Math.max(size.height, position.y + height + 80),
        };
      },
      { width: 1220, height: 820 }
    );
  }, [layoutMode, rackLayout]);

  const displayedYardMapSize = useMemo(
    () => ({
      width: Math.ceil(yardMapSize.width * yardMapScale),
      height: Math.ceil(yardMapSize.height * yardMapScale),
    }),
    [yardMapScale, yardMapSize.height, yardMapSize.width]
  );

  useEffect(() => {
    const shell = mapShellRef.current;
    if (!shell) return;

    const updateMapScale = () => {
      if (layoutMode) {
        setYardMapScale(1);
        return;
      }

      const availableWidth = Math.max(320, shell.clientWidth - 6);
      const nextScale = Math.max(0.65, availableWidth / yardMapSize.width);
      setYardMapScale((currentScale) => {
        const roundedScale = Math.round(nextScale * 10000) / 10000;
        return Math.abs(currentScale - roundedScale) > 0.002 ? roundedScale : currentScale;
      });
    };

    updateMapScale();

    const observer = new ResizeObserver(updateMapScale);
    observer.observe(shell);

    return () => observer.disconnect();
  }, [layoutMode, yardMapSize.width]);

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

  const selectedZoneDetail = useMemo(() => {
    if (!selectedZoneDetailCode) return null;
    return zones.find((zone) => zone.code === selectedZoneDetailCode) ?? null;
  }, [selectedZoneDetailCode, zones]);

  const selectedZoneInventory = useMemo(() => {
    if (!selectedZoneDetail) return [];
    return inventory.filter((row) => row.locationType === "zone" && row.zoneId === selectedZoneDetail.code);
  }, [inventory, selectedZoneDetail]);

  const selectedZoneTotals = useMemo(() => {
    return selectedZoneInventory.reduce(
      (totals, row) => ({
        lines: totals.lines + 1,
        joints: totals.joints + row.joints,
        footage: totals.footage + row.footage,
      }),
      { lines: 0, joints: 0, footage: 0 }
    );
  }, [selectedZoneInventory]);

  const selectedZoneCustomerSummary = useMemo(() => {
    return buildReport(selectedZoneInventory, (row) => row.company);
  }, [selectedZoneInventory]);

  const selectedZoneStatusSummary = useMemo(() => {
    return buildReport(selectedZoneInventory, (row) => row.status);
  }, [selectedZoneInventory]);

  async function loadInventory(yardId: string, racks: RackConfig[], zoneList: ZoneConfig[]) {
    const { data, error } = await supabase
      .from("pipe_inventory")
      .select(`
        id,
        company_id,
        yard_id,
        afe,
        operator,
        rig,
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
      .gt("bulk_joints", 0)
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
        operator: row.operator ?? "",
        rig: row.rig ?? "",
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

  async function loadYardSetup(requestedYardId?: string) {
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

    const nextRole = String(profile?.role ?? "admin").toLowerCase();
    setCurrentUserName(profile?.full_name || sessionData.session.user.email || "User");
    setProfileRole(nextRole);
    setRole(nextRole === "customer" ? "customer" : nextRole === "sales" ? "sales" : "admin");

    const canUseYardView = await loadYardViewPermission(nextRole, sessionData.session.access_token);
    if (!canUseYardView) {
      window.location.href = "/home";
      return;
    }

    const yardResponse = await fetch("/api/yard-options", {
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
      },
      cache: "no-store",
    });

    const yardResult = await yardResponse.json().catch(() => ({}));

    if (!yardResponse.ok || !Array.isArray(yardResult.yards) || yardResult.yards.length === 0) {
      setMessage(yardResult.error || "Could not load yards from Supabase.");
      setLoadingSetup(false);
      return;
    }

    const availableYards: YardRecord[] = yardResult.yards.map((yard: YardRecord) => ({
      id: yard.id,
      name: yard.name,
      code: yard.code,
    }));
    setYardOptions(availableYards);

    const yard =
      availableYards.find((option) => option.id === requestedYardId) ??
      availableYards.find((option) => option.id === selectedYard?.id) ??
      availableYards.find((option) => option.code === "PIFS") ??
      availableYards[0];

    setSelectedYard(yard);

    let dbRacks: any[] | null = null;
    const { data: rackRows, error: rackLayoutError } = await supabase
      .from("racks")
      .select("id, rack_code, capacity_joints, sort_order, layout_x, layout_y, layout_width, layout_height, layout_group, rotation, is_active")
      .eq("yard_id", yard.id)
      .order("sort_order", { ascending: true });

    if (rackLayoutError) {
      const fallbackRackQuery = await supabase
        .from("racks")
        .select("id, rack_code, capacity_joints, sort_order, layout_x, layout_y, layout_group, rotation, is_active")
        .eq("yard_id", yard.id)
        .order("sort_order", { ascending: true });

      dbRacks = fallbackRackQuery.data;
    } else {
      dbRacks = rackRows;
    }

    const savedRackMap = new Map<string, RackConfig>();

    for (const rack of dbRacks ?? []) {
      const normalizedLabel = normalizeRackCode(rack.rack_code ?? "");
      if (!normalizedLabel) continue;

      const fallback = defaultRackPosition(normalizedLabel);
      const parsed = parseRackCode(normalizedLabel);
      const rawLayoutGroup = String(rack.layout_group ?? parsed?.letter ?? "A");
      const enabled = rack.is_active !== false && !rawLayoutGroup.startsWith("disabled:");
      const layoutGroup = rawLayoutGroup.replace(/^disabled:/, "") || parsed?.letter || "A";
      const defaultSortIndex = yardRackCodes.indexOf(normalizedLabel);

      savedRackMap.set(normalizedLabel, {
        id: rack.id,
        label: normalizedLabel,
        capacity: Number(rack.capacity_joints ?? 500),
        sort_order: Number(rack.sort_order ?? (defaultSortIndex >= 0 ? defaultSortIndex + 1 : 9999)),
        layoutX: Number(rack.layout_x ?? fallback.x),
        layoutY: Number(rack.layout_y ?? fallback.y),
        layoutWidth: Math.max(34, Number(rack.layout_width ?? rackTileSize.width)),
        layoutHeight: Math.max(26, Number(rack.layout_height ?? rackTileSize.height)),
        layoutGroup,
        rotation: Number(rack.rotation ?? 0),
        enabled,
      });
    }

    const isDefaultYardLayout = yard.code === "PIFS";
    const defaultRacks = isDefaultYardLayout ? makeDefaultRacks().map((rack) => savedRackMap.get(rack.label) ?? rack) : [];
    const customRacks = Array.from(savedRackMap.values())
      .filter((rack) => !isDefaultYardLayout || !yardRackCodes.includes(rack.label))
      .sort((left, right) => left.sort_order - right.sort_order || left.label.localeCompare(right.label));
    const mappedRacks = [...defaultRacks, ...customRacks];
    setRackLayout(mappedRacks);
    if (!mappedRacks.some((rack) => rack.label === selectedLayoutRackLabel)) {
      setSelectedLayoutRackLabel(mappedRacks[0]?.label ?? "");
    }

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
    await loadInventoryOptions();
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
        .filter((company: CompanyOption) => company.name.trim())
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

  async function loadInventoryOptions() {
    const { data, error } = await supabase
      .from("inventory_options")
      .select("id, option_type, label, is_active")
      .eq("is_active", true)
      .order("option_type", { ascending: true })
      .order("sort_order", { ascending: true })
      .order("label", { ascending: true });

    if (error) {
      setInventoryOptions([
        ...defaultStatusOptions.map((label) => ({ id: `default-status-${label}`, optionType: "status" as const, label })),
        ...defaultConditionOptions.map((label) => ({ id: `default-condition-${label}`, optionType: "condition" as const, label })),
      ]);
      return;
    }

    const mapped = (data ?? [])
      .map((row: any) => ({
        id: row.id,
        optionType: row.option_type as "status" | "condition",
        label: row.label ?? "",
      }))
      .filter((option: InventoryOption) => option.label && ["status", "condition"].includes(option.optionType));

    setInventoryOptions(
      mapped.length > 0
        ? mapped
        : [
            ...defaultStatusOptions.map((label) => ({ id: `default-status-${label}`, optionType: "status" as const, label })),
            ...defaultConditionOptions.map((label) => ({ id: `default-condition-${label}`, optionType: "condition" as const, label })),
          ]
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
        destination,
        missing_box_protectors,
        missing_pin_protectors,
        notes,
        afe,
        part_number,
        size,
        grade,
        connection,
        pipe_range,
        condition,
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
        receiving_ticket_id,
        shipping_ticket_id,
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

    const { data: releaseData, error: releaseError } = await supabase
      .from("tubular_release_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);

    if (releaseError) {
      setReleaseRequests([]);
      if (!String(releaseError.message).includes("tubular_release_requests")) {
        setMessage(`Release requests failed: ${releaseError.message}`);
      }
    } else {
      setReleaseRequests(
        (releaseData ?? []).map((row: any) => ({
          id: row.id,
          requestNumber: row.request_number ?? "",
          companyName: row.company_name ?? "",
          customerName: row.customer_name ?? "",
          customerEmail: row.customer_email ?? "",
          yardName: row.yard_name ?? "",
          rackLabel: row.rack_label ?? "",
          quantityJoints: Number(row.quantity_joints ?? 0),
          releaseDate: formatDate(row.release_date ?? ""),
          releasedTo: row.released_to ?? "",
          shipDate: formatDate(row.ship_date ?? ""),
          carrier: row.carrier ?? "",
          destination: row.destination ?? "",
          partSummary: row.part_summary ?? "",
          partLines: Array.isArray(row.part_lines) ? row.part_lines : [],
          status: row.status ?? "Submitted",
          notes: row.notes ?? "",
          signatureName: row.signature_name ?? "",
          createdAt: formatDate(row.created_at),
        }))
      );
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
          destination: row.destination ?? "",
          afe: row.afe ?? "",
          partNumber: row.part_number ?? "",
          size: row.size ?? "",
          grade: row.grade ?? "",
          connection: row.connection ?? "",
          pipeRange: normalizePipeRange(row.pipe_range),
          condition: row.condition ?? "New",
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
        const storedFootage = row.footage === null || row.footage === undefined ? NaN : Number(row.footage);

        return {
          id: row.id,
          ticketId: row.ticket_id ?? row.shipping_ticket_id ?? row.receiving_ticket_id ?? "",
          receivingTicketId: row.receiving_ticket_id ?? "",
          shippingTicketId: row.shipping_ticket_id ?? "",
          company: company?.name ?? "Unknown",
          afe: row.afe ?? "",
          partNumber: row.part_number ?? "",
          pipeRange,
          condition: row.condition ?? "",
          joints,
          footage: Number.isFinite(storedFootage) ? storedFootage : calculateRangeFootage(joints, pipeRange),
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

  function startTicketCountEdit(ticketId: string, lines: TicketLine[]) {
    const nextDrafts: Record<string, { joints: string; footage: string }> = {};

    lines.forEach((line) => {
      nextDrafts[line.id] = {
        joints: String(line.joints),
        footage: String(line.footage),
      };
    });

    setEditingTicketCountId(ticketId);
    setTicketCountDrafts(nextDrafts);
    setMessage("");
  }

  function cancelTicketCountEdit() {
    setEditingTicketCountId("");
    setTicketCountDrafts({});
  }

  function updateTicketCountDraft(line: TicketLine, field: "joints" | "footage", value: string) {
    setTicketCountDrafts((current) => {
      const existing = current[line.id] ?? {
        joints: String(line.joints),
        footage: String(line.footage),
      };

      if (field === "joints") {
        const joints = Math.max(0, Math.trunc(Number(value || 0)));

        return {
          ...current,
          [line.id]: {
            joints: value,
            footage: String(calculateRangeFootage(joints, line.pipeRange)),
          },
        };
      }

      return {
        ...current,
        [line.id]: {
          ...existing,
          footage: value,
        },
      };
    });
  }

  async function saveTicketCountEdits(ticketId: string, lines: TicketLine[]) {
    if (isReadOnlyRole) {
      setMessage("This role can view and print tickets, but cannot change ticket counts.");
      return;
    }

    if (lines.length === 0) {
      setMessage("This ticket has no line items to edit.");
      return;
    }

    let updates: { id: string; joints: number; footage: number }[] = [];

    try {
      updates = lines.map((line) => {
        const draft = ticketCountDrafts[line.id] ?? {
          joints: String(line.joints),
          footage: String(line.footage),
        };
        const joints = Math.trunc(Number(draft.joints || 0));
        const footage = Number(draft.footage || 0);

        if (!Number.isFinite(joints) || joints < 0 || !Number.isFinite(footage) || footage < 0) {
          throw new Error("Counts must be zero or greater.");
        }

        return {
          id: line.id,
          joints,
          footage,
        };
      });
    } catch (error: any) {
      setMessage(`Ticket count update failed: ${error.message}`);
      return;
    }

    setSavingTicketCounts(true);
    setMessage("");

    try {
      for (const update of updates) {
        const { error } = await supabase
          .from("ticket_line_items")
          .update({
            joints: update.joints,
            footage: update.footage,
          })
          .eq("id", update.id);

        if (error) throw error;
      }

      setTicketLines((current) =>
        current.map((line) => {
          const updated = updates.find((item) => item.id === line.id);
          return updated ? { ...line, joints: updated.joints, footage: updated.footage } : line;
        })
      );
      cancelTicketCountEdit();
      await loadTickets();
      setMessage("Ticket counts updated.");
    } catch (error: any) {
      setMessage(`Ticket count update failed: ${error.message}`);
    } finally {
      setSavingTicketCounts(false);
    }
  }

  function renderTicketCountEditor(ticketId: string, lines: TicketLine[]) {
    const isEditing = editingTicketCountId === ticketId;

    if (lines.length === 0) {
      return (
        <div className="ticket-line-list">
          <span>No line items are linked to this ticket.</span>
        </div>
      );
    }

    return (
      <div className="ticket-line-list ticket-count-list">
        {lines.map((line) => {
          const draft = ticketCountDrafts[line.id] ?? {
            joints: String(line.joints),
            footage: String(line.footage),
          };

          return (
            <div key={line.id} className="ticket-count-row">
              <div>
                <strong>{line.partNumber || "Line item"}</strong>
                <span>{line.afe ? `TU# ${line.afe} / ` : ""}{line.pipeRange} / {line.condition || "No condition"}</span>
              </div>

              {isEditing ? (
                <div className="ticket-count-fields">
                  <label>
                    Joints
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={draft.joints}
                      onChange={(event) => updateTicketCountDraft(line, "joints", event.target.value)}
                    />
                  </label>
                  <label>
                    Footage
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={draft.footage}
                      onChange={(event) => updateTicketCountDraft(line, "footage", event.target.value)}
                    />
                  </label>
                </div>
              ) : (
                <div>
                  <span>{line.joints} joints</span>
                  <span>{line.footage.toLocaleString()} ft</span>
                </div>
              )}
            </div>
          );
        })}

        {!isReadOnlyRole && (
          <div className="ticket-count-actions">
            {isEditing ? (
              <>
                <button className="button" onClick={cancelTicketCountEdit} disabled={savingTicketCounts}>
                  Cancel
                </button>
                <button className="button primary" onClick={() => saveTicketCountEdits(ticketId, lines)} disabled={savingTicketCounts}>
                  {savingTicketCounts ? "Saving..." : "Save Counts"}
                </button>
              </>
            ) : (
              <button className="button primary" onClick={() => startTicketCountEdit(ticketId, lines)}>
                Edit Ticket Counts
              </button>
            )}
          </div>
        )}
      </div>
    );
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

    const params = new URLSearchParams(window.location.search);
    if (params.get("open") === "reports") {
      openReports();
    }
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

  const activeCustomerSearch = customerFilter === "all" ? "" : customerFilter.trim();

  const rackInventoryMap = useMemo(() => {
    const map = new Map<string, InventoryRow[]>();

    for (const row of inventory) {
      if (row.locationType !== "rack" || !row.rackId) continue;
      const current = map.get(row.rackId) ?? [];
      current.push(row);
      map.set(row.rackId, current);
    }

    return map;
  }, [inventory]);

  const yardCustomerFilterStatus = useMemo(() => {
    if (!activeCustomerSearch) return "All customers shown";

    let matchingRacks = 0;
    let matchingJoints = 0;

    for (const rows of rackInventoryMap.values()) {
      const matchingRows = rows.filter((row) => customerMatchesTerm(row.company, activeCustomerSearch));
      if (matchingRows.length === 0) continue;
      matchingRacks += 1;
      matchingJoints += matchingRows.reduce((sum, row) => sum + row.joints, 0);
    }

    return `${matchingRacks.toLocaleString()} rack${matchingRacks === 1 ? "" : "s"} / ${matchingJoints.toLocaleString()} joints match ${activeCustomerSearch}`;
  }, [activeCustomerSearch, rackInventoryMap]);

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
    return Array.from(new Set([
      ...inventoryOptions.filter((option) => option.optionType === "status").map((option) => option.label),
      ...inventory.map((row) => row.status),
    ].filter(Boolean))).sort();
  }, [inventory, inventoryOptions]);

  const conditionOptions = useMemo(() => {
    return Array.from(new Set([
      ...inventoryOptions.filter((option) => option.optionType === "condition").map((option) => option.label),
      ...inventory.map((row) => row.condition),
    ].filter(Boolean))).sort();
  }, [inventory, inventoryOptions]);

  function rowMatchesQuickFilters(row: InventoryRow) {
    const matchesCustomer = customerFilter === "all" || normalizeFilter(row.company).includes(normalizeFilter(customerFilter));
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
          row.operator,
          row.rig,
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

  const inventoryRegisterRows = useMemo(() => {
    const searchText = search.toLowerCase().trim();

    return inventory.filter((row) => {
      const matchesScope =
        inventoryRegisterScope === "all" ||
        (row.locationType === "zone" && row.zoneId === inventoryRegisterScope);
      const matchesCustomer = customerFilter === "all" || normalizeFilter(row.company).includes(normalizeFilter(customerFilter));
      const matchesStatus = statusFilter === "all" || normalizeFilter(row.status) === normalizeFilter(statusFilter);
      const matchesCondition = conditionFilter === "all" || normalizeFilter(row.condition) === normalizeFilter(conditionFilter);
      const matchesSearch =
        !searchText ||
        [
          row.company,
          row.operator,
          row.rig,
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

      return matchesScope && matchesCustomer && matchesStatus && matchesCondition && matchesSearch;
    });
  }, [conditionFilter, customerFilter, inventory, inventoryRegisterScope, search, statusFilter]);

  const inventoryRegisterTotals = useMemo(() => {
    return inventoryRegisterRows.reduce(
      (totals, row) => ({
        lines: totals.lines + 1,
        joints: totals.joints + row.joints,
        footage: totals.footage + row.footage,
      }),
      { lines: 0, joints: 0, footage: 0 }
    );
  }, [inventoryRegisterRows]);

  const inventoryRegisterZone = useMemo(() => {
    return zones.find((zone) => zone.code === inventoryRegisterScope) ?? null;
  }, [inventoryRegisterScope, zones]);

  const inventoryRegisterTitle =
    inventoryRegisterScope === "all" ? "All Tubulars" : (inventoryRegisterZone?.name ?? "Work Zone Inventory");

  const selectedTotals = useMemo(() => {
    return selectedShipRows.reduce(
      (totals, row) => ({
        joints: totals.joints + row.joints,
        footage: totals.footage + row.footage,
      }),
      { joints: 0, footage: 0 }
    );
  }, [selectedShipRows]);

  const pendingShipLines = useMemo(() => {
    return selectedShipRows.map((row) => {
      const requestedJoints = Math.max(0, Number(shipQuantities[row.id] ?? row.joints));
      const joints = Math.min(row.joints, requestedJoints);
      const footage = calculateRangeFootage(joints, row.pipeRange);

      return { row, joints, footage, requestedJoints };
    });
  }, [selectedShipRows, shipQuantities]);

  const pendingShipTotals = useMemo(() => {
    return pendingShipLines.reduce(
      (totals, line) => ({
        joints: totals.joints + line.joints,
        footage: totals.footage + line.footage,
      }),
      { joints: 0, footage: 0 }
    );
  }, [pendingShipLines]);

  function toggleRow(id: string) {
    setSelectedRows((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
    );
  }

  function setShipLineQuantity(rowId: string, value: string) {
    setShipQuantities((current) => ({
      ...current,
      [rowId]: value,
    }));
  }

  function addReceiveTruckLine() {
    setReceiveTruckLines((current) => [
      ...current,
      {
        ...emptyReceiveTruckLine,
        id: crypto.randomUUID(),
        carrier: receiveForm.carrier,
        poNumber: receiveForm.poNumber,
        truckNumber: "",
        joints: "",
        missingBoxProtectors: receiveForm.missingBoxProtectors || "0",
        missingPinProtectors: receiveForm.missingPinProtectors || "0",
      },
    ]);
  }

  function updateReceiveTruckLine(id: string, updates: Partial<ReceiveTruckLine>) {
    setReceiveTruckLines((current) =>
      current.map((line) => (line.id === id ? { ...line, ...updates } : line))
    );
  }

  function removeReceiveTruckLine(id: string) {
    setReceiveTruckLines((current) => current.filter((line) => line.id !== id));
  }

  function closeReceivePanel() {
    setReceiveOpen(false);
    setActiveReceiveTicketId("");
    setActiveReceiveTicketNumber("");
    setReceiveTruckLines([]);
    setReceiveFiles([]);
  }

  function openNewReceive() {
    setMessage("");
    setActiveReceiveTicketId("");
    setActiveReceiveTicketNumber("");
    setReceiveForm(emptyReceiveForm);
    setReceiveTruckLines([]);
    setReceiveFiles([]);
    setReceiveOpen(true);
  }

  function appendUniqueValues(existing: string, incoming: string) {
    return Array.from(
      new Set(
        [existing, incoming]
          .flatMap((value) => value.split(","))
          .map((value) => value.trim())
          .filter(Boolean)
      )
    ).join(", ");
  }

  function cleanInventoryValue(value: string | null | undefined) {
    const cleaned = (value || "").trim();
    return cleaned || null;
  }

  function sameInventoryBucket(left: InventoryRow, right: InventoryRow) {
    return (
      left.companyId === right.companyId &&
      left.yardId === right.yardId &&
      left.locationType === right.locationType &&
      left.rackDbId === right.rackDbId &&
      left.zoneDbId === right.zoneDbId &&
      (left.afe || "") === (right.afe || "") &&
      (left.operator || "") === (right.operator || "") &&
      (left.rig || "") === (right.rig || "") &&
      left.partNumber === right.partNumber &&
      (left.size || "") === (right.size || "") &&
      (left.grade || "") === (right.grade || "") &&
      (left.connection || "") === (right.connection || "") &&
      left.pipeRange === right.pipeRange &&
      (left.condition || "") === (right.condition || "") &&
      (left.status || "") === (right.status || "")
    );
  }

  async function findMatchingInventoryLine(options: {
    companyId: string | null;
    yardId: string;
    rackId?: string | null;
    zoneId?: string | null;
    excludeId?: string;
    afe?: string | null;
    operator?: string | null;
    rig?: string | null;
    partNumber: string;
    size?: string | null;
    grade?: string | null;
    connection?: string | null;
    pipeRange: PipeRange;
    condition?: string | null;
    status?: string | null;
  }) {
    if (!options.companyId) return null;

    const nullableFilter = (query: any, column: string, value: string | null | undefined) => {
      const cleaned = cleanInventoryValue(value);
      return cleaned ? query.eq(column, cleaned) : query.is(column, null);
    };

    let query: any = supabase
      .from("pipe_inventory")
      .select("id, bulk_joints, bulk_footage")
      .eq("company_id", options.companyId)
      .eq("yard_id", options.yardId)
      .eq("part_number", options.partNumber)
      .eq("pipe_range", options.pipeRange)
      .gt("bulk_joints", 0)
      .order("created_at", { ascending: true })
      .limit(1);

    if (options.excludeId) {
      query = query.neq("id", options.excludeId);
    }

    query = nullableFilter(query, "afe", options.afe);
    query = nullableFilter(query, "operator", options.operator);
    query = nullableFilter(query, "rig", options.rig);
    query = nullableFilter(query, "size", options.size);
    query = nullableFilter(query, "grade", options.grade);
    query = nullableFilter(query, "connection", options.connection);
    query = nullableFilter(query, "condition", options.condition);
    query = nullableFilter(query, "status", options.status);

    if (options.rackId) {
      query = query.eq("rack_id", options.rackId).is("workflow_zone_id", null);
    } else if (options.zoneId) {
      query = query.eq("workflow_zone_id", options.zoneId).is("rack_id", null);
    } else {
      query = query.is("rack_id", null).is("workflow_zone_id", null);
    }

    const { data, error } = await query;
    if (error) throw error;
    return Array.isArray(data) ? data[0] ?? null : null;
  }

  async function addToInventoryLine(options: {
    companyId: string | null;
    yardId: string;
    rackId?: string | null;
    zoneId?: string | null;
    excludeId?: string;
    afe?: string | null;
    operator?: string | null;
    rig?: string | null;
    partNumber: string;
    size?: string | null;
    grade?: string | null;
    connection?: string | null;
    pipeRange: PipeRange;
    condition?: string | null;
    status?: string | null;
    inspectionDue?: string | null;
    joints: number;
    footage: number;
  }) {
    const existingLine = await findMatchingInventoryLine(options);

    if (existingLine?.id) {
      const nextJoints = Number(existingLine.bulk_joints || 0) + options.joints;
      const nextFootage = calculateRangeFootage(nextJoints, options.pipeRange);
      const { error } = await supabase
        .from("pipe_inventory")
        .update({
          bulk_joints: nextJoints,
          bulk_footage: nextFootage,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingLine.id);

      if (error) throw error;
      return existingLine.id as string;
    }

    const { data, error } = await supabase
      .from("pipe_inventory")
      .insert({
        company_id: options.companyId,
        yard_id: options.yardId,
        rack_id: options.rackId ?? null,
        workflow_zone_id: options.zoneId ?? null,
        afe: cleanInventoryValue(options.afe),
        operator: cleanInventoryValue(options.operator),
        rig: cleanInventoryValue(options.rig),
        part_number: options.partNumber,
        size: cleanInventoryValue(options.size),
        grade: cleanInventoryValue(options.grade),
        connection: cleanInventoryValue(options.connection),
        pipe_range: options.pipeRange,
        condition: cleanInventoryValue(options.condition),
        status: cleanInventoryValue(options.status),
        inspection_color: "None",
        inspection_due_date: options.inspectionDue || null,
        bulk_joints: options.joints,
        bulk_footage: options.footage,
        tallied_joints: 0,
        tallied_footage: 0,
      })
      .select("id")
      .single();

    if (error) throw error;
    if (!data?.id) throw new Error("Inventory was saved but did not return an inventory id.");
    return data.id as string;
  }

  async function retireInventoryLine(rowId: string) {
    const { error } = await supabase
      .from("pipe_inventory")
      .update({
        status: "Removed",
        bulk_joints: 0,
        bulk_footage: 0,
        tallied_joints: 0,
        tallied_footage: 0,
        updated_at: new Date().toISOString(),
      })
      .eq("id", rowId);

    if (error) throw error;
  }

  function destinationValueFromName(name: string) {
    const rack = rackLayout.find((item) => item.label === name);
    if (rack) return `rack:${rack.label}`;

    const zone = zones.find((item) => item.name === name || item.code === name);
    if (zone) return `zone:${zone.code}`;

    return emptyReceiveForm.destination;
  }

  function openReceiveForTicket(ticket: ReceivingTicket) {
    if (isReadOnlyRole) {
      setMessage("Sales and customer users can view and print, but cannot receive inventory.");
      return;
    }

    const firstLine = ticketLines.find((line) => line.receivingTicketId === ticket.id);

    setMessage("");
    setActiveReceiveTicketId(ticket.id);
    setActiveReceiveTicketNumber(ticket.ticketNumber);
    setReceiveForm({
      ...emptyReceiveForm,
      carrier: ticket.carrier,
      poNumber: ticket.poNumber,
      truckNumber: "",
      customer: ticket.company,
      destination: destinationValueFromName(ticket.destination),
      afe: ticket.afe || firstLine?.afe || "",
      partNumber: ticket.partNumber || firstLine?.partNumber || "",
      size: ticket.size,
      grade: ticket.grade,
      connection: ticket.connection,
      pipeRange: ticket.pipeRange || firstLine?.pipeRange || "Range 2",
      condition: ticket.condition || firstLine?.condition || "New",
      status: "Received",
      joints: "",
      missingBoxProtectors: "0",
      missingPinProtectors: "0",
      notes: ticket.notes,
    });
    setReceiveTruckLines([
      {
        ...emptyReceiveTruckLine,
        id: crypto.randomUUID(),
        carrier: ticket.carrier,
        poNumber: ticket.poNumber,
      },
    ]);
    setReceiveFiles([]);
    setTicketsOpen(false);
    setReceiveOpen(true);
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
    setShipQuantities(Object.fromEntries(selectedShipRows.map((row) => [row.id, String(row.joints)])));
    setShipOpen(true);
  }

  function buildEditForm(row: InventoryRow): EditForm {
    const destination =
      row.locationType === "rack" && row.rackId
        ? `rack:${row.rackId}`
        : `zone:${row.zoneId ?? "receiving"}`;

    return {
      customer: row.company,
      operator: row.operator,
      rig: row.rig,
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
    setShipQuantities({ [row.id]: String(row.joints) });
    setShipOpen(true);
  }

  function getRackRows(label: string) {
    return inventory.filter((row) => row.locationType === "rack" && row.rackId === label);
  }

  function openRackReceive(label: string) {
    if (isReadOnlyRole) {
      setMessage("Sales and customer users can view and print, but cannot receive inventory.");
      return;
    }

    setMessage("");
    setSelectedRows([]);
    setActiveReceiveTicketId("");
    setActiveReceiveTicketNumber("");
    setReceiveTruckLines([]);
    setReceiveFiles([]);
    setReceiveForm({ ...emptyReceiveForm, destination: `rack:${label}` });
    setRackDetailOpen(false);
    setReceiveOpen(true);
  }

  function openRackInitialInventory(label: string) {
    if (isReadOnlyRole) {
      setMessage("Sales and customer users can view and print, but cannot add inventory.");
      return;
    }

    setMessage("");
    setSelectedRows([]);
    setReceiveForm({
      ...emptyReceiveForm,
      destination: `rack:${label}`,
      status: "Available",
      condition: "Used",
      notes: "Initial inventory entry",
    });
    setRackDetailOpen(false);
    setInitialInventoryOpen(true);
  }

  async function openRackShip(label: string) {
    if (isReadOnlyRole) {
      setMessage("Sales and customer users can view and print, but cannot ship inventory.");
      return;
    }

    const rows = getRackRows(label);
    if (rows.length === 0) {
      setMessage(`Rack ${label} has no pipe to ship.`);
      return;
    }

    const customerNames = Array.from(new Set(rows.map((row) => row.company).filter(Boolean)));
    if (customerNames.length > 1) {
      setSelectedRows([]);
      setMessage(`Rack ${label} has multiple customers. Select one customer's line items below, then Ship.`);
      return;
    }

    setMessage("");
    setSelectedRows(rows.map((row) => row.id));
    setShipForm({
      ...emptyShipForm,
      shipTo: rows[0]?.company ?? "",
      bolNumber: await makeTicketNumber("BOL", "bol"),
    });
    setShipQuantities(Object.fromEntries(rows.map((row) => [row.id, String(row.joints)])));
    setShipFiles([]);
    setRackDetailOpen(false);
    setShipOpen(true);
  }

  function openRackTransfer(label: string) {
    if (isReadOnlyRole) {
      setMessage("Sales and customer users can view and print, but cannot transfer inventory.");
      return;
    }

    const rows = getRackRows(label);
    if (rows.length === 0) {
      setMessage(`Rack ${label} has no pipe to transfer.`);
      return;
    }

    if (rows.length > 1) {
      setSelectedRows([]);
      setMessage(`Rack ${label} has ${rows.length} inventory lines. Select one line below, then Transfer.`);
      return;
    }

    quickTransfer(rows[0]);
    setRackDetailOpen(false);
  }

  function quickAdjust(row: InventoryRow) {
    if (isReadOnlyRole) return;
    setMessage("");
    setSelectedRows([row.id]);
    setEditForm(buildEditForm(row));
    setEditOpen(true);
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

  function moveRackOnMap(event: any) {
    if (!layoutMode || !draggedRack) return;

    event.preventDefault();

    const bounds = event.currentTarget.getBoundingClientRect();
    const rack = rackLayout.find((item) => item.label === draggedRack);
    const rackWidth = rack?.layoutWidth ?? rackTileSize.width;
    const rackHeight = rack?.layoutHeight ?? rackTileSize.height;
    const maxX = Math.max(0, Math.round(bounds.width - rackWidth - 4));
    const maxY = Math.max(0, Math.round(bounds.height - rackHeight - 4));
    const x = Math.round(event.clientX - bounds.left - rackWidth / 2);
    const y = Math.round(event.clientY - bounds.top - rackHeight / 2);

    moveRackToPosition(draggedRack, x, y, maxX, maxY);

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
        layout_x: snapRackPosition(rack.layoutX, rack.layoutY).x,
        layout_y: snapRackPosition(rack.layoutX, rack.layoutY).y,
        layout_width: rack.layoutWidth,
        layout_height: rack.layoutHeight,
        layout_group: rack.enabled === false ? `disabled:${rack.layoutGroup}` : rack.layoutGroup,
        rotation: rack.rotation,
        is_active: rack.enabled !== false,
      }));

      let { error } = await supabase
        .from("racks")
        .upsert(rows, { onConflict: "yard_id,rack_code" });

      if (error && String(error.message ?? "").includes("layout_")) {
        const fallbackRows = rows.map(({ layout_width, layout_height, ...row }) => row);
        const fallbackResult = await supabase
          .from("racks")
          .upsert(fallbackRows, { onConflict: "yard_id,rack_code" });
        error = fallbackResult.error;
      }

      if (error) throw error;

      await loadYardSetup();
      setLayoutMode(false);
      setMessage("Yard rack layout saved.");
    } catch (error: any) {
      setMessage(`Layout save failed: ${error.message}`);
    }
  }
  function renameRack(label: string) {
    const nextLabel = normalizeRackCode(window.prompt("New rack label", label) ?? "");

    if (!nextLabel || nextLabel === label) return;

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

  function moveRackToPosition(label: string, nextX: number, nextY: number, maxX?: number, maxY?: number) {
    const nextPosition = snapRackPosition(nextX, nextY, maxX, maxY);

    setRackLayout((current) => {
      if (!current.some((rack) => rack.label === label)) return current;

      return current.map((rack) =>
        rack.label === label
          ? {
              ...rack,
              layoutX: nextPosition.x,
              layoutY: nextPosition.y,
            }
          : rack
      );
    });
  }

  function nudgeRack(label: string, columnDelta: number, rowDelta: number) {
    const rack = rackLayout.find((item) => item.label === label);
    if (!rack) return;

    moveRackToPosition(
      label,
      rack.layoutX + columnDelta * rackFreeMoveStep,
      rack.layoutY + rowDelta * rackFreeMoveStep
    );
  }

  function rotateRack(label: string) {
    setRackLayout((current) =>
      current.map((rack) =>
        rack.label === label ? { ...rack, rotation: rack.rotation === 90 ? 0 : 90 } : rack
      )
    );

    setMessage(`Rack ${label} orientation changed. Click Save Layout when you are done.`);
  }

  function resizeRackTile(label: string, width: number, height: number) {
    const nextWidth = Math.max(34, Math.min(220, Math.round(width / 2) * 2));
    const nextHeight = Math.max(26, Math.min(160, Math.round(height / 2) * 2));

    setRackLayout((current) =>
      current.map((rack) =>
        rack.label === label
          ? {
              ...rack,
              layoutWidth: nextWidth,
              layoutHeight: nextHeight,
            }
          : rack
      )
    );
  }

  function startRackResize(event: any, label: string) {
    if (!layoutMode) return;

    event.preventDefault();
    event.stopPropagation();

    const rack = rackLayout.find((item) => item.label === label);
    const point = event.touches ? event.touches[0] : event;
    if (!rack || !point) return;

    const startX = point.clientX;
    const startY = point.clientY;
    const startWidth = rack.layoutWidth ?? rackTileSize.width;
    const startHeight = rack.layoutHeight ?? rackTileSize.height;

    const handleMove = (moveEvent: any) => {
      const movePoint = moveEvent.touches ? moveEvent.touches[0] : moveEvent;
      if (!movePoint) return;

      moveEvent.preventDefault();
      resizeRackTile(label, startWidth + movePoint.clientX - startX, startHeight + movePoint.clientY - startY);
    };

    const stopResize = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", stopResize);
      window.removeEventListener("touchmove", handleMove);
      window.removeEventListener("touchend", stopResize);
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", stopResize);
    window.addEventListener("touchmove", handleMove, { passive: false });
    window.addEventListener("touchend", stopResize);
  }

  function openRackDetail(label: string) {
    setSelectedLocation(label);
    setSelectedRows([]);
    setInventoryRegisterOpen(false);
    setRackDetailOpen(true);
  }

  function closeRackDetail() {
    setRackDetailOpen(false);
  }

  function openInventoryRegister(scope = "all") {
    setInventoryRegisterScope(scope);
    setSelectedLocation(scope === "all" ? "all" : scope);
    setSelectedRows([]);
    setRackDetailOpen(false);
    setZoneDetailOpen(false);
    setInventoryRegisterOpen(true);
  }

  function closeInventoryRegister() {
    setInventoryRegisterOpen(false);
    setSelectedRows([]);
  }

  function openZoneDetail(zone: ZoneConfig) {
    setSelectedLocation(zone.code);
    setSelectedRows([]);
    setSelectedZoneDetailCode(zone.code);
    setInventoryRegisterOpen(false);
    setZoneDetailOpen(true);
    setRackDetailOpen(false);
  }

  function closeZoneDetail() {
    setZoneDetailOpen(false);
    setSelectedRows([]);
  }

  function openZoneReceive(zone: ZoneConfig) {
    setMessage("");
    setActiveReceiveTicketId("");
    setActiveReceiveTicketNumber("");
    setReceiveForm({
      ...emptyReceiveForm,
      destination: `zone:${zone.code}`,
    });
    setReceiveTruckLines([]);
    setReceiveFiles([]);
    setZoneDetailOpen(false);
    setReceiveOpen(true);
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

    if (selectedLayoutRackLabel === label) {
      setSelectedLayoutRackLabel("A1");
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

      if (newTotalJoints === 0) {
        await retireInventoryLine(selectedEditRow.id);
      } else {
        const { error: updateError } = await supabase
          .from("pipe_inventory")
          .update({
            company_id: companyId,
            rack_id: rack?.id ?? null,
            workflow_zone_id: zone?.id ?? null,
            afe: editForm.afe || null,
            operator: editForm.operator || null,
            rig: editForm.rig || null,
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
      }

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
      setMessage(newTotalJoints === 0 ? "Inventory line removed because its count is zero." : "Inventory line updated.");
    } catch (error: any) {
      setMessage(`Edit failed: ${error.message}`);
    } finally {
      setSavingEdit(false);
    }
  }

  async function combineSelectedInventoryLines() {
    if (!selectedYard) return;

    setMessage("");
    if (isReadOnlyRole) {
      setMessage("Sales and customer users can view and print, but cannot combine inventory.");
      return;
    }

    if (selectedInventoryRows.length < 2) {
      setMessage("Select two or more matching inventory lines before combining.");
      return;
    }

    const target = selectedInventoryRows[0];
    const mismatched = selectedInventoryRows.some((row) => !sameInventoryBucket(target, row));

    if (mismatched) {
      setMessage("Only matching lines in the same rack/location can be combined. Customer, TU#, part, range, condition, and status must match.");
      return;
    }

    const totalJoints = selectedInventoryRows.reduce((sum, row) => sum + row.joints, 0);
    const totalFootage = calculateRangeFootage(totalJoints, target.pipeRange);

    if (totalJoints <= 0) {
      setMessage("Selected lines do not have inventory to combine.");
      return;
    }

    try {
      const { error: updateError } = await supabase
        .from("pipe_inventory")
        .update({
          bulk_joints: totalJoints,
          bulk_footage: totalFootage,
          tallied_joints: 0,
          tallied_footage: 0,
          updated_at: new Date().toISOString(),
        })
        .eq("id", target.id);

      if (updateError) throw updateError;

      for (const row of selectedInventoryRows.slice(1)) {
        await retireInventoryLine(row.id);
      }

      await supabase.from("pipe_transactions").insert({
        pipe_inventory_id: target.id,
        company_id: target.companyId,
        yard_id: selectedYard.id,
        transaction_type: "combine_inventory",
        quantity_joints: totalJoints,
        quantity_footage: totalFootage,
        from_location: target.rackId ?? target.zoneId,
        to_location: target.rackId ?? target.zoneId,
        comment: `Combined ${selectedInventoryRows.length} matching inventory lines into one rack/location line.`,
      });

      await loadInventory(selectedYard.id, rackLayout, zones);
      await loadReports();
      setSelectedRows([target.id]);
      setMessage(`Combined ${selectedInventoryRows.length} matching inventory lines.`);
    } catch (error: any) {
      setMessage(`Combine failed: ${error.message}`);
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

    const truckLines =
      receiveTruckLines.length > 0
        ? receiveTruckLines
        : [
            {
              ...emptyReceiveTruckLine,
              id: "primary",
              carrier: receiveForm.carrier,
              poNumber: receiveForm.poNumber,
              truckNumber: receiveForm.truckNumber,
              joints: receiveForm.joints,
              missingBoxProtectors: receiveForm.missingBoxProtectors,
              missingPinProtectors: receiveForm.missingPinProtectors,
            },
          ];

    const cleanTruckLines = truckLines.map((line, index) => {
      const joints = Number(line.joints || 0);
      const pipeRange = receiveForm.pipeRange;

      return {
        ...line,
        carrier: (line.carrier || receiveForm.carrier).trim(),
        poNumber: (line.poNumber || receiveForm.poNumber).trim(),
        truckNumber: (line.truckNumber || receiveForm.truckNumber).trim(),
        joints,
        footage: calculateRangeFootage(joints, pipeRange),
        missingBoxProtectors: Math.max(0, Number(line.missingBoxProtectors || 0)),
        missingPinProtectors: Math.max(0, Number(line.missingPinProtectors || 0)),
        label: `Truck ${index + 1}`,
      };
    });

    if (cleanTruckLines.some((line) => line.joints <= 0)) {
      setMessage("Each receiving truck line must have joints before saving.");
      return;
    }

    const totalJoints = cleanTruckLines.reduce((sum, line) => sum + line.joints, 0);
    const totalFootage = cleanTruckLines.reduce((sum, line) => sum + line.footage, 0);
    const missingBoxProtectors = cleanTruckLines.reduce((sum, line) => sum + line.missingBoxProtectors, 0);
    const missingPinProtectors = cleanTruckLines.reduce((sum, line) => sum + line.missingPinProtectors, 0);
    const carrierSummary = Array.from(new Set(cleanTruckLines.map((line) => line.carrier).filter(Boolean))).join(", ");
    const poSummary = Array.from(new Set(cleanTruckLines.map((line) => line.poNumber).filter(Boolean))).join(", ");
    const truckSummary = Array.from(new Set(cleanTruckLines.map((line) => line.truckNumber).filter(Boolean))).join(", ");
  
    setSavingReceive(true);
  
    try {
      const companyId = await findOrCreateCompany(receiveForm.customer);
      const { rack, zone } = getDestination(receiveForm.destination);
      const destinationName = rack?.label ?? zone?.name ?? receiveForm.destination;
      let receivingTicketId = activeReceiveTicketId;
      let ticketNumber = activeReceiveTicketNumber;

      if (activeReceiveTicketId) {
        const { data: existingTicket, error: existingTicketError } = await supabase
          .from("receiving_tickets")
          .select("ticket_number, carrier, po_number, truck_number, missing_box_protectors, missing_pin_protectors, joints, footage, notes")
          .eq("id", activeReceiveTicketId)
          .single();

        if (existingTicketError) throw existingTicketError;

        ticketNumber = existingTicket?.ticket_number || activeReceiveTicketNumber;

        const { error: updateTicketError } = await supabase
          .from("receiving_tickets")
          .update({
            carrier: appendUniqueValues(existingTicket?.carrier ?? "", carrierSummary) || null,
            po_number: appendUniqueValues(existingTicket?.po_number ?? "", poSummary) || null,
            truck_number: appendUniqueValues(existingTicket?.truck_number ?? "", truckSummary) || null,
            destination: destinationName,
            missing_box_protectors: Number(existingTicket?.missing_box_protectors ?? 0) + missingBoxProtectors,
            missing_pin_protectors: Number(existingTicket?.missing_pin_protectors ?? 0) + missingPinProtectors,
            pathfinder_name: receiveForm.pathfinderName || null,
            pathfinder_signature: receiveForm.pathfinderSignature || null,
            carrier_name: receiveForm.carrierName || null,
            carrier_signature: receiveForm.carrierSignature || null,
            notes: receiveForm.notes || existingTicket?.notes || null,
            afe: receiveForm.afe || null,
            part_number: receiveForm.partNumber,
            size: receiveForm.size || null,
            grade: receiveForm.grade || null,
            connection: receiveForm.connection || null,
            pipe_range: receiveForm.pipeRange,
            condition: receiveForm.condition || "New",
            joints: Number(existingTicket?.joints ?? 0) + totalJoints,
            footage: Number(existingTicket?.footage ?? 0) + totalFootage,
          })
          .eq("id", activeReceiveTicketId);

        if (updateTicketError) throw updateTicketError;
      } else {
        ticketNumber = await makeTicketNumber("REC", "receiving");

        const { data: receivingTicket, error: ticketError } = await supabase
          .from("receiving_tickets")
          .insert({
            company_id: companyId,
            yard_id: selectedYard.id,
            ticket_number: ticketNumber,
            carrier: carrierSummary || null,
            po_number: poSummary || null,
            truck_number: truckSummary || null,
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
            joints: totalJoints,
            footage: totalFootage,
          })
          .select("id")
          .single();

        if (ticketError) throw ticketError;
        if (!receivingTicket?.id) throw new Error("Receiving ticket was saved but did not return a ticket id.");
        receivingTicketId = receivingTicket.id;
      }

      if (!receivingTicketId) throw new Error("Receiving ticket id is missing.");

      const createdInventoryIds: string[] = [];
      const ticketLineItems = [];

      for (const line of cleanTruckLines) {
        const savedInventoryLineId = await addToInventoryLine({
          companyId,
          yardId: selectedYard.id,
          rackId: rack?.id ?? null,
          zoneId: zone?.id ?? null,
          afe: receiveForm.afe,
          operator: receiveForm.operator,
          rig: receiveForm.rig,
          partNumber: receiveForm.partNumber,
          size: receiveForm.size,
          grade: receiveForm.grade,
          connection: receiveForm.connection,
          pipeRange: receiveForm.pipeRange,
          condition: receiveForm.condition || "New",
          status: receiveForm.status || "Received",
          inspectionDue: receiveForm.inspectionDue || null,
          joints: line.joints,
          footage: line.footage,
        });

        createdInventoryIds.push(savedInventoryLineId);

        ticketLineItems.push({
          receiving_ticket_id: receivingTicketId,
          pipe_inventory_id: savedInventoryLineId,
          company_id: companyId,
          part_number: receiveForm.partNumber,
          afe: receiveForm.afe || null,
          size: receiveForm.size || null,
          grade: receiveForm.grade || null,
          connection: receiveForm.connection || null,
          pipe_range: receiveForm.pipeRange,
          condition: receiveForm.condition || "New",
          joints: line.joints,
          footage: line.footage,
        });

        await supabase.from("pipe_transactions").insert({
          pipe_inventory_id: savedInventoryLineId,
          company_id: companyId,
          yard_id: selectedYard.id,
          transaction_type: "receive",
          from_location: line.truckNumber ? `Truck ${line.truckNumber}` : null,
          to_location: destinationName,
          quantity_joints: line.joints,
          quantity_footage: line.footage,
          comment: receiveForm.notes || `Received ${line.label} on ticket ${ticketNumber}`,
        });
      }

      if (ticketLineItems.length > 0) {
        const { error: lineError } = await supabase
          .from("ticket_line_items")
          .insert(ticketLineItems);

        if (lineError) throw lineError;
      }

      await saveTicketAttachments({
        files: receiveFiles,
        companyId,
        inventoryId: createdInventoryIds[0],
        receivingTicketId,
        ticketNumber,
        folder: "receiving",
      });
  
      await loadInventory(selectedYard.id, rackLayout, zones);
      await loadTickets();
  
      setReceiveOpen(false);
      setActiveReceiveTicketId("");
      setActiveReceiveTicketNumber("");
      setReceiveForm(emptyReceiveForm);
      setReceiveTruckLines([]);
      setReceiveFiles([]);
      setMessage(`${activeReceiveTicketId ? "Truck line(s) added" : "Receiving saved"}. Ticket ${ticketNumber} with ${cleanTruckLines.length} truck line(s)${receiveFiles.length ? ` and ${receiveFiles.length} attachment(s)` : ""}`);
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

      const inventoryLineId = await addToInventoryLine({
        companyId,
        yardId: selectedYard.id,
        rackId: rack?.id ?? null,
        zoneId: zone?.id ?? null,
        afe: receiveForm.afe,
        operator: receiveForm.operator,
        rig: receiveForm.rig,
        partNumber: receiveForm.partNumber,
        size: receiveForm.size,
        grade: receiveForm.grade,
        connection: receiveForm.connection,
        pipeRange: receiveForm.pipeRange,
        condition: receiveForm.condition || "Used",
        status: receiveForm.status || "Available",
        inspectionDue: null,
        joints,
        footage,
      });

      const { error: transactionError } = await supabase.from("pipe_transactions").insert({
        pipe_inventory_id: inventoryLineId,
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
      setMessage(`Initial inventory saved to ${destinationName}. Matching rack inventory was combined automatically.`);
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
      const destinationStatus =
        zone?.code === "inspection"
          ? "Awaiting Inspection"
          : zone?.code === "hardband"
            ? "WIP"
            : zone?.code === "shipping"
              ? "Awaiting Ship"
              : selectedTransferRow.status;

      if (movingAll) {
        const matchingDestination = await findMatchingInventoryLine({
          companyId: selectedTransferRow.companyId,
          yardId: selectedYard.id,
          rackId: rack?.id ?? null,
          zoneId: zone?.id ?? null,
          excludeId: selectedTransferRow.id,
          afe: selectedTransferRow.afe,
          operator: selectedTransferRow.operator,
          rig: selectedTransferRow.rig,
          partNumber: selectedTransferRow.partNumber,
          size: selectedTransferRow.size,
          grade: selectedTransferRow.grade,
          connection: selectedTransferRow.connection,
          pipeRange: selectedTransferRow.pipeRange,
          condition: selectedTransferRow.condition,
          status: destinationStatus,
        });

        if (matchingDestination?.id) {
          await addToInventoryLine({
            companyId: selectedTransferRow.companyId,
            yardId: selectedYard.id,
            rackId: rack?.id ?? null,
            zoneId: zone?.id ?? null,
            excludeId: selectedTransferRow.id,
            afe: selectedTransferRow.afe,
            operator: selectedTransferRow.operator,
            rig: selectedTransferRow.rig,
            partNumber: selectedTransferRow.partNumber,
            size: selectedTransferRow.size,
            grade: selectedTransferRow.grade,
            connection: selectedTransferRow.connection,
            pipeRange: selectedTransferRow.pipeRange,
            condition: selectedTransferRow.condition,
            status: destinationStatus,
            inspectionDue: selectedTransferRow.inspectionDue || null,
            joints: moveJoints,
            footage: moveFootage,
          });
          await retireInventoryLine(selectedTransferRow.id);
        } else {
          const { error: moveError } = await supabase
            .from("pipe_inventory")
            .update({
              rack_id: rack?.id ?? null,
              workflow_zone_id: zone?.id ?? null,
              status: destinationStatus,
              updated_at: new Date().toISOString(),
            })
            .eq("id", selectedTransferRow.id);

          if (moveError) throw moveError;
        }
      } else {
        const remainingJoints = selectedTransferRow.joints - moveJoints;
        const remainingFootage = calculateRangeFootage(remainingJoints, selectedTransferRow.pipeRange);

        if (remainingJoints <= 0) {
          await retireInventoryLine(selectedTransferRow.id);
        } else {
          const { error: sourceError } = await supabase
            .from("pipe_inventory")
            .update({
              bulk_joints: remainingJoints,
              bulk_footage: remainingFootage,
              updated_at: new Date().toISOString(),
            })
            .eq("id", selectedTransferRow.id);

          if (sourceError) throw sourceError;
        }

        await addToInventoryLine({
          companyId: selectedTransferRow.companyId,
          yardId: selectedYard.id,
          rackId: rack?.id ?? null,
          zoneId: zone?.id ?? null,
          excludeId: selectedTransferRow.id,
          afe: selectedTransferRow.afe,
          operator: selectedTransferRow.operator,
          rig: selectedTransferRow.rig,
          partNumber: selectedTransferRow.partNumber,
          size: selectedTransferRow.size,
          grade: selectedTransferRow.grade,
          connection: selectedTransferRow.connection,
          pipeRange: selectedTransferRow.pipeRange,
          condition: selectedTransferRow.condition,
          status: destinationStatus,
          inspectionDue: selectedTransferRow.inspectionDue || null,
          joints: moveJoints,
          footage: moveFootage,
        });
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

    const shipLines = selectedShipRows.map((row) => {
      const requestedJoints = Number(shipQuantities[row.id] ?? row.joints);
      const joints = Math.max(0, requestedJoints);

      return {
        row,
        requestedJoints,
        joints,
        footage: calculateRangeFootage(joints, row.pipeRange),
      };
    });

    if (shipLines.some((line) => line.requestedJoints > line.row.joints)) {
      setMessage("Ship quantity cannot be greater than the joints available on that line.");
      return;
    }

    const activeShipLines = shipLines.filter((line) => line.joints > 0);

    if (activeShipLines.length === 0) {
      setMessage("Enter at least one joint to ship.");
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

      const lineItems = activeShipLines.map(({ row, joints, footage }) => ({
        ticket_id: ticket.id,
        shipping_ticket_id: ticket.id,
        pipe_inventory_id: row.id,
        company_id: row.companyId,
        part_number: row.partNumber,
        afe: row.afe || null,
        size: row.size || null,
        grade: row.grade || null,
        connection: row.connection || null,
        pipe_range: row.pipeRange,
        condition: row.condition || null,
        joints,
        footage,
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

      for (const { row, joints, footage } of activeShipLines) {
        const remainingJoints = Math.max(0, row.joints - joints);
        const remainingFootage = calculateRangeFootage(remainingJoints, row.pipeRange);

        if (remainingJoints === 0) {
          await retireInventoryLine(row.id);
        } else {
          const { error: inventoryError } = await supabase
            .from("pipe_inventory")
            .update({
              bulk_joints: remainingJoints,
              bulk_footage: remainingFootage,
              tallied_joints: 0,
              tallied_footage: 0,
              updated_at: new Date().toISOString(),
            })
            .eq("id", row.id);

          if (inventoryError) throw inventoryError;
        }

        await supabase.from("pipe_transactions").insert({
          pipe_inventory_id: row.id,
          company_id: row.companyId,
          yard_id: selectedYard.id,
          transaction_type: "ship",
          quantity_joints: joints,
          quantity_footage: footage,
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
      setShipQuantities({});
      setShipFiles([]);
      setMessage(`Shipping ticket ${ticketNumber} saved. BOL ${bolNumber}${shipFiles.length ? ` with ${shipFiles.length} attachment(s)` : ""}`);
    } catch (error: any) {
      setMessage(`Ship failed: ${error.message}`);
    } finally {
      setSavingShip(false);
    }
  }


  function exportInventoryRowsCsv(rowsToExport: InventoryRow[], locationName: string) {
    if (rowsToExport.length === 0) {
      setMessage("No inventory rows to export.");
      return;
    }

    const headers = [
      "Date Created",
      "Company",
      "Operator",
      "Rig",
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

    const rows = rowsToExport.map((row) => {
      const location = row.locationType === "rack" ? row.rackId : row.zoneId;

      return [
        row.createdAt,
        row.company,
        row.operator,
        row.rig,
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

    downloadCsv(`titan-inventory-${locationName}-${today}.csv`, headers, rows);

    setMessage(`Exported ${rowsToExport.length} inventory rows.`);
  }

  function exportInventoryCsv() {
    const locationName = selectedLocation === "all" ? "all-locations" : selectedLocation;
    exportInventoryRowsCsv(filteredInventory, locationName);
  }

  function exportZoneInventoryCsv() {
    const zoneName = selectedZoneDetail?.code ?? "work-zone";
    exportInventoryRowsCsv(selectedZoneInventory, `zone-${zoneName}`);
  }

  function exportInventoryRegisterCsv() {
    const fileName = inventoryRegisterScope === "all" ? "all-tubulars" : `zone-${inventoryRegisterScope}`;
    exportInventoryRowsCsv(inventoryRegisterRows, fileName);
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
      <main className={`app-shell ${styles.yardLoadingShell}`}>
        <section className={styles.yardLoadingCard}>
          <img src="/titan_logo.jpg" alt="TITAN" />
          <span>Yard View</span>
          <h1>Loading TITAN Yard</h1>
          <p>Building the rack map, yard access, and live inventory view.</p>
          <div className={styles.yardLoadingBar} aria-hidden="true">
            <i />
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className={`app-shell ${styles.yardViewShell}`}>
      <datalist id="customer-name-options">
        {customerNameOptions.map((customer) => (
          <option key={customer} value={customer} />
        ))}
      </datalist>
      <datalist id="yard-customer-filter-options">
        {customerOptions.map((customer) => (
          <option key={customer} value={customer} />
        ))}
      </datalist>

      <section className={`main-panel ${styles.yardMainPanel}`}>
        <section className={styles.yardTopDock}>
          <button className={`brand brand-home-link ${styles.yardBrand}`} type="button" onClick={() => (window.location.href = "/home")}>
            <div className="brand-mark">PF</div>
            <div>
              <div className="brand-title">TITAN by Pathfinder Inspections</div>
            </div>
          </button>

          <label className={styles.yardSelectControl}>
            <span>Yard</span>
            <select
              className="field"
              value={selectedYard?.id ?? ""}
              onChange={(event) => {
                setSelectedRows([]);
                setSelectedLocation("all");
                setInventoryRegisterOpen(false);
                loadYardSetup(event.target.value);
              }}
              disabled={loadingSetup || yardOptions.length < 2}
            >
              {yardOptions.length === 0 && <option>{selectedYard?.name ?? "Pathfinder Yard"}</option>}
              {yardOptions.map((yard) => (
                <option key={yard.id} value={yard.id}>
                  {yard.name}
                </option>
              ))}
            </select>
          </label>

          <div className={styles.yardPrimaryActions}>
            <button className="button primary" disabled={isReadOnlyRole} onClick={openNewReceive}>Receive</button>
            <button className="button" disabled={isReadOnlyRole} onClick={openShip}>Ship</button>
            <button className="button" disabled={isReadOnlyRole} onClick={openTransfer}>Transfer</button>
            <button className="button" disabled={isReadOnlyRole || selectedRows.length !== 1} onClick={openEdit}>Adjust</button>
            <button className="button" onClick={refreshYardView}>Refresh</button>

            <details className={styles.yardMoreActions}>
              <summary>More</summary>
              <div>
                <button className="button" onClick={() => window.print()}>Print</button>
                <button className="button" onClick={exportInventoryCsv}>Export CSV</button>
                <button className="button" disabled={isReadOnlyRole || selectedRows.length === 0} onClick={completeSelectedRows}>Complete</button>
                <button className="button" disabled={isReadOnlyRole || selectedRows.length < 2} onClick={combineSelectedInventoryLines}>
                  Combine Lines
                </button>
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
                <button className="button" onClick={openTickets}>Tickets</button>
                <button className="button" onClick={openReports}>Reports</button>
                <button className="button" disabled={role === "customer"} onClick={() => (window.location.href = "/dashboard")}>Command Center</button>
                <button className="button" disabled={role === "customer"} onClick={openActivity}>Activity</button>
                <button className="button" onClick={() => setPasswordOpen(true)}>Password</button>
              </div>
            </details>
          </div>
        </section>

        {message && <div className="modal-message">{message}</div>}

        <header className={styles.yardMapHeader}>
          <div>
            <span>Yard View</span>
            <h1>{selectedYard?.name ?? "Pathfinder Yard"}</h1>
            <p>{filteredInventory.length} visible line items / {selectedTotals.joints.toLocaleString()} selected joints / {selectedTotals.footage.toLocaleString()} selected ft</p>
          </div>

          <div className={styles.yardMapHeaderActions}>
            <button
              className="button"
              onClick={() => {
                setSelectedLocation("all");
                setRackDetailOpen(false);
                setZoneDetailOpen(false);
                setInventoryRegisterOpen(false);
              }}
            >
              Show All
            </button>
            {layoutMode && <button className="button primary" onClick={saveRackLayout}>Save Layout</button>}
            <button className={`button ${layoutMode ? "primary" : ""}`} onClick={() => setLayoutMode((current) => !current)}>
              {layoutMode ? "Done Layout" : "Edit Layout"}
            </button>
          </div>
        </header>

        <section className={styles.yardZoneStrip}>
          <span>Work zones</span>
          <div>
            <button
              className={inventoryRegisterOpen && inventoryRegisterScope === "all" ? styles.activeZoneChip : ""}
              onClick={() => openInventoryRegister("all")}
            >
              All Tubulars
            </button>
            {zones.map((zone) => (
              <button
                key={zone.id}
                className={selectedLocation === zone.code ? styles.activeZoneChip : ""}
                onClick={() => openZoneDetail(zone)}
              >
                {zone.name}
              </button>
            ))}
          </div>
        </section>

        <section className={`rack-section ${styles.yardMapSection}`}>
          <div className={styles.yardMapInstruction}>
            <strong>{layoutMode ? "Layout editor" : "Rack map"}</strong>
            <span>{layoutMode ? "Select, move, resize, name, and save racks." : "Click a rack for details. Hover shows customer and pipe contents."}</span>
          </div>

          <div className={styles.yardCustomerFilter}>
            <label>
              <span>Customer lookup</span>
              <input
                list="yard-customer-filter-options"
                value={activeCustomerSearch}
                onChange={(event) => setCustomerFilter(event.target.value.trim() || "all")}
                placeholder="Type or select customer"
              />
            </label>
            <label>
              <span>Inventory lookup</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="TU#, part, grade, rack, condition"
              />
            </label>
            <div className={styles.filterStatus}>{yardCustomerFilterStatus}</div>
            <button
              className="button"
              onClick={() => {
                setCustomerFilter("all");
                setSearch("");
                setSelectedLocation("all");
                setRackDetailOpen(false);
                setZoneDetailOpen(false);
                setInventoryRegisterOpen(false);
              }}
            >
              Clear
            </button>
          </div>

          {layoutMode && selectedLayoutRack && (
            <div className="rack-editor-panel">
              <div>
                <span className="eyebrow">Selected Rack</span>
                <h3>{selectedLayoutRack.label}</h3>
                <p>
                  {selectedLayoutRack.enabled ? "Enabled" : "Disabled"} / {selectedLayoutRack.capacity} joint capacity /{" "}
                  {selectedLayoutRack.rotation === 90 ? "Vertical" : "Horizontal"}
                </p>
              </div>

              <div className="rack-editor-controls">
                <button className="mini-button" onClick={() => nudgeRack(selectedLayoutRack.label, 0, -1)}>Up</button>
                <button className="mini-button" onClick={() => nudgeRack(selectedLayoutRack.label, -1, 0)}>Left</button>
                <button className="mini-button" onClick={() => nudgeRack(selectedLayoutRack.label, 1, 0)}>Right</button>
                <button className="mini-button" onClick={() => nudgeRack(selectedLayoutRack.label, 0, 1)}>Down</button>
                <button className="mini-button" onClick={() => rotateRack(selectedLayoutRack.label)}>Turn</button>
                <button className="mini-button" onClick={() => editRackCapacity(selectedLayoutRack.label)}>Capacity</button>
                <button className="mini-button" onClick={() => renameRack(selectedLayoutRack.label)}>Rename</button>
                <button className="mini-button" onClick={() => toggleRackEnabled(selectedLayoutRack.label)}>
                  {selectedLayoutRack.enabled ? "Disable" : "Enable"}
                </button>
                <button className="mini-button danger" onClick={() => deleteRack(selectedLayoutRack.label)}>Delete</button>
              </div>
            </div>
          )}

          <div ref={mapShellRef} className={`yard-map-shell ${styles.yardMapShell} ${layoutMode ? styles.layoutMapShell : ""}`}>
            <div
              className={styles.yardMapViewport}
              style={{
                width: `${displayedYardMapSize.width}px`,
                height: `${displayedYardMapSize.height}px`,
              }}
            >
              <div
                className="yard-map wtx-yard-map"
                onDragOver={(event) => event.preventDefault()}
                onDrop={moveRackOnMap}
                style={{
                  position: "relative",
                  minHeight: `${yardMapSize.height}px`,
                  minWidth: `${yardMapSize.width}px`,
                  height: `${yardMapSize.height}px`,
                  width: `${yardMapSize.width}px`,
                  overflow: "hidden",
                  border: "1px solid #303846",
                  borderRadius: "10px",
                  backgroundImage:
                    selectedYard?.code === "PIFS"
                      ? "linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), url('/wtx-yard-map.jpg')"
                      : "linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(135deg, rgba(249,115,22,0.08), rgba(15,23,42,0.94))",
                  backgroundSize: "74px 74px, 74px 74px, 100% 100%",
                  backgroundPosition: "26px 70px, 26px 70px, center",
                  backgroundRepeat: "repeat, repeat, no-repeat",
                  boxSizing: "border-box",
                  padding: "12px",
                  transform: `scale(${yardMapScale})`,
                  transformOrigin: "top left",
                }}
              >
            {rackLayout.filter((rack) => layoutMode || rack.enabled).map((rack) => {
              const allRackInventory = rackInventoryMap.get(rack.label) ?? [];
              const rackSearchInventory = allRackInventory.filter((row) => {
                const searchText = search.toLowerCase().trim();
                const matchesSearch =
                  !searchText ||
                  [row.company, row.afe, row.partNumber, row.size, row.grade, row.connection, row.status, row.condition, row.rackId ?? "", row.zoneId ?? ""]
                    .join(" ")
                    .toLowerCase()
                    .includes(searchText);

                return rowMatchesQuickFilters(row) && matchesSearch;
              });
              const joints = allRackInventory.reduce((sum, row) => sum + row.joints, 0);
              const visibleJoints = rackSearchInventory.reduce((sum, row) => sum + row.joints, 0);
              const fill = rack.capacity > 0 ? Math.min(100, Math.round((joints / rack.capacity) * 100)) : 0;
              const customerMatch = Boolean(activeCustomerSearch) && allRackInventory.some((row) => customerMatchesTerm(row.company, activeCustomerSearch));
              const customerDim = Boolean(activeCustomerSearch) && !customerMatch;
              const customerBadge = customerMatch ? rackCustomerMatchLabel(allRackInventory, activeCustomerSearch) : "";
              const rackCustomerLines = buildReport(allRackInventory, (row) => row.company);
              const rackPipeLines = [...allRackInventory].sort((left, right) => right.joints - left.joints);
              const rackPosition = snapRackPosition(rack.layoutX, rack.layoutY);
              const rackWidth = rack.layoutWidth ?? rackTileSize.width;
              const rackHeight = rack.layoutHeight ?? rackTileSize.height;
              const hoverOpensLeft = rackPosition.x + rackWidth + 500 > yardMapSize.width;
              const hoverOpensUp = rackPosition.y + 430 > yardMapSize.height;

              return (
                <div
                  key={rack.id}
                  className={`rack-tile compact-rack ${styles.rackTileShell} ${selectedLocation === rack.label ? "active" : ""} ${selectedLayoutRackLabel === rack.label ? "selected-layout-rack" : ""} ${joints > 0 ? "has-inventory" : ""} ${customerMatch ? styles.customerMatch : ""} ${customerDim ? styles.customerDim : ""} ${layoutMode ? "layout-mode" : ""} ${!rack.enabled ? "disabled-rack" : ""} ${rack.rotation === 90 ? "vertical-rack" : "horizontal-rack"}`}
                  draggable={layoutMode}
                  onDragStart={() => setDraggedRack(rack.label)}
                  onDragEnd={() => setDraggedRack(null)}
                  onClick={() => {
                    if (layoutMode) setSelectedLayoutRackLabel(rack.label);
                  }}
                  style={{
                    position: "absolute",
                    left: rackPosition.x,
                    top: rackPosition.y,
                    width: `${rackWidth}px`,
                    minWidth: "34px",
                    minHeight: "26px",
                    height: `${rackHeight}px`,
                    overflow: layoutMode ? "hidden" : "visible",
                    cursor: layoutMode ? "grab" : "pointer",
                    borderColor: !rack.enabled ? "#7f1d1d" : customerMatch ? "#22c55e" : selectedLocation === rack.label ? "#f97316" : joints > 0 ? "#f97316" : "#303846",
                    background: !rack.enabled ? "rgba(127, 29, 29, 0.25)" : customerMatch ? "rgba(34, 197, 94, 0.2)" : joints > 0 ? "rgba(249, 115, 22, 0.18)" : "#1b2027",
                    opacity: !rack.enabled ? 0.45 : customerDim ? 0.24 : 1,
                    zIndex: customerMatch ? 4 : selectedLocation === rack.label ? 3 : 2,
                  }}
                >
                  <button
                    className="rack-tile-button compact-rack-button"
                    onClick={(event) => {
                      event.stopPropagation();
                      if (layoutMode) {
                        setSelectedLayoutRackLabel(rack.label);
                        return;
                      }

                      openRackDetail(rack.label);
                    }}
                    style={{
                      minHeight: "100%",
                      height: "100%",
                      padding: "5px 7px",
                      gap: "3px",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <span className="rack-code" style={{ fontSize: "13px", lineHeight: "1", textAlign: "center" }}>{rack.label}</span>
                    <span className={styles.rackJoints}>{joints.toLocaleString()} jts{search ? ` / ${visibleJoints.toLocaleString()} visible` : ""}</span>
                    <span className={styles.rackCustomers}>{rackCustomerSummaryText(allRackInventory)}</span>
                    <span className="rack-meter" style={{ height: "3px", marginTop: "2px", width: "100%" }}>
                      <span style={{ width: `${fill}%`, background: joints > 0 ? "#f97316" : "#303846" }} />
                    </span>
                  </button>
                  {customerBadge && <span className={styles.rackFilterBadge}>{customerBadge}</span>}
                  {!layoutMode && (
                    <div
                      className={`${styles.rackHoverCard} ${hoverOpensLeft ? styles.rackHoverCardLeft : ""} ${hoverOpensUp ? styles.rackHoverCardUp : ""}`}
                    >
                      <h4>{rack.label}</h4>
                      {allRackInventory.length === 0 ? (
                        <div className={styles.rackHoverEmpty}>
                          Empty rack
                          <span>Click Receive to add pipe here.</span>
                        </div>
                      ) : (
                        <>
                          {rackCustomerLines.map((line) => (
                            <div key={line.label} className={styles.rackHoverRow}>
                              <strong>{line.label}</strong>
                              <span>{line.joints.toLocaleString()} jts</span>
                            </div>
                          ))}
                          <div className={styles.rackHoverSubtitle}>Pipe in this rack</div>
                          {rackPipeLines.map((row) => (
                            <div key={row.id} className={styles.rackHoverRow}>
                              <span>{rackPipeDescription(row)} / {row.condition || row.status || "-"}</span>
                              <strong>{row.joints.toLocaleString()}</strong>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  )}
                  {layoutMode && (
                    <span
                      className="rack-resize-handle"
                      onMouseDown={(event) => startRackResize(event, rack.label)}
                      onTouchStart={(event) => startRackResize(event, rack.label)}
                      aria-label={`Resize ${rack.label}`}
                    />
                  )}
                </div>
              );
            })}
              </div>
            </div>
          </div>
        </section>

      </section>

      {inventoryRegisterOpen && (
        <div className={`modal-backdrop rack-detail-backdrop ${styles.rackDetailBackdrop}`}>
          <section className={`rack-detail-screen ${styles.rackDetailScreen} ${styles.inventoryRegisterScreen}`}>
            <div className="slide-header">
              <div>
                <h2>{inventoryRegisterTitle}</h2>
                <p>
                  {inventoryRegisterTotals.lines.toLocaleString()} line items / {inventoryRegisterTotals.joints.toLocaleString()} joints /{" "}
                  {inventoryRegisterTotals.footage.toLocaleString()} ft
                </p>
              </div>
              <button className="icon-button" onClick={closeInventoryRegister}>X</button>
            </div>

            <div className={`rack-detail-actions ${styles.inventoryRegisterActions}`}>
              <button className="button" onClick={closeInventoryRegister}>Back to Yard</button>
              <button className="button" onClick={exportInventoryRegisterCsv}>Export CSV</button>
              <button
                className="button"
                disabled={isReadOnlyRole || selectedRows.length === 0}
                onClick={openShip}
              >
                Ship
              </button>
              <button
                className="button"
                disabled={isReadOnlyRole || selectedRows.length !== 1}
                onClick={openTransfer}
              >
                Transfer
              </button>
              <button
                className="button"
                disabled={isReadOnlyRole || selectedRows.length !== 1}
                onClick={openEdit}
              >
                Adjust
              </button>
            </div>

            <div className={`rack-detail-metrics ${styles.inventoryRegisterMetrics}`}>
              <div>
                <span>Line Items</span>
                <strong>{inventoryRegisterTotals.lines.toLocaleString()}</strong>
                <small>visible records</small>
              </div>
              <div>
                <span>Total Joints</span>
                <strong>{inventoryRegisterTotals.joints.toLocaleString()}</strong>
                <small>in this view</small>
              </div>
              <div>
                <span>Footage</span>
                <strong>{inventoryRegisterTotals.footage.toLocaleString()}</strong>
                <small>calculated ft</small>
              </div>
              <div>
                <span>Selected</span>
                <strong>{selectedRows.length}</strong>
                <small>line{selectedRows.length === 1 ? "" : "s"} selected</small>
              </div>
            </div>

            <section className={`ticket-card rack-detail-lines ${styles.rackDetailLines} ${styles.inventoryRegisterLines}`}>
              <h3>{inventoryRegisterTitle} Line Items</h3>
              <div className={`table-wrap ${styles.rackDetailTableWrap} ${styles.inventoryRegisterTableWrap}`}>
                <table>
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Company</th>
                      <th>Operator</th>
                      <th>Rig</th>
                      <th>TU#</th>
                      <th>Part Number</th>
                      <th>Size</th>
                      <th>Grade</th>
                      <th>Connection</th>
                      <th>Range</th>
                      <th>Status</th>
                      <th>Condition</th>
                      <th>Location</th>
                      <th>Joints</th>
                      <th>Footage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inventoryRegisterRows.map((row) => {
                      const location = row.locationType === "rack" ? row.rackId : row.zoneId;

                      return (
                        <tr key={row.id}>
                          <td>
                            <input type="checkbox" checked={selectedRows.includes(row.id)} onChange={() => toggleRow(row.id)} />
                          </td>
                          <td>{row.company}</td>
                          <td>{row.operator || "-"}</td>
                          <td>{row.rig || "-"}</td>
                          <td>{row.afe}</td>
                          <td>{row.partNumber}</td>
                          <td>{row.size}</td>
                          <td>{row.grade}</td>
                          <td>{row.connection}</td>
                          <td>{row.pipeRange}</td>
                          <td><span className="badge">{row.status}</span></td>
                          <td>{row.condition}</td>
                          <td>{location}</td>
                          <td>{row.joints}</td>
                          <td>{row.footage.toLocaleString()}</td>
                        </tr>
                      );
                    })}

                    {inventoryRegisterRows.length === 0 && (
                      <tr>
                        <td colSpan={15} className="empty-cell">No inventory found in this view.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        </div>
      )}

      {rackDetailOpen && selectedRackDetail && (
        <div className={`modal-backdrop rack-detail-backdrop ${styles.rackDetailBackdrop}`}>
          <section className={`rack-detail-screen ${styles.rackDetailScreen}`}>
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
                onClick={() => openRackReceive(selectedRackDetail.label)}
              >
                Receive
              </button>
              <button
                className="button"
                disabled={isReadOnlyRole || selectedRackInventory.length === 0}
                onClick={() => openRackShip(selectedRackDetail.label)}
              >
                Ship
              </button>
              <button
                className="button"
                disabled={isReadOnlyRole || selectedRackInventory.length === 0}
                onClick={() => openRackTransfer(selectedRackDetail.label)}
              >
                Transfer
              </button>
              <button
                className="button"
                disabled={isReadOnlyRole}
                onClick={() => openRackInitialInventory(selectedRackDetail.label)}
              >
                Add Initial Inventory
              </button>
              <button
                className="button"
                disabled={isReadOnlyRole || selectedRackInventory.length !== 1}
                onClick={() => {
                  if (!selectedRackInventory[0]) return;
                  quickAdjust(selectedRackInventory[0]);
                  setRackDetailOpen(false);
                }}
              >
                Adjust
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

            <section className={`ticket-card rack-detail-lines ${styles.rackDetailLines}`}>
              <h3>Rack Line Items</h3>
              <div className={`table-wrap ${styles.rackDetailTableWrap}`}>
                <table>
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Company</th>
                      <th>Operator</th>
                      <th>Rig</th>
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
                          <td>{row.company}</td>
                          <td>{row.operator || "-"}</td>
                          <td>{row.rig || "-"}</td>
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
                        <td colSpan={14} className="empty-cell">No inventory found in rack {selectedRackDetail.label}.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
          </section>
        </div>
      )}

      {zoneDetailOpen && selectedZoneDetail && (
        <div className={`modal-backdrop rack-detail-backdrop ${styles.rackDetailBackdrop}`}>
          <section className={`rack-detail-screen ${styles.rackDetailScreen}`}>
            <div className="slide-header">
              <div>
                <h2>{selectedZoneDetail.name}</h2>
                <p>
                  {selectedZoneTotals.lines} line items / {selectedZoneTotals.joints.toLocaleString()} joints / {selectedZoneTotals.footage.toLocaleString()} ft
                </p>
              </div>
              <button className="icon-button" onClick={closeZoneDetail}>X</button>
            </div>

            <div className="rack-detail-actions">
              <button className="button" onClick={closeZoneDetail}>Back to Yard</button>
              <button className="button" onClick={exportZoneInventoryCsv}>Export Zone CSV</button>
              <button
                className="button primary"
                disabled={isReadOnlyRole}
                onClick={() => openZoneReceive(selectedZoneDetail)}
              >
                Receive
              </button>
              <button
                className="button"
                disabled={isReadOnlyRole || selectedRows.length === 0}
                onClick={openShip}
              >
                Ship
              </button>
              <button
                className="button"
                disabled={isReadOnlyRole || selectedRows.length !== 1}
                onClick={openTransfer}
              >
                Transfer
              </button>
              <button
                className="button"
                disabled={isReadOnlyRole || selectedRows.length !== 1}
                onClick={openEdit}
              >
                Adjust
              </button>
            </div>

            <div className="rack-detail-metrics">
              <div>
                <span>Line Items</span>
                <strong>{selectedZoneTotals.lines}</strong>
                <small>active records</small>
              </div>
              <div>
                <span>Total Joints</span>
                <strong>{selectedZoneTotals.joints.toLocaleString()}</strong>
                <small>in this work zone</small>
              </div>
              <div>
                <span>Footage</span>
                <strong>{selectedZoneTotals.footage.toLocaleString()}</strong>
                <small>calculated ft</small>
              </div>
              <div>
                <span>Selected</span>
                <strong>{selectedRows.length}</strong>
                <small>line{selectedRows.length === 1 ? "" : "s"} selected</small>
              </div>
            </div>

            <div className="rack-detail-grid">
              <section className="ticket-card">
                <h3>Inventory By Customer</h3>
                {selectedZoneCustomerSummary.length === 0 && <p className="muted-text">No customer inventory in this work zone.</p>}
                {selectedZoneCustomerSummary.map((line) => (
                  <div key={line.label} className="report-row">
                    <span>{line.label}</span>
                    <strong>{line.joints.toLocaleString()} joints</strong>
                    <small>{line.footage.toLocaleString()} ft / {line.lines} lines</small>
                  </div>
                ))}
              </section>

              <section className="ticket-card">
                <h3>Inventory By Status</h3>
                {selectedZoneStatusSummary.length === 0 && <p className="muted-text">No status totals in this work zone.</p>}
                {selectedZoneStatusSummary.map((line) => (
                  <div key={line.label} className="report-row">
                    <span>{line.label}</span>
                    <strong>{line.joints.toLocaleString()} joints</strong>
                    <small>{line.footage.toLocaleString()} ft / {line.lines} lines</small>
                  </div>
                ))}
              </section>
            </div>

            <section className={`ticket-card rack-detail-lines ${styles.rackDetailLines}`}>
              <h3>Work Zone Line Items</h3>
              <div className={`table-wrap ${styles.rackDetailTableWrap}`}>
                <table>
                  <thead>
                    <tr>
                      <th>Select</th>
                      <th>Company</th>
                      <th>Operator</th>
                      <th>Rig</th>
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
                    {selectedZoneInventory.map((row) => (
                      <tr key={row.id}>
                        <td>
                          <input type="checkbox" checked={selectedRows.includes(row.id)} onChange={() => toggleRow(row.id)} />
                        </td>
                        <td>{row.company}</td>
                        <td>{row.operator || "-"}</td>
                        <td>{row.rig || "-"}</td>
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
                    ))}

                    {selectedZoneInventory.length === 0 && (
                      <tr>
                        <td colSpan={14} className="empty-cell">No inventory found in {selectedZoneDetail.name}.</td>
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
              <label>Operator<input value={editForm.operator} onChange={(event) => setEditForm({ ...editForm, operator: event.target.value })} placeholder="Exxon Mobile" /></label>
              <label>Rig<input value={editForm.rig} onChange={(event) => setEditForm({ ...editForm, rig: event.target.value })} placeholder="Ensign T125" /></label>

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
                  {conditionOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>

              <label>
                Status
                <select value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value })}>
                  {statusOptions.map((option) => <option key={option}>{option}</option>)}
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
              <label>Operator<input value={receiveForm.operator} onChange={(event) => setReceiveForm({ ...receiveForm, operator: event.target.value })} placeholder="Exxon Mobile" /></label>
              <label>Rig<input value={receiveForm.rig} onChange={(event) => setReceiveForm({ ...receiveForm, rig: event.target.value })} placeholder="Ensign T125" /></label>

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
                  {conditionOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>

              <label>
                Status
                <select value={receiveForm.status} onChange={(event) => setReceiveForm({ ...receiveForm, status: event.target.value })}>
                  {statusOptions.map((option) => <option key={option}>{option}</option>)}
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
                <h2>{activeReceiveTicketId ? "Add Truck to Receiving Ticket" : "Receive Pipe"}</h2>
                <p>{activeReceiveTicketId ? `Continue ${activeReceiveTicketNumber}` : "Create inventory and receiving record"}</p>
              </div>
              <button className="icon-button" onClick={closeReceivePanel}>X</button>
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
              <label>Operator<input value={receiveForm.operator} onChange={(event) => setReceiveForm({ ...receiveForm, operator: event.target.value })} placeholder="Exxon Mobile" /></label>
              <label>Rig<input value={receiveForm.rig} onChange={(event) => setReceiveForm({ ...receiveForm, rig: event.target.value })} placeholder="Ensign T125" /></label>

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
                  {conditionOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>

              <label>
                Status
                <select value={receiveForm.status} onChange={(event) => setReceiveForm({ ...receiveForm, status: event.target.value })}>
                  {statusOptions.map((option) => <option key={option}>{option}</option>)}
                </select>
              </label>

              <label>Joints<input type="number" value={receiveForm.joints} onChange={(event) => setReceiveForm({ ...receiveForm, joints: event.target.value })} /></label>
              <label>Calculated Footage<input readOnly value={calculateRangeFootage(Number(receiveForm.joints || 0), receiveForm.pipeRange).toLocaleString()} /></label>
              <label>Missing Box Protectors<input type="number" min="0" value={receiveForm.missingBoxProtectors} onChange={(event) => setReceiveForm({ ...receiveForm, missingBoxProtectors: event.target.value })} /></label>
              <label>Missing Pin Protectors<input type="number" min="0" value={receiveForm.missingPinProtectors} onChange={(event) => setReceiveForm({ ...receiveForm, missingPinProtectors: event.target.value })} /></label>
              <section className="ticket-card full">
                <div className="section-heading compact-heading">
                  <div>
                    <h3>Truck Lines</h3>
                    <p>Use this when one receiving ticket has more than one truck.</p>
                  </div>
                  <button type="button" className="button" onClick={addReceiveTruckLine}>Add Truck</button>
                </div>
                {receiveTruckLines.length === 0 ? (
                  <p className="muted-text">No extra trucks added. The main carrier, PO, truck number, joints, and missing protector fields above will be used.</p>
                ) : (
                  <div className="ticket-preview">
                    <table>
                      <thead>
                        <tr>
                          <th>Carrier</th>
                          <th>PO</th>
                          <th>Truck</th>
                          <th>Joints</th>
                          <th>Footage</th>
                          <th>Missing Box</th>
                          <th>Missing Pin</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {receiveTruckLines.map((line) => {
                          const lineJoints = Number(line.joints || 0);

                          return (
                            <tr key={line.id}>
                              <td><input value={line.carrier} onChange={(event) => updateReceiveTruckLine(line.id, { carrier: event.target.value })} /></td>
                              <td><input value={line.poNumber} onChange={(event) => updateReceiveTruckLine(line.id, { poNumber: event.target.value })} /></td>
                              <td><input value={line.truckNumber} onChange={(event) => updateReceiveTruckLine(line.id, { truckNumber: event.target.value })} /></td>
                              <td><input type="number" min="0" value={line.joints} onChange={(event) => updateReceiveTruckLine(line.id, { joints: event.target.value })} /></td>
                              <td>{calculateRangeFootage(lineJoints, receiveForm.pipeRange).toLocaleString()}</td>
                              <td><input type="number" min="0" value={line.missingBoxProtectors} onChange={(event) => updateReceiveTruckLine(line.id, { missingBoxProtectors: event.target.value })} /></td>
                              <td><input type="number" min="0" value={line.missingPinProtectors} onChange={(event) => updateReceiveTruckLine(line.id, { missingPinProtectors: event.target.value })} /></td>
                              <td><button type="button" className="button danger-button" onClick={() => removeReceiveTruckLine(line.id)}>Remove</button></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
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
              <button className="button" onClick={closeReceivePanel}>Cancel</button>
              <button className="button primary" onClick={saveReceive} disabled={savingReceive || isReadOnlyRole}>
                {savingReceive ? "Saving..." : activeReceiveTicketId ? "Add Truck" : "Save Receiving"}
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
              <button className="icon-button" onClick={() => { setShipOpen(false); setShipQuantities({}); setShipFiles([]); }}>X</button>
            </div>

            {message && <div className="modal-message">{message}</div>}

            <div className="transfer-summary">
              <div><strong>Ship To</strong><span>{shipForm.shipTo || "Required"}</span></div>
              <div><strong>Total Joints</strong><span>{pendingShipTotals.joints}</span></div>
              <div><strong>Total Footage</strong><span>{pendingShipTotals.footage.toLocaleString()}</span></div>
            </div>

            <section className="ticket-card full">
              <h3>Shipping Ticket Quantities</h3>
              <p className="muted-text">
                Enter the exact quantity for this ticket. These quantities print on the ticket and are removed from inventory.
              </p>
              <div className="ticket-preview">
                <table>
                  <thead>
                    <tr>
                      <th>Company</th>
                      <th>Part Number</th>
                      <th>Available</th>
                      <th>Joints to Ship</th>
                      <th>Calculated Footage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pendingShipLines.map(({ row, joints, footage }) => (
                      <tr key={row.id}>
                        <td>{row.company}</td>
                        <td>{row.partNumber}</td>
                        <td>{row.joints}</td>
                        <td>
                          <input
                            type="number"
                            min="0"
                            max={row.joints}
                            value={shipQuantities[row.id] ?? String(row.joints)}
                            onChange={(event) => setShipLineQuantity(row.id, event.target.value)}
                          />
                        </td>
                        <td>{footage.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={3}><strong>Totals</strong></td>
                      <td><strong>{pendingShipTotals.joints}</strong></td>
                      <td><strong>{pendingShipTotals.footage.toLocaleString()}</strong></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </section>

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
                  {pendingShipLines.map(({ row, joints, footage }) => (
                    <tr key={row.id}>
                      <td>{row.company}</td>
                      <td>{row.afe}</td>
                      <td>{row.partNumber}</td>
                      <td>{row.pipeRange}</td>
                      <td>{row.condition}</td>
                      <td>{joints}</td>
                      <td>{footage.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="slide-actions">
              <button className="button" onClick={() => { setShipOpen(false); setShipQuantities({}); setShipFiles([]); }}>Cancel</button>
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
                <select value={ticketFilter} onChange={(event) => setTicketFilter(event.target.value as "all" | "receiving" | "shipping" | "release")}>
                  <option value="all">All Tickets</option>
                  <option value="receiving">Receiving Only</option>
                  <option value="shipping">Shipping / BOL Only</option>
                  <option value="release">Release Requests</option>
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
              Showing {filteredReceivingTickets.length} receiving tickets, {filteredShippingTickets.length} shipping/BOL tickets, {filteredReleaseRequests.length} release requests, and {filteredTransferDocuments.length} transfer documents
            </div>
            <div className="tickets-grid">
              <section className="ticket-card">
                <h3>Receiving Tickets</h3>
                {filteredReceivingTickets.length === 0 && <p className="muted-text">No receiving tickets found.</p>}

                {filteredReceivingTickets.map((ticket) => {
                  const lines = ticketLines.filter((line) => line.receivingTicketId === ticket.id);
                  const attachments = ticketAttachments.filter((attachment) => attachment.receivingTicketId === ticket.id);
                  const joints = lines.reduce((sum, line) => sum + line.joints, 0);
                  const footage = lines.reduce((sum, line) => sum + line.footage, 0);

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
                      {lines.length > 0 && (
                        <div>
                          <span>{joints} joints</span>
                          <span>{footage.toLocaleString()} ft</span>
                        </div>
                      )}
                      <button
                        className="button"
                        onClick={() =>
                          (window.location.href = `/ticket-print?type=receiving&id=${ticket.id}`)
                        }
                      >
                        Print / PDF
                      </button>
                      <button
                        className="button"
                        disabled={isReadOnlyRole}
                        onClick={() => openReceiveForTicket(ticket)}
                      >
                        Add Truck
                      </button>
                      {renderTicketCountEditor(ticket.id, lines)}
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
                  const lines = ticketLines.filter((line) => line.shippingTicketId === ticket.id || line.ticketId === ticket.id);
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
                      {renderTicketCountEditor(ticket.id, lines)}
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
                <h3>Tubular Release Requests</h3>
                {filteredReleaseRequests.length === 0 && <p className="muted-text">No release requests found.</p>}

                {filteredReleaseRequests.map((request) => (
                  <article key={request.id} className="ticket-row stacked">
                    <div>
                      <strong>{request.requestNumber}</strong>
                      <span>{request.companyName || "Customer"}</span>
                    </div>
                    <div>
                      <span>{request.customerName || request.customerEmail || "Customer user"}</span>
                      <span>{request.createdAt}</span>
                    </div>
                    <div>
                      <span>{request.yardName || "Yard"}</span>
                      <span>Rack {request.rackLabel || "-"}</span>
                    </div>
                    <div>
                      <span>{request.quantityJoints} joints requested</span>
                      <span>Status: {request.status}</span>
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
                    <div>
                      <span>Signed: {request.signatureName || "-"}</span>
                    </div>
                    {request.partSummary && (
                      <div>
                        <span>Parts: {request.partSummary}</span>
                      </div>
                    )}
                    {request.notes && <p className="muted-text">{request.notes}</p>}
                    <div className="customer-ticket-actions">
                      <button className="button" onClick={() => (window.location.href = `/ticket-print?type=release&id=${request.id}`)}>
                        Print / PDF
                      </button>
                    </div>
                  </article>
                ))}
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



