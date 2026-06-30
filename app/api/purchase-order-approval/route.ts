import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const adminClient =
  supabaseUrl && serviceRoleKey
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
    : null;

const submitRoles = new Set(["admin", "inventory_specialist", "inventory_manager"]);
const managementRoles = new Set(["admin", "inventory_manager"]);

function normalizeRole(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replaceAll(" ", "_");
}

function messageFromError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

async function getActor(request: Request) {
  if (!adminClient) throw new Error("Supabase service role is not configured.");

  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("Missing authorization token.");

  const { data: authData, error: authError } = await adminClient.auth.getUser(token);
  if (authError || !authData.user) throw new Error("Invalid authorization token.");

  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, full_name, role")
    .eq("id", authData.user.id)
    .single();

  if (profileError || !profile) throw new Error("User profile not found.");

  return {
    id: authData.user.id,
    email: authData.user.email ?? "",
    fullName: String(profile.full_name ?? authData.user.email ?? "TITAN user"),
    role: normalizeRole(profile.role),
  };
}

export async function POST(request: Request) {
  try {
    if (!adminClient) {
      return Response.json({ error: "Supabase service role is not configured." }, { status: 500 });
    }

    const actor = await getActor(request);
    const body = await request.json().catch(() => ({}));
    const poId = String(body.poId ?? "").trim();
    const action = String(body.action ?? "").trim().toLowerCase();
    const vendorEmail = String(body.vendorEmail ?? body.recipientEmail ?? "").trim();
    const note = String(body.note ?? "").trim();

    const statusByAction: Record<string, string> = {
      submit: "Submitted",
      approve: "Approved",
      order: "Ordered",
      close: "Closed",
      cancel: "Cancelled",
      reopen: "Draft",
    };

    const nextStatus = statusByAction[action];

    if (!poId || !nextStatus) {
      return Response.json({ error: "Purchase order and valid action are required." }, { status: 400 });
    }

    if (!submitRoles.has(actor.role)) {
      return Response.json({ error: "You do not have permission to update purchase orders." }, { status: 403 });
    }

    if (["approve", "order", "close", "cancel", "reopen"].includes(action) && !managementRoles.has(actor.role)) {
      return Response.json({ error: "Management approval is required for this purchase order action." }, { status: 403 });
    }

    const updatePayload: Record<string, unknown> = {
      status: nextStatus,
      updated_at: new Date().toISOString(),
    };

    if (action === "submit") {
      updatePayload.submitted_at = new Date().toISOString();
      updatePayload.submitted_by = actor.fullName;
    }

    if (action === "approve") {
      updatePayload.approved_at = new Date().toISOString();
      updatePayload.approved_by = actor.fullName;
    }

    if (action === "order") {
      updatePayload.ordered_at = new Date().toISOString();
      updatePayload.ordered_by = actor.fullName;
    }

    const { data: purchaseOrder, error: updateError } = await adminClient
      .from("purchase_orders")
      .update(updatePayload)
      .eq("id", poId)
      .select("*")
      .single();

    if (updateError || !purchaseOrder) {
      return Response.json({ error: updateError?.message ?? "Purchase order was not found." }, { status: 404 });
    }

    let emailStatus = `PO status changed to ${nextStatus}.`;

    if (action === "order" && vendorEmail) {
      const emailResponse = await fetch(new URL("/api/purchase-order-email", request.url), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: request.headers.get("authorization") ?? "",
        },
        body: JSON.stringify({
          poId,
          recipientEmail: vendorEmail,
          note: note || `Purchase order ${purchaseOrder.po_number ?? ""} has been ordered.`,
        }),
      });

      const emailResult = await emailResponse.json().catch(() => ({}));
      emailStatus = emailResponse.ok
        ? "PO status changed to Ordered and vendor email was sent."
        : `PO status changed to Ordered, but vendor email failed: ${emailResult.error ?? "Unknown email error."}`;
    }

    return Response.json({ purchaseOrder, emailStatus });
  } catch (error) {
    return Response.json({ error: messageFromError(error) }, { status: 500 });
  }
}
