-- End-to-end proof that the write-path invariant actually holds at the
-- database, not just in the client: deliberately attempt to WRITE a
-- retired loadout to a real safe row, assert the row comes back
-- normalized, then restore the original value. Net effect: none.
--
-- This is the check the "reload the app" test can't make on its own — a
-- reload doesn't necessarily issue a loadout write, so it can't prove a
-- write would be caught. This does.
--
-- If the trigger were missing or broken this migration FAILS and rolls
-- back, so the invariant is verified every time the migrations are
-- replayed against a fresh environment.

begin;

do $$
declare
  v_id        uuid;
  v_original  jsonb;
  v_after     jsonb;
  v_types     text[];
  retired     text[] := array['pacman','spaceinvaders','frogger','donkeykong','centipede',
                              'asteroids','snake','galaga','digdug','qbert','wordscramble'];
  probe       jsonb := $probe${
    "effectiveScore": 1,
    "modules": [
      {"id":"probe-0","name":"Circuit Trail","type":"snake","weight":1.1,"difficulty":0.3,
       "description":"Grow the trail without crossing it"},
      {"id":"probe-1","name":"Keypad","type":"keypad","weight":1,"difficulty":0.3,
       "description":"Enter the code sequence"},
      {"id":"probe-2","name":"Pac-Man","type":"pacman","weight":1.2,"difficulty":0.3,
       "description":"custom game","customGameId":"probe-cg",
       "customConfig":{"mode":"dsl_program","config":{"version":1},"baseEngine":"maze"}}
    ]}$probe$::jsonb;
begin
  -- Any safe will do; take a stable one.
  select id, security_loadout into v_id, v_original
  from safes order by id limit 1;

  if v_id is null then
    raise notice 'no safes present — skipping live trigger verification';
    return;
  end if;

  -- Attempt to store retired types (this is exactly what a stale client
  -- write would look like).
  update safes set security_loadout = probe where id = v_id;

  select security_loadout into v_after from safes where id = v_id;
  select array_agg(value->>'type' order by ord) into v_types
    from jsonb_array_elements(v_after->'modules') with ordinality as t(value, ord);

  if exists (select 1 from unnest(v_types) t where t = any(retired)) then
    raise exception 'TRIGGER FAILED: a retired type was stored (%)', v_types;
  end if;
  if (select count(distinct t) from unnest(v_types) t) <> array_length(v_types, 1) then
    raise exception 'TRIGGER FAILED: duplicate locks stored (%)', v_types;
  end if;
  if (v_after#>>'{modules,2,customGameId}') is null
     or (v_after#>>'{modules,2,customConfig,mode}') <> 'dsl_program' then
    raise exception 'TRIGGER FAILED: custom-game linkage lost';
  end if;

  raise notice 'trigger verified: attempted [snake,keypad,pacman] -> stored %', v_types;

  -- Restore the row exactly as it was.
  update safes set security_loadout = v_original where id = v_id;

  select security_loadout into v_after from safes where id = v_id;
  if v_after <> v_original then
    raise exception 'restore failed: safe % was left modified', v_id;
  end if;
  raise notice 'probe row restored unchanged';
end $$;

commit;
