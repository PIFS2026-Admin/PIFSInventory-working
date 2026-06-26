export function splitEmails(value?: string | null) {
  return String(value || "")
    .split(/[;,]/)
    .map((email) => email.trim())
    .filter((email) => email.includes("@"));
}

function uniqueEmails(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter((value) => value.includes("@"))));
}

export async function getProfileEmailsForRoles(adminClient: any, roles: string[]) {
  const roleSet = new Set(roles.map((role) => role.toLowerCase()));
  const emails = new Set<string>();
  const missingUserIds: string[] = [];

  const { data: profiles } = await adminClient
    .from("profiles")
    .select("id, role");

  for (const profile of profiles ?? []) {
    if (!roleSet.has(String(profile.role ?? "").toLowerCase())) continue;
    if (profile.id) {
      missingUserIds.push(profile.id);
    }
  }

  if (missingUserIds.length > 0) {
    for (let page = 1; page <= 10; page += 1) {
      const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) break;

      for (const user of data.users ?? []) {
        if (missingUserIds.includes(user.id) && user.email) {
          emails.add(user.email);
        }
      }

      if ((data.users ?? []).length < 1000) break;
    }
  }

  return Array.from(emails);
}

export async function listNotificationRecipientsWithFallback(
  adminClient: any,
  notificationKey: string,
  fallbackRoles: string[],
  fallbackEnvValues: Array<string | undefined | null> = [],
) {
  const configuredEmails: string[] = [];

  try {
    const { data: notificationType, error: typeError } = await adminClient
      .from("email_notification_types")
      .select("id")
      .eq("notification_key", notificationKey)
      .eq("is_active", true)
      .maybeSingle();

    if (typeError) throw typeError;

    if (notificationType?.id) {
      const { data: recipients, error: recipientError } = await adminClient
        .from("email_notification_recipients")
        .select("user_id")
        .eq("notification_type_id", notificationType.id)
        .eq("enabled", true);

      if (recipientError) throw recipientError;

      const recipientIds = (recipients ?? [])
        .map((recipient: any) => String(recipient.user_id ?? ""))
        .filter(Boolean);

      if (recipientIds.length > 0) {
        const { data: profiles } = await adminClient
          .from("profiles")
          .select("id")
          .in("id", recipientIds);

        const missingUserIds: string[] = [];
        for (const profile of profiles ?? []) {
          if (profile.id) {
            missingUserIds.push(profile.id);
          }
        }

        const knownProfileIds = new Set((profiles ?? []).map((profile: any) => profile.id));
        for (const recipientId of recipientIds) {
          if (!knownProfileIds.has(recipientId)) missingUserIds.push(recipientId);
        }

        if (missingUserIds.length > 0) {
          for (let page = 1; page <= 10; page += 1) {
            const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage: 1000 });
            if (error) break;

            for (const user of data.users ?? []) {
              if (missingUserIds.includes(user.id) && user.email) {
                configuredEmails.push(user.email);
              }
            }

            if ((data.users ?? []).length < 1000) break;
          }
        }
      }
    }
  } catch {
    // If the admin notification tables have not been installed yet, fall back to legacy role/env recipients.
  }

  const fallbackEmails =
    configuredEmails.length > 0
      ? []
      : [
          ...(await getProfileEmailsForRoles(adminClient, fallbackRoles)),
          ...fallbackEnvValues.flatMap((value) => splitEmails(value)),
        ];

  return uniqueEmails([...configuredEmails, ...fallbackEmails]);
}
