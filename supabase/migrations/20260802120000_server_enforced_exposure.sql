-- Server-enforced exposure.
--
-- THE FICTION BEING REPLACED: heistModeActive / heistModeExpiresAt lived
-- only in the browser's zustand store. No column recorded exposure and
-- no Edge Function checked it, so every safe was attackable at any time
-- regardless of whether its owner was raiding. The core bargain of the
-- game — you can only be raided while you are yourself raiding — was
-- not enforced anywhere.
--
-- `exposed_until` is now the single source of truth. It is written only
-- by the set_exposure Edge Function, which derives the window length
-- from ECONOMY.heistDuration server-side; the client never supplies a
-- value. start_attack refuses an attack on a defender whose window has
-- lapsed, BEFORE any stake is debited, and list_targets only lists real
-- players who are currently exposed.
--
-- EXIT SEMANTICS (deliberate): clearing exposed_until stops NEW attacks
-- from starting. It does not touch attacks already in flight — those
-- rows keep their pending status and settle normally through
-- submit_result. Once a stake is committed the contest resolves, win or
-- lose. See PROGRESS-DEFENCE.md; an escape hatch that cancelled
-- in-flight raids would hand all the upside of raiding to whoever bails
-- fastest, which is exactly the reflex/automation contest
-- ANTI-AUTOMATION.md exists to avoid.
--
-- BACKFILL: existing safes get NULL — nobody starts exposed. That is
-- the correct default (you are only attackable while raiding) and
-- strands nobody: any player can expose themselves at will from the
-- heist screen, and the target list keeps filling with bots regardless.

begin;

alter table public.safes
  add column if not exists exposed_until timestamptz;

comment on column public.safes.exposed_until is
  'When this safe stops being attackable. Written only by the set_exposure Edge Function (window length derived from ECONOMY.heistDuration). NULL or past = not attackable.';

-- Partial index: the only query shape is "currently exposed".
create index if not exists safes_exposed_until_idx
  on public.safes (exposed_until)
  where exposed_until is not null;

-- The public snapshot view must carry exposure so list_targets can
-- filter on it. Recreated with the same columns plus exposed_until —
-- still no balance-history, email or user-identifying data beyond the
-- handle the target card already shows.
drop view if exists public_safe_snapshots;
create or replace view public_safe_snapshots as
  select
    s.id,
    s.owner_id,
    s.balance,
    s.security_loadout,
    s.last_attacked_at,
    s.updated_at,
    s.exposed_until,
    p.handle
  from safes s
  join profiles p on p.id = s.owner_id
  where s.balance > 0;

grant select on public_safe_snapshots to authenticated;

commit;
