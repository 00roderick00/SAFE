-- Enforced invariant: no safe may ever STORE a retired module type.
--
-- The 2026-07-27 one-shot backfill cleaned the safes it matched, but two
-- holes remained and roderick.jones came back with `pacman`:
--
--   1. The backfill (and the client's migrateRetiredLoadout) skipped
--      CUSTOM modules entirely. The offending module was a DSL custom
--      game stored with `type: 'pacman'` while its customConfig
--      .baseEngine was `maze` — so it rendered fine but advertised a
--      retired game on the public target card, and nothing ever healed
--      it. The correct fix for a custom module is to relabel `type` to
--      the engine that actually renders it.
--   2. A one-shot backfill is not an invariant. Any client write
--      (`updateLoadout`) could reintroduce a retired type.
--
-- This migration converts the rule into a BEFORE INSERT OR UPDATE
-- trigger on `safes`, so the database itself normalizes every write no
-- matter which client (or how stale) performed it — then re-runs the
-- backfill through the same function.
--
-- SECURITY (PROGRESS-SECURITY.md): retired types and every substitute
-- are class-2, and a custom module keeps its customGameId/customConfig
-- (so a DSL game stays DSL-verified), therefore verifiableCount is
-- unchanged for every rewritten safe. No safe becomes forgeable.
--
-- The maps below are asserted equal to RETIRED_REPLACEMENTS /
-- MODULE_CONFIG by _shared/retiredBackfill.test.ts.

begin;

create or replace function public.normalize_retired_loadout(p_loadout jsonb)
returns jsonb
language plpgsql
immutable
as $$
declare
  retired      text[] := array['pacman','spaceinvaders','frogger','donkeykong','centipede',
                               'asteroids','snake','galaga','digdug','qbert','wordscramble'];
  -- Preference order used when the primary analog is already equipped,
  -- so migration never yields two identical locks.
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
  meta         jsonb;
begin
  if p_loadout is null or jsonb_typeof(p_loadout->'modules') <> 'array' then
    return p_loadout;
  end if;

  -- Seed `used` with the types that are staying put.
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

    -- NOTE: `->` yields jsonb 'null' for an explicit JSON null, so test
    -- the type rather than `IS NULL`.
    is_custom := (m->>'customGameId') is not null
                 or jsonb_typeof(m->'customConfig') = 'object';
    base_engine := m#>>'{customConfig,baseEngine}';

    new_type := null;

    -- Custom game: relabel to the engine that actually renders it —
    -- unless that label is already equipped, in which case fall through
    -- so the safe doesn't end up showing two identical locks. (`type`
    -- is only a label for a custom module: DSL games render through the
    -- interpreter, engine_config games through customConfig.baseEngine.)
    if is_custom and base_engine is not null
       and not (base_engine = any(retired)) and not (base_engine = any(used)) then
      new_type := base_engine;
    else
      -- Primary analog, then fallbacks, skipping anything already used.
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
                else 'memorymatch'
              end;
      if not (cand = any(used)) then
        new_type := cand;
      else
        foreach cand in array fallbacks loop
          if not (cand = any(used)) then
            new_type := cand;
            exit;
          end if;
        end loop;
        if new_type is null then
          new_type := 'memorymatch';
        end if;
      end if;
    end if;

    used := used || new_type;

    if is_custom then
      -- Keep the creator's name/description/weight; only the engine
      -- label was wrong.
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

create or replace function public.safes_normalize_loadout()
returns trigger
language plpgsql
as $$
begin
  new.security_loadout := public.normalize_retired_loadout(new.security_loadout);
  return new;
end $$;

drop trigger if exists safes_normalize_loadout_trg on public.safes;
create trigger safes_normalize_loadout_trg
  before insert or update of security_loadout on public.safes
  for each row execute function public.safes_normalize_loadout();

-- ------- Self-test the normalizer before trusting it ----------------
-- Runs against roderick.jones's exact production shape: a DSL custom
-- game mislabelled `pacman` (baseEngine maze) alongside a real `maze`.
do $$
declare
  probe  jsonb := $probe${
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
  got     jsonb;
  types   text[];
  retired text[] := array['pacman','spaceinvaders','frogger','donkeykong','centipede',
                          'asteroids','snake','galaga','digdug','qbert','wordscramble'];
begin
  got := public.normalize_retired_loadout(probe);
  select array_agg(value->>'type' order by ord)
    into types
    from jsonb_array_elements(got->'modules') with ordinality as t(value, ord);

  if exists (select 1 from unnest(types) t where t = any(retired)) then
    raise exception 'normalizer self-test failed: retired type survived (%)', types;
  end if;
  if array_length(types, 1) <> 3 then
    raise exception 'normalizer self-test failed: slot count changed (%)', types;
  end if;
  if (select count(distinct t) from unnest(types) t) <> 3 then
    raise exception 'normalizer self-test failed: duplicate lock produced (%)', types;
  end if;
  -- The custom game must keep playing: linkage and DSL payload intact.
  if (got#>>'{modules,0,customGameId}') is null
     or (got#>>'{modules,0,customConfig,mode}') <> 'dsl_program' then
    raise exception 'normalizer self-test failed: custom-game linkage lost';
  end if;
  raise notice 'normalizer self-test passed: % (custom game preserved)', types;
end $$;

-- ------- Re-run the backfill through the same function --------------
do $$
declare
  v_before int;
  v_after  int;
  retired  text[] := array['pacman','spaceinvaders','frogger','donkeykong','centipede',
                           'asteroids','snake','galaga','digdug','qbert','wordscramble'];
begin
  select count(*) into v_before
  from safes s
  where exists (
    select 1 from jsonb_array_elements(s.security_loadout->'modules') m
    where (m->>'type') = any(retired)
  );
  raise notice 'no-retired backfill: % safe(s) to normalize', v_before;

  -- The trigger rewrites the value; touching the column is enough.
  update safes s
  set security_loadout = s.security_loadout
  where exists (
    select 1 from jsonb_array_elements(s.security_loadout->'modules') m
    where (m->>'type') = any(retired)
  );

  select count(*) into v_after
  from safes s
  where exists (
    select 1 from jsonb_array_elements(s.security_loadout->'modules') m
    where (m->>'type') = any(retired)
  );
  if v_after <> 0 then
    raise exception 'backfill incomplete: % safe(s) still carry a retired type', v_after;
  end if;

  -- Slot count must be preserved for every safe.
  if exists (
    select 1 from safes s
    where jsonb_typeof(s.security_loadout->'modules') = 'array'
      and jsonb_array_length(s.security_loadout->'modules') > 3
  ) then
    raise exception 'backfill corrupted a loadout: module array longer than 3 slots';
  end if;

  raise notice 'no-retired backfill: verified — 0 safes carry a retired type (trigger now enforces it)';
end $$;

commit;
