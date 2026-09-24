import { invoiceAdminClient } from "../../../../lib/serverInvoiceApprovals";
import { sendInvoiceDueReminders } from "../../../../lib/invoiceApprovalNotifications";

export const runtime = "nodejs";

function authorized(request: Request) {
  const secret = process.env.INVOICE_REMINDER_SECRET || process.env.CRON_SECRET || "";
  if (!secret) return process.env.NODE_ENV !== "production";
  const bearer = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  return bearer === secret || request.headers.get("x-cron-secret") === secret;
}

async function run(request: Request) {
  if (!authorized(request)) return Response.json({ error: "Unauthorized." }, { status: 401 });
  try {
    return Response.json({ ok: true, ...(await sendInvoiceDueReminders(invoiceAdminClient())) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
