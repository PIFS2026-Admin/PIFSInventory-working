import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const fullName = String(body.fullName ?? "").trim();
    const role = String(body.role ?? "customer").trim();
    const companyId = body.companyId ? String(body.companyId) : null;

    if (!email || !fullName || !role) {
      return Response.json(
        { error: "Email, full name, and role are required." },
        { status: 400 }
      );
    }

    if (role === "customer" && !companyId) {
      return Response.json(
        { error: "Customer users must be assigned to a company." },
        { status: 400 }
      );
    }

    if (!["admin", "employee", "customer", "operator", "sales"].includes(role)) {
      return Response.json(
        { error: "Role must be admin, employee, customer, operator, or sales." },
        { status: 400 }
      );
    }

    const siteUrl =
      request.headers.get("origin") ??
      process.env.NEXT_PUBLIC_SITE_URL ??
      "https://pifstitan.com";

    const { data: invitedUser, error: inviteError } =
      await adminSupabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${siteUrl}/login`,
        data: {
          full_name: fullName,
          role,
        },
      });

    if (inviteError) {
      return Response.json({ error: inviteError.message }, { status: 400 });
    }

    const userId = invitedUser.user?.id;

    if (!userId) {
      return Response.json(
        { error: "User invite was sent, but no user id was returned." },
        { status: 400 }
      );
    }

    if (password) {
      const { error: passwordError } = await adminSupabase.auth.admin.updateUserById(userId, {
        password,
      });

      if (passwordError) {
        return Response.json({ error: passwordError.message }, { status: 400 });
      }
    }

    const { error: profileError } = await adminSupabase
      .from("profiles")
      .upsert({
        id: userId,
        full_name: fullName,
        role,
        company_id: role === "customer" ? companyId : null,
      });

    if (profileError) {
      return Response.json({ error: profileError.message }, { status: 400 });
    }

    return Response.json({
      ok: true,
      userId,
      email,
      role,
      invited: true,
    });
  } catch (error: any) {
    return Response.json(
      { error: error.message ?? "Unexpected server error." },
      { status: 500 }
    );
  }
}
