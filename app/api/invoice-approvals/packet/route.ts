import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { invoiceCanView, invoiceErrorResponse, invoiceRequestContext, invoiceSchemaMissing } from "../../../../lib/serverInvoiceApprovals";

export const runtime = "nodejs";

function clean(value: unknown) {
  return String(value ?? "").replace(/[^\x20-\x7E]/g, " ").trim();
}

function money(value: unknown) {
  return Number(value || 0).toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function dateTime(value: unknown) {
  const raw = String(value || "");
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw);
  return Number.isNaN(date.getTime()) ? "-" : date.toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

function wrap(text: string, width: number) {
  const words = clean(text).split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";
  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > width && line) {
      lines.push(line);
      line = word;
    } else line = candidate;
  });
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

export async function GET(request: Request) {
  try {
    const context = await invoiceRequestContext(request);
    if (!context.invoicePermissions.export) throw new Error("You do not have permission to export approved packets.");
    const invoiceId = new URL(request.url).searchParams.get("invoiceId") || "";
    const invoiceResult = await context.admin.from("titan_ap_invoices").select("*").eq("id", invoiceId).single();
    if (invoiceResult.error || !invoiceResult.data) throw new Error("Invoice not found.");
    const invoice = invoiceResult.data;
    if (!invoiceCanView(context, invoice)) throw new Error("You do not have access to this invoice.");
    if (!["approved", "posted", "paid", "archived"].includes(invoice.status)) throw new Error("The approved packet is available after approval.");

    const [approvalResult, fileResult, supportingResult] = await Promise.all([
      context.admin.from("titan_ap_invoice_approvals").select("*").eq("invoice_id", invoiceId).single(),
      context.admin.from("titan_ap_invoice_files").select("*").eq("invoice_id", invoiceId).eq("is_current", true).single(),
      context.admin.from("titan_ap_invoice_files").select("*").eq("invoice_id", invoiceId).eq("file_kind", "supporting").order("version_number", { ascending: true }),
    ]);
    if (approvalResult.error || !approvalResult.data) throw new Error("The authenticated approval record is missing.");
    if (fileResult.error || !fileResult.data) throw new Error("The original invoice file is missing.");
    if (supportingResult.error) throw supportingResult.error;
    const approval = approvalResult.data;
    const storedFile = fileResult.data;
    const [downloaded, signatureDownload] = await Promise.all([
      context.admin.storage.from(storedFile.storage_bucket).download(storedFile.storage_path),
      approval.signature_storage_path
        ? context.admin.storage.from(approval.signature_storage_bucket || storedFile.storage_bucket).download(approval.signature_storage_path)
        : Promise.resolve({ data: null, error: null }),
    ]);
    if (downloaded.error || !downloaded.data) throw downloaded.error || new Error("The invoice file could not be downloaded.");
    if (signatureDownload.error) throw signatureDownload.error;
    const sourceBytes = new Uint8Array(await downloaded.data.arrayBuffer());
    const signatureBytes = signatureDownload.data ? new Uint8Array(await signatureDownload.data.arrayBuffer()) : null;
    const supportingDocuments = await Promise.all((supportingResult.data || []).map(async (file) => {
      const result = await context.admin.storage.from(file.storage_bucket).download(file.storage_path);
      if (result.error || !result.data) throw result.error || new Error(`Supporting document ${file.original_file_name} could not be downloaded.`);
      return { file, bytes: new Uint8Array(await result.data.arrayBuffer()) };
    }));

    const packet = await PDFDocument.create();
    const regular = await packet.embedFont(StandardFonts.Helvetica);
    const bold = await packet.embedFont(StandardFonts.HelveticaBold);
    let page = packet.addPage([612, 792]);
    let y = 748;
    const orange = rgb(1, 0.455, 0.09);
    const dark = rgb(0.08, 0.1, 0.13);
    const muted = rgb(0.35, 0.4, 0.47);

    const write = (value: string, x: number, size = 10, font = regular, color = dark) => {
      page.drawText(clean(value), { x, y, size, font, color });
    };
    const field = (label: string, value: unknown, x: number, top: number) => {
      y = top;
      page.drawText(label.toUpperCase(), { x, y, size: 7, font: bold, color: orange });
      page.drawText(clean(value) || "-", { x, y: y - 15, size: 10, font: bold, color: dark });
    };

    write("TITAN", 44, 11, bold, orange);
    y -= 27;
    write("APPROVED INVOICE PACKET", 44, 22, bold);
    y -= 17;
    write("Authenticated approval and accounting coding", 44, 10, regular, muted);
    page.drawLine({ start: { x: 44, y: y - 16 }, end: { x: 568, y: y - 16 }, thickness: 2, color: orange });

    field("Vendor", invoice.vendor_name, 44, 658);
    field("Invoice Number", invoice.invoice_number, 320, 658);
    field("Invoice Date", invoice.invoice_date, 44, 610);
    field("Due Date", invoice.due_date || "-", 180, 610);
    field("Invoice Total", money(invoice.total_amount), 320, 610);
    field("Status", clean(invoice.status).replaceAll("_", " ").toUpperCase(), 470, 610);

    y = 552;
    write("ACCOUNTING CODING", 44, 10, bold, orange);
    y -= 23;
    page.drawRectangle({ x: 44, y: y - 5, width: 524, height: 20, color: rgb(0.92, 0.93, 0.95) });
    page.drawText("CODE", { x: 50, y, size: 7, font: bold, color: muted });
    page.drawText("DESCRIPTION / ALLOCATION", { x: 145, y, size: 7, font: bold, color: muted });
    page.drawText("AMOUNT", { x: 500, y, size: 7, font: bold, color: muted });
    y -= 24;
    const lines = Array.isArray(approval.coding_snapshot) ? approval.coding_snapshot : [];
    for (const line of lines) {
      if (y < 110) {
        page = packet.addPage([612, 792]);
        y = 748;
      }
      const detail = [line.accounting_code_description, line.cost_center && `Cost center: ${line.cost_center}`, line.department && `Department: ${line.department}`, line.job_number && `Job: ${line.job_number}`, line.description].filter(Boolean).join(" | ");
      page.drawText(clean(line.accounting_code), { x: 50, y, size: 9, font: bold, color: dark });
      const detailLines = wrap(detail || "-", 62).slice(0, 3);
      detailLines.forEach((detailLine, index) => page.drawText(detailLine, { x: 145, y: y - index * 11, size: 8, font: regular, color: dark }));
      page.drawText(money(line.amount), { x: 500, y, size: 9, font: bold, color: dark });
      const rowHeight = Math.max(25, detailLines.length * 11 + 7);
      page.drawLine({ start: { x: 44, y: y - rowHeight + 7 }, end: { x: 568, y: y - rowHeight + 7 }, thickness: 0.5, color: rgb(0.8, 0.82, 0.85) });
      y -= rowHeight;
    }
    page.drawText(`CODING TOTAL  ${money(approval.approved_total)}`, { x: 385, y: y - 5, size: 10, font: bold, color: dark });

    y -= 54;
    if (y < (signatureBytes ? 280 : 155)) {
      page = packet.addPage([612, 792]);
      y = 748;
    }
    write("ELECTRONIC APPROVAL", 44, 10, bold, orange);
    y -= 22;
    wrap(approval.approval_statement, 85).forEach((line) => {
      write(line, 44, 9, regular, dark);
      y -= 12;
    });
    y -= 8;
    if (signatureBytes) {
      const signatureImage = await packet.embedPng(signatureBytes);
      const dimensions = signatureImage.scaleToFit(240, 72);
      page.drawImage(signatureImage, { x: 44, y: y - dimensions.height, width: dimensions.width, height: dimensions.height });
      y -= dimensions.height + 12;
    }
    write(`Approved and signed by: ${approval.approver_name}`, 44, 10, bold);
    y -= 16;
    write(`TITAN user ID: ${approval.approver_id}`, 44, 8, regular, muted);
    y -= 14;
    write(`Date and time: ${dateTime(approval.approved_at)}`, 44, 8, regular, muted);
    y -= 14;
    write(`Signature method: ${approval.signature_version}`, 44, 8, regular, muted);
    y -= 14;
    if (approval.signature_sha256) {
      write(`Signature SHA-256: ${approval.signature_sha256}`, 44, 7, regular, muted);
      y -= 12;
    }
    write(`Original file SHA-256: ${approval.original_file_sha256}`, 44, 7, regular, muted);

    if (invoice.posted_at) {
      y -= 32;
      if (y < 125) {
        page = packet.addPage([612, 792]);
        y = 748;
      }
      write("AP CLOSEOUT", 44, 10, bold, orange);
      y -= 20;
      write(`Posted: ${dateTime(invoice.posted_at)} by ${invoice.posted_by_name || "TITAN AP"}`, 44, 9, bold);
      y -= 14;
      write(`Posting reference: ${invoice.posting_reference || "-"}`, 44, 8, regular, muted);
      if (invoice.paid_at) {
        y -= 17;
        write(`Paid: ${dateTime(invoice.payment_date)} by ${invoice.paid_by_name || "TITAN AP"}`, 44, 9, bold);
        y -= 14;
        write(`Payment reference: ${invoice.payment_reference || "-"}`, 44, 8, regular, muted);
      }
      if (invoice.archived_at) {
        y -= 17;
        write(`Archived: ${dateTime(invoice.archived_at)} by ${invoice.archived_by_name || "TITAN AP"}`, 44, 9, bold);
        if (invoice.archive_note) {
          y -= 14;
          wrap(invoice.archive_note, 85).slice(0, 3).forEach((line) => {
            write(line, 44, 8, regular, muted);
            y -= 11;
          });
        }
      }
    }

    if (storedFile.mime_type === "application/pdf") {
      const original = await PDFDocument.load(sourceBytes);
      const copied = await packet.copyPages(original, original.getPageIndices());
      copied.forEach((originalPage) => packet.addPage(originalPage));
    } else {
      const image = storedFile.mime_type === "image/png" ? await packet.embedPng(sourceBytes) : await packet.embedJpg(sourceBytes);
      const dimensions = image.scaleToFit(540, 720);
      const originalPage = packet.addPage([612, 792]);
      originalPage.drawImage(image, { x: (612 - dimensions.width) / 2, y: (792 - dimensions.height) / 2, width: dimensions.width, height: dimensions.height });
    }

    for (const document of supportingDocuments) {
      const label = `${clean(document.file.document_type || "Supporting document").replaceAll("_", " ").toUpperCase()}: ${clean(document.file.original_file_name)}`;
      if (document.file.mime_type === "application/pdf") {
        const supportingPdf = await PDFDocument.load(document.bytes);
        const pages = await packet.copyPages(supportingPdf, supportingPdf.getPageIndices());
        pages.forEach((supportingPage, index) => {
          if (index === 0) supportingPage.drawText(label, { x: 18, y: supportingPage.getHeight() - 18, size: 7, font: bold, color: orange });
          packet.addPage(supportingPage);
        });
      } else {
        const image = document.file.mime_type === "image/png" ? await packet.embedPng(document.bytes) : await packet.embedJpg(document.bytes);
        const dimensions = image.scaleToFit(540, 690);
        const supportingPage = packet.addPage([612, 792]);
        supportingPage.drawText(label, { x: 36, y: 760, size: 8, font: bold, color: orange });
        supportingPage.drawImage(image, { x: (612 - dimensions.width) / 2, y: 36, width: dimensions.width, height: dimensions.height });
      }
    }

    const bytes = await packet.save();
    const fileName = `Approved-${safeName(invoice.vendor_name)}-${safeName(invoice.invoice_number)}.pdf`;
    return new Response(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    if (invoiceSchemaMissing(error)) return Response.json({ error: "Run supabase/titan_invoice_approval.sql to enable Invoice Approvals." }, { status: 503 });
    return invoiceErrorResponse(error);
  }
}

function safeName(value: unknown) {
  return clean(value).replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "invoice";
}
