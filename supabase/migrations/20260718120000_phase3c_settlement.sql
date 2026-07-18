-- Phase 3C — Atomic attack settlement (TESTING-FINDINGS-2 P0.2)
--
-- The win branch of submit_result issued its loot/royalty/defender-debit
-- ledger writes and the status update as SEPARATE PostgREST calls. Any
-- one failing left the attack `pending` with a partial or empty ledger
-- while the function still returned "won" — wins never actually
-- persisted, and the dangling pending row blocked the attacker's next
-- attack.
--
-- settle_attack() performs the whole resolution in ONE transaction:
-- result rows + every ledger entry + plays bump + insurance decrement +
-- the status flip are all-or-nothing. If anything raises, the tx rolls
-- back and the RPC returns an error, so the Edge Function returns a real
-- failure instead of a fake "won".

create or replace function settle_attack(
  p_attack_id            uuid,
  p_status               attack_status,
  p_loot                 integer,
  p_platform_fee         integer,
  p_result_rows          jsonb,        -- [{module_index, module_type, score, passed, time_spent_ms}]
  p_ledger               jsonb,        -- [{user_id|null, delta, reason, ref_type, ref_id|null}]
  p_play_game_ids        uuid[],       -- live custom_games to increment plays on
  p_insurance_policy_id  uuid,         -- null when no claim
  p_insurance_new_claims integer
) returns integer                      -- attacker's post-settlement balance
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
  -- Lock the attack; only settle a still-pending one. This makes the
  -- whole function idempotent under retries/races: a second caller sees
  -- a non-pending row and aborts cleanly.
  select attacker_id into v_attacker
    from attacks
    where id = p_attack_id and status = 'pending'
    for update;
  if not found then
    raise exception 'attack_not_pending' using errcode = 'P0001';
  end if;

  -- Per-module results.
  if p_result_rows is not null then
    insert into attack_results (attack_id, module_index, module_type, score, passed, time_spent_ms)
    select p_attack_id,
           (r->>'module_index')::int,
           r->>'module_type',
           (r->>'score')::real,
           (r->>'passed')::boolean,
           (r->>'time_spent_ms')::int
    from jsonb_array_elements(p_result_rows) as r;
  end if;

  -- Every ledger entry + balance mutation, in this same transaction.
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

  -- Insurance claim decrement (if any).
  if p_insurance_policy_id is not null then
    update insurance_policies
      set claims_remaining = p_insurance_new_claims
      where id = p_insurance_policy_id;
  end if;

  -- Bump plays on each involved live game.
  if p_play_game_ids is not null then
    foreach v_gid in array p_play_game_ids
    loop
      update custom_games
        set plays = plays + 1, updated_at = now()
        where id = v_gid;
    end loop;
  end if;

  -- Finalize.
  update attacks
    set status = p_status,
        loot = p_loot,
        platform_fee = p_platform_fee,
        resolved_at = now()
    where id = p_attack_id;

  select balance into v_balance from safes where owner_id = v_attacker;
  return v_balance;
end $$;

comment on function settle_attack is
  'Atomically resolve an attack: results + ledger + plays + insurance + status in one tx. Raises attack_not_pending if already resolved.';

-- ---------------------------------------------------------------
-- One-time cleanup (TESTING-FINDINGS-2 "test pollution"): the old
-- non-atomic win branch left dangling `pending` attacks that block the
-- attacker's next attack. Abandon any pending attack older than 10
-- minutes — well past a real in-flight session, so this only sweeps the
-- stale ones. Going forward, settle_attack() prevents new dangles.
-- ---------------------------------------------------------------
update attacks
  set status = 'abandoned', resolved_at = now()
  where status = 'pending'
    and created_at < now() - interval '10 minutes';
