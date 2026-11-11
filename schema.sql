-- Halves — database setup
-- Paste this whole file into Supabase → SQL Editor → New query → Run.

-- The two people using the app
create table if not exists public.members (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at   timestamptz not null default now()
);

-- Every expense and every settle-up payment
create table if not exists public.entries (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null default 'expense' check (kind in ('expense', 'settle')),
  title       text not null check (char_length(title) between 1 and 120),
  amount      numeric(12,2) not null check (amount > 0),
  category    text,
  paid_by     uuid not null references public.members(user_id),
  split       text not null check (split in ('half', 'full')),
  spent_on    date not null default current_date,
  note        text,
  created_by  uuid not null default auth.uid() references public.members(user_id),
  updated_by  uuid references public.members(user_id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists entries_spent_on_idx on public.entries (spent_on desc, created_at desc);

-- Safety net: never allow more than two members
create or replace function public.max_two_members() returns trigger
language plpgsql as $$
begin
  if (select count(*) from public.members) >= 2 then
    raise exception 'This app only supports two people';
  end if;
  return new;
end $$;

drop trigger if exists members_limit on public.members;
create trigger members_limit before insert on public.members
  for each row execute function public.max_two_members();

-- Row level security: only signed-in users (i.e. the two of you) can read/write
alter table public.members enable row level security;
alter table public.entries enable row level security;

drop policy if exists "members read"        on public.members;
drop policy if exists "members insert self" on public.members;
drop policy if exists "members update self" on public.members;
create policy "members read"        on public.members for select to authenticated using (true);
create policy "members insert self" on public.members for insert to authenticated with check (user_id = auth.uid());
create policy "members update self" on public.members for update to authenticated using (user_id = auth.uid());

drop policy if exists "entries read"   on public.entries;
drop policy if exists "entries insert" on public.entries;
drop policy if exists "entries update" on public.entries;
drop policy if exists "entries delete" on public.entries;
create policy "entries read"   on public.entries for select to authenticated using (true);
create policy "entries insert" on public.entries for insert to authenticated with check (created_by = auth.uid());
create policy "entries update" on public.entries for update to authenticated using (true) with check (updated_by = auth.uid());
create policy "entries delete" on public.entries for delete to authenticated using (true);

-- Live sync between both phones
alter publication supabase_realtime add table public.entries;
