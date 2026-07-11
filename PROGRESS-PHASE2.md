# Phase 2 Progress

Server-authoritative rewrite of the core loop on Supabase. Client is now a thin renderer over Edge Functions that own RNG, plausibility, and every balance mutation. Existing client-only flow is retained as a fallback for offline/dev use, but a real signed-in user always transacts through the server.

`npm run build` ✓ · `npm run lint` ✓ (0 errors, 80 warnings — all the react-hooks v7 warnings inherited from Phase 1) · `npm test` ✓ 94 tests.

## Manual deploy steps (do these in order in the Supabase dashboard)

You've already set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in `.env.local`. The following are one-time server-side deploys.

### 1. Run the SQL migrations

Open **SQL Editor** in your Supabase dashboard for project `cqacfzkyxmtmjzpksznj`, then paste and run each of these files in order:

1. `supabase/migrations/20260710120000_phase2_initial_schema.sql` — creates the tables, enums, `insert_ledger()` helper, and the `handle_new_user()` trigger that provisions a profile + safe + 1000-token starting grant when someone signs up.
2. `supabase/migrations/20260710120100_phase2_rls_policies.sql` — enables Row-Level Security on every user-facing table and installs owner-scoped read/write policies. Also creates the `public_safe_snapshots` view attackers use to see potential targets.

After running both, verify:
- **Table editor** shows `profiles`, `safes`, `attacks`, `attack_results`, `insurance_policies`, `ledger`.
- **Database → Functions** shows `insert_ledger` and `handle_new_user`.
- **Authentication → Policies** shows the six tables have RLS enabled.

### 2. Deploy the three Edge Functions

Install the Supabase CLI once (`brew install supabase/tap/supabase`), then from the repo root:

```sh
supabase login                        # first time only
supabase link --project-ref cqacfzkyxmtmjzpksznj
supabase functions deploy start_attack
supabase functions deploy submit_result
supabase functions deploy resolve_defense
```

Each deploy uploads `supabase/functions/<name>/index.ts` plus everything it imports from `supabase/functions/_shared/`.

### 3. Set the function secrets

The functions read three env vars at runtime. Set them from the dashboard (**Project settings → Edge Functions → Secrets**) or the CLI:

```sh
supabase secrets set SUPABASE_URL="https://cqacfzkyxmtmjzpksznj.supabase.co"
supabase secrets set SUPABASE_ANON_KEY="sb_publishable_oAGqo_jXkjE6yP0AHQAOwA_TljkVzFC"
supabase secrets set SUPABASE_SERVICE_ROLE_KEY="<paste from Project settings → API>"
```

**`SUPABASE_SERVICE_ROLE_KEY` must never be shipped to the browser.** It bypasses RLS and is the key that lets Edge Functions write to `attacks`, `ledger`, and `insurance_policies`.

### 4. Enable magic-link auth

**Authentication → Providers → Email**:
- Enable "Email" provider (usually on by default).
- Under Site URL, set your dev URL: `http://localhost:5173` (add your prod URL when you deploy).
- Under Redirect URLs, add `http://localhost:5173`. Magic-link emails will bounce back to this origin.

### 5. Restart the dev server

`.env.local` is only read on Vite startup:

```sh
npm run dev
```

## What changed on the client

- **Auth gate** — `App.tsx` now renders `AuthScreen` when there is no Supabase session. The old onboarding is unchanged and still runs first.
- **First-login migration** — `useHydrateFromServer` copies your localStorage balance/loadout into the DB once (idempotent via `profiles.migrated_from_local`) then rehydrates the client store from the server on every fresh session. If the local balance is *higher* than the 1000-token starting grant, the delta is credited as a `migration` ledger row. Local balance never *debits* on migration.
- **Attack flow** — clicking a target in Heist mode now calls `start_attack`; the AttackScreen dispatches the server-provided per-module seeds; on completion `submit_result` decides win/loss and returns the new balance. The old client-computed path (`heistStore.startAttack` / `.completeAttack`) is kept as a fallback for when no session exists (or for the smoke tests).
- **Defense** — `HomeScreen`'s heist-mode tick calls `resolve_defense` when signed in; the server rolls attacker skill, resolves against the actual loadout, and applies loot/insurance in the ledger. Client just displays the outcome.
- **Async PvP target list** — `HeistScreen` queries `public_safe_snapshots` for real safes and backfills with local matchmaking bots to reach 15 targets.

