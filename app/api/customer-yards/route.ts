import { createClient } from "@supabase/supabase-js";

type AdminClient = ReturnType<typeof configuredSupabase>;

function configuredSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Customer yard setup is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

function errorMessage(error: any) {
  return String(error?.message ?? error ?? "Unknown error.");
}

function normalizeCode(value: unknown) {
  return String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

async function customerAccess(request: Request, admin: AdminClient) {
  const token = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!token) return { error: "Missing user session.", status: 401 as const };

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) return { error: "Invalid user session.", status: 401 as const };

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, role, company_id")
    .eq("id", userData.user.id)
    .single();

  if (profileError || profile?.role !== "customer" || !profile.company_id) {
    return { error: "Customer yard setup requires a customer company login.", status: 403 as const };
  }

  return { userId: userData.user.id, companyId: String(profile.company_id), status: 200 as const };
}

async function assignedYardIds(admin: AdminClient, userId: string) {
  const { data, error } = await admin
    .from("inventory_user_yards")
    .select("yard_id")
    .eq("user_id", userId);

  if (error) throw error;
  return new Set((data ?? []).map((row: any) => String(row.yard_id)));
}

async function requireManagedYard(admin: AdminClient, userId: string, companyId: string, yardId: string) {
  const assignments = await assignedYardIds(admin, userId);
  if (!assignments.has(yardId)) throw new Error("You are not assigned to this yard.");

  const { data: yard, error } = await admin
    .from("yards")
    .select("id, owner_company_id")
    .eq("id", yardId)
    .single();

  if (error) throw error;
  if (String(yard.owner_company_id ?? "") !== companyId) {
    throw new Error("This yard is managed by Pathfinder. Customer changes are not allowed.");
  }
}

