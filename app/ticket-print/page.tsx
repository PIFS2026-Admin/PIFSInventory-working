"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

type TicketType = "receiving" | "shipping";

type Ticket = {
  id: string;
  type: TicketType;
  ticketNumber: string;
  bolNumber: string;
  company: string;
  carrier: string;
  poNumber: string;
  truckNumber: string;
  shipTo: string;
  receivedFrom: string;
  destination: string;
  notes: string;
  createdAt: string;
};

type TicketLine = {
  id: string;
  afe: string;
  partNumber: string;
  condition: string;
  joints: number;
  footage: number;
};

const emptyTicket: Ticket = {
  id: "",
  type: "receiving",
  ticketNumber: "",
  bolNumber: "",
  company: "",
  carrier: "",
  poNumber: "",
  truckNumber: "",
  shipTo: "",
  receivedFrom: "",
  destination: "",
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

      if (type === "shipping") {
        let query = supabase
          .from("shipping_tickets")
          .select(
            "id, ticket_number, bol_number, carrier, po_number, truck_number, ship_to, destination, notes, created_at, companies(name)"
          );

        query = isUuid(id) ? query.eq("id", id) : query.eq("ticket_number", id);

        const { data, error } = await query.single();

        if (error) {
          setError(error.message);
          return;
        }

        setTicket({
          id: data.id,
          type: "shipping",
          ticketNumber: data.ticket_number ?? "",
          bolNumber: data.bol_number ?? "",
          company: data.companies?.name ?? "",
          carrier: data.carrier ?? "",
          poNumber: data.po_number ?? "",
          truckNumber: data.truck_number ?? "",
          shipTo: data.ship_to ?? "",
          receivedFrom: "",
          destination: data.destination ?? "",
          notes: data.notes ?? "",
          createdAt: data.created_at ?? "",
        });

        const { data: lineData, error: lineError } = await supabase
          .from("ticket_line_items")
          .select("id, afe, part_number, condition, joints, footage")
          .eq("ticket_id", data.id)
          .order("created_at", { ascending: true });

        if (lineError) {
          setError(lineError.message);
          return;
        }

        setLines(
          (lineData ?? []).map((line) => ({
            id: line.id,
            afe: line.afe ?? "",
            partNumber: line.part_number ?? "",
            condition: line.condition ?? "",
            joints: Number(line.joints ?? 0),
            footage: Number(line.footage ?? 0),
          }))
        );

        return;
      }

      let query = supabase
        .from("receiving_tickets")
        .select(
          "id, ticket_number, carrier, po_number, truck_number, destination, notes, created_at, afe, part_number, condition, joints, footage, companies(name)"
        );

      query = isUuid(id) ? query.eq("id", id) : query.eq("ticket_number", id);

      const { data, error } = await query.single();

      if (error) {
        setError(error.message);
        return;
      }

      setTicket({
        id: data.id,
        type: "receiving",
        ticketNumber: data.ticket_number ?? "",
        bolNumber: "",
        company: data.companies?.name ?? "",
        carrier: data.carrier ?? "",
        poNumber: data.po_number ?? "",
        truckNumber: data.truck_number ?? "",
        shipTo: "",
        receivedFrom: data.companies?.name ?? "",
        destination: data.destination ?? "-",
        notes: data.notes ?? "",
        createdAt: data.created_at ?? "",
      });

      setLines([
        {
          id: data.id,
          afe: data.afe ?? "",
          partNumber: data.part_number ?? "",
          condition: data.condition ?? "",
          joints: Number(data.joints ?? 0),
          footage: Number(data.footage ?? 0),
        },
      ]);
    }

    loadTicket();
  }, []);

  if (error) {
    return <main className="print-page"><section className="print-sheet">{error}</section></main>;
  }

  return (
    <main className="print-page">
      <div className="print-actions">
        <button className="button" onClick={() => history.back()}>Back</button>
        <button className="button primary" onClick={() => window.print()}>Print / Save PDF</button>
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
            <h2>{ticket.type === "shipping" ? "Shipping Ticket / Bill of Lading" : "Receiving Ticket"}</h2>
            <p>{ticket.ticketNumber}</p>
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
          <div><span>Company</span><strong>{ticket.company}</strong></div>
          <div><span>Carrier</span><strong>{ticket.carrier || "-"}</strong></div>
          <div><span>PO Number</span><strong>{ticket.poNumber || "-"}</strong></div>
          <div><span>Truck Number</span><strong>{ticket.truckNumber || "-"}</strong></div>
          <div>
            <span>{ticket.type === "shipping" ? "Ship To" : "Received From"}</span>
            <strong>{ticket.type === "shipping" ? ticket.shipTo || "-" : ticket.receivedFrom || "-"}</strong>
          </div>
          <div><span>Destination</span><strong>{ticket.destination || "-"}</strong></div>
        </section>

        <table className="ticket-table">
          <thead>
            <tr>
              <th>TU#</th>
              <th>Part Number</th>
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
                <td>{line.condition}</td>
                <td>{formatNumber(line.joints)}</td>
                <td>{formatNumber(line.footage)}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={3}><strong>Totals</strong></td>
              <td><strong>{formatNumber(totals.joints)}</strong></td>
              <td><strong>{formatNumber(totals.footage)}</strong></td>
            </tr>
          </tbody>
        </table>

        <section className="ticket-notes">
          <h3>Notes</h3>
          <p>{ticket.notes || "No notes."}</p>
        </section>

        <section className="signature-grid">
          <div><span></span><p>Pathfinder Representative</p></div>
          <div><span></span><p>Carrier / Driver Signature</p></div>
          <div><span></span><p>Customer Representative</p></div>
        </section>
      </section>
    </main>
  );
}