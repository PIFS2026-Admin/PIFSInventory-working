-- TITAN Communications module foundation
-- Additive migration: creates Communications tables, private attachment storage,
-- RLS policies, notification fanout, permission seeds, and Realtime publication.

create extension if not exists pgcrypto;

do $$
begin
  if to_regclass('public.profiles') is not null then
    alter table public.profiles add column if not exists email text;
    alter table public.profiles add column if not exists department text;
    alter table public.profiles add column if not exists is_disabled boolean not null default false;
  end if;
end $$;

create or replace function public.communications_is_internal()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and coalesce(p.is_disabled, false) = false
        and lower(coalesce(p.role::text, '')) not in ('', 'customer')
    ),
    false
  );
$$;

create or replace function public.communications_is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
      from public.profiles p
      where p.id = (select auth.uid())
        and coalesce(p.is_disabled, false) = false
        and lower(coalesce(p.role::text, '')) in ('admin', 'owner', 'administrator')
    ),
    false
  );
$$;

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_key text unique,
  name text not null,
  conversation_type text not null default 'group',
  yard_id uuid references public.yards(id) on delete set null,
  department text,
  topic text,
  color text not null default 'orange',
  priority text not null default 'normal',
  is_archived boolean not null default false,
  is_locked boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_type_check check (
    conversation_type in ('group', 'direct', 'announcement', 'yard', 'department')
  ),
  constraint conversations_priority_check check (
    priority in ('low', 'normal', 'important', 'urgent')
  )
);

create table if not exists public.conversation_members (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  muted boolean not null default false,
  urgent_only boolean not null default false,
  safety_override boolean not null default true,
  last_read_at timestamptz,
  joined_at timestamptz not null default now(),
  removed_at timestamptz,
  unique (conversation_id, user_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text,
  priority text not null default 'normal',
  reply_to_message_id uuid references public.messages(id) on delete set null,
  status text not null default 'delivered',
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint messages_priority_check check (priority in ('normal', 'important', 'urgent')),
  constraint messages_status_check check (status in ('sent', 'delivered', 'failed'))
);

create table if not exists public.message_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  uploaded_by uuid not null references auth.users(id) on delete cascade,
  storage_bucket text not null default 'communication-attachments',
  file_path text not null,
  file_name text not null,
  file_type text,
  file_size bigint,
  created_at timestamptz not null default now(),
  unique (storage_bucket, file_path)
);

create table if not exists public.message_read_receipts (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null default 'like',
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, reaction)
);

create table if not exists public.message_acknowledgements (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  acknowledged_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

create table if not exists public.communication_tasks (
  id uuid primary key default gen_random_uuid(),
  source_message_id uuid not null references public.messages(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  owner_id uuid references auth.users(id) on delete set null,
  title text not null,
  status text not null default 'Open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_message_id)
);

create table if not exists public.communication_notification_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  muted boolean not null default false,
  urgent_only boolean not null default false,
  safety_override boolean not null default true,
  desktop_enabled boolean not null default true,
  email_enabled boolean not null default false,
  push_enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (user_id, conversation_id)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text,
  auth_secret text,
  user_agent text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists conversations_type_idx on public.conversations (conversation_type, is_archived, updated_at desc);
create index if not exists conversations_yard_id_idx on public.conversations (yard_id);
create index if not exists conversations_department_idx on public.conversations (department);
create index if not exists conversation_members_user_idx on public.conversation_members (user_id, removed_at);
create index if not exists conversation_members_conversation_idx on public.conversation_members (conversation_id, removed_at);
create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at desc);
create index if not exists message_attachments_message_idx on public.message_attachments (message_id);
create index if not exists communication_tasks_conversation_idx on public.communication_tasks (conversation_id, status);

create or replace function public.communications_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_conversations_updated_at on public.conversations;
create trigger touch_conversations_updated_at
before update on public.conversations
for each row execute function public.communications_touch_updated_at();

drop trigger if exists touch_messages_updated_at on public.messages;
create trigger touch_messages_updated_at
before update on public.messages
for each row execute function public.communications_touch_updated_at();

drop trigger if exists touch_communication_tasks_updated_at on public.communication_tasks;
create trigger touch_communication_tasks_updated_at
before update on public.communication_tasks
for each row execute function public.communications_touch_updated_at();

drop trigger if exists touch_push_subscriptions_updated_at on public.push_subscriptions;
create trigger touch_push_subscriptions_updated_at
before update on public.push_subscriptions
for each row execute function public.communications_touch_updated_at();

create or replace function public.communications_is_member(target_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = target_conversation_id
        and cm.user_id = (select auth.uid())
        and cm.removed_at is null
    ),
    false
  );
$$;

