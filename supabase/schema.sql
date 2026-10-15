-- Run in the Supabase SQL editor.
-- WARNING: drops and recreates the two tables (existing messages are deleted).
--
-- Principle: the browser is not trusted. Identity, nickname and timestamp are
-- filled in by the database; the client may only supply `id` and `content`.
-- Nobody can update or delete a message.

drop table if exists public.messages;
drop table if exists public.profiles;

-- One nickname per anonymous identity ---------------------------------------

create table public.profiles (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  nickname text not null
);

alter table public.profiles enable row level security;
revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to authenticated;

create policy "read own profile" on public.profiles
  for select to authenticated
  using (user_id = (select auth.uid()));

-- join_chat(): called once on entry; creates the nickname if missing ----------

create or replace function public.join_chat()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  animals text[] := array['貓','狗','兔','狐','熊','鹿','鳥','鯨'];
  nick text;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  insert into public.profiles (user_id, nickname)
  values (uid, '匿名' || animals[1 + floor(random() * 8)::int] || (100 + floor(random() * 900)::int))
  on conflict (user_id) do nothing;

  select p.nickname into nick from public.profiles p where p.user_id = uid;
  return nick;
end;
$$;

revoke all on function public.join_chat() from public, anon;
grant execute on function public.join_chat() to authenticated;

-- Messages -------------------------------------------------------------------

create table public.messages (
  id         uuid primary key default gen_random_uuid(),
  author_id  uuid not null,
  nickname   text not null,
  content    text not null check (char_length(content) between 1 and 500),
  created_at timestamptz not null default now()
);

create index messages_created_idx on public.messages (created_at desc);
create index messages_author_idx  on public.messages (author_id, created_at desc);

alter table public.messages enable row level security;
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (id, content) on public.messages to authenticated;  -- only these two columns

create policy "read all" on public.messages
  for select to authenticated using (true);

create policy "insert as self" on public.messages
  for insert to authenticated
  with check (author_id = (select auth.uid()));

-- Before every insert: stamp identity, tidy the text, rate-limit -------------
-- Error text doubles as an error code the client maps to a friendly message.

create or replace function public.stamp_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid  uuid := auth.uid();
  nick text;
  recent int;
begin
  if uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select p.nickname into nick from public.profiles p where p.user_id = uid;
  if nick is null then
    raise exception 'NO_PROFILE';
  end if;

  new.author_id  := uid;
  new.nickname   := nick;
  new.created_at := clock_timestamp();
  new.content    := btrim(new.content);

  if char_length(new.content) = 0 then
    raise exception 'EMPTY';
  end if;
  if char_length(new.content) > 500 then
    raise exception 'TOO_LONG';
  end if;

  -- serialise per user so parallel requests can't slip past the count
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 0));

  select count(*) into recent
  from public.messages m
  where m.author_id = uid and m.created_at > new.created_at - interval '10 seconds';

  if recent >= 5 then
    raise exception 'RATE_LIMITED';
  end if;

  return new;
end;
$$;

revoke all on function public.stamp_message() from public, anon, authenticated;

create trigger stamp_message
  before insert on public.messages
  for each row execute function public.stamp_message();

-- Realtime ---------------------------------------------------------------------

alter publication supabase_realtime add table public.messages;
