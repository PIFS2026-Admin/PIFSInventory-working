"use client";

import { useEffect, useMemo, useState } from "react";
import { goBackOrFallback } from "../../lib/navigation";
import { supabase } from "../../lib/supabase";

type TicketType = "receiving" | "shipping" | "transfer" | "release";

type Ticket = {
  id: string;
  type: TicketType;
  ticketNumber: string;
  bolNumber: string;
  documentType: string;
  company: string;
  carrier: string;
  poNumber: string;
  truckNumber: string;
  truckSequence: number;
  truckCount: number;
  driverName: string;
  truckUnitNumber: string;
  trailerNumber: string;
  shipTo: string;
  receivedFrom: string;
  destination: string;
  releaseDate: string;
  releasedTo: string;
  shipDate: string;
  rackLabel: string;
  missingBoxProtectors: number;
  missingPinProtectors: number;
  pathfinderName: string;
  pathfinderSignature: string;
  carrierName: string;
  carrierSignature: string;
  notes: string;
  createdAt: string;
};

type TicketLine = {
  id: string;
  company?: string;
  receivingTicketTruckId?: string;
  afe: string;
  partNumber: string;
  size?: string;
  weight?: string;
  grade?: string;
  connection?: string;
  pipeRange: "Range 2" | "Range 3";
  condition: string;
  joints: number;
  footage: number;
  missingBoxProtectors?: number;
  missingPinProtectors?: number;
  notes?: string;
};

type TicketAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  documentType: string;
};

type TicketLineRow = {
  id: string;
  receiving_ticket_truck_id?: string | null;
  companies?: unknown;
  afe?: string | null;
  size?: string | null;
  weight?: string | null;
  grade?: string | null;
  connection?: string | null;
  part_number?: string | null;
  pipe_range?: string | null;
  condition?: string | null;
  joints?: number | string | null;
  footage?: number | string | null;
  missing_box_protectors?: number | string | null;
  missing_pin_protectors?: number | string | null;
  notes?: string | null;
};

type DocumentRow = {
  id: string;
  document_type?: string | null;
  file_name?: string | null;
  file_url?: string | null;
};

type ReleasePartLine = {
  afe?: string | null;
  partNumber?: string | null;
  part_number?: string | null;
  size?: string | null;
  grade?: string | null;
  connection?: string | null;
  pipeRange?: string | null;
  pipe_range?: string | null;
  condition?: string | null;
  joints?: number | string | null;
  total_joints?: number | string | null;
  bulk_joints?: number | string | null;
  footage?: number | string | null;
  total_footage?: number | string | null;
  bulk_footage?: number | string | null;
};

type TransferDetails = {
  company?: string;
  ticketNumber?: string;
  documentNumber?: string;
  from?: string;
  fromLocation?: string;
  to?: string;
  toLocation?: string;
  notes?: string;
  comment?: string;
  createdAt?: string;
  pathfinderName?: string;
  pathfinderSignature?: string;
  carrierName?: string;
  carrierSignature?: string;
  afe?: string;
  partNumber?: string;
  pipeRange?: string;
  condition?: string;
  joints?: number | string | null;
  lines?: ReleasePartLine[];
};

type ReceivingTruckTicket = {
  id: string;
  receiving_ticket_id: string;
  truck_sequence: number | null;
  truck_label: string | null;
  carrier: string | null;
  po_number: string | null;
  truck_number: string | null;
  driver_name: string | null;
  truck_unit_number: string | null;
  trailer_number: string | null;
  bol_number: string | null;
  arrival_at: string | null;
  missing_box_protectors: number | null;
  missing_pin_protectors: number | null;
  pathfinder_name: string | null;
  pathfinder_signature: string | null;
  carrier_name: string | null;
  carrier_signature: string | null;
  notes: string | null;
  total_joints: number | null;
  total_footage: number | null;
  created_at: string | null;
};

const emptyTicket: Ticket = {
  id: "",
  type: "receiving",
  ticketNumber: "",
  bolNumber: "",
  documentType: "",
  company: "",
  carrier: "",
  poNumber: "",
  truckNumber: "",
  truckSequence: 0,
  truckCount: 0,
  driverName: "",
  truckUnitNumber: "",
  trailerNumber: "",
  shipTo: "",
  receivedFrom: "",
  destination: "",
  releaseDate: "",
  releasedTo: "",
  shipDate: "",
  rackLabel: "",
  missingBoxProtectors: 0,
  missingPinProtectors: 0,
  pathfinderName: "",
  pathfinderSignature: "",
  carrierName: "",
  carrierSignature: "",
  notes: "",
  createdAt: "",
};

