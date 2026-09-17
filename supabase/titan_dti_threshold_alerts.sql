begin;

create table if not exists public.titan_dti_inspection_threshold_states (
  report_id uuid not null references public.titan_dti_inspection_reports(id) on delete cascade,
  alert_type text not null check (alert_type in ('dbr', 'repairs')),
  is_active boolean not null default false,
  current_count integer not null default 0 check (current_count >= 0),
  total_joint_count integer not null default 0 check (total_joint_count >= 0),
  last_alerted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (report_id, alert_type)
);

alter table public.titan_dti_inspection_threshold_states enable row level security;

drop policy if exists "titan dti threshold states read" on public.titan_dti_inspection_threshold_states;
create policy "titan dti threshold states read"
on public.titan_dti_inspection_threshold_states
for select to authenticated
using (public.titan_dti_controls_can_access());

grant select on public.titan_dti_inspection_threshold_states to authenticated;

insert into public.email_notification_types (notification_key, name, description, sort_order, is_active)
values (
  'dti_inspection_threshold_alert',
  'DTI DBR and Repair Threshold',
  'A DTI inspection report reaches 10% DBR joints or 10% qualifying box and pin repairs. Refaces and hardbanding are excluded.',
  85,
  true
)
on conflict (notification_key) do update
set name = excluded.name,
    description = excluded.description,
    sort_order = excluded.sort_order,
    is_active = true;

insert into public.email_notification_recipients (notification_type_id, user_id, enabled)
select nt.id, p.id, true
from public.email_notification_types nt
cross join public.profiles p
where nt.notification_key = 'dti_inspection_threshold_alert'
  and lower(coalesce(p.role::text, '')) in ('admin', 'administrator', 'dti_superintendent')
on conflict (notification_type_id, user_id) do nothing;

comment on table public.titan_dti_inspection_threshold_states is
'Tracks active DBR and repair threshold episodes so TITAN sends one alert per crossing and can alert again after the percentage falls below 10%.';

commit;
