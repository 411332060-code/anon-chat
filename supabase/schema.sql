-- Run this once in the Supabase SQL editor.

create table if not exists public.messages (
  id         bigint generated always as identity primary key,
  nickname   text not null check (char_length(nickname) between 1 and 20),
  content    text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.messages enable row level security;

-- Anyone (no login) can read and post; nobody can edit or delete.
create policy "anyone can read messages"
  on public.messages for select
  to anon using (true);

create policy "anyone can post messages"
  on public.messages for insert
  to anon with check (true);

-- Broadcast new rows to connected clients.
alter publication supabase_realtime add table public.messages;