create or replace function public.communications_can_read_conversation(target_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(
    exists (
      select 1
      from public.conversation_members cm
      where cm.conversation_id = target_conversation_id
        and cm.user_id = (select auth.uid())
        and cm.removed_at is null
    )
    or (
      public.communications_is_admin()
      and exists (
        select 1
        from public.conversations c
        where c.id = target_conversation_id
          and c.conversation_type <> 'direct'
      )
    ),
    false
  );
$$;

create or replace function public.communications_can_manage(target_conversation_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select public.communications_is_admin()
    or coalesce(
      exists (
        select 1
        from public.conversation_members cm
        where cm.conversation_id = target_conversation_id
          and cm.user_id = (select auth.uid())
          and cm.is_admin = true
          and cm.removed_at is null
      ),
      false
    );
$$;

alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.message_attachments enable row level security;
alter table public.message_read_receipts enable row level security;
alter table public.message_reactions enable row level security;
alter table public.message_acknowledgements enable row level security;
alter table public.communication_tasks enable row level security;
alter table public.communication_notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "communications conversations read member" on public.conversations;
create policy "communications conversations read member"
on public.conversations for select to authenticated
using (public.communications_can_read_conversation(id));

drop policy if exists "communications conversations create internal" on public.conversations;
create policy "communications conversations create internal"
on public.conversations for insert to authenticated
with check (public.communications_is_internal() and created_by = (select auth.uid()));

drop policy if exists "communications conversations manage" on public.conversations;
create policy "communications conversations manage"
on public.conversations for update to authenticated
using (public.communications_can_manage(id))
with check (public.communications_can_manage(id));

drop policy if exists "communications conversations delete manager" on public.conversations;
create policy "communications conversations delete manager"
on public.conversations for delete to authenticated
using (
  conversation_type in ('group', 'direct')
  and public.communications_can_manage(id)
);

drop policy if exists "communications members read conversation" on public.conversation_members;
create policy "communications members read conversation"
on public.conversation_members for select to authenticated
using (public.communications_can_read_conversation(conversation_id));

drop policy if exists "communications members insert manager" on public.conversation_members;
create policy "communications members insert manager"
on public.conversation_members for insert to authenticated
with check (
  public.communications_is_internal()
  and (
    user_id = (select auth.uid())
    or public.communications_can_manage(conversation_id)
    or public.communications_is_admin()
  )
);

drop policy if exists "communications members update own or manager" on public.conversation_members;
create policy "communications members update own or manager"
on public.conversation_members for update to authenticated
using (user_id = (select auth.uid()) or public.communications_can_manage(conversation_id))
with check (user_id = (select auth.uid()) or public.communications_can_manage(conversation_id));

drop policy if exists "communications members delete manager" on public.conversation_members;
create policy "communications members delete manager"
on public.conversation_members for delete to authenticated
using (public.communications_can_manage(conversation_id));

drop policy if exists "communications messages read member" on public.messages;
create policy "communications messages read member"
on public.messages for select to authenticated
using (public.communications_can_read_conversation(conversation_id));

drop policy if exists "communications messages send member" on public.messages;
create policy "communications messages send member"
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and public.communications_is_member(conversation_id)
  and not exists (
    select 1
    from public.conversations c
    where c.id = conversation_id
      and c.is_locked = true
      and not public.communications_can_manage(c.id)
  )
);

drop policy if exists "communications messages update own or manager" on public.messages;
create policy "communications messages update own or manager"
on public.messages for update to authenticated
using (sender_id = (select auth.uid()) or public.communications_can_manage(conversation_id))
with check (sender_id = (select auth.uid()) or public.communications_can_manage(conversation_id));

drop policy if exists "communications attachments read member" on public.message_attachments;
create policy "communications attachments read member"
on public.message_attachments for select to authenticated
using (public.communications_can_read_conversation(conversation_id));

drop policy if exists "communications attachments insert sender" on public.message_attachments;
create policy "communications attachments insert sender"
on public.message_attachments for insert to authenticated
with check (uploaded_by = (select auth.uid()) and public.communications_is_member(conversation_id));

drop policy if exists "communications read receipts own" on public.message_read_receipts;
create policy "communications read receipts own"
on public.message_read_receipts for all to authenticated
using (
  user_id = (select auth.uid())
  or public.communications_can_read_conversation((select m.conversation_id from public.messages m where m.id = message_id))
)
with check (user_id = (select auth.uid()) and public.communications_is_member((select m.conversation_id from public.messages m where m.id = message_id)));

drop policy if exists "communications reactions member" on public.message_reactions;
create policy "communications reactions member"
on public.message_reactions for all to authenticated
using (
  user_id = (select auth.uid())
  or public.communications_can_read_conversation((select m.conversation_id from public.messages m where m.id = message_id))
)
with check (user_id = (select auth.uid()) and public.communications_is_member((select m.conversation_id from public.messages m where m.id = message_id)));

drop policy if exists "communications acknowledgements member" on public.message_acknowledgements;
create policy "communications acknowledgements member"
on public.message_acknowledgements for all to authenticated
using (
  user_id = (select auth.uid())
  or public.communications_can_read_conversation((select m.conversation_id from public.messages m where m.id = message_id))
)
with check (user_id = (select auth.uid()) and public.communications_is_member((select m.conversation_id from public.messages m where m.id = message_id)));

drop policy if exists "communications tasks read member" on public.communication_tasks;
create policy "communications tasks read member"
on public.communication_tasks for select to authenticated
using (public.communications_can_read_conversation(conversation_id));

drop policy if exists "communications tasks create member" on public.communication_tasks;
create policy "communications tasks create member"
on public.communication_tasks for insert to authenticated
with check (owner_id = (select auth.uid()) and public.communications_is_member(conversation_id));

drop policy if exists "communications tasks update owner manager" on public.communication_tasks;
create policy "communications tasks update owner manager"
on public.communication_tasks for update to authenticated
using (owner_id = (select auth.uid()) or public.communications_can_manage(conversation_id))
with check (owner_id = (select auth.uid()) or public.communications_can_manage(conversation_id));

drop policy if exists "communications notification prefs own" on public.communication_notification_preferences;
create policy "communications notification prefs own"
on public.communication_notification_preferences for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "communications push subscriptions own" on public.push_subscriptions;
create policy "communications push subscriptions own"
on public.push_subscriptions for all to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create or replace function public.communications_notify_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  conversation_row public.conversations%rowtype;
  sender_name text;
  recipient record;
  should_notify boolean;
begin
  select * into conversation_row
  from public.conversations
  where id = new.conversation_id;

  if conversation_row.id is null then
    return new;
  end if;

  select coalesce(full_name, email, 'TITAN user')
  into sender_name
  from public.profiles
  where id = new.sender_id;

  for recipient in
    select cm.user_id, cm.muted, cm.urgent_only
    from public.conversation_members cm
    join public.profiles p on p.id = cm.user_id
    where cm.conversation_id = new.conversation_id
      and cm.removed_at is null
      and cm.user_id <> new.sender_id
      and coalesce(p.is_disabled, false) = false
      and lower(coalesce(p.role::text, '')) <> 'customer'
  loop
    should_notify := not recipient.muted
      and (not recipient.urgent_only or new.priority in ('important', 'urgent'));

    if should_notify then
      insert into public.notifications (
        recipient_user_id,
        audience,
        title,
        body,
        category,
        priority,
        action_label,
        action_url,
        created_by
      )
      values (
        recipient.user_id,
        'user',
        conversation_row.name,
        concat(sender_name, ': ', left(coalesce(new.body, 'Attachment'), 180)),
        'communications',
        case when new.priority = 'urgent' then 'urgent' when new.priority = 'important' then 'high' else 'normal' end,
        'Open Conversation',
        concat('/communications?conversation=', new.conversation_id::text),
        new.sender_id
      );
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists communications_notify_message on public.messages;
create trigger communications_notify_message
after insert on public.messages
for each row execute function public.communications_notify_message();

create or replace function public.communications_touch_conversation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set updated_at = now()
  where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists communications_touch_conversation on public.messages;
create trigger communications_touch_conversation
after insert or update on public.messages
for each row execute function public.communications_touch_conversation();

insert into storage.buckets (id, name, public)
values ('communication-attachments', 'communication-attachments', false)
on conflict (id) do nothing;

drop policy if exists "communication attachments storage read" on storage.objects;
create policy "communication attachments storage read"
on storage.objects for select to authenticated
using (
  bucket_id = 'communication-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (
    public.communications_can_read_conversation(split_part(name, '/', 1)::uuid)
  )
);

