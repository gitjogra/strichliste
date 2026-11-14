-- Strichliste: Tabelle + Zugriffsschutz.
-- In Supabase: SQL Editor → New query → einfügen → Run.

create table if not exists public.tally_days (
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  day        date not null,
  log        text[] not null default '{}',          -- Reihenfolge der Striche, z. B. {s,m,s}
  updated_at timestamptz not null default now(),
  primary key (user_id, day),
  constraint log_valid check (
    log <@ array['s','m']::text[]
    and cardinality(log) <= 6
  )
);

-- Row Level Security: Jeder Account sieht und ändert nur seine eigenen Zeilen.
-- Ohne Login (nur mit dem öffentlichen anon key) liefert die Tabelle nichts.
alter table public.tally_days enable row level security;

drop policy if exists "own rows" on public.tally_days;
create policy "own rows" on public.tally_days
  for all
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- Eigene Übungen (zusätzlich zur festen Liste in js/exercises.js)
create table if not exists public.custom_exercises (
  id         uuid primary key,
  user_id    uuid not null default auth.uid() references auth.users on delete cascade,
  type       text not null check (type in ('s','m')),
  name       text not null check (char_length(name) between 1 and 80),
  deleted    boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists custom_exercises_user_idx on public.custom_exercises (user_id);
alter table public.custom_exercises enable row level security;
drop policy if exists "own rows" on public.custom_exercises;
create policy "own rows" on public.custom_exercises
  for all to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