function getParam(name: string) {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get(name) ?? "";
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function formatDate(value: string) {
  if (!value) return "";
  return value.slice(0, 10);
}

function formatNumber(value: number) {
  return Number(value || 0).toLocaleString();
}

function normalizePipeRange(value: unknown): "Range 2" | "Range 3" {
  return value === "Range 3" ? "Range 3" : "Range 2";
}

function calculateRangeFootage(joints: number, pipeRange: string) {
  return Math.round(Number(joints || 0) * (pipeRange === "Range 3" ? 43.5 : 31.5) * 100) / 100;
}

function isMissingDatabaseObject(error: unknown) {
  const message =
    error && typeof error === "object" && "message" in error ? String((error as { message?: unknown }).message ?? "") : "";

  return (
    message.includes("Could not find") ||
    message.includes("does not exist") ||
    message.includes("schema cache") ||
    message.includes("receiving_ticket_trucks") ||
    message.includes("receiving_ticket_truck_id")
  );
}

function scaleTicketLinesToJoints(lines: TicketLine[], requestedJoints: number) {
  let remaining = Math.max(0, Number(requestedJoints || 0));
  const scaled: TicketLine[] = [];

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

  return scaled;
}

function getCompanyName(value: unknown) {
  const readName = (item: unknown) => {
    if (!item || typeof item !== "object" || !("name" in item)) return "";
    const name = (item as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  };

  if (Array.isArray(value)) return readName(value[0]);
  return readName(value);
}

function makePipeDescription(line: TicketLine) {
  const spec = [line.size, line.weight, line.grade, line.connection].filter(Boolean).join(" ");
  return [spec, line.partNumber, line.pipeRange, line.condition].filter(Boolean).join(" / ") || line.partNumber || "-";
}

function makeTruckLabel(truck?: ReceivingTruckTicket) {
  if (!truck) return "Truck";
  const label = truck.truck_label || (truck.truck_sequence ? `Truck ${truck.truck_sequence}` : "Truck");
  const truckNumber = truck.truck_number || truck.truck_unit_number;
  const bol = truck.bol_number ? `BOL ${truck.bol_number}` : "";
  return [label, truckNumber, bol].filter(Boolean).join(" / ");
}

function makeSignatureBlack(value: string) {
  return new Promise<string>((resolve) => {
    if (!value || !value.startsWith("data:image")) {
      resolve(value);
      return;
    }

    const image = new Image();

    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth || image.width;
      canvas.height = image.naturalHeight || image.height;

      const context = canvas.getContext("2d");
      if (!context) {
        resolve(value);
        return;
      }

      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);

      for (let index = 0; index < imageData.data.length; index += 4) {
        const alpha = imageData.data[index + 3];

        if (alpha > 8) {
          imageData.data[index] = 0;
          imageData.data[index + 1] = 0;
          imageData.data[index + 2] = 0;
          imageData.data[index + 3] = 255;
        }
      }

      context.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };

    image.onerror = () => resolve(value);
    image.src = value;
  });
}

