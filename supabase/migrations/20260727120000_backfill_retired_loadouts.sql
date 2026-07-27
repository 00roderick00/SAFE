-- Backfill: substitute retired module types in EXISTING safes.
--
-- The tactile-redesign retirement (PROGRESS-TACTILE.md §1/§2) migrates a
-- loadout lazily, on the owner's next login. Safes whose owners haven't
-- logged in since therefore keep serving retired games to attackers —
-- e.g. trevor.mentis was live with a `spaceinvaders` lock. This applies
-- the SAME replacement map server-side, once, to every safe.
--
-- The map here is asserted to equal RETIRED_REPLACEMENTS (and the names/
-- weights to equal MODULE_CONFIG) by
-- supabase/functions/_shared/retiredBackfill.test.ts, so this SQL cannot
-- drift from the TypeScript.
--
-- SECURITY (PROGRESS-SECURITY.md): every retired type AND every
-- replacement is class-2 (never server-verifiable), so this rewrite
-- cannot change any safe's verifiableCount. No safe that was
-- unforgeable becomes forgeable, and none that had a verifiable lock
-- loses it. Asserted below and in roster.test.ts.
--
-- Custom games (customGameId / customConfig present) are never touched:
-- retirement applies to the built-in roster only, and a custom game on
-- a retired base engine still renders through the registry.
--
-- Idempotent: re-running matches nothing.

begin;

create temporary table _retired_repl (
  old_type        text primary key,
  new_type        text not null,
  new_name        text not null,
  new_description text not null,
  new_weight      numeric not null
) on commit drop;

insert into _retired_repl (old_type, new_type, new_name, new_description, new_weight) values
  ('pacman',        'maze',       'Maze',      'Find the exit',                    1.0),
  ('spaceinvaders', 'breakout',   'Fracture',  'Shatter every panel in the wall',  1.2),
  ('frogger',       'reaction',   'Reaction',  'Test your reflexes',               0.9),
  ('donkeykong',    'breakout',   'Fracture',  'Shatter every panel in the wall',  1.2),
  ('centipede',     'breakout',   'Fracture',  'Shatter every panel in the wall',  1.2),
  ('asteroids',     'breakout',   'Fracture',  'Shatter every panel in the wall',  1.2),
  ('snake',         'maze',       'Maze',      'Find the exit',                    1.0),
  ('galaga',        'breakout',   'Fracture',  'Shatter every panel in the wall',  1.2),
  ('digdug',        'maze',       'Maze',      'Find the exit',                    1.0),
  ('qbert',         'maze',       'Maze',      'Find the exit',                    1.0),
  ('wordscramble',  'wordsearch', 'Word Find', 'Find hidden words',                1.0);

-- A module is migratable when it is a built-in (no custom-game linkage)
-- whose type is retired.
create or replace function pg_temp.is_migratable(m jsonb) returns boolean as $$
  select (m ? 'type')
     and (m->>'customGameId') is null
     and (m->'customConfig') is null
     and exists (select 1 from _retired_repl r where r.old_type = m->>'type');
$$ language sql stable;

do $$
declare
  v_affected int;
  v_before   int;
  v_after    int;
begin
  -- How many safes carry a retired built-in right now?
  select count(*) into v_before
  from safes s
  where exists (
    select 1 from jsonb_array_elements(s.security_loadout->'modules') m
    where pg_temp.is_migratable(m)
  );
  raise notice 'retired-loadout backfill: % safe(s) to migrate', v_before;

  update safes s
  set security_loadout = jsonb_set(
        s.security_loadout,
        '{modules}',
        (
          select coalesce(jsonb_agg(
                   case
                     when pg_temp.is_migratable(t.m)
                       then t.m || jsonb_build_object(
                              'type',        r.new_type,
                              'name',        r.new_name,
                              'description', r.new_description,
                              'weight',      r.new_weight)
                     else t.m
                   end
                   order by t.ord
                 ), '[]'::jsonb)
          from jsonb_array_elements(s.security_loadout->'modules')
               with ordinality as t(m, ord)
          left join _retired_repl r on r.old_type = t.m->>'type'
        )
      ),
      updated_at = now()
  where exists (
    select 1 from jsonb_array_elements(s.security_loadout->'modules') m
    where pg_temp.is_migratable(m)
  );
  get diagnostics v_affected = row_count;
  raise notice 'retired-loadout backfill: % safe(s) rewritten', v_affected;

  -- VERIFY: no safe may still carry a retired built-in.
  select count(*) into v_after
  from safes s
  where exists (
    select 1 from jsonb_array_elements(s.security_loadout->'modules') m
    where pg_temp.is_migratable(m)
  );
  if v_after <> 0 then
    raise exception 'backfill incomplete: % safe(s) still carry a retired type', v_after;
  end if;

  -- VERIFY: slot counts are preserved (no module dropped or duplicated).
  if exists (
    select 1 from safes s
    where jsonb_typeof(s.security_loadout->'modules') = 'array'
      and jsonb_array_length(s.security_loadout->'modules') > 3
  ) then
    raise exception 'backfill corrupted a loadout: module array longer than 3 slots';
  end if;

  raise notice 'retired-loadout backfill: verified — 0 safes carry a retired type';
end $$;

commit;
