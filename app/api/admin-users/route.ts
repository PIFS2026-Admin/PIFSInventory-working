import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import {
  allRoleOptions,
  cleanModuleKeys,
  defaultModulesForRole,
  isKnownRole,
  normalizeRole,
} from "../../../lib/modulePermissions";

function configuredAdminSupabase() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase admin user route is not configured.");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

function getErrorMessage(error: any) {
  if (!error) return "Unknown error.";
  if (typeof error === "string") return error;
  if (typeof error.message === "string" && error.message.trim()) return error.message;
  if (typeof error.error_description === "string" && error.error_description.trim()) {
    return error.error_description;
  }
  if (typeof error.error === "string" && error.error.trim()) return error.error;

  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error.";
  }
}

function makeTemporaryPassword() {
  return `Titan-${randomBytes(4).toString("hex")}-${randomBytes(3).toString("hex")}!`;
}

const modulePermissionSetupMessage =
  "User module permissions table is missing. Run supabase/user_module_permissions.sql in Supabase SQL Editor.";

function isMissingInventoryYardAccessTable(error: any) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("inventory_user_yards") &&
    (message.includes("does not exist") ||
      message.includes("could not find the table") ||
      message.includes("schema cache"))
  );
}

function isMissingModulePermissionsTable(error: any) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("user_module_permissions") &&
    (message.includes("does not exist") ||
      message.includes("could not find the table") ||
      message.includes("schema cache"))
  );
}

function isMissingProfileColumn(error: any) {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("profiles.") ||
    message.includes("column") ||
    message.includes("schema cache")
  ) && (
    message.includes("email") ||
    message.includes("customer_id") ||
    message.includes("department") ||
    message.includes("is_disabled")
  );
}

function isMicrosoftMailConfigured() {
  return Boolean(
    process.env.MICROSOFT_TENANT_ID &&
      process.env.MICROSOFT_CLIENT_ID &&
      process.env.MICROSOFT_CLIENT_SECRET &&
      process.env.MICROSOFT_MAIL_FROM
  );
}

async function getMicrosoftAccessToken() {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    throw new Error("Microsoft 365 email is not configured.");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    }
  );

  const result = await response.json();

  if (!response.ok || !result.access_token) {
    throw new Error(getErrorMessage(result));
  }

  return String(result.access_token);
}

async function sendMicrosoftLoginEmail(options: {
  email: string;
  fullName: string;
  role: string;
  temporaryPassword: string;
  siteUrl: string;
}) {
  const from = process.env.MICROSOFT_MAIL_FROM;

  if (!from) {
    throw new Error("MICROSOFT_MAIL_FROM is missing.");
  }

  const accessToken = await getMicrosoftAccessToken();
  const loginUrl = `${options.siteUrl}/login`;

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2 style="margin:0 0 6px">Welcome to TITAN</h2>
      <p style="margin:0 0 18px;color:#f97316;font-weight:700">Powering smarter pipe management</p>
      <p>${options.fullName}, your TITAN account has been created.</p>
      <p><strong>Login:</strong> <a href="${loginUrl}">${loginUrl}</a></p>
      <p><strong>Email:</strong> ${options.email}</p>
      <p><strong>Temporary password:</strong> ${options.temporaryPassword}</p>
      <p>Please sign in and change your password.</p>
      <div style="margin-top:22px;padding-top:14px;border-top:1px solid #d1d5db;color:#374151;font-size:13px">
        <strong>Pathfinder Inspections &amp; Field Services</strong><br />
        7501 Groening St.<br />
        Odessa, TX 79765<br />
        (432) 233-3600<br />
        <a href="https://pifstitan.com">pifstitan.com</a>
      </div>
    </div>
  `;

  const response = await fetch(
    `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(from)}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: "Your TITAN login",
          body: {
            contentType: "HTML",
            content: html,
          },
          toRecipients: [
            {
              emailAddress: {
                address: options.email,
              },
            },
          ],
        },
        saveToSentItems: true,
      }),
    }
  );

  if (!response.ok) {
    const result = await response.json().catch(() => null);
    throw new Error(getErrorMessage(result) || `Microsoft email failed with status ${response.status}.`);
  }
}

