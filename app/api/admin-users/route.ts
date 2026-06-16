import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const adminSupabase = createClient(supabaseUrl, serviceRoleKey);

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

    const siteUrl = (
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://pifstitan.com"
    ).replace(/\/$/, "");

    const saveProfile = async (userId: string) => {
      return adminSupabase.from("profiles").upsert({
        id: userId,
        full_name: fullName,
        role,
        company_id: role === "customer" ? companyId : null,
      });
    };

    const { data: invitedUser, error: inviteError } =
      await adminSupabase.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${siteUrl}/login`,
        data: {
          full_name: fullName,
          role,
        },
      });

    if (inviteError) {
      const inviteMessage = getErrorMessage(inviteError);

      if (!password) {
        return Response.json(
          {
            error:
              `Invite email failed: ${inviteMessage}. ` +
              "Enter a temporary password to create the user without an email, or fix the SMTP email settings and try again.",
          },
          { status: 400 }
        );
      }

      const { data: createdUser, error: createError } =
        await adminSupabase.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });

      if (createError) {
        return Response.json(
          {
            error:
              `Invite email failed: ${inviteMessage}. ` +
              `Temporary-password creation also failed: ${getErrorMessage(createError)}`,
          },
          { status: 400 }
        );
      }

      const fallbackUserId = createdUser.user?.id;

      if (!fallbackUserId) {
        return Response.json(
          { error: "User was created without an email invite, but no user id was returned." },
          { status: 400 }
        );
      }

      const { error: fallbackProfileError } = await saveProfile(fallbackUserId);

      if (fallbackProfileError) {
        return Response.json({ error: getErrorMessage(fallbackProfileError) }, { status: 400 });
      }

      return Response.json({
        ok: true,
        userId: fallbackUserId,
        email,
        role,
        invited: false,
        warning:
          `User created with temporary password, but invite email failed: ${inviteMessage}. ` +
          "Give the user the temporary password manually.",
      });
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

    const { error: profileError } = await saveProfile(userId);

    if (profileError) {
      return Response.json({ error: getErrorMessage(profileError) }, { status: 400 });
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
      { error: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
