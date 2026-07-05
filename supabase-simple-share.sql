create table if not exists public.cabaret_app_state (
  id text primary key,
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.cabaret_app_state enable row level security;

drop policy if exists "Allow anon app state read" on public.cabaret_app_state;
drop policy if exists "Allow anon app state insert" on public.cabaret_app_state;
drop policy if exists "Allow anon app state update" on public.cabaret_app_state;

create policy "Allow anon app state read"
  on public.cabaret_app_state
  for select
  to anon
  using (id = 'main-store-nnmrdisk');

create policy "Allow anon app state insert"
  on public.cabaret_app_state
  for insert
  to anon
  with check (id = 'main-store-nnmrdisk');

create policy "Allow anon app state update"
  on public.cabaret_app_state
  for update
  to anon
  using (id = 'main-store-nnmrdisk')
  with check (id = 'main-store-nnmrdisk');
