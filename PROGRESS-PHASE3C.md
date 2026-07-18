# Progress — Phase 3C (post-QA fixes from TESTING-FINDINGS.md)

Worked the `TESTING-FINDINGS.md` list in priority order. All four
actionable P1/P2 items are fixed with tests. Build, tests, and my own
lint are green; P3 items are left as documented TODOs per scope.

**Status:** `npm run build` ✓ · `npm run test` ✓ (195 passed, 18 files)
· `npm run lint` → 3 **pre-existing** errors remain (see "Lint" below),
0 introduced by this work.

`generate_game` Edge Function **deployed** to project
`cqacfzkyxmtmjzpksznj`. No new DB migrations (all new data rides in the
existing `calibration_stats` JSONB + `description` columns).

---

## P1.1 — Flaky marketplace equip (first click didn't persist) ✅

**Root cause (three compounding bugs in `MarketplaceScreen.equip`):**
1. It read `securityLoadout` captured at render — a stale closure that a
   concurrent server-hydrate could have already replaced.
2. It resolved the user via `supabase.auth.getUser()` — a *network* call
   that can transiently return no user right after load; the server
   write sat behind `if (data.user)`, so it was **silently skipped**.
3. It updated the client store *before* the server write, so a late
   hydrate could clobber the just-equipped module.

**Fix (`src/screens/MarketplaceScreen.tsx` + new `src/game/loadout.ts`):**
- Read the loadout fresh from `usePlayerStore.getState()` at click time.
- Resolve the session from the cached `getSession()` (no flaky network
  round-trip); if there's genuinely no session, show an error instead of
  silently no-op'ing.
- **Server write first, then** update local state → we reflect what
  actually persisted. Only navigate on success.
- Stable module id (`<gameId>-slot-<n>`) makes re-equip idempotent.
- Buttons now show a spinner while saving, disable during a write, and
  render an "equipped ✓" badge driven by the **persisted** store.
- Equip is extracted to `buildCustomModule()` (unit-testable, sanitizes
  display strings).

**Tests:** `src/screens/MarketplaceScreen.equip.test.tsx` — asserts a
single first click calls `updateLoadout` exactly once with the equipped
module and navigates; and that a missing session surfaces an error and
does **not** write or navigate. (Also added an in-memory `localStorage`
polyfill to `src/test/setup.ts` so store-backed component tests run.)

## P1.2 — Production auth email + session refresh ✅ (code/config) ⚠️ (1 manual step)

- **Custom SMTP as code:** new `supabase/config.toml` with an
  `[auth.email.smtp]` block (Resend defaults; SendGrid/Postmark swap in),
  all secrets read from env vars, plus `jwt_expiry = 7200` with
  refresh-token rotation and a raised `email_sent` rate limit.
- **Setup doc:** `docs/AUTH_EMAIL_SETUP.md` — dashboard walkthrough
  (recommended) **and** the `supabase config push` path.
- **Silent token refresh:** `autoRefreshToken` was already on;
  `src/services/supabaseClient.ts` now also re-arms the refresh loop on
  tab `visibilitychange` (start when visible / stop when hidden), which
  fixes the mid-use "JWT expired" bounces when a tab was backgrounded.

## P2.3 — DSL difficulty feedback in the builder ✅

- **Dry-run preview:** `generate_game` accepts `dryRun: true` — it runs
  the full pipeline (moderation → AI → validate → calibrate) but does
  **not** persist a row, returning the solve-rate estimate + a tweak.
  New **"Preview difficulty"** button in the builder
  (`src/screens/CustomGameScreen.tsx`) shows the estimate vs. the live
  30–70% band before publishing; on a rejected publish it keeps the form
  open and shows the same feedback so creators can iterate.