## Anti-cheat verification (browser test plan)

The whole point of Phase 2 is that **editing localStorage can no longer change your real balance.** Steps to verify once the manual deploy above is done:

1. **Fresh account A**
   - `npm run dev`, open the app, click through onboarding.
   - Enter your email in `AuthScreen`, click the magic link that arrives, and confirm you land on the home screen. Your balance should be **1000** (from `handle_new_user()`; a small delay is possible while the trigger fires — refresh once).
2. **Fresh account B in a different browser profile** (or private window)
   - Repeat with a second email. Confirm this account also starts at 1000. Confirm the home screen shows a *different* balance than account A when you both make a couple of moves — proves state is per-user, not shared localStorage.
3. **Attack account A from account B (or vice versa)**
   - In account B, enter Heist mode. In the target list you should see account A's handle. Attack it.
   - The game should still play through the minigames (from server-provided seeds). On completion, the loot/loss you see should match what the server computed.
   - In Supabase's Table Editor, open `ledger` and filter by your user id — you should see the sequence: `attack_stake`, then either `attack_loot` + `platform_cut` (win) or nothing else for you and `defense_fee` for A (loss).
4. **Try to cheat via localStorage**
   - Open devtools → Application → Local Storage.
   - Find the `safe-player-storage` key and edit `safeBalance` to something ridiculous (e.g., 999999) then reload.
   - The client will briefly show the tampered value from persist, then `useHydrateFromServer` will overwrite it with the server-authoritative balance on the next tick. Total time to correction: ~200ms.
   - Now try to attack again: even if you spoofed a large balance in the client, `start_attack` reads `safes.balance` from the DB and will reject if the real balance is < stake. Watch it fail with `insufficient_balance`.
5. **Try to cheat via a fabricated attack result**
   - Start a real attack against another player; open Network tab and inspect the `submit_result` request payload.
   - Try to modify one entry to have `score: 1, passed: true, timeSpent: 10` and resubmit (via replay).
   - Server returns `implausible_result` with reason `too_fast_for_pass`. No `attack_loot` row is written; your stake stays lost.

If all five checks pass, you've hit the Phase 2 Definition of Done from PHASE2.md.

## Hotfix — attack resolution bugs (2026-07-11)

Three live-game bugs shipped in the initial Phase 2 build:

1. **Losses never resolved.** `completeServerAttack` submitted only the results the client had produced. On an early exit (fail lock 1 of 3) that's 1 result, but `submit_result` required exactly N → 400 `module_count_mismatch` → attack stayed `pending` forever, stake gone.
2. **Cancel/back button abandoned the attack.** `handleCancel` only did `resetHeist()` + `navigate()`; the server never heard about it → another `pending` orphan.
3. **Balance didn't refresh** on return from an attack, only on full page reload — because `submit_result` errored on losses so no `newBalance` payload came back.

Fixes shipped in the same commit as this section:

- `submit_result` Edge Function:
  * Accepts `results.length ≤ expected`. Missing modules are recorded server-side with `{score: 0, passed: false, timeSpent: 0}`, marking the attack `lost`. Wins still require the full `N == expected`.
  * **Idempotent**: calling `submit_result` on an already-resolved attack returns the current `{status, loot, platformFee, newBalance}` with `idempotent: true` instead of a 409. No new ledger rows — no double-pay possible even under retry, double-click, or hydrate cleanup.
- `AttackScreen`:
  * `handleCancel` now calls `completeServerAttack` before navigating, so back-button = attack resolves as lost.
  * `rehydrateBalance` helper trusts `payload.newBalance` first, falls back to a fresh `api.getSafe` read. Called after both `handleComplete` and `handleCancel`.