async function customerYards(admin: AdminClient, userId: string, companyId: string) {
  const assignments = await assignedYardIds(admin, userId);
  const { data: yards, error } = await admin
    .from("yards")
    .select("id, name, code, is_active, owner_company_id")
    .eq("owner_company_id", companyId)
    .order("name", { ascending: true });

  if (error) throw error;
  const visible = (yards ?? []).filter((yard: any) => assignments.has(String(yard.id)));
  const yardIds = visible.map((yard: any) => yard.id);

  const [{ data: racks, error: racksError }, { data: zones, error: zonesError }] = await Promise.all([
    yardIds.length
      ? admin.from("racks").select("id, yard_id, rack_code, capacity_joints, is_active").in("yard_id", yardIds).order("sort_order")
      : Promise.resolve({ data: [], error: null }),
    yardIds.length
      ? admin.from("workflow_zones").select("id, yard_id, name, code, sort_order, is_active").in("yard_id", yardIds).order("sort_order")
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (racksError) throw racksError;
  if (zonesError) throw zonesError;
  return { yards: visible, racks: racks ?? [], zones: zones ?? [] };
}

export async function GET(request: Request) {
  try {
    const admin = configuredSupabase();
    const access = await customerAccess(request, admin);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });
    return Response.json(await customerYards(admin, access.userId, access.companyId));
  } catch (error: any) {
    return Response.json({ error: errorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const admin = configuredSupabase();
    const access = await customerAccess(request, admin);
    if ("error" in access) return Response.json({ error: access.error }, { status: access.status });

    const body = await request.json().catch(() => ({}));
    const action = String(body.action ?? "");

    if (action === "create-yard") {
      const name = String(body.name ?? "").trim();
      const requestedCode = normalizeCode(body.code || name);
      if (!name || !requestedCode) return Response.json({ error: "Yard name is required." }, { status: 400 });

      const companyCode = access.companyId.replace(/-/g, "").slice(0, 8).toUpperCase();
      const code = `${companyCode}_${requestedCode}`.slice(0, 32);
      const { data: yard, error } = await admin
        .from("yards")
        .insert({ name, code, is_active: true, owner_company_id: access.companyId, created_by: access.userId })
        .select("id, name, code, is_active, owner_company_id")
        .single();

      if (error) throw error;

      const { data: companyUsers, error: usersError } = await admin
        .from("profiles")
        .select("id")
        .eq("company_id", access.companyId)
        .eq("role", "customer");
      if (usersError) throw usersError;

      const assignments = (companyUsers ?? []).map((profile: any) => ({ user_id: profile.id, yard_id: yard.id, can_access: true }));
      if (assignments.length) {
        const { error: assignmentError } = await admin
          .from("inventory_user_yards")
          .upsert(assignments, { onConflict: "user_id,yard_id" });
        if (assignmentError) throw assignmentError;
      }

      return Response.json({ ok: true, yard, ...(await customerYards(admin, access.userId, access.companyId)) });
    }

    const yardId = String(body.yardId ?? "").trim();
    if (!yardId) return Response.json({ error: "Yard is required." }, { status: 400 });
    await requireManagedYard(admin, access.userId, access.companyId, yardId);

    if (action === "save-racks") {
      const racks = Array.isArray(body.racks) ? body.racks : [];
      if (!racks.length) return Response.json({ error: "Add at least one rack before saving." }, { status: 400 });

      const rows = racks.map((rack: any, index: number) => ({
        yard_id: yardId,
        rack_code: normalizeCode(rack.rack_code),
        capacity_joints: Math.max(1, Number(rack.capacity_joints ?? 500)),
        sort_order: index + 1,
        layout_x: Number(rack.layout_x ?? 0),
        layout_y: Number(rack.layout_y ?? 0),
        layout_width: Math.max(34, Number(rack.layout_width ?? 104)),
        layout_height: Math.max(26, Number(rack.layout_height ?? 64)),
        layout_group: String(rack.layout_group ?? "CUSTOM"),
        rotation: Number(rack.rotation ?? 0) === 90 ? 90 : 0,
        is_active: rack.is_active !== false,
      }));

      if (rows.some((row: any) => !row.rack_code)) {
        return Response.json({ error: "Every rack needs a name." }, { status: 400 });
      }

      const { error } = await admin.from("racks").upsert(rows, { onConflict: "yard_id,rack_code" });
      if (error) throw error;
    } else if (action === "delete-rack") {
      const rackId = String(body.rackId ?? "");
      const { data: rack, error: rackError } = await admin.from("racks").select("id").eq("id", rackId).eq("yard_id", yardId).single();
      if (rackError || !rack) throw new Error("Rack was not found in this yard.");

      const { count, error: inventoryError } = await admin
        .from("pipe_inventory")
        .select("id", { count: "exact", head: true })
        .eq("rack_id", rackId)
        .neq("status", "Shipped");
      if (inventoryError) throw inventoryError;
      if ((count ?? 0) > 0) return Response.json({ error: "Move the inventory before deleting this rack." }, { status: 409 });

      const { error } = await admin.from("racks").delete().eq("id", rackId).eq("yard_id", yardId);
      if (error) throw error;
    } else if (action === "save-zone") {
      const zoneId = String(body.zoneId ?? "");
      const name = String(body.name ?? "").trim();
      const code = normalizeCode(body.code || name).toLowerCase();
      if (!name || !code) return Response.json({ error: "Work-zone name is required." }, { status: 400 });

      const row = { yard_id: yardId, name, code, is_active: body.isActive !== false, sort_order: Number(body.sortOrder ?? 0) };
      const query = zoneId
        ? admin.from("workflow_zones").update(row).eq("id", zoneId).eq("yard_id", yardId)
        : admin.from("workflow_zones").insert(row);
      const { error } = await query;
      if (error) throw error;
    } else if (action === "delete-zone") {
      const zoneId = String(body.zoneId ?? "");
      const { count, error: inventoryError } = await admin
        .from("pipe_inventory")
        .select("id", { count: "exact", head: true })
        .eq("workflow_zone_id", zoneId)
        .neq("status", "Shipped");
      if (inventoryError) throw inventoryError;
      if ((count ?? 0) > 0) return Response.json({ error: "Move the inventory before deleting this work zone." }, { status: 409 });

      const { error } = await admin.from("workflow_zones").delete().eq("id", zoneId).eq("yard_id", yardId);
      if (error) throw error;
    } else {
      return Response.json({ error: "Unknown yard action." }, { status: 400 });
    }

    return Response.json({ ok: true, ...(await customerYards(admin, access.userId, access.companyId)) });
  } catch (error: any) {
    const message = errorMessage(error);
    const status = /not assigned|not allowed|managed by pathfinder/i.test(message) ? 403 : 500;
    return Response.json({ error: message }, { status });
  }
}
