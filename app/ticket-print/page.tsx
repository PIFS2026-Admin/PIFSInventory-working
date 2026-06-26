"use client";

import { useEffect, useMemo, useState } from "react";
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
  shipTo: string;
  receivedFrom: string;
  destination: string;
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
  afe: string;
  partNumber: string;
  size?: string;
  grade?: string;
  connection?: string;
  pipeRange: "Range 2" | "Range 3";
  condition: string;
  joints: number;
  footage: number;
};

type TicketAttachment = {
  id: string;
  fileName: string;
  fileUrl: string;
  documentType: string;
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
  shipTo: "",
  receivedFrom: "",
  destination: "",
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

function getCompanyName(value: unknown) {
  const readName = (item: unknown) => {
    if (!item || typeof item !== "object" || !("name" in item)) return "";
    const name = (item as { name?: unknown }).name;
    return typeof name === "string" ? name : "";
  };

  if (Array.isArray(value)) return readName(value[0]);
  return readName(value);
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
  const [attachments, setAttachments] = useState<TicketAttachment[]>([]);
  const [printSignatures, setPrintSignatures] = useState({
    pathfinderSignature: "",
    carrierSignature: "",
  });
  const [error, setError] = useState("");

  const totals = useMemo(() => {
    return lines.reduce(
      (sum, line) => ({
        joints: sum.joints + Number(line.joints || 0),
        footage: sum.footage + Number(line.footage || 0),
      }),
      { joints: 0, footage: 0 }
    );
  }, [lines]);

  useEffect(() => {
    async function loadTicket() {
      const type = (getParam("type") || "receiving") as TicketType;
      const id = getParam("id");

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

        let partLines = Array.isArray(data.part_lines) ? data.part_lines : [];

        if (partLines.length === 0 && data.company_id && data.rack_id) {
          const { data: inventoryRows } = await supabase
            .from("pipe_inventory")
            .select("afe, part_number, size, grade, connection, pipe_range, condition, bulk_joints, total_joints, bulk_footage, total_footage")
            .eq("company_id", data.company_id)
            .eq("rack_id", data.rack_id);

          partLines = (inventoryRows ?? []).map((row: any) => {
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
          carrier: "",
          poNumber: "",
          truckNumber: "",
          shipTo: "",
          receivedFrom: data.yard_name ?? "",
          destination: data.rack_label ?? "",
          missingBoxProtectors: 0,
          missingPinProtectors: 0,
          pathfinderName: "",
          pathfinderSignature: "",
          carrierName: data.signature_name ?? "",
          carrierSignature: data.signature_data ?? "",
          notes: data.notes ?? "",
          createdAt: data.created_at ?? "",
        });

        setLines(
          partLines.map((line: any, index: number) => {
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
          })
        );

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

        let details: any = {};

        try {
          details = JSON.parse(data.file_url || "{}");
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
          shipTo: "",
          receivedFrom: details.fromLocation ?? "",
          destination: details.toLocation ?? "",
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
          shipTo: data.ship_to ?? "",
          receivedFrom: "",
          destination: data.destination ?? "",
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
          (lineData ?? []).map((line: any) => {
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
          (attachmentData ?? []).map((attachment: any) => ({
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

      setTicket({
        id: data.id,
        type: "receiving",
        ticketNumber: data.ticket_number ?? "",
        bolNumber: "",
        documentType: "",
        company: companyName,
        carrier: data.carrier ?? "",
        poNumber: data.po_number ?? "",
        truckNumber: data.truck_number ?? "",
        shipTo: "",
        receivedFrom: companyName,
        destination: data.destination ?? "-",
        missingBoxProtectors: Number(data.missing_box_protectors ?? 0),
        missingPinProtectors: Number(data.missing_pin_protectors ?? 0),
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
        .eq("receiving_ticket_id", data.id)
        .order("id", { ascending: true });

      if (lineError) {
        setError(lineError.message);
        return;
      }

      const mappedLines = (lineData ?? []).map((line: any) => {
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
      });

      setLines(
        mappedLines.length > 0
          ? mappedLines
          : [
              {
                id: data.id,
                afe: data.afe ?? "",
                partNumber: data.part_number ?? "",
                pipeRange: normalizePipeRange(data.pipe_range),
                condition: data.condition ?? "",
                joints: Number(data.joints ?? 0),
                footage: calculateRangeFootage(Number(data.joints ?? 0), normalizePipeRange(data.pipe_range)),
              },
            ]
      );

      const { data: attachmentData, error: attachmentError } = await supabase
        .from("documents")
        .select("id, document_type, file_url, file_name")
        .eq("receiving_ticket_id", data.id)
        .order("created_at", { ascending: true });

      if (attachmentError) {
        setError(attachmentError.message);
        return;
      }

      setAttachments(
        (attachmentData ?? []).map((attachment: any) => ({
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
    window.location.href = "/";
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
                    : "Receiving Ticket"}
            </h2>
            <p>{ticket.ticketNumber}</p>
            {ticket.type === "transfer" && (
              <p>{ticket.receivedFrom || "-"} to {ticket.destination || "-"}</p>
            )}
          </div>
          <div className="ticket-date-box">
            <span>Date</span>
            <strong>{formatDate(ticket.createdAt)}</strong>
            {ticket.type === "shipping" && (
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
                <strong>{ticket.destination || "-"}</strong>
              </div>
              <div>
                <span>Quantity Requested</span>
                <strong>{formatNumber(totals.joints)} joints</strong>
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

        <table className="ticket-table">
          <thead>
            <tr>
              <th>TU#</th>
              <th>Part Number</th>
              {ticket.type === "release" && (
                <>
                  <th>Size</th>
                  <th>Grade</th>
                  <th>Connection</th>
                </>
              )}
              <th>Range</th>
              <th>Condition</th>
              <th>Joints</th>
              <th>Footage</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>{line.afe}</td>
                <td>{line.partNumber}</td>
                {ticket.type === "release" && (
                  <>
                    <td>{line.size || "-"}</td>
                    <td>{line.grade || "-"}</td>
                    <td>{line.connection || "-"}</td>
                  </>
                )}
                <td>{line.pipeRange}</td>
                <td>{line.condition}</td>
                <td>{formatNumber(line.joints)}</td>
                <td>{formatNumber(line.footage)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={ticket.type === "release" ? 7 : 4}>
                <strong>Totals</strong>
              </td>
              <td>
                <strong>{formatNumber(totals.joints)}</strong>
              </td>
              <td>
                <strong>{formatNumber(totals.footage)}</strong>
              </td>
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
      </section>
    </main>
  );
}