- `useHydrateFromServer`: on every session load, lists any `status=pending` attacks for the user and resolves them by posting `submit_result` with empty results. Your existing dangling attack is cleaned up on next login.
- Tests (`supabase/functions/attack.roundtrip.test.ts`): full model of the Edge Function's decision tree in-memory. Covers WIN, LOSS-on-partial, ABANDON (empty), IDEMPOTENT replay, cheating rejection, bot-target loss, and stake-cap enforcement — 8 scenarios, 97 tests total.

**No new manual deploy step is required beyond redeploying the two changed functions:**

```sh
supabase functions deploy submit_result
```

(No SQL change; the ledger and attack tables are unchanged.)

**Manual verification for the hotfix:**

1. In a signed-in browser, start an attack against a bot, deliberately fail lock 1, then wait for the "Heist Failed" complete screen and click Continue.
   - Network tab: one `POST /functions/v1/submit_result` with 1 result. Response is 200 with `status: "lost"`.
   - Home screen: balance decreased by exactly the stake and reflects immediately (no reload).
2. Start another attack, then hit the back arrow mid-play.
   - Network tab: one `submit_result` fires with the partial or empty results. Response 200 `lost`.
   - Balance updates immediately.
3. Win a heist (attack a low-difficulty bot and pass all locks).
   - Balance shown after Continue equals stake-loss + loot-net-of-cut. Refreshing the page shows the same balance.
4. **Existing dangling attack**: next time you sign in, watch the console for `[hydrate] pending-attack cleanup` — no errors means it was resolved as lost silently.
5. **Idempotency**: in devtools, double-click Continue on a completed heist, or replay the `submit_result` POST once. Balance does not double-credit.

## Hotfix — target-selection mismatch (2026-07-11, second pass)

Live-game bug: the target shown in the "Confirm Attack" dialog was not the target actually attacked. Selecting `OptimalSafe3` for $35 stake launched a heist against `ShadowBot915` for $14.

Root cause: the target list was generated client-side (`matchmaking.generateBotFeed`), but `start_attack` independently rolled its own bot when the client passed `botDifficulty`. The client's selected target was ignored end-to-end — only the numeric difficulty made it to the server.

Chose **option (b)** — server is the source of truth for the whole target list.

- **New Edge Function `list_targets`** returns the full heist target list in one call: real safes from `public_safe_snapshots` (excluding self and cooldown) plus deterministically-seeded bots to fill the requested count. Each entry has an opaque `id` the client must round-trip verbatim to `start_attack`. Every derived field (`attackFee`, `difficultyBand`, `lootRange`, `securityScore`) is computed server-side using the shared economy module, so the stake shown in the confirm dialog equals the stake `start_attack` will actually debit.
- **New `_shared/bot-target.ts`** — a pure module that maps a seed to a full bot spec (`{handle, balance, difficulty, loadout, ...}`). `parseBotId` recovers the seed from an id of the form `bot_<seed>`. Both `list_targets` and `start_attack` call `generateBotTarget(seed)` for byte-identical output — no bot table needed, no client-tamper surface.
- **`start_attack`** now recognises three id shapes and dispatches deterministically:
  1. `bot_<seed>` — regenerate the same bot the client saw via `generateBotTarget(seed)`. This is the primary flow.
  2. UUID — real safe from `public_safe_snapshots` (unchanged).
  3. No id — legacy path, mints a fresh bot on the server. Still uses `generateBotTarget` internally so `bot_target` jsonb always includes `{id, seed, handle, balance, difficulty}` reliably (previously it was `{seed, difficulty, handle}` only, so `submit_result` fell back to a hardcoded 1500 balance for loot calc).
