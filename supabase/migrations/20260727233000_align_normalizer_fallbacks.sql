-- Align the SQL normalizer's fallback walk with migrateRetiredLoadout.
--
-- The previous version defaulted straight to `memorymatch` whenever the
-- primary analog lookup missed (e.g. a custom module whose baseEngine is
-- `maze` and whose `maze` label is already taken), instead of walking
-- the shared fallback preference order. TypeScript picked `breakout` for
-- roderick.jones's loadout; the trigger picked `memorymatch`. Both are
-- valid (no retired type, no duplicate) but they must not disagree —
-- the whole point of this work is that one rule governs every write
-- path. This replaces the function with the exact TS ordering:
--
--     [custom baseEngine if free] -> [retirement analog] -> [fallbacks]
--
-- and re-normalizes any row the old ordering already touched.

begin;

create or replace function public.normalize_retired_loadout(p_loadout jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  retired      text[] := array['pacman','spaceinvaders','frogger','donkeykong','centipede',
                               'asteroids','snake','galaga','digdug','qbert','wordscramble'];
  -- Mirrors REPLACEMENT_FALLBACKS in _shared/roster.ts, in order.
  fallbacks    text[] := array['maze','breakout','reaction','wordsearch','memorymatch','spotdiff',
                               'jigsaw','numsequence','quickmath','logic','cipher','sudoku'];
  m            jsonb;
  out_mods     jsonb := '[]'::jsonb;
  used         text[] := '{}';
  m_type       text;
  base_engine  text;
  is_custom    boolean;
  new_type     text;
  cand         text;
  f            text;
  meta         jsonb;
begin
  if p_loadout is null or jsonb_typeof(p_loadout->'modules') <> 'array' then
    return p_loadout;
  end if;

  for m in select value from jsonb_array_elements(p_loadout->'modules') loop
    if not ((m->>'type') = any(retired)) then
      used := used || (m->>'type');
    end if;
  end loop;

  for m in select value from jsonb_array_elements(p_loadout->'modules') loop
    m_type := m->>'type';

    if not (m_type = any(retired)) then
      out_mods := out_mods || jsonb_build_array(m);
      continue;
    end if;

    -- `->` yields jsonb 'null' for an explicit JSON null, so test the
    -- type rather than `IS NULL` (this is what made the first backfill
    -- skip this module entirely).
    is_custom := (m->>'customGameId') is not null
                 or jsonb_typeof(m->'customConfig') = 'object';
    base_engine := m#>>'{customConfig,baseEngine}';
    new_type := null;

    -- 1. A custom module prefers the engine that actually renders it,
    --    if that label isn't already equipped.
    if is_custom and base_engine is not null
       and not (base_engine = any(retired)) and not (base_engine = any(used)) then
      new_type := base_engine;
    end if;

    -- 2. Otherwise the retirement analog, if free.
    if new_type is null then
      cand := case coalesce(base_engine, m_type)
                when 'pacman'        then 'maze'
                when 'spaceinvaders' then 'breakout'
                when 'frogger'       then 'reaction'
                when 'donkeykong'    then 'breakout'
                when 'centipede'     then 'breakout'
                when 'asteroids'     then 'breakout'
                when 'snake'         then 'maze'
                when 'galaga'        then 'breakout'
                when 'digdug'        then 'maze'
                when 'qbert'         then 'maze'
                when 'wordscramble'  then 'wordsearch'
                else null
              end;
      if cand is not null and not (cand = any(used)) then
        new_type := cand;
      end if;
    end if;

    -- 3. Otherwise walk the shared fallback order.
    if new_type is null then
      foreach f in array fallbacks loop
        if not (f = any(used)) then
          new_type := f;
          exit;
        end if;
      end loop;
    end if;

    if new_type is null then
      new_type := 'memorymatch';
    end if;

    used := used || new_type;

    if is_custom then
      out_mods := out_mods || jsonb_build_array(m || jsonb_build_object('type', new_type));
    else
      meta := case new_type
                when 'maze'        then '{"name":"Maze","description":"Find the exit","weight":1.0}'
                when 'breakout'    then '{"name":"Fracture","description":"Shatter every panel in the wall","weight":1.2}'
                when 'reaction'    then '{"name":"Reaction","description":"Test your reflexes","weight":0.9}'
                when 'wordsearch'  then '{"name":"Word Find","description":"Find hidden words","weight":1.0}'
                when 'memorymatch' then '{"name":"Memory","description":"Match the pairs","weight":1.1}'
                when 'spotdiff'    then '{"name":"Spot It","description":"Find differences","weight":1.0}'
                when 'jigsaw'      then '{"name":"Jigsaw","description":"Complete the puzzle","weight":1.1}'
                when 'numsequence' then '{"name":"Numbers","description":"Complete the sequence","weight":1.1}'
                when 'quickmath'   then '{"name":"Math","description":"Solve fast","weight":1.0}'
                when 'logic'       then '{"name":"Logic","description":"Solve the puzzle","weight":1.2}'
                when 'cipher'      then '{"name":"Cipher","description":"Decode the message","weight":1.2}'
                when 'sudoku'      then '{"name":"Sudoku","description":"Fill the grid","weight":1.3}'
                else '{"name":"Memory","description":"Match the pairs","weight":1.1}'
              end::jsonb;
      out_mods := out_mods || jsonb_build_array(m || jsonb_build_object('type', new_type) || meta);
    end if;
  end loop;

  return jsonb_set(p_loadout, '{modules}', out_mods);
end $$;

-- Self-test: must now agree with migrateRetiredLoadout, which returns
-- ['breakout','quickmath','maze'] for this exact production shape.
do $$
declare
  probe jsonb := $probe${
    "effectiveScore": 29.48,
    "modules": [
      {"id":"cg-slot-0","name":"Pac-Man","type":"pacman","weight":1.2,"difficulty":0.3,
       "description":"Eat dots, avoid ghost","customGameId":"cg",
       "customConfig":{"mode":"dsl_program","config":{"version":1},"baseEngine":"maze"}},
      {"id":"cg-slot-1","name":"Math","type":"quickmath","weight":1,"difficulty":0.3,
       "description":"Solve fast","customGameId":"cg",
       "customConfig":{"mode":"dsl_program","config":{"version":1},"baseEngine":"maze"}},
      {"id":"m-2","name":"Maze","type":"maze","weight":1,"difficulty":0.3,"description":"Find the exit"}
    ]}$probe$::jsonb;
  types text[];
begin
  select array_agg(value->>'type' order by ord) into types
    from jsonb_array_elements(public.normalize_retired_loadout(probe)->'modules')
         with ordinality as t(value, ord);
  if types <> array['breakout','quickmath','maze'] then
    raise exception 'normalizer disagrees with migrateRetiredLoadout: got %', types;
  end if;
  raise notice 'normalizer agrees with the TypeScript: %', types;
end $$;

-- Re-normalize rows the previous ordering already rewrote: any custom
-- module whose stored `type` no longer matches the engine it renders.
do $$
declare
  v_fixed int;
begin
  update safes s
  set security_loadout = s.security_loadout
  where exists (
    select 1
    from jsonb_array_elements(s.security_loadout->'modules') m
    where jsonb_typeof(m->'customConfig') = 'object'
      and (m#>>'{customConfig,baseEngine}') is not null
      and (m->>'type') <> (m#>>'{customConfig,baseEngine}')
  );
  get diagnostics v_fixed = row_count;
  raise notice 'fallback-alignment: % safe(s) re-normalized', v_fixed;
end $$;

commit;
