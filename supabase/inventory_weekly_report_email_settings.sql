insert into public.email_notification_types (notification_key, name, description, sort_order, is_active)
values (
  'inventory_weekly_report',
  'Weekly Inventory Report',
  'Weekly consumables issue spend and usage summary is emailed.',
  110,
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
where nt.notification_key = 'inventory_weekly_report'
  and lower(coalesce(p.role::text, '')) in ('admin', 'administrator', 'inventory_manager')
on conflict (notification_type_id, user_id) do update
set enabled = true;
