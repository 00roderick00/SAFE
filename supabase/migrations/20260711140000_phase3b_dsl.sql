-- Phase 3B — DSL game support on custom_games.
--
-- 3A rows are engine-config: they name a base_engine and carry a
-- tunable `config` blob. 3B rows are DSL programs: they carry a
-- `dsl_program` blob interpreted by a fixed runtime — the two flow
-- through the same marketplace, equip UI, and royalty pipeline,
-- distinguished by the `mode` column.

alter table custom_games
  add column if not exists mode text
    not null default 'engine_config'
    check (mode in ('engine_config', 'dsl_program'));

alter table custom_games
  add column if not exists dsl_program jsonb;

-- Existing 3A rows already have base_engine + config; leave them on
-- mode='engine_config'. New 3B rows will set mode='dsl_program' and
-- may leave base_engine set to a nominal engine (used only for the
-- royalty enum + UI icon) with the interpreter driving actual
-- gameplay from dsl_program.

-- Rebuild the public marketplace view to expose the mode + DSL.
-- Postgres' `create or replace view` refuses to change column
-- names/order, so drop + recreate.
drop view if exists public_custom_games;
create view public_custom_games as
  select
    cg.id,
    cg.creator_id,
    cg.name,
    cg.description,
    cg.base_engine,
    cg.mode,
    cg.config,
    cg.dsl_program,
    cg.calibrated_difficulty,
    cg.plays,
    cg.status,
    cg.created_at,
    p.handle as creator_handle
  from custom_games cg
  join profiles p on p.id = cg.creator_id
  where cg.status = 'live';

grant select on public_custom_games to anon, authenticated;
