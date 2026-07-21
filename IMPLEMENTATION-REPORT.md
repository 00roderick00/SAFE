# SAFE overhaul — implementation report (2026-07-21)

Repository: **nested `~/SAFE/SAFE`** on branch **`codex-rebuild`** (the correct
production app). The parent `~/SAFE` is obsolete and was not touched.

This pass delivered the highest-value, coherent phases of the visual/gameplay-clarity
brief with tests, kept the repo passing throughout, and verified the app in a real
browser. Below is what changed, decisions, files, tests, exact results, browser flows,
and what remains.

## What changed (by brief section)

- **Release hygiene (critical).** Prominent "correct repo & branch" banners at the top
  of `README.md` and `DEPLOY.md`; a non-destructive `scripts/verify-repo.sh`
  (+ `npm run verify-repo`) that detects the rebuilt app and exits non-zero in the
  obsolete parent. Verified: passes here, fails (exit 1) in `~/SAFE`.
- **§5 De-brand third-party arcade games.** Renamed all 12 recognizable arcade games to
  original SAFE concepts (Grid Runner, Stack Breach, Star Intercept, Prism Steps, Barrel
  Run, Swarm Defense, Cross Point, Segment Hunt, Orbital Debris, Fracture, Tunnel Charge,
  Circuit Trail) and neutralized their character emoji. **Internal IDs preserved** for
  loadouts/seeds/server contracts. Documented + tested mapping in `game/gameNaming.ts`.
- **§4/§6 Featured vs Experimental + catalog corrections.** Added a curated Featured
  roster and player-facing status badge; replaced the misleading "Calibration pending"
  on every built-in. The picker now opens on the **current lock's own category** instead
  of an empty Community tab.
- **§1/§2 Plain language + onboarding.** The onboarding CTA now changes after the player
  inspects a lock ("Tap a lock to continue" → "Continue"); "Skip" is labelled "Skip to
  sign in" so it never implies entering the game; removed engineering/banned phrases
  ("verified mechanical sequence", "settlement" as the primary result, "not an invented
  reward", "persistent multiplayer state", "AI output is validated…" as a lead sentence).
  Primary actions across the flow now read plainly: **Expose your vault**, **Expose for
  10 minutes**, **Choose a target**, **Attack {name}?**, **Risk 31 TK**, **You won/lost
  X TK**, **Find another target**.
- **§7 Target selection.** Target cards now show only the decision-critical **Risk** and
  **Potential win**; the gross-loot / platform-cut breakdown moved into the confirmation
  sheet. The confirm sheet's dominant button is labelled with the actual risk
  ("Risk 40 TK") and abandoning-is-a-loss is stated explicitly.
- **§9 Marketplace safety.** Added `game/listingSafety.ts` display-time filtering so
  injection/test/garbage listings (e.g. the historical "Inject" prompt-injection row) are
  hidden from the Marketplace and picker Community tab regardless of calibration; all
  shown text is sanitized. Documented a reviewable, **non-executed** DB cleanup procedure.
- **§10 Create copy.** Replaced the security-boundary lead sentence with player-facing
  fairness language; the AI-as-data boundary stays in developer docs.
- **§3/§11/§12 (partial).** Kept the strong existing vault/outcome mechanical system;
  added a plain result subhead to `VaultOutcome`; the outcome/dossier copy is larger and
  clearer. (See "Remaining" for the deeper vault-animation and full typography work.)

## Important design decisions

- **Internal IDs are the contract; names are presentation.** De-branding changed
  `MODULE_CONFIG` name/description/icon only. A test asserts every internal id still
  exists and no banned term leaks — so saved loadouts and the server attack flow are
  unaffected.
- **Defense-in-depth over deletion.** Marketplace safety hides unsafe rows at display
  time and documents a *quarantine* (not delete) cleanup — no production data was mutated.
- **Honest states only.** Featured/Experimental is a curation label, not invented
  performance data; no success probabilities or ratings were fabricated.
- **Preserved the security spine.** No change to server-authoritative settlement, seed/
  answer/replay verification, RLS, moderation, or economy formulas. Existing attack-flow
  and verification tests remain green.

## Files changed / added

Changed: `README.md`, `DEPLOY.md`, `package.json`, `src/index.css`,
`supabase/functions/_shared/constants.ts` (arcade names), `src/game/catalog.ts`,
`src/screens/GamePickerScreen.tsx`, `src/screens/OnboardingScreen.tsx`,
`src/screens/HeistScreen.tsx`, `src/screens/AttackScreen.tsx`,
`src/screens/CustomGameScreen.tsx`, `src/screens/MarketplaceScreen.tsx`,
`src/components/game/VaultOutcome.tsx`, and the tests below.

Added: `scripts/verify-repo.sh`, `src/game/gameNaming.ts`(+test),
`src/game/listingSafety.ts`(+test), `src/screens/GamePickerScreen.catalog.test.tsx`,
`src/screens/MarketplaceScreen.safety.test.tsx`, `docs/MARKETPLACE_SAFETY.md`,
`IMPLEMENTATION-REPORT.md`.

## Tests added/updated

Added: game de-branding + internal-ID compatibility; Featured/Experimental catalog
status; picker initial category + no "Calibration pending"; marketplace unsafe-content
rejection (unit) + hidden in render; onboarding CTA change + no-jargon; plus updated
existing onboarding/heist/abandon/reachability/App-QA tests to the new labels and the
Tetris→Stack Breach public rename.

## Exact results

- `npm test` — **44 files, 303 tests passing** (was 40/286 at baseline; +11 net after
  adding coverage and updating renamed-label assertions).
- `npm run build` — **success** (`✓ built`), lazy chunks preserved.
- `npm run lint` — **0 errors**, 62 warnings (unchanged from baseline; none in new files).
- `npm run verify-repo` — passes in `~/SAFE/SAFE`, fails (exit 1) in `~/SAFE`.

## Browser flows tested (headless Chromium, DEV `?visualQa=1`)

At **390×844** and **1280×720**: Home, Security (defense array), Heist briefing/targets,
History, Create, Marketplace, Insurance, and the defense picker all rendered with
**zero console/page errors**. Verified in-picker: de-branded names present, **no**
third-party names, Featured + Experimental badges shown, "Calibration pending" gone, and
a minigame preview (Stack Breach) mounts cleanly. New copy confirmed live
("Expose your vault", "Configure lock 1").

## Remaining / not done this pass

- **§3 deep vault event choreography** (per-bolt retract synced to each cracked lock,
  loot-transfer, defense-absorb, insurance shield layer as one shareable sequence): the
  existing mechanical system (SafeGraphic, BreachHud bolt rail, VaultOutcome door) is
  solid and was refined, but the full end-to-end cinematic was not rebuilt.
- **§6 per-game animated thumbnails**, **§8 full Marketplace redesign into StateFrame
  chrome**, **§10 Create redesign with templates/preview**, and a **full §11 typography
  sweep** are partially addressed (copy + safety + a few sizes) but not comprehensive.
- **§9 production cleanup** of the "Inject" row is documented but intentionally **not
  executed** (requires reviewer + prod DB access).

## Items needing external credentials / production action

- Running the documented marketplace quarantine SQL against prod DB `cqacfzkyxmtmjzpksznj`
  (reviewer-gated).
- No deploy/push was performed, per instructions.

## Recommended next step

Tackle **§3 (vault event choreography)** next — it's the signature experience and the
current mechanical primitives (bolt rail, dial, door) are already in place to sequence.
Then the §8 Marketplace and §10 Create visual redesigns, and a comprehensive §11
typography pass with layout regression checks.
