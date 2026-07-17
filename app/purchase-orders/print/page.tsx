"use client";

/* eslint-disable @next/next/no-img-element */

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { formatPoMoney, normalizePoStatus } from "../../../lib/purchaseOrderLifecycle";
import styles from "./print.module.css";

type PrintOrder = {
  id: string;
  poNumber: string;
  vendorName: string;
  vendorEmail: string;
  orderDate: string;
  requestedBy: string;
  department: string;
  budgetCode: string;
  costCenter: string;
  status: string;
  notes: string;
  totalAmount: number;
};

type PrintLine = {
  id: string;
  itemCode: string;
  description: string;
  quantityOrdered: number;
  quantityReceived: number;
  unitPrice: number;
  lineTotal: number;
  glCode: string;
};

function numberValue(value: unknown) {
  const parsed = Number(String(value ?? "0").replace(/[$,]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function dateText(value: unknown) {
  if (!value) return "-";
  return String(value).slice(0, 10);
}

function PurchaseOrderPrintContent() {
  const params = useSearchParams();
  const poId = params.get("id") || "";
  const [order, setOrder] = useState<PrintOrder | null>(null);
  const [lines, setLines] = useState<PrintLine[]>([]);
  const [message, setMessage] = useState("Loading purchase order...");

  const totals = useMemo(() => ({
    ordered: lines.reduce((sum, line) => sum + line.quantityOrdered, 0),
    received: lines.reduce((sum, line) => sum + line.quantityReceived, 0),
    amount: lines.reduce((sum, line) => sum + line.lineTotal, 0),
  }), [lines]);

  useEffect(() => {
    async function loadPrintOrder() {
      if (!poId) {
        setMessage("Missing purchase order id.");
        return;
      }

      const { data: orderData, error: orderError } = await supabase
        .from("purchase_orders")
        .select("*")
        .eq("id", poId)
        .single();

      if (orderError || !orderData) {
        setMessage(orderError?.message || "Purchase order not found.");
        return;
      }

      const { data: lineData, error: lineError } = await supabase
        .from("purchase_order_lines")
        .select("*")
        .eq("purchase_order_id", poId)
        .order("created_at");

      if (lineError) {
        setMessage(lineError.message);
        return;
      }

      setOrder({
        id: orderData.id,
        poNumber: orderData.po_number || "",
        vendorName: orderData.vendor_name || "",
        vendorEmail: orderData.vendor_email || "",
        orderDate: dateText(orderData.order_date),
        requestedBy: orderData.requested_by || "",
        department: orderData.department || "",
        budgetCode: orderData.budget_code || "",
        costCenter: orderData.cost_center || "",
        status: normalizePoStatus(orderData.status),
        notes: orderData.notes || "",
        totalAmount: numberValue(orderData.total_amount ?? orderData.total_value),
      });
      setLines(
        (lineData || []).map((line) => ({
          id: line.id,
          itemCode: line.item_code || "",
          description: line.description || line.item_name || "",
          quantityOrdered: numberValue(line.quantity_ordered),
          quantityReceived: numberValue(line.quantity_received),
          unitPrice: numberValue(line.unit_price ?? line.unit_cost),
          lineTotal: numberValue(line.line_total),
          glCode: line.gl_code || "",
        })),
      );
      setMessage("");
    }

    void loadPrintOrder();
  }, [poId]);

  if (!order) {
    return (
      <main className={styles.shell}>
        <section className={styles.sheet}>{message}</section>
      </main>
    );
  }

  return (
    <main className={styles.shell}>
      <div className={`${styles.actions} no-print`}>
        <button className="button" onClick={() => window.location.assign("/purchase-orders")}>Back to POs</button>
        <button className="button primary" onClick={() => window.print()}>Print / Save PDF</button>
      </div>

      <section className={styles.sheet}>
        <header className={styles.header}>
          <img src="/titan_logo.jpg" alt="TITAN" />
          <div>
            <p>Purchase Order</p>
            <h1>{order.poNumber}</h1>
            <span>{order.status}</span>
          </div>
        </header>

        <section className={styles.metaGrid}>
          <div><span>Vendor</span><strong>{order.vendorName || "-"}</strong></div>
          <div><span>Vendor Email</span><strong>{order.vendorEmail || "-"}</strong></div>
          <div><span>Order Date</span><strong>{order.orderDate}</strong></div>
          <div><span>Requested By</span><strong>{order.requestedBy || "-"}</strong></div>
          <div><span>Department</span><strong>{order.department || "-"}</strong></div>
          <div><span>Cost Code</span><strong>{order.costCenter || order.budgetCode || "-"}</strong></div>
        </section>

        <table className={styles.table}>
          <thead>
            <tr>
              <th>Item ID</th>
              <th>Description</th>
              <th>GL</th>
              <th>Ordered</th>
              <th>Received</th>
              <th>Unit</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id}>
                <td>{line.itemCode || "-"}</td>
                <td>{line.description}</td>
                <td>{line.glCode || "-"}</td>
                <td>{line.quantityOrdered.toLocaleString()}</td>
                <td>{line.quantityReceived.toLocaleString()}</td>
                <td>{formatPoMoney(line.unitPrice)}</td>
                <td>{formatPoMoney(line.lineTotal)}</td>
              </tr>
            ))}
            {lines.length === 0 && <tr><td colSpan={7}>No line items found.</td></tr>}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>Totals</td>
              <td>{totals.ordered.toLocaleString()}</td>
              <td>{totals.received.toLocaleString()}</td>
              <td />
              <td>{formatPoMoney(order.totalAmount || totals.amount)}</td>
            </tr>
          </tfoot>
        </table>

        {order.notes && (
          <section className={styles.notes}>
            <span>Notes</span>
            <p>{order.notes}</p>
          </section>
        )}

        <footer className={styles.footer}>
          <strong>Pathfinder Inspections & Field Services</strong>
          <span>7501 Groening St. / Odessa, TX 79765 / (432) 233-3600 / pifstitan.com</span>
        </footer>
      </section>
    </main>
  );
}

export default function PurchaseOrderPrintPage() {
  return (
    <Suspense fallback={<main className={styles.shell}><section className={styles.sheet}>Loading purchase order...</section></main>}>
      <PurchaseOrderPrintContent />
    </Suspense>
  );
}
