create or replace function public.can_access_tubing_daily_summaries()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and lower(coalesce(role::text, '')) in (
        'admin', 'employee', 'service_line_manager', 'tubing_lead', 'tubing_hand'
      )
  );
$$;

create table if not exists public.tubing_drift_verifications (
  id uuid primary key default gen_random_uuid(),
  verification_number text not null unique,
  verification_date date not null default current_date,
  drift_serial_number text,
  checked_out_by text,
  signature_data text,
  ft_tu_number text,
  end_a_0_diameter numeric(8,4),
  end_a_0_result text check (end_a_0_result in ('Pass', 'Fail') or end_a_0_result is null),
  end_a_90_diameter numeric(8,4),
  end_a_90_result text check (end_a_90_result in ('Pass', 'Fail') or end_a_90_result is null),
  center_0_diameter numeric(8,4),
  center_0_result text check (center_0_result in ('Pass', 'Fail') or center_0_result is null),
  center_90_diameter numeric(8,4),
  center_90_result text check (center_90_result in ('Pass', 'Fail') or center_90_result is null),
  end_b_0_diameter numeric(8,4),
  end_b_0_result text check (end_b_0_result in ('Pass', 'Fail') or end_b_0_result is null),
  end_b_90_diameter numeric(8,4),
  end_b_90_result text check (end_b_90_result in ('Pass', 'Fail') or end_b_90_result is null),
  overall_length numeric(8,3),
  overall_result text check (overall_result in ('Pass', 'Fail') or overall_result is null),
  comments text,
  status text not null default 'Draft' check (status in ('Draft', 'Completed')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tubing_drift_verifications_date_idx
  on public.tubing_drift_verifications(verification_date desc);
create index if not exists tubing_drift_verifications_serial_idx
  on public.tubing_drift_verifications(drift_serial_number);

alter table public.tubing_drift_verifications enable row level security;

drop policy if exists "tubing drift verification authorized access"
  on public.tubing_drift_verifications;
create policy "tubing drift verification authorized access"
on public.tubing_drift_verifications
for all
to authenticated
using (public.can_access_tubing_daily_summaries())
with check (public.can_access_tubing_daily_summaries());

grant select, insert, update, delete on public.tubing_drift_verifications to authenticated;
grant execute on function public.can_access_tubing_daily_summaries() to authenticated;
