# Phase 1 Progress

End-to-end pass through the Phase 1 checklist in `ROADMAP.md`. Each step is one or more commits so any of them can be reverted individually. `npm run build`, `npm run lint`, and `npm test` all pass at HEAD.

## What changed

### 1. Unified minigame contract + registry + error boundary
- New shared type `MiniGameProps = { difficulty, seed, onComplete }` in `src/types/index.ts`.
- New `src/components/minigames/registry.ts` mapping every non-custom `ModuleType` to its component. Adding a new minigame is now one entry in the registry.
- Legacy `PatternLock`, `Keypad`, and `TimingLock` migrated off the `{ config }` prop shape onto `{ difficulty, seed, onComplete }`. `generatePatternConfig`/`generateKeypadConfig`/`generateTimingConfig` now take a difficulty number directly.
- Deleted `generateMiniGameConfig` — the function whose `throw new Error` at `modules.ts:186` was the root cause of `AttackScreen` crashing on 24 of 36 module types.
- New `MiniGameErrorBoundary` catches per-minigame render errors, reports a failed `MiniGameResult` once, and shows a fallback so the whole app no longer crashes if one lock throws.
- New `MiniGameHost` owns the registry lookup and wraps the resolved component in the error boundary. `AttackScreen` and `GamePickerScreen` both dispatch through it; the ~200 lines of hand-written switch chains in both files are gone.

**Result:** All 36 minigames are now playable in real attacks. Unknown/unregistered types render a graceful "Unknown module" state instead of crashing.

### 2. Single breach model
- Kept the live all-or-nothing model in `heistStore.completeAttack` (skill-based, per-lock pass/fail).
- Deleted the never-called `calculateBreachResult` weighted-score model and `ECONOMY.breachThreshold`.
- Removed the `successChance: 'low' | 'medium' | 'high'` field from `BotSafe`, its setters in matchmaking/aiBotService, and `getSuccessChanceLabel`/`SUCCESS_CHANCES`. The field was written on every bot but never rendered in the UI.
- `calculateSuccessProbability` stays: still used by insurance pricing and the safe-dashboard risk estimates, which are heuristic and unrelated to the per-attack outcome.

### 3. Real defense
- `gameStore.simulateDefense` now takes the player's actual `SecurityLoadout` and `InsurancePolicy`. It rolls one attacker skill in `[0.3, 0.8]` and beats a lock iff `skill > lock.difficulty`. Attacker succeeds only if all locks are beaten (mirrors the player-side model).
- `moduleResults` on the emitted `DefenseEvent` are now populated (previously always empty).
- Defender fee uses `calculateAttackFee(playerBalance, playerSecurityScore)` — no more hardcoded `(0.8, 1.6)` that contradicted `ECONOMY.feeParams` `(0.5, 1.0)`.

### 4. Insurance payouts
- On a failed defense with an active policy, `simulateDefense` calls `processInsuranceClaim` and reports the payout in `DefenseEvent.insurancePayout`.
- `HomeScreen`'s heist-tick effect adds the payout to the balance via `addEarnings`, and calls `useInsuranceClaim` to decrement the remaining claims.
- Distinct notification when insurance kicks in vs. an uninsured breach.

### 5. Hygiene
- `MODULE_TYPES_BY_CATEGORY` and `ALL_MODULE_TYPES` now derive from `MODULE_CONFIG` in `constants.ts`. Deleted the duplicated arrays in `matchmaking.ts` and `aiBotService.ts`.
- Deleted dead code: `getSuccessChanceLabel`, `calculateBreachResult`, `SUCCESS_CHANCES`, the unused `playerRating` param on `createBotFromStrategy`, and the dead-imported `generateMiniGameConfig` in `heistStore.ts`.
- Removed a set of unused vars/imports across `App.tsx`, several minigames, and `earningsData` (see commits).
- `EarningsGraph` helper functions (`generateSampleData`, `filterDataByRange`, `DataPoint`, `TimeRange`) moved to a sibling `earningsData.ts` file so the component file only exports components — silences `react-refresh/only-export-components`.
- Real `README.md` replacing the Vite boilerplate.
- Fixed the fee-param regression: `simulateDefense` no longer has the drift and there's a regression test in `economy.test.ts`.

