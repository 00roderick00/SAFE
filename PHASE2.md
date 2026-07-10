# Phase 2 — Real Backend (Supabase)

Goal: move tokens, balances, stakes, loot, and opponents from client-only localStorage to a server-authoritative backend so the game is real and not cheatable. Async PvP (attack snapshots of real players); bots backfill when player density is low.

## Stack decision
- **Supabase**: Postgres + Auth + Edge Functions (Deno) + Row Level Security. Free tier is enough for MVP.
- Keep the existing React client; add a `src/services/api.ts` layer that talks to Supabase. Stores keep their shape but hydrate from and write through the server.

## Environment
- `.env.local` holds `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (anon key is safe to ship — it's gated by RLS). NEVER put the service_role key in the client.
- Add `@supabase/supabase-js`.

## Data model (tables)
- `profiles` — id (=auth user), handle, mmr, created_at.
- `safes` — owner_id, balance, security_loadout (jsonb: module types + difficulties), updated_at.
- `attacks` — id, attacker_id, defender_safe_id, stake, seed, status (pending/won/lost), loot, created_at, resolved_at.
- `attack_results` — attack_id, module_index, score, passed, time_spent.
- `insurance_policies` — owner_id, tier, coverage, expires_at, premium.
- `ledger` — user_id, delta, reason, ref_id, created_at (append-only audit of every token change).

## Server-authoritative rules (Edge Functions, not client)
1. `start_attack`: validate attacker balance ≥ stake, deduct stake atomically, pick defender, generate + store per-module RNG **seeds server-side**, return module list + seeds. Enforce per-target cooldown + max attacks/target (constants already exist).
2. `submit_result`: client sends per-module scores; server re-derives expected difficulty from stored seeds, applies plausibility checks (time floors, score bounds), decides win/loss with the all-or-nothing model, computes loot via the SAME formulas in `economy.ts` (port them into a shared module the Edge Function imports), writes ledger rows. Client never decides payouts.
3. `resolve_defense` / insurance claim: run server-side; wire `processInsuranceClaim`.
4. All balance writes go through the ledger; balance = sum(ledger) or a maintained column updated in the same transaction.

## Anti-cheat baseline
- RLS: a user can only read/write their own profile/safe; attacks readable by participants.
- Rate limits on start_attack.
- Seeds server-owned so replayable games can be validated; non-replayable arcade games get plausibility bounds (max realistic score for elapsed time).

## Async PvP
- Attacking hits a **snapshot** of a real player's stored `safes.security_loadout` (no live netcode). If too few real targets, matchmaking.ts bots fill the list (tag them as bots).

## Migration
- On first login, migrate existing localStorage balance/loadout into the DB once, then treat server as source of truth. Keep a client cache for offline display only.

## Order of work
1. Supabase project + schema migration SQL + RLS policies.
2. `src/services/api.ts` + auth (email magic link is simplest).
3. Port economy.ts into a shared module usable by both client and Edge Functions.
4. Edge Functions: start_attack, submit_result, resolve_defense.
5. Rewire stores to read/write through api.ts; keep optimistic UI.
6. Async PvP target list from real safes + bot backfill.
7. Tests: Edge Function unit tests + an integration test of a full attack round-trip.

## Definition of done
- A second browser/account sees a different balance; attacking one account's snapshot moves tokens per server rules; editing localStorage does NOT change your real balance. Build + lint + tests green.
