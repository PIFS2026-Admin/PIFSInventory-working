import { createClient } from "@supabase/supabase-js";
import {
  allModuleKeys,
  allPermissionModuleKeys,
  allRoleKeys,
  permissionActions,
} from "../../../lib/modulePermissions";

const customerModules = new Set(["yard_view", "reports"]);

type Body = Record<string, unknown>;
type Admin = ReturnType<typeof configured>;
function configured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Supabase admin access configuration is missing.");
  return createClient(url, key, { auth: { persistSession: false } });
}
function text(value: unknown) {
  return String(value ?? "").trim();
}
function lower(value: unknown) {
  return text(value).toLowerCase();
}
function errorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : String((error as { message?: unknown })?.message ?? error);
}
function missing(error: unknown) {
  const value = lower(errorMessage(error));
  return (
    value.includes("titan_access_events") ||
    value.includes("grant_source") ||
    value.includes("service_line") ||
    value.includes("schema cache")
  );
}
async function requireAdmin(request: Request) {
  const admin = configured();
  const token = (request.headers.get("authorization") ?? "")
    .replace(/^Bearer\s+/i, "")
    .trim();
  if (!token)
    return {
      admin,
      error: Response.json(
        { error: "You must be signed in." },
        { status: 401 },
      ),
    };
  const { data } = await admin.auth.getUser(token);
  if (!data.user)
    return {
      admin,
      error: Response.json(
        { error: "Your session could not be verified." },
        { status: 401 },
      ),
    };
  const { data: profile } = await admin
    .from("profiles")
    .select("role,is_disabled")
    .eq("id", data.user.id)
    .maybeSingle();
  if (
    !profile ||
    profile.is_disabled ||
    !["admin", "owner"].includes(lower(profile.role))
  )
    return {
      admin,
      error: Response.json(
        { error: "Administrator access is required." },
        { status: 403 },
      ),
    };
  return { admin, userId: data.user.id };
}
async function snapshot(admin: Admin, userId: string) {
  const [profile, modules, extras, yards] = await Promise.all([
    admin
      .from("profiles")
      .select(
        "id,full_name,email,role,department,service_line,access_configured,company_id,is_disabled",
      )
      .eq("id", userId)
      .maybeSingle(),
    admin
      .from("user_module_permissions")
      .select("module_key,can_access,active,grant_source,service_line")
      .eq("user_id", userId),
    admin
      .from("user_permission_overrides")
      .select(
        "module_key,action_key,is_allowed,active,grant_source,service_line",
      )
      .eq("user_id", userId),
    admin
      .from("inventory_user_yards")
      .select("yard_id,can_access,active")
      .eq("user_id", userId),
  ]);
  for (const result of [profile, modules, extras, yards])
    if (result.error) throw result.error;
  return {
    profile: profile.data,
    modules: modules.data ?? [],
    extras: extras.data ?? [],
    yards: yards.data ?? [],
  };
}
export async function GET(request: Request) {
  try {
    const access = await requireAdmin(request);
    if ("error" in access) return access.error;
    const admin = access.admin;
    const [profiles, modules, extras, yards, locations, events] =
      await Promise.all([
        admin
          .from("profiles")
          .select(
            "id,full_name,email,role,department,service_line,access_configured,company_id,is_disabled",
          )
          .order("full_name"),
        admin
          .from("user_module_permissions")
          .select(
            "user_id,module_key,can_access,active,grant_source,role_at_grant,service_line",
          ),
        admin
          .from("user_permission_overrides")
          .select(
            "user_id,module_key,action_key,is_allowed,active,grant_source,service_line",
          ),
        admin
          .from("inventory_user_yards")
          .select("user_id,yard_id,can_access,active"),
        admin
          .from("yards")
          .select("id,name,code,is_active,owner_company_id")
          .order("name"),
        admin
          .from("titan_access_events")
          .select("id,target_user_id,event_type,summary,actor_id,created_at")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);
    for (const result of [profiles, modules, extras, yards, locations, events])
      if (result.error) throw result.error;
    return Response.json({
      ok: true,
      profiles: profiles.data ?? [],
      modules: modules.data ?? [],
      extras: extras.data ?? [],
      yards: yards.data ?? [],
      locations: locations.data ?? [],
      events: events.data ?? [],
    });
  } catch (error) {
    return Response.json(
      {
        error: missing(error)
          ? "Run supabase/titan_person_centered_access.sql before opening People & Access."
          : errorMessage(error),
      },
      { status: missing(error) ? 409 : 500 },
    );
  }
}
export async function POST(request: Request) {
  try {
    const access = await requireAdmin(request);
    if ("error" in access) return access.error;
    const admin = access.admin;
    const body = (await request.json().catch(() => ({}))) as Body;
    const userId = text(body.userId),
      role = text(body.role),
      serviceLine = text(body.serviceLine) || null;
    if (!userId || !allRoleKeys.includes(role as never))
      return Response.json(
        { error: "Select a person and valid role." },
        { status: 400 },
      );
    const moduleSet = new Set(allModuleKeys);
    const modules = [
      ...new Set(
        (Array.isArray(body.modules) ? body.modules : [])
          .map(text)
          .filter((value) => moduleSet.has(value as never)),
      ),
    ];
    const permissionModuleSet = new Set(allPermissionModuleKeys);
    const actionSet = new Set(permissionActions);
    const extras = (Array.isArray(body.extras) ? body.extras : [])
      .map((value) => value as Record<string, unknown>)
      .map((value) => ({
        moduleKey: text(value.moduleKey),
        actionKey: text(value.actionKey),
      }))
      .filter(
        (value) =>
          permissionModuleSet.has(value.moduleKey as never) &&
          actionSet.has(value.actionKey as never),
      );
    const yardIds = [
      ...new Set(
        (Array.isArray(body.yardIds) ? body.yardIds : [])
          .map(text)
          .filter(Boolean),
      ),
    ];
    const before = await snapshot(admin, userId);
    const currentProfile = before.profile as {
      role?: unknown;
      company_id?: unknown;
    } | null;
    const currentRole = lower(currentProfile?.role);
    const changingCustomerBoundary =
      (currentRole === "customer") !== (role === "customer");
    if (changingCustomerBoundary && body.confirmRoleConversion !== true) {
      return Response.json(
        {
          error:
            "Changing between a customer and an internal role requires explicit confirmation.",
        },
        { status: 409 },
      );
    }
    if (role === "customer") {
      const companyId = text(currentProfile?.company_id);
      if (!companyId)
        return Response.json(
          {
            error:
              "Assign this customer to a company from User Management before saving access.",
          },
          { status: 400 },
        );
      if (
        modules.some((moduleKey) => !customerModules.has(moduleKey)) ||
        extras.length > 0
      ) {
        return Response.json(
          {
            error:
              "Customer accounts can only use their portal, yard inventory, release requests, and customer reports.",
          },
          { status: 400 },
        );
      }
      if (yardIds.length) {
        const { data: ownedYards, error: yardError } = await admin
          .from("yards")
          .select("id")
          .in("id", yardIds)
          .eq("owner_company_id", companyId);
        if (yardError) throw yardError;
        if ((ownedYards ?? []).length !== yardIds.length)
          return Response.json(
            {
              error:
                "A customer can only be assigned to yards owned by their company.",
            },
            { status: 400 },
          );
      }
    }
    const { error: profileError } = await admin
      .from("profiles")
      .update({ role, service_line: serviceLine, access_configured: true })
      .eq("id", userId);
    if (profileError) throw profileError;
    const now = new Date().toISOString();
    const { error: disableModules } = await admin
      .from("user_module_permissions")
      .update({
        can_access: false,
        active: false,
        updated_by: access.userId,
        updated_at: now,
      })
      .eq("user_id", userId);
    if (disableModules) throw disableModules;
    if (modules.length) {
      const { error } = await admin.from("user_module_permissions").upsert(
        modules.map((moduleKey) => ({
          user_id: userId,
          module_key: moduleKey,
          can_access: true,
          active: true,
          grant_source: "Person Access",
          role_at_grant: role,
          service_line: serviceLine,
          updated_by: access.userId,
          updated_at: now,
        })),
        { onConflict: "user_id,module_key" },
      );
      if (error) throw error;
    }
    const { error: disableExtras } = await admin
      .from("user_permission_overrides")
      .delete()
      .eq("user_id", userId);
    if (disableExtras) throw disableExtras;
    if (extras.length) {
      const { error } = await admin.from("user_permission_overrides").upsert(
        extras.map((extra) => ({
          user_id: userId,
          module_key: extra.moduleKey,
          action_key: extra.actionKey,
          is_allowed: true,
          active: true,
          grant_source: "Person Access",
          service_line: serviceLine,
          updated_by: access.userId,
          updated_at: now,
        })),
        { onConflict: "user_id,module_key,action_key" },
      );
      if (error) throw error;
    }
    const { error: disableYards } = await admin
      .from("inventory_user_yards")
      .update({
        can_access: false,
        active: false,
        updated_by: access.userId,
        updated_at: now,
      })
      .eq("user_id", userId);
    if (disableYards) throw disableYards;
    if (yardIds.length) {
      const { error } = await admin.from("inventory_user_yards").upsert(
        yardIds.map((yardId) => ({
          user_id: userId,
          yard_id: yardId,
          can_access: true,
          active: true,
          updated_by: access.userId,
          updated_at: now,
        })),
        { onConflict: "user_id,yard_id" },
      );
      if (error) throw error;
    }
    const after = await snapshot(admin, userId);
    const name =
      text((after.profile as { full_name?: unknown } | null)?.full_name) ||
      "User";
    const { error: auditError } = await admin
      .from("titan_access_events")
      .insert({
        target_user_id: userId,
        event_type: "Access Updated",
        summary: `Access updated for ${name}: ${role}, ${modules.length} modules, ${extras.length} extras, ${yardIds.length} yards.`,
        before_value: before,
        after_value: after,
        actor_id: access.userId,
      });
    if (auditError) throw auditError;
    return Response.json({ ok: true, snapshot: after });
  } catch (error) {
    return Response.json(
      {
        error: missing(error)
          ? "Run supabase/titan_person_centered_access.sql before saving access."
          : errorMessage(error),
      },
      { status: missing(error) ? 409 : 500 },
    );
  }
}
