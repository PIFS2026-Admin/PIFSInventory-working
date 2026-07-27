alter table public.service_board_columns
  add column if not exists due_date date;

create index if not exists service_board_columns_due_date_idx
  on public.service_board_columns(due_date)
  where active = true;
