# Progress — Phase 3D (attack/settlement hardening from TESTING-FINDINGS-2)

Fixed the two P0s and both P1s from `TESTING-FINDINGS-2.md`. The
attack/settlement half is now server-verified and atomic.

**Status:** `npm run build` ✓ · `npm run test` ✓ (206 passed, 20 files)
· `npm run lint` unchanged (3 pre-existing react-compiler errors in
`QuickMath.tsx`/`SnakeGame.tsx`, untouched here). Two migrations applied
to the linked DB; `submit_result` redeployed.

---

## P0.1 (SECURITY) — server-side outcome verification ✅

`submit_result` no longer trusts the client's `passed`/`score`. New
`_shared/verify.ts` recomputes each module's outcome:

- **DSL games** → **deterministic replay** (`replayDslTrace`, reusing the
  same runtime calibration uses). The client now records its per-tick
  input trace (`DslRunner` → `MiniGameResult.inputTrace` → submit
  payload); the server replays it from the issued seed (same
  xmur3→mulberry32 RNG, so enemy motion matches) and a module passes
  **iff the replay actually wins**. No trace / losing trace / bad config
  → fail.
- **Non-DSL** (built-in locks/arcades, engine-config customs) → still
  plausibility, documented as the residual. All-or-nothing means any
  safe carrying ≥1 DSL module (the reported case) is now fully protected:
  a fabricated all-pass fails the DSL replay and the whole attack loses.

The exact reported exploit — `{passed:true, score:0.85}` for every
module with nothing played — is now rejected. Tests in
`_shared/verify.test.ts` assert: fabricated (no trace) → not all passed;
losing trace → fail; genuine winning trace → pass; mixed DSL+lock
fabrication → rejected via the DSL module.

## P0.2 (FUNCTIONAL) — atomic win commit ✅

Migration `20260718120000_phase3c_settlement.sql` adds `settle_attack()`
— one transaction that writes results + every ledger entry + plays bump
+ insurance decrement + the status flip. `submit_result` builds the
ledger batch in JS and commits it via this single RPC:

- If anything fails, the tx rolls back and the function returns
  **`settlement_failed`** instead of a fake `won`.
- The RPC locks the attack `for update` and only settles a still-pending
  one, so retries/races are idempotent (a loser gets `attack_not_pending`
  → we return the resolved state).
- Follow-up migration `20260718120100` makes the result insert
  `on conflict do nothing` so a resubmitted pre-3C partial attack can't
  abort settlement.

`submit_result.settlement.test.ts` asserts a real win persists
status+loot+royalty (and bumps plays) while a fabricated win persists as
`lost` with no loot, and that a second settle is a no-op.

## P1 — real players appear as targets ✅

Root cause: `useSession()` returns `undefined` while loading, and
`HeistScreen` treated that as "signed out", eagerly loading client bots
which then blocked the real `list_targets` fetch once the session
arrived. Now the effect keys on a `sessionKey` (`loading | uid | anon`):
it does nothing while loading, loads server targets once a user exists,
and only falls back to client bots when definitively anonymous.
`gameStore` records `targetsSource` (`server|local`) and `HeistScreen`
shows a "couldn't reach the live target server" banner with Retry when a
signed-in user falls back — no more silent fallback hiding the creator
economy.

## P1 — loss royalty no longer floors to zero ✅

`computeCreatorRoyalty` now floors every play to
`ECONOMY.creatorMinRoyalty` (=1): a lost 16-token-stake attack pays each
creator ≥1 instead of `floor(0.32)=0`. Win share (20% of platform cut)
is likewise floored. Existing royalty math tests still pass (their values
are all ≥1).

## Cleanup ✅

The settlement migration abandons any `pending` attack older than 10
minutes (`status='abandoned'`), sweeping the dangling `trevor.mentis`
test attack without touching a real in-flight session.

---

## Deploys / migrations run

- `supabase db push` → `20260718120000_phase3c_settlement.sql`,
  `20260718120100_settle_attack_on_conflict.sql`.
- `supabase functions deploy submit_result` (bundles the new
  `verify.ts` + updated `attack-flow.ts`/`constants.ts`). Smoke-checked:
  returns 401 without a user JWT (runs, doesn't crash on boot).

## Residual / follow-ups (documented, not launch-blocking)

- Non-DSL modules (built-in locks, engine-config customs) are still
  plausibility-only, not replay-verified. A safe made **entirely** of
  those remains fabricable. Next step: seed-derive each lock's solution
  server-side (or require an input trace) so every module is replayable;
  until then a safe should include ≥1 replayable (DSL) module for full
  protection.
- Live re-test the two-account win path end-to-end once custom SMTP is
  in place (needs a second signed-in account) — the unit/settlement
  tests cover the logic, but the browser round-trip wasn't re-run.
- DSL tick logic is still duplicated client↔server; the replay depends on
  them staying in lock-step (the phase3b round-trip test guards this).
  Extracting one shared module remains a carried-over TODO.