drop policy if exists "communication attachments storage upload" on storage.objects;
create policy "communication attachments storage upload"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'communication-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and public.communications_is_member(split_part(name, '/', 1)::uuid)
);

drop policy if exists "communication attachments storage update" on storage.objects;
create policy "communication attachments storage update"
on storage.objects for update to authenticated
using (
  bucket_id = 'communication-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (
    public.communications_can_read_conversation(split_part(name, '/', 1)::uuid)
  )
)
with check (
  bucket_id = 'communication-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (
    public.communications_can_read_conversation(split_part(name, '/', 1)::uuid)
  )
);

drop policy if exists "communication attachments storage delete" on storage.objects;
create policy "communication attachments storage delete"
on storage.objects for delete to authenticated
using (
  bucket_id = 'communication-attachments'
  and split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  and (
    owner::text = (select auth.uid())::text
    or public.communications_is_admin()
  )
);

do $$
begin
  if to_regclass('public.user_module_permissions') is not null then
    alter table public.user_module_permissions
      drop constraint if exists user_module_permissions_module_key_check;

    alter table public.user_module_permissions
      add constraint user_module_permissions_module_key_check check (
        module_key in (
          'yard_view',
          'inventory',
          'purchase_orders',
          'dti',
          'dti_summary',
          'hardband',
          'admin',
          'reports',
          'dashboard',
          'communications'
        )
      );
  end if;
