-- Daily Tracker: per-user private app state.
-- Run this once in Supabase SQL Editor.

create table if not exists public.daily_tracker_user_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.daily_tracker_user_state enable row level security;

drop policy if exists "daily_tracker_select_own" on public.daily_tracker_user_state;
drop policy if exists "daily_tracker_insert_own" on public.daily_tracker_user_state;
drop policy if exists "daily_tracker_update_own" on public.daily_tracker_user_state;

create policy "daily_tracker_select_own"
on public.daily_tracker_user_state
for select
to authenticated
using (auth.uid() = user_id);

create policy "daily_tracker_insert_own"
on public.daily_tracker_user_state
for insert
to authenticated
with check (auth.uid() = user_id);

create policy "daily_tracker_update_own"
on public.daily_tracker_user_state
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

do $$
begin
  alter publication supabase_realtime add table public.daily_tracker_user_state;
exception
  when duplicate_object then null;
end $$;
