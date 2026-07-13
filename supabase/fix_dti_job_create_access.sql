alter type public.user_role add value if not exists 'dti_lead';

create or replace function public.is_dti_internal_user()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    public.current_user_role()::text in (
      'admin',
      'employee',
      'dti_superintendent',
      'dti_lead',
      'dti_inspector'
    ),
    false
  )
$$;

create or replace function public.is_dti_reader()
returns boolean
language sql
security definer
set search_path = public
as $$
  select coalesce(
    public.current_user_role()::text in (
      'admin',
      'employee',
      'sales',
      'dti_superintendent',
      'dti_lead',
      'dti_inspector'
    ),
    false
  )
$$;

drop policy if exists "inspectors internal read" on public.inspectors;
drop policy if exists "inspectors internal write" on public.inspectors;

create policy "inspectors internal read"
on public.inspectors
for select
to authenticated
using (public.current_user_role()::text in ('admin', 'employee', 'dti_superintendent', 'dti_lead'));

create policy "inspectors internal write"
on public.inspectors
for all
to authenticated
using (public.current_user_role()::text in ('admin', 'employee', 'dti_superintendent'))
with check (public.current_user_role()::text in ('admin', 'employee', 'dti_superintendent'));
