create table if not exists public.cabaret_app_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.cabaret_app_state enable row level security;

create policy "Allow app state read"
  on public.cabaret_app_state
  for select
  using (auth.role() = 'authenticated');

create policy "Allow app state insert"
  on public.cabaret_app_state
  for insert
  with check (auth.role() = 'authenticated');

create policy "Allow app state update"
  on public.cabaret_app_state
  for update
  using (auth.role() = 'authenticated')
  with check (auth.role() = 'authenticated');
