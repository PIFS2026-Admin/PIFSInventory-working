"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type TicketType = "receiving" | "shipping" | "transfer";

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
  pipeRange: "Range 2" | "Range 3";
  condition: string;
  joints: number;
  footage: number;
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

export default function TicketPrintPage() {
  const [ticket, setTicket] = useState<Ticket>(emptyTicket);
  const [lines, setLines] = useState<TicketLine[]>([]);
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
          .eq("ticket_id", data.id)
          .order("id", { ascending: true });

        if (lineError) {
          setError(lineError.message);
          return;
        }

        setLines(
          (lineData ?? []).map((line) => {
            const pipeRange = normalizePipeRange(line.pipe_range);
            const joints = Number(line.joints ?? 0);

            return {
              id: line.id,
              afe: line.afe ?? "",
              partNumber: line.part_number ?? "",
              pipeRange,
              condition: line.condition ?? "",
              joints,
              footage: calculateRangeFootage(joints, pipeRange),
            };
          })
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

      setLines([
        {
          id: data.id,
          afe: data.afe ?? "",
          partNumber: data.part_number ?? "",
          pipeRange: normalizePipeRange(data.pipe_range),
          condition: data.condition ?? "",
          joints: Number(data.joints ?? 0),
          footage: calculateRangeFootage(Number(data.joints ?? 0), normalizePipeRange(data.pipe_range)),
        },
      ]);
    }

    loadTicket();
  }, []);

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
                <td>{line.pipeRange}</td>
                <td>{line.condition}</td>
                <td>{formatNumber(line.joints)}</td>
                <td>{formatNumber(line.footage)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={4}>
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

        <section className="signature-grid">
          <div>
            <span>
              {ticket.pathfinderName && <strong className="printed-signer-name">{ticket.pathfinderName}</strong>}
              {ticket.pathfinderSignature && <img src={ticket.pathfinderSignature} alt="Pathfinder Representative Signature" />}
            </span>
            <p>Pathfinder Representative</p>
          </div>
          <div>
            <span>
              {ticket.carrierName && <strong className="printed-signer-name">{ticket.carrierName}</strong>}
              {ticket.carrierSignature && <img src={ticket.carrierSignature} alt="Carrier / Driver Signature" />}
            </span>
            <p>Carrier / Driver Signature</p>
          </div>
        </section>
      </section>
    </main>
  );
}