- **Concrete tweak suggestions:** new
  `supabase/functions/_shared/suggestions.ts` maps a calibration miss +
  the actual config/program to a specific lever, e.g. *"Too hard —
  increase the timer to ~23s (+8s), or remove one enemy."* Stored in
  `calibration_stats.suggestion` and shown in the builder + game list.
- **Smarter calibration player (reduces bimodality):**
  `dsl-runtime.ts`'s headless AI now uses **BFS shortest-path** toward
  the nearest objective (with per-step enemy avoidance) instead of
  Manhattan-greedy, which dead-ended against walls and made wall-heavy
  games bimodal. Deterministic; a new test proves it routes around a
  wall a greedy player can't.

**Tests:** `suggestions.test.ts` (engine + DSL cases),
`dsl-runtime.test.ts` BFS-detour test. Existing calibration/roundtrip
tests still pass (BFS didn't change `tick()` semantics, so client and
server stay in agreement).

## P2.4 — Sanitize titles/descriptions + reject junk listings ✅

- **Sanitizer (both sides):** new `src/utils/sanitize.ts` (display) +
  `supabase/functions/_shared/sanitize.ts` (write-time) strip HTML tags,
  control/zero-width/bidi chars, collapse whitespace, and length-cap.
  Applied when rendering names/descriptions in Marketplace + Custom
  Games, when building an equipped module, and when storing the row.
  (The injection string from the findings now renders as a single inert
  line and never as markup — React escapes text too, so this is
  defense-in-depth.)
- **`description` no longer = raw prompt:** `generate_game` stores a
  *sanitized* description instead of the raw prompt slice.
- **Quality gate:** `qualityCheck()` (in `_shared/sanitize.ts`, wired
  into `moderate()`) deterministically rejects, *before* any AI spend,
  titles/prompts that are too short, symbol-only, keyboard-mash, or read
  as prompt-injection ("ignore instructions", "return {…}"). Rejections
  flow through the existing rejected-row path with a clear reason and
  are hidden from the marketplace.

**Tests:** `src/utils/sanitize.test.ts`,
`supabase/functions/_shared/sanitize.test.ts` (sanitizer + quality gate,
incl. the exact findings' injection listing), and the existing
`moderation.test.ts` still passes.

---

## Manual steps you must run

1. **Configure the SMTP secret** (blocks real users + the 2-account
   royalty test). Follow `docs/AUTH_EMAIL_SETUP.md` — either fill in
   Custom SMTP in the Supabase dashboard (fastest) **or** export the
   `SUPABASE_AUTH_SMTP_*` env vars and run `supabase config push`.
   I can't do this — it needs your provider domain + API key.
2. **After SMTP works**, finish the one pending live test from the
   findings: sign in a second account, attack the first account's safe
   (custom game equipped), confirm a `creator_royalty` ledger row. All
   prerequisites are already verified/deployed.
3. (Optional) If you use `supabase config push`, review `config.toml`
   first — push is whole-file and overwrites dashboard values for the
   keys it sets.

## Lint note (pre-existing, not from this work)

`npm run lint` reports **3 errors, all in `src/components/minigames/
QuickMath.tsx`** (React-Compiler "memoization could not be preserved" +
"setState in effect"). These predate this work, are in a minigame
unrelated to the findings, and are behavior-sensitive to "fix," so they
were left alone. Baseline was 6 errors; this work reduced it to 3 (fixed
an unused import in `SnakeGame.tsx` and kept all new files clean). The
87 warnings are also all pre-existing.

## P3 — left as documented TODOs (per scope)

- Confirm-attack "Attack" button hit area — the buttons are already
  `flex-1` inside a `stopPropagation` sheet; the reported edge-dismiss
  depends on runtime tap behavior I couldn't verify headlessly.
- Vite >500 kB chunk — code-split later.
- Carried over from 3B: DSL runtime duplicated client/server (extract to
  one shared module), `MemoryMatch.memorizeTime` ignored, moderation
  fail-open on Anthropic outage, marketplace has no rating/search/sort.