export async function POST(request: Request) {
  try {
    const adminSupabase = configuredAdminSupabase();
    const body = await request.json();

    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const fullName = String(body.fullName ?? "").trim();
    const rawRole = String(body.role ?? "customer").trim();
    const role = normalizeRole(rawRole);
    const companyId = body.companyId ? String(body.companyId) : null;
    const customerId = body.customerId ? String(body.customerId) : companyId;
    const department = String(body.department ?? "").trim();
    const yardIds = Array.isArray(body.yardIds)
      ? Array.from(new Set(body.yardIds.map((value: unknown) => String(value)).filter(Boolean)))
      : [];
    const requestedModuleKeys = cleanModuleKeys(
      Array.isArray(body.moduleKeys) ? body.moduleKeys : []
    );

    if (!email || !fullName || !rawRole) {
      return Response.json(
        { error: "Email, full name, and role are required." },
        { status: 400 }
      );
    }

    if (!isKnownRole(rawRole)) {
      return Response.json(
        {
          error: `Unknown role "${rawRole}". Use one of: ${allRoleOptions
            .map((option) => option.label)
            .join(", ")}.`,
        },
        { status: 400 }
      );
    }

    if (role === "customer" && !customerId) {
      return Response.json(
        { error: "Customer users must be assigned to a company." },
        { status: 400 }
      );
    }

    const moduleKeys =
      role === "customer"
        ? []
        : requestedModuleKeys.length > 0
          ? requestedModuleKeys
          : defaultModulesForRole(role);

    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://pifstitan.com"
    ).replace(/\/$/, "");

    const saveProfile = async (userId: string) => {
      const profilePayload = {
        id: userId,
        email,
        full_name: fullName,
        role,
        company_id: role === "customer" ? customerId : null,
        customer_id: role === "customer" ? customerId : null,
        department: department || null,
        is_disabled: false,
      };

      const result = await adminSupabase.from("profiles").upsert(profilePayload);

      if (!result.error || !isMissingProfileColumn(result.error)) {
        return result;
      }

      return adminSupabase.from("profiles").upsert({
        id: userId,
        full_name: fullName,
        role,
        company_id: role === "customer" ? customerId : null,
      });
    };

    const temporaryPassword = password || makeTemporaryPassword();

    const { data: createdUser, error: createError } =
      await adminSupabase.auth.admin.createUser({
        email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: {
          full_name: fullName,
          role,
          department,
          customer_id: role === "customer" ? customerId : null,
        },
      });

    if (createError) {
      return Response.json(
        { error: `Could not create user: ${getErrorMessage(createError)}` },
        { status: 400 }
      );
    }

    const userId = createdUser.user?.id;

    if (!userId) {
      return Response.json(
        { error: "User was created, but no user id was returned." },
        { status: 400 }
      );
    }

    const { error: profileError } = await saveProfile(userId);

    if (profileError) {
      return Response.json({ error: getErrorMessage(profileError) }, { status: 400 });
    }

    let yardAccessWarning = "";
    let moduleAccessWarning = "";

    if (role !== "customer" && yardIds.length > 0) {
      const { error: yardAccessError } = await adminSupabase
        .from("inventory_user_yards")
        .insert(
          yardIds.map((yardId) => ({
            user_id: userId,
            yard_id: yardId,
          }))
        );

      if (yardAccessError) {
        yardAccessWarning = isMissingInventoryYardAccessTable(yardAccessError)
          ? " Yard access was not saved because the database setup is missing. Run supabase/fix_inventory_yard_access.sql in Supabase SQL Editor."
          : ` Yard access was not saved: ${getErrorMessage(yardAccessError)}`;
      }
    }

    if (moduleKeys.length > 0) {
      const { error: moduleAccessError } = await adminSupabase
        .from("user_module_permissions")
        .insert(
          moduleKeys.map((moduleKey) => ({
            user_id: userId,
            module_key: moduleKey,
            can_access: true,
          }))
        );

      if (moduleAccessError) {
        moduleAccessWarning = isMissingModulePermissionsTable(moduleAccessError)
          ? ` ${modulePermissionSetupMessage}`
          : ` Screen permissions were not saved: ${getErrorMessage(moduleAccessError)}`;
      }
    }

    if (!isMicrosoftMailConfigured()) {
      return Response.json({
        ok: true,
        userId,
        email,
        role,
        emailed: false,
        temporaryPassword,
        warning:
          `User created, but Microsoft 365 email is not configured. Temporary password: ${temporaryPassword}${yardAccessWarning}${moduleAccessWarning}`,
      });
    }

    try {
      await sendMicrosoftLoginEmail({
        email,
        fullName,
        role,
        temporaryPassword,
        siteUrl,
      });
    } catch (emailError: any) {
      return Response.json({
        ok: true,
        userId,
        email,
        role,
        emailed: false,
        temporaryPassword,
        warning:
          `User created, but Microsoft 365 email failed: ${getErrorMessage(emailError)}. ` +
          `Temporary password: ${temporaryPassword}${yardAccessWarning}${moduleAccessWarning}`,
      });
    }

    return Response.json({
      ok: true,
      userId,
      email,
      role,
      emailed: true,
      warning:
        yardAccessWarning || moduleAccessWarning
          ? `User created and login email sent.${yardAccessWarning}${moduleAccessWarning}`
          : "",
    });
  } catch (error: any) {
    return Response.json(
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