### 6. Tests
- Added Vitest + happy-dom + @testing-library/react. Scripts: `npm test`, `npm run test:watch`, `npm run test:coverage`.
- `src/game/economy.test.ts` covers every exported function in `economy.ts` — monotonicity, clamps, caps, distribution splits, insurance premium bounds, `processInsuranceClaim` policy validity gates (with faked timers), principal floor edge cases, and end-to-end `calculateEconomyStats`.
- `src/components/minigames/minigames.smoke.test.tsx` renders every minigame in the registry (`describe.each`) under the canonical `{ difficulty, seed, onComplete }` contract and asserts mount+unmount does not throw. This is the test that would have caught the original `AttackScreen` crash.

**66 tests, all passing.**

## Known trade-off (documented in eslint.config.js)

`eslint-plugin-react-hooks` v7 introduced three rules that fire across ~30 minigames as pre-existing warnings:

- `react-hooks/purity` — Date.now/Math.random called during render (mostly `useRef(Date.now())` at mount time).
- `react-hooks/set-state-in-effect` — setState from inside gameplay effects.
- `react-hooks/immutability` — useEffect referencing a `useCallback` declared later in the same component.

Each surfaces a real code smell but the fixes are per-file and out of scope for Phase 1's bug-fix mandate. They are demoted to `warn` in `eslint.config.js` (visible in `npm run lint` output, not blocking). Future PRs can chip away at them; recommend revisiting before Phase 2 ships.

## What to manually verify in the browser

Run `npm run dev` and:

1. **Onboarding** — first-visit flow completes and you land on the home screen without an infinite loop (previously the effect would re-fire on every re-render; now it derives from the store).
2. **Attack loop coverage** — from Heist mode, attack a few different bots. In particular, look for bots whose loadout includes any of the newly-wired 24 minigame types (arcade: `snake`, `breakout`, `tetris`, `galaga`, `digdug`, `qbert`; puzzle: `sudoku`, `jigsaw`, `wordsearch`, `logic`, `maze`, `spotdiff`, `reaction`, `numsequence`, `cipher`; classic: `combination`, `sequence`, `slider`, `rotation`, `wire`, `fingerprint`, `morse`, `colorcode`, `safedial`). All should render and be playable. None should crash the app.
3. **Attack failure recovery** — if a lock ever throws mid-play, you should see a red "Lock malfunction" fallback and the heist counts that lock as failed rather than tumbling the whole session.
4. **Defense while in heist mode** — enter heist mode and wait for a simulated attack. Confirm the notification text differentiates insured vs. uninsured breaches. Buy insurance in `/insurance` first, then verify that a subsequent breach produces an "insurance paid out" notification and your balance decreases by `lootLost - insurancePayout`.
5. **Fees** — configure a range of loadouts and confirm the attack fee shown on a target card scales the way you expect: harder safes → cheaper stakes; capped at `feeMin`/`feeMax`.
6. **Insurance flow** — buy the 1-hour plan on a healthy safe; the tile should show correct remaining claims. Take at least two breaches; the third attempt should report the policy as expired/out of claims and the payout should be 0.
7. **Game picker preview** — from `/security/pick/:slotIndex`, "Try It" on each of the 36 games should render the game preview (using `MiniGameHost`).
8. **Custom module fallback** — no UI currently lets you place a `custom` module; if you inject one via devtools it should render the "Unknown module" fallback rather than crashing.

## Commits in this pass (top to bottom)

1. `Add ROADMAP and CLAUDE project context`
2. `Unify minigames behind { difficulty, seed, onComplete } registry`
3. `Consolidate breach model to all-or-nothing; drop dead sigmoid label`
4. `Real defense: deterministic loadout resolution + insurance payouts`
5. `Single source of truth for module type arrays`
6. `Clean up unused imports, variables, and dead exports`
7. `Move minigame startTime useRef init into mount effect`
8. `Clean up unused imports, variables, and dead exports` (second pass, plus MiniGameHost)
9. `Real README describing SAFE, its stack, and current status`
10. `Vitest + tests for economy.ts and every registered minigame`

## Next up (Phase 2 in ROADMAP)

- Supabase-backed server for real balances, seeded RNG, server-side score validation, and async PvP against snapshots of real players' loadouts.
- Per-target cooldowns and rate limits are already in `constants.ts`; move them server-side.
- Wire the Anthropic API path in `aiBotService.ts` for liquidity bots when player density is low.