- **Client**: `api.fetchTargetList` calls `list_targets`; `gameStore.refreshTargetsFromServer` no longer mixes in local `matchmaking.generateBotFeed` bots for signed-in users (kept as fallback when the server call fails or when signed out). `HeistScreen.handleConfirmAttack` always passes `defenderSafeId: selectedTarget.id` — no more `botDifficulty` branch, so a chosen target is stable from list → confirm → start_attack → attack screen.
- **Test** (`supabase/functions/attack.roundtrip.test.ts`): a new "bot target id round-trip" section asserts (a) the bot object `list_targets` builds is byte-identical to the bot `start_attack` re-derives from the same id, and (b) the stake shown in the confirm dialog equals the stake `start_attack` actually charges. `_shared/bot-target.test.ts` adds 12 unit tests for `parseBotId`, `newBotId`, and `generateBotTarget` (determinism, uniqueness, band assignments, fee-cap under attacker balance).

### Redeploy (this hotfix)

Committing does not deploy. From the repo root:

```sh
supabase functions deploy list_targets
supabase functions deploy start_attack
```

`submit_result` and `resolve_defense` are unchanged. **No SQL migration.**

### Manual verification for the hotfix

1. Reload the app (signed in). Open the Heist screen — the target list is now coming from the server.
2. In devtools → Network, filter for `list_targets`. Every card shown has an `id` from the response body.
3. Pick a bot target (name shown as e.g. `ShadowKeeperabc` — the trailing 3 chars are seed-derived). Note the stake in the confirm dialog.
4. Click Attack. In the Network tab watch `start_attack` fire; the request body contains `defenderSafeId: "bot_..."` matching the id from step 3.
5. On the AttackScreen the header reads the same name; on completion, the stake debit equals the confirm-dialog stake.
6. Pick a real safe (a UUID-shaped id). Verify the same round-trip: name and stake shown = name and stake actually charged.
7. Refresh the target list a couple of times — each refresh generates fresh bot ids (they change every call by design; there is no persistent bot table).

## Known trade-offs & TODOs

- **Insurance purchase is two calls, not one.** `api.purchaseInsurance` inserts the policy and then debits via `insert_ledger`. If the second call fails you end up with a paid-for policy and no debit — the opposite (no policy, debit) is not possible because of the order. TODO: extract to a `buy_insurance` Edge Function so both writes go through a single stored procedure.
- **Bot balances aren't persisted with the attack** — the server currently defaults to 1500 when computing loot for a bot target. Rounding this in a follow-up requires threading defender balance into `bot_target` jsonb on start.
- **`resolve_defense` fires an inbound attack ~5% of the time** on the client tick. The tick is client-driven, so a malicious client could just spam the endpoint. TODO: add a per-user rate limit table or move to a cron.
- **Real-time push not wired**. Attacks against a signed-in player fire and forget — the defender doesn't see a live notification until they open the app and hydrate. Supabase Realtime on the `ledger` table would fix this in a couple of lines.
- **`bot_target` jsonb doesn't include defenderBalance yet** — see `submit_result/index.ts` fallback of 1500 for bot loot.
- **`recentlyAttacked` is still in `gameStore` (localStorage)**. It's a UI hint, not authoritative — the server enforces cooldowns from `safes.last_attacked_at`. This is fine but noted.

## Files added / touched

- `supabase/migrations/20260710120000_phase2_initial_schema.sql`
- `supabase/migrations/20260710120100_phase2_rls_policies.sql`
- `supabase/functions/_shared/{types,constants,economy,modules,rng,plausibility,attack-flow,http}.ts`
- `supabase/functions/{start_attack,submit_result,resolve_defense}/index.ts`
- `supabase/functions/_shared/{rng,plausibility,attack-flow}.test.ts`
- `supabase/functions/attack.roundtrip.test.ts`
- `src/services/{supabaseClient,useSession,useHydrateFromServer,api}.ts`
- `src/screens/AuthScreen.tsx`
- `src/App.tsx`, `src/screens/HomeScreen.tsx`, `src/screens/HeistScreen.tsx`, `src/screens/AttackScreen.tsx`
- `src/store/{gameStore,heistStore}.ts`
- `src/game/{constants,economy,modules}.ts` (now one-line re-exports from `@shared/*`)
- `vite.config.ts`, `vitest.config.ts`, `tsconfig.app.json` (path alias)