end $$;

do $$
begin
  if to_regclass('public.permissions') is not null then
    insert into public.permissions (permission_key, name, description, module_key, sort_order)
    values
      ('communications.view', 'Communications', 'Open Communications.', 'communications', 160),
      ('communications.send_direct', 'Send Direct Messages', 'Send direct messages to internal employees.', 'communications', 161),
      ('communications.create_group', 'Create Groups', 'Create group conversations.', 'communications', 162),
      ('communications.manage_group', 'Manage Groups', 'Manage group membership and settings.', 'communications', 163),
      ('communications.send_announcement', 'Send Announcements', 'Send alert and announcement conversations.', 'communications', 164),
      ('communications.upload_files', 'Upload Communication Files', 'Attach files and images to messages.', 'communications', 165),
      ('communications.delete_own_message', 'Delete Own Message', 'Delete or redact your own messages.', 'communications', 166),
      ('communications.moderate_messages', 'Moderate Messages', 'Moderate messages and locked conversations.', 'communications', 167),
      ('communications.view_all_yard_channels', 'View All Yard Channels', 'View all yard channels regardless of assignment.', 'communications', 168),
      ('communications.manage_notification_settings', 'Manage Communication Notifications', 'Manage communication mute and notification settings.', 'communications', 169)
    on conflict (permission_key) do update
    set name = excluded.name,
        description = excluded.description,
        module_key = excluded.module_key,
        sort_order = excluded.sort_order,
        is_active = true;
  end if;
end $$;

do $$
declare
  role_keys text[] := array[
    'admin',
    'owner',
    'administrator',
    'service_line_manager',
    'dti_superintendent',
    'dti_lead',
    'level_2_inspector',
    'yard_manager',
    'yard_hand',
    'inventory_manager',
    'inventory_specialist',
    'warehouse_employee',
    'sales',
    'office_admin',
    'cdt_lead',
    'cdt_hand',
    'hardband_lead',
    'hardband_hand',
    'tubing_lead',
    'tubing_hand',
    'maintenance_lead',
    'maintenance_hand',
    'employee',
    'operator',
    'dti_inspector',
    'lead_inspector'
  ];
  action_keys text[] := array['view', 'create', 'edit', 'delete', 'approve', 'close', 'export', 'manage_settings', 'receive_notifications'];
  default_role_key text;
  default_action_key text;
begin
  if to_regclass('public.role_permission_defaults') is not null then
    foreach default_role_key in array role_keys loop
      foreach default_action_key in array action_keys loop
        if default_role_key in ('admin', 'owner', 'administrator')
          or default_action_key in ('view', 'create', 'edit', 'export', 'receive_notifications')
          or (default_role_key in ('service_line_manager', 'dti_superintendent', 'yard_manager', 'inventory_manager', 'office_admin') and default_action_key in ('approve', 'close', 'manage_settings'))
        then
          insert into public.role_permission_defaults (role_key, module_key, action_key, is_allowed)
          values (default_role_key, 'communications', default_action_key, true)
          on conflict (role_key, module_key, action_key) do update
          set is_allowed = excluded.is_allowed;
        end if;
      end loop;
    end loop;
  end if;
end $$;

do $$
begin
  if to_regclass('public.user_module_permissions') is not null and to_regclass('public.profiles') is not null then
    insert into public.user_module_permissions (user_id, module_key, can_access)
    select p.id, 'communications', true
    from public.profiles p
    where coalesce(p.is_disabled, false) = false
      and lower(coalesce(p.role::text, '')) not in ('', 'customer')
    on conflict (user_id, module_key) do update
    set can_access = true,
        updated_at = now();
  end if;
end $$;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.conversations to authenticated;
grant select, insert, update, delete on public.conversation_members to authenticated;
grant select, insert, update, delete on public.messages to authenticated;
grant select, insert, update, delete on public.message_attachments to authenticated;
grant select, insert, update, delete on public.message_read_receipts to authenticated;
grant select, insert, update, delete on public.message_reactions to authenticated;
grant select, insert, update, delete on public.message_acknowledgements to authenticated;
grant select, insert, update, delete on public.communication_tasks to authenticated;
grant select, insert, update, delete on public.communication_notification_preferences to authenticated;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.conversations;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.conversation_members;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.message_attachments;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.message_read_receipts;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.notifications;
  exception when duplicate_object then null;
  end;
end $$;
