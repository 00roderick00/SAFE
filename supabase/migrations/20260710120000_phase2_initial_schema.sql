-- SAFE Phase 2 — Server-authoritative schema
--
-- Tables:
--   profiles           one row per authenticated user
--   safes              the player's guarded token store + loadout snapshot
--   attacks            in-progress + resolved attack sessions
--   attack_results     per-module scores submitted for an attack
--   insurance_policies active + expired policies (append; expiry via expires_at)
--   ledger             append-only audit log; balance = sum(delta) for a user
--
-- Balance rule: safes.balance is a maintained cache. Every mutation
-- goes through insert_ledger() which appends to `ledger` and updates
-- `safes.balance` in the same transaction. Balance never mutates
-- outside that function. Client cannot write to `ledger` directly
-- (RLS forbids); Edge Functions use the service_role key.

-- ---------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------
create extension if not exists "pgcrypto";  -- gen_random_uuid()

-- ---------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------
do $$ begin
  create type attack_status as enum ('pending', 'won', 'lost', 'abandoned');
exception when duplicate_object then null; end $$;

do $$ begin
  create type ledger_reason as enum (
    'initial_grant',      -- starting balance on profile creation
    'attack_stake',       -- attacker debited on start_attack
    'attack_loot',        -- attacker credited on won
    'defense_fee',        -- defender credited when attack loses
    'defense_loss',       -- defender debited when attack wins
    'insurance_premium',  -- defender debited when buying insurance
    'insurance_payout',   -- defender credited from claim
    'platform_cut',       -- platform's share; user_id = null
    'migration',          -- one-time localStorage -> DB migration
    'admin_adjustment'    -- manual correction
  );
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------

create table if not exists profiles (
  id           uuid primary key references auth.users on delete cascade,
  handle       text unique,
  mmr          integer not null default 1000,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  migrated_from_local boolean not null default false
);

create table if not exists safes (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null unique references profiles(id) on delete cascade,
  balance            integer not null default 0 check (balance >= 0),
  security_loadout   jsonb not null default '{"modules":[],"effectiveScore":0}'::jsonb,
  updated_at         timestamptz not null default now(),
  last_attacked_at   timestamptz
);

create index if not exists safes_updated_at_idx on safes (updated_at desc);
create index if not exists safes_owner_idx on safes (owner_id);

create table if not exists attacks (
  id                 uuid primary key default gen_random_uuid(),
  attacker_id        uuid not null references profiles(id) on delete cascade,
  defender_safe_id   uuid references safes(id) on delete set null, -- null when target is a bot
  is_bot_target      boolean not null default false,
  bot_target         jsonb, -- when is_bot_target, this holds the generated bot snapshot
  stake              integer not null check (stake >= 0),
  status             attack_status not null default 'pending',
  loot               integer not null default 0 check (loot >= 0),
  platform_fee       integer not null default 0 check (platform_fee >= 0),
  loadout_snapshot   jsonb not null,           -- frozen loadout at attack start
  module_seeds       jsonb not null,           -- ordered array of {index, moduleType, seed}
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz
);

create index if not exists attacks_attacker_idx on attacks (attacker_id, created_at desc);
create index if not exists attacks_defender_idx on attacks (defender_safe_id, created_at desc);
create index if not exists attacks_pending_idx on attacks (attacker_id) where status = 'pending';

create table if not exists attack_results (
  attack_id       uuid not null references attacks(id) on delete cascade,
  module_index    integer not null check (module_index >= 0),
  module_type     text not null,
  score           real not null check (score >= 0 and score <= 1),
  passed          boolean not null,
  time_spent_ms   integer not null check (time_spent_ms >= 0),
  primary key (attack_id, module_index)
);

create table if not exists insurance_policies (
  id                uuid primary key default gen_random_uuid(),
  owner_id          uuid not null references profiles(id) on delete cascade,
  tier              text not null,
  coverage          real not null check (coverage > 0 and coverage <= 1),
  premium           integer not null,
  max_payout        integer not null,
  claims_remaining  integer not null check (claims_remaining >= 0),
  purchased_at      timestamptz not null default now(),
  expires_at        timestamptz not null
);

create index if not exists insurance_owner_active_idx
  on insurance_policies (owner_id, expires_at desc)
  where claims_remaining > 0;

create table if not exists ledger (
  id            bigserial primary key,
  user_id       uuid references profiles(id) on delete cascade, -- null for platform_cut
  delta         integer not null,
  reason        ledger_reason not null,
  ref_type      text,       -- 'attack', 'policy', 'defense', 'migration', etc.
  ref_id        uuid,
  created_at    timestamptz not null default now()
);

create index if not exists ledger_user_created_idx on ledger (user_id, created_at desc);
create index if not exists ledger_ref_idx on ledger (ref_type, ref_id);

-- ---------------------------------------------------------------
-- Balance mutation helper. USE THIS instead of touching safes.balance
-- directly. Runs as security definer so RLS is bypassed for the
-- ledger insert; caller (Edge Function via service_role) is trusted.
-- ---------------------------------------------------------------

create or replace function insert_ledger(
  p_user_id  uuid,
  p_delta    integer,
  p_reason   ledger_reason,
  p_ref_type text,
  p_ref_id   uuid
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  new_id bigint;
begin
  insert into ledger (user_id, delta, reason, ref_type, ref_id)
    values (p_user_id, p_delta, p_reason, p_ref_type, p_ref_id)
    returning id into new_id;

  -- Only mutate safes.balance when a user is attached (platform cuts
  -- are recorded with user_id = null).
  if p_user_id is not null then
    update safes
      set balance    = balance + p_delta,
          updated_at = now()
      where owner_id = p_user_id;
  end if;

  return new_id;
end $$;

comment on function insert_ledger is
  'Append a ledger row and adjust the owner''s safe balance in the same tx.';

-- ---------------------------------------------------------------
-- Bootstrap a profile + safe row when a user signs up.
-- Fires on auth.users insert (Supabase's built-in table).
-- ---------------------------------------------------------------

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_safe_id uuid;
begin
  insert into public.profiles (id, handle)
    values (new.id, coalesce(new.raw_user_meta_data->>'handle', split_part(new.email, '@', 1)))
    on conflict (id) do nothing;

  insert into public.safes (owner_id, balance, security_loadout)
    values (new.id, 1000, '{"modules":[],"effectiveScore":0}'::jsonb)
    on conflict (owner_id) do nothing
    returning id into new_safe_id;

  if new_safe_id is not null then
    insert into public.ledger (user_id, delta, reason, ref_type, ref_id)
      values (new.id, 1000, 'initial_grant', 'signup', new.id);
  end if;

  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
