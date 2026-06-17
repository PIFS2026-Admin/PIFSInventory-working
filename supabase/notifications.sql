create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_user_id uuid references auth.users(id) on delete cascade,
  recipient_company_id uuid references public.companies(id) on delete cascade,
  audience text not null default 'user',
  role text,
  title text not null,
  body text,
  category text not null default 'general',
  priority text not null default 'normal',
  action_label text,
  action_url text,
  email_sent_at timestamptz,
  read_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notifications_audience_check check (
    audience in ('user', 'company', 'internal', 'role', 'broadcast')
  ),
  constraint notifications_priority_check check (
    priority in ('low', 'normal', 'high', 'urgent')
  )
);

create index if not exists notifications_recipient_user_id_idx
  on public.notifications (recipient_user_id, read_at, created_at desc);

create index if not exists notifications_recipient_company_id_idx
  on public.notifications (recipient_company_id, read_at, created_at desc);

create index if not exists notifications_audience_idx
  on public.notifications (audience, role, read_at, created_at desc);

create or replace function public.touch_notifications_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_notifications_updated_at on public.notifications;

create trigger touch_notifications_updated_at
before update on public.notifications
for each row
execute function public.touch_notifications_updated_at();

alter table public.notifications enable row level security;

drop policy if exists "notifications readable by recipient" on public.notifications;
create policy "notifications readable by recipient"
on public.notifications
for select
to authenticated
using (
  recipient_user_id = auth.uid()
  or recipient_company_id = public.current_user_company_id()
  or (audience = 'internal' and public.is_internal_user())
  or (audience = 'role' and role = public.current_user_role()::text)
  or (
    audience = 'broadcast'
    and public.current_user_role()::text in (
      'admin',
      'employee',
      'sales',
      'dti_superintendent',
      'dti_inspector',
      'operator'
    )
  )
);

drop policy if exists "notifications update own readable" on public.notifications;
create policy "notifications update own readable"
on public.notifications
for update
to authenticated
using (
  recipient_user_id = auth.uid()
  or recipient_company_id = public.current_user_company_id()
  or (audience = 'internal' and public.is_internal_user())
  or (audience = 'role' and role = public.current_user_role()::text)
  or (
    audience = 'broadcast'
    and public.current_user_role()::text in (
      'admin',
      'employee',
      'sales',
      'dti_superintendent',
      'dti_inspector',
      'operator'
    )
  )
)
with check (
  recipient_user_id = auth.uid()
  or recipient_company_id = public.current_user_company_id()
  or (audience = 'internal' and public.is_internal_user())
  or (audience = 'role' and role = public.current_user_role()::text)
  or (
    audience = 'broadcast'
    and public.current_user_role()::text in (
      'admin',
      'employee',
      'sales',
      'dti_superintendent',
      'dti_inspector',
      'operator'
    )
  )
);

drop policy if exists "notifications internal insert" on public.notifications;
create policy "notifications internal insert"
on public.notifications
for insert
to authenticated
with check (public.is_internal_user());

drop policy if exists "notifications internal delete" on public.notifications;
create policy "notifications internal delete"
on public.notifications
for delete
to authenticated
using (public.is_internal_user());

grant select, insert, update, delete on public.notifications to authenticated;