export default function TicketPrintPage() {
  const [ticket, setTicket] = useState<Ticket>(emptyTicket);
  const [lines, setLines] = useState<TicketLine[]>([]);
  const [receivingTrucks, setReceivingTrucks] = useState<ReceivingTruckTicket[]>([]);
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [printSignatures, setPrintSignatures] = useState({
    pathfinderSignature: "",
    carrierSignature: "",
  });
  const [error, setError] = useState("");

  const isReceivingTruckPrint = ticket.type === "receiving" && ticket.documentType === "receiving_truck";
  const isReceivingMasterPrint = ticket.type === "receiving" && ticket.documentType === "receiving_master";
  const showSignatureGrid = ticket.type !== "receiving" || isReceivingTruckPrint;
  const receivingTruckById = useMemo(
    () => new Map(receivingTrucks.map((truck) => [truck.id, truck])),
    [receivingTrucks]
  );

  const totals = useMemo(() => {
    return lines.reduce(
      (sum, line) => ({
        joints: sum.joints + Number(line.joints || 0),
        footage: sum.footage + Number(line.footage || 0),
      }),
      { joints: 0, footage: 0 }
    );
  }, [lines]);

  const receivingSizeTotals = useMemo(() => {
    if (!isReceivingMasterPrint) return [];

    const totalsBySize = new Map<
      string,
      { size: string; joints: number; footage: number; missingBoxProtectors: number; missingPinProtectors: number }
    >();

    for (const line of lines) {
      const size = line.size || "Unspecified";
      const existing =
        totalsBySize.get(size) ??
        { size, joints: 0, footage: 0, missingBoxProtectors: 0, missingPinProtectors: 0 };

      existing.joints += Number(line.joints || 0);
      existing.footage += Number(line.footage || 0);
      existing.missingBoxProtectors += Number(line.missingBoxProtectors || 0);
      existing.missingPinProtectors += Number(line.missingPinProtectors || 0);
      totalsBySize.set(size, existing);
    }

    return Array.from(totalsBySize.values()).sort((left, right) => left.size.localeCompare(right.size));
  }, [isReceivingMasterPrint, lines]);

  const receivingSpecTotals = useMemo(() => {
    if (!isReceivingMasterPrint) return [];

    const totalsBySpec = new Map<
      string,
      {
        description: string;
        joints: number;
        footage: number;
        missingBoxProtectors: number;
        missingPinProtectors: number;
        trucks: Map<string, number>;
      }
    >();

    for (const line of lines) {
      const key = [line.size || "", line.weight || "", line.grade || "", line.connection || "", line.partNumber || "", line.pipeRange, line.condition || ""].join("|");
      const existing =
        totalsBySpec.get(key) ??
        {
          description: makePipeDescription(line),
          joints: 0,
          footage: 0,
          missingBoxProtectors: 0,
          missingPinProtectors: 0,
          trucks: new Map<string, number>(),
        };
      const truckLabel = makeTruckLabel(
        line.receivingTicketTruckId ? receivingTruckById.get(line.receivingTicketTruckId) : undefined
      );

      existing.joints += Number(line.joints || 0);
      existing.footage += Number(line.footage || 0);
      existing.missingBoxProtectors += Number(line.missingBoxProtectors || 0);
      existing.missingPinProtectors += Number(line.missingPinProtectors || 0);
      existing.trucks.set(truckLabel, (existing.trucks.get(truckLabel) ?? 0) + Number(line.joints || 0));
      totalsBySpec.set(key, existing);
    }

    return Array.from(totalsBySpec.values()).sort((left, right) => left.description.localeCompare(right.description));
  }, [isReceivingMasterPrint, lines, receivingTruckById]);

  const lineTablePrefixColumnCount =
    (isReceivingMasterPrint ? 1 : 0) +
    (ticket.type === "receiving" ? 1 : 0) +
    2 +
    (ticket.type === "receiving" ? 4 : ticket.type === "release" ? 3 : 0) +
    2;

  useEffect(() => {
    async function loadTicket() {
      const type = (getParam("type") || "receiving") as TicketType;
      const id = getParam("id");
      const truckId = getParam("truckId");
      setReceivingTrucks([]);

      if (!id) {
        setError("Missing ticket id.");
        return;
      }

      if (type === "release") {
        let query = supabase
          .from("tubular_release_requests")
          .select("*");

        query = isUuid(id) ? query.eq("id", id) : query.eq("request_number", id);

        const { data, error } = await query.single();

        if (error) {
          setError(error.message);
          return;
        }

        let partLines: ReleasePartLine[] = Array.isArray(data.part_lines) ? (data.part_lines as ReleasePartLine[]) : [];

        if (partLines.length === 0 && data.company_id && data.rack_id) {
          const { data: inventoryRows } = await supabase
            .from("pipe_inventory")
            .select("afe, part_number, size, grade, connection, pipe_range, condition, bulk_joints, total_joints, bulk_footage, total_footage")
            .eq("company_id", data.company_id)
            .eq("rack_id", data.rack_id);

          partLines = ((inventoryRows ?? []) as ReleasePartLine[]).map((row) => {
            const pipeRange = normalizePipeRange(row.pipe_range);
            const joints = Number(row.total_joints ?? row.bulk_joints ?? 0);
            const storedFootage = row.total_footage ?? row.bulk_footage;

            return {
              afe: row.afe ?? "",
              partNumber: row.part_number ?? "",
              size: row.size ?? "",
              grade: row.grade ?? "",
              connection: row.connection ?? "",
              pipeRange,
              condition: row.condition ?? "",
              joints,
              footage: storedFootage === null || storedFootage === undefined
                ? calculateRangeFootage(joints, pipeRange)
                : Number(storedFootage),
            };
          });
        }

        setTicket({
          id: data.id,
          type: "release",
          ticketNumber: data.request_number ?? "",
          bolNumber: "",
          documentType: "",
          company: data.company_name ?? "",
          carrier: data.carrier ?? "",
          poNumber: "",
          truckNumber: "",
          truckSequence: 0,
          truckCount: 0,
          driverName: "",
          truckUnitNumber: "",
          trailerNumber: "",
          shipTo: data.released_to ?? "",
          receivedFrom: data.yard_name ?? "",
          destination: data.destination ?? "",
          releaseDate: data.release_date ?? "",
          releasedTo: data.released_to ?? "",
          shipDate: data.ship_date ?? "",
          rackLabel: data.rack_label ?? "",
          missingBoxProtectors: 0,
          missingPinProtectors: 0,
          pathfinderName: "",
          pathfinderSignature: "",
          carrierName: data.signature_name ?? "",
          carrierSignature: data.signature_data ?? "",
          notes: data.notes ?? "",
          createdAt: data.created_at ?? "",
        });

        const mappedPartLines = partLines.map((line, index) => {
            const pipeRange = normalizePipeRange(line.pipeRange ?? line.pipe_range);
            const joints = Number(line.joints ?? line.total_joints ?? line.bulk_joints ?? 0);
            const storedFootage = line.footage ?? line.total_footage ?? line.bulk_footage;

            return {
              id: `${data.id}-${index}`,
              afe: line.afe ?? "",
              partNumber: line.partNumber ?? line.part_number ?? "",
              size: line.size ?? "",
              grade: line.grade ?? "",
              connection: line.connection ?? "",
              pipeRange,
              condition: line.condition ?? "",
              joints,
              footage: storedFootage === null || storedFootage === undefined
                ? calculateRangeFootage(joints, pipeRange)
                : Number(storedFootage),
            };
          });

        setLines(scaleTicketLinesToJoints(mappedPartLines, Number(data.quantity_joints ?? 0)));

        return;
      }

      if (type === "transfer") {
        let query = supabase
          .from("documents")
          .select("id, document_type, file_url, created_at, companies(name)");

        query = isUuid(id) ? query.eq("id", id) : query.eq("id", id);

        const { data, error } = await query.single();

        if (error) {
          setError(error.message);
          return;
        }

        let details: TransferDetails = {};

        try {
          details = JSON.parse(data.file_url || "{}") as TransferDetails;
        } catch {
          details = {};
        }

        const companyName = details.company || getCompanyName(data.companies);

        setTicket({
          id: data.id,
          type: "transfer",
          ticketNumber: details.documentNumber ?? data.id,
          bolNumber: "",
          documentType: data.document_type ?? "",
          company: companyName,
          carrier: "",
          poNumber: "",
          truckNumber: "",
          truckSequence: 0,
          truckCount: 0,
          driverName: "",
          truckUnitNumber: "",
          trailerNumber: "",
          shipTo: "",
          receivedFrom: details.fromLocation ?? "",
          destination: details.toLocation ?? "",
          releaseDate: "",
          releasedTo: "",
          shipDate: "",
          rackLabel: "",
          missingBoxProtectors: 0,
          missingPinProtectors: 0,
          pathfinderName: details.pathfinderName ?? "",
          pathfinderSignature: details.pathfinderSignature ?? "",
          carrierName: details.carrierName ?? "",
          carrierSignature: details.carrierSignature ?? "",
          notes: details.comment ?? "",
          createdAt: details.createdAt ?? data.created_at ?? "",
        });

        setLines([
          {
            id: data.id,
            afe: details.afe ?? "",
            partNumber: details.partNumber ?? "",
            pipeRange: normalizePipeRange(details.pipeRange),
            condition: details.condition ?? "",
            joints: Number(details.joints ?? 0),
            footage: calculateRangeFootage(Number(details.joints ?? 0), normalizePipeRange(details.pipeRange)),
          },
        ]);

        return;
      }

      if (type === "shipping") {
        let query = supabase
          .from("shipping_tickets")
          .select(
            "id, ticket_number, bol_number, carrier, po_number, truck_number, ship_to, destination, pathfinder_name, pathfinder_signature, carrier_name, carrier_signature, notes, created_at, companies(name)"
          );

        query = isUuid(id) ? query.eq("id", id) : query.eq("ticket_number", id);

        const { data, error } = await query.single();

        if (error) {
          setError(error.message);
          return;
        }

        const companyName = getCompanyName(data.companies);

        setTicket({
          id: data.id,
          type: "shipping",
          ticketNumber: data.ticket_number ?? "",
          bolNumber: data.bol_number ?? "",
          documentType: "",
          company: companyName,
          carrier: data.carrier ?? "",
          poNumber: data.po_number ?? "",
          truckNumber: data.truck_number ?? "",
          truckSequence: 0,
          truckCount: 0,
          driverName: "",
          truckUnitNumber: data.truck_number ?? "",
          trailerNumber: "",
          shipTo: data.ship_to ?? "",
          receivedFrom: "",
          destination: data.destination ?? "",
          releaseDate: "",
          releasedTo: "",
          shipDate: "",
          rackLabel: "",
          missingBoxProtectors: 0,
          missingPinProtectors: 0,
          pathfinderName: data.pathfinder_name ?? "",
          pathfinderSignature: data.pathfinder_signature ?? "",
          carrierName: data.carrier_name ?? "",
          carrierSignature: data.carrier_signature ?? "",
          notes: data.notes ?? "",
          createdAt: data.created_at ?? "",
        });

        const { data: lineData, error: lineError } = await supabase
          .from("ticket_line_items")
          .select("id, afe, part_number, pipe_range, condition, joints, footage")
          .or(`ticket_id.eq.${data.id},shipping_ticket_id.eq.${data.id}`)
          .order("id", { ascending: true });

        if (lineError) {
          setError(lineError.message);
          return;
        }

        setLines(
          ((lineData ?? []) as TicketLineRow[]).map((line) => {
            const pipeRange = normalizePipeRange(line.pipe_range);
            const joints = Number(line.joints ?? 0);
            const storedFootage = line.footage === null || line.footage === undefined ? NaN : Number(line.footage);

            return {
              id: line.id,
              afe: line.afe ?? "",
              partNumber: line.part_number ?? "",
              pipeRange,
              condition: line.condition ?? "",
              joints,
              footage: Number.isFinite(storedFootage) ? storedFootage : calculateRangeFootage(joints, pipeRange),
            };
          })
        );

        const { data: attachmentData, error: attachmentError } = await supabase
          .from("documents")
          .select("id, document_type, file_url, file_name")
          .eq("shipping_ticket_id", data.id)
          .order("created_at", { ascending: true });

        if (attachmentError) {
          setError(attachmentError.message);
          return;
        }

        setAttachments(
          ((attachmentData ?? []) as DocumentRow[]).map((attachment) => ({
            id: attachment.id,
            documentType: attachment.document_type ?? "",
            fileName: attachment.file_name ?? "Attachment",
            fileUrl: attachment.file_url ?? "",
          }))
        );

        return;
      }

      let query = supabase
        .from("receiving_tickets")
        .select(
          "id, ticket_number, carrier, po_number, truck_number, destination, missing_box_protectors, missing_pin_protectors, pathfinder_name, pathfinder_signature, carrier_name, carrier_signature, notes, created_at, afe, part_number, pipe_range, condition, joints, footage, companies(name)"
        );

      query = isUuid(id) ? query.eq("id", id) : query.eq("ticket_number", id);

      const { data, error } = await query.single();

      if (error) {
        setError(error.message);
        return;
      }

      const companyName = getCompanyName(data.companies);
      const { data: truckData, error: truckError } = await supabase
        .from("receiving_ticket_trucks")
        .select(
          "id, receiving_ticket_id, truck_sequence, truck_label, carrier, po_number, truck_number, driver_name, truck_unit_number, trailer_number, bol_number, arrival_at, missing_box_protectors, missing_pin_protectors, pathfinder_name, pathfinder_signature, carrier_name, carrier_signature, notes, total_joints, total_footage, created_at"
        )
        .eq("receiving_ticket_id", data.id)
        .order("truck_sequence", { ascending: true });

      if (truckError && !isMissingDatabaseObject(truckError)) {
        setError(truckError.message);
        return;
      }

      const receivingTrucks = ((truckError ? [] : truckData) ?? []) as ReceivingTruckTicket[];
      setReceivingTrucks(receivingTrucks);
      const selectedTruck = truckId ? receivingTrucks.find((truck) => truck.id === truckId) ?? null : null;

      if (truckId && receivingTrucks.length > 0 && !selectedTruck) {
        setError("Receiving truck ticket not found.");
        return;
      }

      const truckCount = receivingTrucks.length || 1;
      const isTruckPrint = Boolean(selectedTruck);

      setTicket({
        id: data.id,
        type: "receiving",
        ticketNumber: data.ticket_number ?? "",
        bolNumber: selectedTruck?.bol_number ?? "",
        documentType: isTruckPrint ? "receiving_truck" : "receiving_master",
        company: companyName,
        carrier: selectedTruck?.carrier ?? data.carrier ?? "",
        poNumber: selectedTruck?.po_number ?? data.po_number ?? "",
        truckNumber: selectedTruck?.truck_number ?? data.truck_number ?? "",
        truckSequence: Number(selectedTruck?.truck_sequence ?? 0),
        truckCount,
        driverName: selectedTruck?.driver_name ?? "",
        truckUnitNumber: selectedTruck?.truck_unit_number ?? "",
        trailerNumber: selectedTruck?.trailer_number ?? "",
        shipTo: "",
        receivedFrom: companyName,
        destination: data.destination ?? "-",
        releaseDate: "",
        releasedTo: "",
        shipDate: "",
        rackLabel: "",
        missingBoxProtectors: Number(selectedTruck?.missing_box_protectors ?? data.missing_box_protectors ?? 0),
        missingPinProtectors: Number(selectedTruck?.missing_pin_protectors ?? data.missing_pin_protectors ?? 0),
        pathfinderName: selectedTruck?.pathfinder_name ?? "",
        pathfinderSignature: selectedTruck?.pathfinder_signature ?? "",
        carrierName: selectedTruck?.carrier_name ?? selectedTruck?.driver_name ?? "",
        carrierSignature: selectedTruck?.carrier_signature ?? "",
        notes: selectedTruck?.notes ?? data.notes ?? "",
        createdAt: selectedTruck?.arrival_at ?? data.created_at ?? "",
      });

      let lineQuery = supabase
        .from("ticket_line_items")
        .select("id, afe, size, weight, grade, connection, part_number, pipe_range, condition, joints, footage, receiving_ticket_truck_id, missing_box_protectors, missing_pin_protectors, notes, companies(name)")
        .eq("receiving_ticket_id", data.id)
        .order("receiving_ticket_truck_id", { ascending: true })
        .order("line_sequence", { ascending: true })
        .order("id", { ascending: true });

      if (selectedTruck) {
        lineQuery = lineQuery.eq("receiving_ticket_truck_id", selectedTruck.id);
      }

      const lineResult = await lineQuery;
      let lineData = lineResult.data as TicketLineRow[] | null;
      let lineError = lineResult.error;

      if (lineError && isMissingDatabaseObject(lineError)) {
        const fallback = await supabase
          .from("ticket_line_items")
          .select("id, afe, size, grade, connection, part_number, pipe_range, condition, joints, footage")
          .eq("receiving_ticket_id", data.id)
          .order("id", { ascending: true });
        lineData = fallback.data as TicketLineRow[] | null;
        lineError = fallback.error;
      }

      if (lineError) {
        setError(lineError.message);
        return;
      }

      const mappedLines = (lineData ?? []).map((line: TicketLineRow) => {
        const pipeRange = normalizePipeRange(line.pipe_range);
        const joints = Number(line.joints ?? 0);
        const storedFootage = line.footage === null || line.footage === undefined ? NaN : Number(line.footage);

        return {
          id: line.id,
          company: getCompanyName(line.companies),
          receivingTicketTruckId: line.receiving_ticket_truck_id ?? "",
          afe: line.afe ?? "",
          size: line.size ?? "",
          weight: line.weight ?? "",
          grade: line.grade ?? "",
          connection: line.connection ?? "",
          partNumber: line.part_number ?? "",
          pipeRange,
          condition: line.condition ?? "",
          joints,
          footage: Number.isFinite(storedFootage) ? storedFootage : calculateRangeFootage(joints, pipeRange),
          missingBoxProtectors: Number(line.missing_box_protectors ?? 0),
          missingPinProtectors: Number(line.missing_pin_protectors ?? 0),
          notes: line.notes ?? "",
        };
      });

      setLines(
        mappedLines.length > 0
          ? mappedLines
          : [
              {
                id: selectedTruck?.id ?? data.id,
                company: companyName,
                receivingTicketTruckId: selectedTruck?.id ?? "",
                afe: data.afe ?? "",
                size: "",
                weight: "",
                grade: "",
                connection: "",
                partNumber: data.part_number ?? "",
                pipeRange: normalizePipeRange(data.pipe_range),
                condition: data.condition ?? "",
                joints: Number(selectedTruck?.total_joints ?? data.joints ?? 0),
                footage: Number(
                  selectedTruck?.total_footage ??
                    data.footage ??
                    calculateRangeFootage(Number(data.joints ?? 0), normalizePipeRange(data.pipe_range))
                ),
                missingBoxProtectors: Number(selectedTruck?.missing_box_protectors ?? data.missing_box_protectors ?? 0),
                missingPinProtectors: Number(selectedTruck?.missing_pin_protectors ?? data.missing_pin_protectors ?? 0),
                notes: selectedTruck?.notes ?? data.notes ?? "",
              },
            ]
      );

      let attachmentQuery = supabase
        .from("documents")
        .select("id, document_type, file_url, file_name, receiving_ticket_truck_id")
        .eq("receiving_ticket_id", data.id)
        .order("created_at", { ascending: true });

      if (selectedTruck) {
        attachmentQuery = attachmentQuery.eq("receiving_ticket_truck_id", selectedTruck.id);
      }

      const attachmentResult = await attachmentQuery;
      let attachmentData = attachmentResult.data as DocumentRow[] | null;
      let attachmentError = attachmentResult.error;

      if (attachmentError && isMissingDatabaseObject(attachmentError)) {
        const fallback = await supabase
          .from("documents")
          .select("id, document_type, file_url, file_name")
          .eq("receiving_ticket_id", data.id)
          .order("created_at", { ascending: true });
        attachmentData = fallback.data as DocumentRow[] | null;
        attachmentError = fallback.error;
      }

      if (attachmentError) {
        setError(attachmentError.message);
        return;
      }

      setAttachments(
        (attachmentData ?? []).map((attachment) => ({
          id: attachment.id,
          documentType: attachment.document_type ?? "",
          fileName: attachment.file_name ?? "Attachment",
          fileUrl: attachment.file_url ?? "",
        }))
      );
    }

    loadTicket();
  }, []);

  useEffect(() => {
    let active = true;

    async function prepareSignatures() {
      const [pathfinderSignature, carrierSignature] = await Promise.all([
        makeSignatureBlack(ticket.pathfinderSignature),
        makeSignatureBlack(ticket.carrierSignature),
      ]);

      if (active) {
        setPrintSignatures({ pathfinderSignature, carrierSignature });
      }
    }

    prepareSignatures();

    return () => {
      active = false;
    };
  }, [ticket.pathfinderSignature, ticket.carrierSignature]);

  function goBack() {
    goBackOrFallback("/");
  }

  if (error) {
    return (
      <main className="print-page">
        <section className="print-sheet">{error}</section>
      </main>
    );
  }

  return (
    <main className="print-page">
      <div className="print-actions">
        <button className="button" onClick={goBack}>
          Back
        </button>
        <button className="button primary" onClick={() => window.print()}>
          Print / Save PDF
        </button>
      </div>

      <section className="print-sheet">
        <header className="ticket-letterhead">
          <img src="/pathfinder-logo.png" alt="Pathfinder Inspections & Field Services" />
          <div>
            <h1>Pathfinder Inspections & Field Services</h1>
            <p>7501 Groening St.</p>
            <p>Odessa, TX 79765</p>
            <p>(432) 233-3600</p>
          </div>
        </header>

        <div className="ticket-title-row">
          <div>
            <h2>
              {ticket.type === "shipping"
                ? "Shipping Ticket / Bill of Lading"
                : ticket.type === "transfer"
                  ? "Transfer Document"
                  : ticket.type === "release"
                    ? "Tubular Release Request"
                    : isReceivingTruckPrint
                      ? `Receiving Ticket - Truck ${ticket.truckSequence} of ${ticket.truckCount}`
                      : "Master Receiving Ticket"}
            </h2>
            <p>{ticket.ticketNumber}</p>
            {ticket.type === "transfer" && (
              <p>{ticket.receivedFrom || "-"} to {ticket.destination || "-"}</p>
            )}
            {isReceivingTruckPrint && ticket.bolNumber && <p>BOL {ticket.bolNumber}</p>}
          </div>
          <div className="ticket-date-box">
            <span>Date</span>
            <strong>{formatDate(ticket.type === "release" ? ticket.releaseDate || ticket.createdAt : ticket.createdAt)}</strong>
            {(ticket.type === "shipping" || isReceivingTruckPrint) && (
              <>
                <span>BOL</span>
                <strong>{ticket.bolNumber}</strong>
              </>
            )}
          </div>
        </div>

        <section className="ticket-info-grid">
          {ticket.type === "release" ? (
            <>
              <div>
                <span>Company</span>
                <strong>{ticket.company}</strong>
              </div>
              <div>
                <span>Yard</span>
                <strong>{ticket.receivedFrom || "-"}</strong>
              </div>
              <div>
                <span>Rack / Location</span>
                <strong>{ticket.rackLabel || "-"}</strong>
              </div>
              <div>
                <span>Quantity Requested</span>
                <strong>{formatNumber(totals.joints)} joints</strong>
              </div>
              <div>
                <span>Release Date</span>
                <strong>{formatDate(ticket.releaseDate) || "-"}</strong>
              </div>
              <div>
                <span>Released To</span>
                <strong>{ticket.releasedTo || ticket.shipTo || "-"}</strong>
              </div>
              <div>
                <span>Ship Date</span>
                <strong>{formatDate(ticket.shipDate) || "-"}</strong>
              </div>
              <div>
                <span>Carrier</span>
                <strong>{ticket.carrier || "-"}</strong>
              </div>
              <div>
                <span>Destination</span>
                <strong>{ticket.destination || "-"}</strong>
              </div>
              <div>
                <span>Signed By</span>
                <strong>{ticket.carrierName || "-"}</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>Submitted</strong>
              </div>
            </>
          ) : (
            <>
              <div>
                <span>Company</span>
                <strong>{ticket.company}</strong>
              </div>
              <div>
                <span>Carrier</span>
                <strong>{ticket.carrier || "-"}</strong>
              </div>
              <div>
                <span>PO Number</span>
                <strong>{ticket.poNumber || "-"}</strong>
              </div>
              <div>
                <span>Truck Number</span>
                <strong>{ticket.truckNumber || "-"}</strong>
              </div>
              {isReceivingMasterPrint && (
                <div>
                  <span>Truck Tickets</span>
                  <strong>{formatNumber(ticket.truckCount)}</strong>
                </div>
              )}
              {isReceivingTruckPrint && (
                <>
                  <div>
                    <span>Driver</span>
                    <strong>{ticket.driverName || ticket.carrierName || "-"}</strong>
                  </div>
                  <div>
                    <span>Truck / Unit</span>
                    <strong>{ticket.truckUnitNumber || "-"}</strong>
                  </div>
                  <div>
                    <span>Trailer</span>
                    <strong>{ticket.trailerNumber || "-"}</strong>
                  </div>
                </>
              )}
              <div>
                <span>{ticket.type === "shipping" ? "Ship To" : ticket.type === "transfer" ? "From" : "Received From"}</span>
                <strong>{ticket.type === "shipping" ? ticket.shipTo || "-" : ticket.receivedFrom || "-"}</strong>
              </div>
              <div>
                <span>{ticket.type === "transfer" ? "To" : "Destination"}</span>
                <strong>{ticket.destination || "-"}</strong>
              </div>
            </>
          )}
        </section>

        {ticket.type === "receiving" && (
          <section className="ticket-info-grid protector-grid">
            <div>
              <span>Missing Box Protectors</span>
              <strong>{formatNumber(ticket.missingBoxProtectors)}</strong>
            </div>
            <div>
              <span>Missing Pin Protectors</span>
              <strong>{formatNumber(ticket.missingPinProtectors)}</strong>
            </div>
          </section>
        )}

        {isReceivingMasterPrint && receivingSizeTotals.length > 0 && (
          <section className="ticket-notes">
            <h3>Receiving Summary By Size</h3>
            <table className="ticket-table ticket-summary-table">
              <thead>
                <tr>
                  <th>Pipe Size</th>
                  <th>Joints</th>
                  <th>Footage</th>
                  <th>Missing Box</th>
                  <th>Missing Pin</th>
                </tr>
              </thead>
              <tbody>
                {receivingSizeTotals.map((row) => (
                  <tr key={row.size}>
                    <td>{row.size}</td>
                    <td>{formatNumber(row.joints)}</td>
                    <td>{formatNumber(row.footage)}</td>
                    <td>{formatNumber(row.missingBoxProtectors)}</td>
                    <td>{formatNumber(row.missingPinProtectors)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {isReceivingMasterPrint && receivingSpecTotals.length > 0 && (
          <section className="ticket-notes">
            <h3>Receiving Summary By Complete Pipe Description</h3>
            <table className="ticket-table ticket-summary-table">
              <thead>
                <tr>
                  <th>Pipe Description</th>
                  <th>Joints</th>
                  <th>Footage</th>
                  <th>Missing Box</th>
                  <th>Missing Pin</th>
                  <th>Truck Breakdown</th>
                </tr>
              </thead>
              <tbody>
                {receivingSpecTotals.map((row) => (
                  <tr key={row.description}>
                    <td>{row.description}</td>
                    <td>{formatNumber(row.joints)}</td>
                    <td>{formatNumber(row.footage)}</td>
                    <td>{formatNumber(row.missingBoxProtectors)}</td>
                    <td>{formatNumber(row.missingPinProtectors)}</td>
                    <td>
                      {Array.from(row.trucks.entries())
                        .map(([truck, joints]) => `${truck}: ${formatNumber(joints)} jts`)
                        .join("; ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        <table className="ticket-table">
          <thead>
            <tr>
              {isReceivingMasterPrint && <th>Truck / BOL</th>}
              {ticket.type === "receiving" && <th>Customer / Owner</th>}
              <th>TU#</th>
              <th>Part Number</th>
              {(ticket.type === "receiving" || ticket.type === "release") && (
                <>
                  <th>Size</th>
                  {ticket.type === "receiving" && <th>Weight</th>}
                  <th>Grade</th>
                  <th>Connection</th>
                </>
              )}
              <th>Range</th>
              <th>Condition</th>
              <th>Joints</th>
              <th>Footage</th>
              {ticket.type === "receiving" && (
                <>
                  <th>Missing Box</th>
                  <th>Missing Pin</th>
                  <th>Notes</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                {isReceivingMasterPrint && (
                  <td>{makeTruckLabel(line.receivingTicketTruckId ? receivingTruckById.get(line.receivingTicketTruckId) : undefined)}</td>
                )}
                {ticket.type === "receiving" && <td>{line.company || ticket.company || "-"}</td>}
                <td>{line.afe}</td>
                <td>{line.partNumber}</td>
                {(ticket.type === "receiving" || ticket.type === "release") && (
                  <>
                    <td>{line.size || "-"}</td>
                    {ticket.type === "receiving" && <td>{line.weight || "-"}</td>}
                    <td>{line.grade || "-"}</td>
                    <td>{line.connection || "-"}</td>
                  </>
                )}
                <td>{line.pipeRange}</td>
                <td>{line.condition}</td>
                <td>{formatNumber(line.joints)}</td>
                <td>{formatNumber(line.footage)}</td>
                {ticket.type === "receiving" && (
                  <>
                    <td>{formatNumber(line.missingBoxProtectors ?? 0)}</td>
                    <td>{formatNumber(line.missingPinProtectors ?? 0)}</td>
                    <td>{line.notes || "-"}</td>
                  </>
                )}
              </tr>
            ))}
            <tr>
              <td colSpan={lineTablePrefixColumnCount}>
                <strong>Totals</strong>
              </td>
              <td>
                <strong>{formatNumber(totals.joints)}</strong>
              </td>
              <td>
                <strong>{formatNumber(totals.footage)}</strong>
              </td>
              {ticket.type === "receiving" && (
                <>
                  <td>
                    <strong>{formatNumber(ticket.missingBoxProtectors)}</strong>
                  </td>
                  <td>
                    <strong>{formatNumber(ticket.missingPinProtectors)}</strong>
                  </td>
                  <td />
                </>
              )}
            </tr>
          </tbody>
        </table>

        <section className="ticket-notes">
          <h3>Notes</h3>
          <p>{ticket.notes || "No notes."}</p>
        </section>

        {attachments.length > 0 && (
          <section className="ticket-notes ticket-attachments-print">
            <h3>Attachments</h3>
            {attachments.map((attachment) => (
              <p key={attachment.id}>
                <a href={attachment.fileUrl} target="_blank" rel="noreferrer">
                  {attachment.fileName}
                </a>
              </p>
            ))}
          </section>
        )}

        {showSignatureGrid && (
          <section className={`signature-grid ${ticket.type === "release" ? "signature-grid-single" : ""}`}>
            {ticket.type !== "release" && (
              <div>
                <span>
                  {ticket.pathfinderName && <strong className="printed-signer-name">{ticket.pathfinderName}</strong>}
                  {printSignatures.pathfinderSignature && (
                    <img src={printSignatures.pathfinderSignature} alt="Pathfinder Representative Signature" />
                  )}
                </span>
                <p>Pathfinder Representative</p>
              </div>
            )}
            <div>
              <span>
                {ticket.carrierName && <strong className="printed-signer-name">{ticket.carrierName}</strong>}
                {printSignatures.carrierSignature && (
                  <img src={printSignatures.carrierSignature} alt={ticket.type === "release" ? "Customer Release Signature" : "Carrier / Driver Signature"} />
                )}
              </span>
              <p>{ticket.type === "release" ? "Customer Release Signature" : "Carrier / Driver Signature"}</p>
            </div>
          </section>
        )}
      </section>
    </main>
  );
}
