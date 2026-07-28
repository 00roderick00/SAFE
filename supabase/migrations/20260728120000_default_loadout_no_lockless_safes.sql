-- Fix the empty-loadout trap.
--
-- THE BUG: handle_new_user() created every safe with
-- '{"modules":[],"effectiveScore":0}'. A lockless safe has
-- verifiableCount = 0, and the composition rule in submit_result forces
-- such an attack to a LOSS (PROGRESS-SECURITY.md) — correctly, since
-- nothing in it can be verified. But list_targets happily listed those
-- safes, so a defenceless-looking vault was advertised as an attractive
-- target, could never be breached, and silently ate the attacker's
-- stake. Two of seven live safes were in this state, one holding 1,096
-- tokens.
--
-- THE FIX (at source): every safe is created with a real starter
-- defence. keypad is a class-1a verifiable lock, so verifiableCount >= 1
-- from the moment the safe exists and the trap cannot form.
--
-- This does NOT weaken anything: the composition rule and the forgery
-- guarantee are untouched. It removes the *cause* of safes that trip
-- the rule, rather than relaxing the rule. Deliberately NOT making
-- lockless safes an instant breach — that would be a free-money farm.
--
-- Matches the client's tier-0 default loadout (playerStore
-- createDefaultLoadout): keypad, slider, memorymatch at 0.3 difficulty.
-- Names/descriptions/weights mirror MODULE_CONFIG; effectiveScore is the
-- value calculateSecurityScore() produces for this set (recomputed
-- server-side on every attack regardless).

begin;

create or replace function public.default_security_loadout()
returns jsonb
language sql
immutable
as $$
  select '{
    "modules": [
      {"id":"starter-slot-0","type":"keypad","difficulty":0.3,"weight":1.0,
       "name":"Keypad","description":"Enter the code sequence"},
      {"id":"starter-slot-1","type":"slider","difficulty":0.3,"weight":0.9,
       "name":"Slider","description":"Slide to unlock"},
      {"id":"starter-slot-2","type":"memorymatch","difficulty":0.3,"weight":1.1,
       "name":"Memory","description":"Match the pairs"}
    ],
    "effectiveScore": 27.68
  }'::jsonb;
$$;

-- Recreate the signup trigger function with the starter defence.
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
    values (new.id, 1000, public.default_security_loadout())
    on conflict (owner_id) do nothing
    returning id into new_safe_id;

  if new_safe_id is not null then
    insert into public.ledger (user_id, delta, reason, ref_type, ref_id)
      values (new.id, 1000, 'initial_grant', 'signup', new.id);
  end if;

  return new;
end $$;

-- ------- Backfill safes that are already lockless --------------------
do $$
declare
  v_empty int;
  v_fixed int;
begin
  select count(*) into v_empty
  from safes
  where jsonb_typeof(security_loadout->'modules') <> 'array'
     or jsonb_array_length(security_loadout->'modules') = 0;
  raise notice 'empty-loadout backfill: % safe(s) with no locks', v_empty;

  update safes
  set security_loadout = public.default_security_loadout(),
      updated_at = now()
  where jsonb_typeof(security_loadout->'modules') <> 'array'
     or jsonb_array_length(security_loadout->'modules') = 0;
  get diagnostics v_fixed = row_count;
  raise notice 'empty-loadout backfill: % safe(s) given the starter defence', v_fixed;

  if exists (
    select 1 from safes
    where jsonb_typeof(security_loadout->'modules') <> 'array'
       or jsonb_array_length(security_loadout->'modules') = 0
  ) then
    raise exception 'backfill incomplete: lockless safes remain';
  end if;

  -- Every safe must now carry at least one server-verifiable lock, or
  -- it would still be listed-but-unbreachable.
  if exists (
    select 1 from safes s
    where not exists (
      select 1 from jsonb_array_elements(s.security_loadout->'modules') m
      where m->>'type' in ('keypad','colorcode','combination','chesspuzzle')
         or (m#>>'{customConfig,mode}') = 'dsl_program'
    )
  ) then
    raise warning 'some safes still have no server-verifiable lock; list_targets filters these out';
  end if;

  raise notice 'empty-loadout backfill: verified — no lockless safes remain';
end $$;

commit;

-- ------- Rate-limit bucket for the player-search endpoint -------------
-- Search is the first endpoint that lets a caller probe for other
-- players by name, so it gets a real (DB-backed, not per-isolate) limit.
-- RLS is enabled with NO policies: only the service role — i.e. Edge
-- Functions — can touch it. The browser can neither read nor write it.
begin;

create table if not exists public.api_rate_limits (
  user_id      uuid not null references public.profiles(id) on delete cascade,
  endpoint     text not null,
  window_start timestamptz not null default now(),
  hits         integer not null default 0,
  primary key (user_id, endpoint)
);

alter table public.api_rate_limits enable row level security;

commit;
