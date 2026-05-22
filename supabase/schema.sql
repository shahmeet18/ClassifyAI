-- ═══════════════════════════════════════════════════════════════════════════
--  ClassifyAI — Supabase Schema
--  Run this in: Supabase Dashboard → SQL Editor → Run
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Organizations ──────────────────────────────────────────────────────────
create table if not exists public.organizations (
  id          uuid default gen_random_uuid() primary key,
  name        text not null,
  slug        text unique not null,
  plan        text default 'starter',      -- starter | business | enterprise
  owner_id    uuid references auth.users(id) on delete cascade,
  created_at  timestamptz default now()
);

-- ── User profiles (extends auth.users) ────────────────────────────────────
create table if not exists public.profiles (
  id              uuid references auth.users(id) on delete cascade primary key,
  full_name       text,
  organization_id uuid references public.organizations(id) on delete set null,
  role            text default 'admin',    -- admin | steward | reviewer | viewer
  created_at      timestamptz default now(),
  updated_at      timestamptz default now()
);

-- ── Row-Level Security ─────────────────────────────────────────────────────
alter table public.organizations  enable row level security;
alter table public.profiles        enable row level security;

-- Organizations: owner + members can read
create policy "org_select" on public.organizations for select
  using (
    owner_id = auth.uid()
    or id in (select organization_id from public.profiles where id = auth.uid())
  );

create policy "org_insert" on public.organizations for insert
  with check (owner_id = auth.uid());

create policy "org_update" on public.organizations for update
  using (owner_id = auth.uid());

-- Profiles: users manage their own row
create policy "profile_select" on public.profiles for select
  using (id = auth.uid());

create policy "profile_insert" on public.profiles for insert
  with check (id = auth.uid());

create policy "profile_update" on public.profiles for update
  using (id = auth.uid());

-- ── Auto-create profile on signup (optional trigger) ─────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
