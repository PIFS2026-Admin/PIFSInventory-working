create table if not exists public.tubular_release_requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique,
  company_id uuid references public.companies(id) on delete set null,
  yard_id uuid references public.yards(id) on delete set null,
  rack_id uuid references public.racks(id) on delete set null,
  customer_user_id uuid references auth.users(id) on delete set null,
  customer_name text,
  customer_email text,
  company_name text,
  yard_name text,
  rack_label text,
  quantity_joints integer not null default 0 check (quantity_joints >= 0),
  notes text,
  signature_name text not null,
  signature_data text,
  status text not null default 'Submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tubular_release_requests_company_id_idx
  on public.tubular_release_requests(company_id, created_at desc);

create index if not exists tubular_release_requests_yard_id_idx
  on public.tubular_release_requests(yard_id, created_at desc);

create index if not exists tubular_release_requests_rack_id_idx
  on public.tubular_release_requests(rack_id, created_at desc);

create or replace function public.touch_tubular_release_requests_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_tubular_release_requests_updated_at on public.tubular_release_requests;

create trigger touch_tubular_release_requests_updated_at
before update on public.tubular_release_requests
for each row
execute function public.touch_tubular_release_requests_updated_at();

alter table public.tubular_release_requests enable row level security;

drop policy if exists "release requests read own company or internal" on public.tubular_release_requests;
create policy "release requests read own company or internal"
on public.tubular_release_requests
for select
to authenticated
using (
  public.is_internal_user()
  or company_id = public.current_user_company_id()
);

drop policy if exists "release requests customer insert own company" on public.tubular_release_requests;
create policy "release requests customer insert own company"
on public.tubular_release_requests
for insert
to authenticated
with check (
  public.is_internal_user()
  or company_id = public.current_user_company_id()
);

drop policy if exists "release requests internal update" on public.tubular_release_requests;
create policy "release requests internal update"
on public.tubular_release_requests
for update
to authenticated
using (public.is_internal_user())
with check (public.is_internal_user());

grant select, insert, update on public.tubular_release_requests to authenticated;
