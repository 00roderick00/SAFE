-- Phase 3C follow-up: make settle_attack's result insert idempotent.
--
-- If a pre-3C dangling attack already has partial attack_results rows,
-- a resubmit would hit the (attack_id, module_index) PK and abort the
-- whole settlement. `on conflict do nothing` lets settlement proceed on
-- the already-recorded rows instead of erroring. Everything else is
-- unchanged from 20260718120000.

create or replace function settle_attack(
  p_attack_id            uuid,
  p_status               attack_status,
  p_loot                 integer,
  p_platform_fee         integer,
  p_result_rows          jsonb,
  p_ledger               jsonb,
  p_play_game_ids        uuid[],
  p_insurance_policy_id  uuid,
  p_insurance_new_claims integer
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attacker uuid;
  v_entry    jsonb;
  v_gid      uuid;
  v_balance  integer;
begin
  select attacker_id into v_attacker
    from attacks
    where id = p_attack_id and status = 'pending'
    for update;
  if not found then
    raise exception 'attack_not_pending' using errcode = 'P0001';
  end if;

  if p_result_rows is not null then
    insert into attack_results (attack_id, module_index, module_type, score, passed, time_spent_ms)
    select p_attack_id,
           (r->>'module_index')::int,
           r->>'module_type',
           (r->>'score')::real,
           (r->>'passed')::boolean,
           (r->>'time_spent_ms')::int
    from jsonb_array_elements(p_result_rows) as r
    on conflict (attack_id, module_index) do nothing;
  end if;

  if p_ledger is not null then
    for v_entry in select * from jsonb_array_elements(p_ledger)
    loop
      perform insert_ledger(
        case when v_entry->>'user_id' is null then null
             else (v_entry->>'user_id')::uuid end,
        (v_entry->>'delta')::int,
        (v_entry->>'reason')::ledger_reason,
        v_entry->>'ref_type',
        case when v_entry->>'ref_id' is null then null
             else (v_entry->>'ref_id')::uuid end
      );
    end loop;
  end if;

  if p_insurance_policy_id is not null then
    update insurance_policies
      set claims_remaining = p_insurance_new_claims
      where id = p_insurance_policy_id;
  end if;

  if p_play_game_ids is not null then
    foreach v_gid in array p_play_game_ids
    loop
      update custom_games
        set plays = plays + 1, updated_at = now()
        where id = v_gid;
    end loop;
  end if;

  update attacks
    set status = p_status,
        loot = p_loot,
        platform_fee = p_platform_fee,
        resolved_at = now()
    where id = p_attack_id;

  select balance into v_balance from safes where owner_id = v_attacker;
  return v_balance;
end $$;
