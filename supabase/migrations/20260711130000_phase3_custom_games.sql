-- Phase 3A — Custom games (AI-configured minigames)
--
-- A user prompts the AI, the AI proposes a config for one of the
-- existing engines, the server validates + calibrates it, and
-- (if it passes the solve-rate band) publishes it as a `live`
-- custom_game that anyone can equip on their safe.
--
-- Every attack that hits a custom-game module pays the creator a
-- royalty; that royalty is a ledger row with reason
-- 'creator_royalty' (added to the enum below).

-- --------------------------------------------------------------
-- 1. Extend the ledger_reason enum.
--    Adding an enum value cannot run inside a transaction that
--    also uses it, so we do this in a standalone statement.
-- --------------------------------------------------------------

alter type ledger_reason add value if not exists 'creator_royalty';

-- --------------------------------------------------------------
-- 2. custom_games table.
-- --------------------------------------------------------------

create table if not exists custom_games (
  id                       uuid primary key default gen_random_uuid(),
  creator_id               uuid not null references profiles(id) on delete cascade,
  name                     text not null,
  description              text not null default '',
  prompt                   text not null default '',
  base_engine              text not null,
  config                   jsonb not null,
  stated_difficulty        real not null check (stated_difficulty >= 0 and stated_difficulty <= 1),
  calibrated_difficulty    real,
  calibration_stats        jsonb,
  status                   text not null default 'draft'
                             check (status in ('draft', 'calibrating', 'live', 'rejected')),
  plays                    integer not null default 0,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index if not exists custom_games_creator_idx on custom_games (creator_id, created_at desc);
create index if not exists custom_games_live_idx on custom_games (status, updated_at desc) where status = 'live';

-- --------------------------------------------------------------
-- 3. RLS. Creators read/write their own drafts; everyone reads
--    live rows via a view; direct writes forbidden (Edge Functions
--    use service_role).
-- --------------------------------------------------------------

alter table custom_games enable row level security;

drop policy if exists "custom_games_owner_all" on custom_games;
create policy "custom_games_owner_all"
  on custom_games for all
  using (creator_id = auth.uid())
  with check (creator_id = auth.uid());

drop policy if exists "custom_games_live_select" on custom_games;
create policy "custom_games_live_select"
  on custom_games for select
  using (status = 'live');

-- Public marketplace view: everything an equipping player needs.
create or replace view public_custom_games as
  select
    cg.id,
    cg.creator_id,
    cg.name,
    cg.description,
    cg.base_engine,
    cg.config,
    cg.calibrated_difficulty,
    cg.plays,
    cg.status,
    cg.created_at,
    p.handle as creator_handle
  from custom_games cg
  join profiles p on p.id = cg.creator_id
  where cg.status = 'live';

grant select on public_custom_games to anon, authenticated;
