-- SAFE Phase 2 — Row Level Security policies
--
-- Access model:
--   profiles           user reads + updates own row; anyone can read
--                      (handle, mmr) columns for leaderboards via a view
--                      (kept simple here — full row readable, no email).
--   safes              user reads/updates own row; loadout is readable
--                      to any authenticated user via the target list
--                      view (`public_safe_snapshots`) — the underlying
--                      row is NOT directly readable to non-owners.
--   attacks            attacker reads own; defender reads attacks where
--                      defender_safe_id.owner_id = auth.uid().
--                      Direct writes forbidden — Edge Function only.
--   attack_results     read only, mirrors attacks scope. Direct writes
--                      forbidden.
--   insurance_policies user reads/inserts own; updates only via Edge
--                      Function (service_role bypasses RLS).
--   ledger             user reads own; direct writes forbidden.

alter table profiles           enable row level security;
alter table safes              enable row level security;
alter table attacks            enable row level security;
alter table attack_results     enable row level security;
alter table insurance_policies enable row level security;
alter table ledger             enable row level security;

-- profiles -------------------------------------------------------
drop policy if exists "profiles_self_select" on profiles;
create policy "profiles_self_select"
  on profiles for select
  using (id = auth.uid());

drop policy if exists "profiles_self_update" on profiles;
create policy "profiles_self_update"
  on profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- Public read of just handle + mmr for leaderboards / target labels.
-- Implemented as a view instead of a policy so we don't expose the
-- migrated_from_local flag or timestamps.
create or replace view public_profiles as
  select id, handle, mmr from profiles;

grant select on public_profiles to anon, authenticated;

-- safes ----------------------------------------------------------
drop policy if exists "safes_self_all" on safes;
create policy "safes_self_all"
  on safes for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- Public snapshot view: everything an attacker needs to see about a
-- potential target — no balance changes exposed, only the loadout
-- and coarse balance for the target card. Balance is INTENTIONAL —
-- attackers need to see stakes at risk. It's already the same
-- information the target list shows in the client today.
create or replace view public_safe_snapshots as
  select
    s.id,
    s.owner_id,
    s.balance,
    s.security_loadout,
    s.last_attacked_at,
    s.updated_at,
    p.handle
  from safes s
  join profiles p on p.id = s.owner_id
  where s.balance > 0;

grant select on public_safe_snapshots to authenticated;

-- attacks --------------------------------------------------------
drop policy if exists "attacks_participant_select" on attacks;
create policy "attacks_participant_select"
  on attacks for select
  using (
    attacker_id = auth.uid()
    or exists (
      select 1 from safes s
      where s.id = defender_safe_id and s.owner_id = auth.uid()
    )
  );

-- No insert/update/delete policies for authenticated role: only
-- service_role (used by Edge Functions) can write.

-- attack_results -------------------------------------------------
drop policy if exists "attack_results_participant_select" on attack_results;
create policy "attack_results_participant_select"
  on attack_results for select
  using (
    exists (
      select 1 from attacks a
      where a.id = attack_id
        and (
          a.attacker_id = auth.uid()
          or exists (
            select 1 from safes s
            where s.id = a.defender_safe_id and s.owner_id = auth.uid()
          )
        )
    )
  );

-- insurance_policies --------------------------------------------
drop policy if exists "insurance_self_select" on insurance_policies;
create policy "insurance_self_select"
  on insurance_policies for select
  using (owner_id = auth.uid());

-- Insertion goes through the Edge Function too (so premium debits
-- the ledger). No client-side insert/update.

-- ledger --------------------------------------------------------
drop policy if exists "ledger_self_select" on ledger;
create policy "ledger_self_select"
  on ledger for select
  using (user_id = auth.uid());

-- No client writes ever.
