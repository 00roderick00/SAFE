# PROGRESS — Tactile roster, skill-not-chance, progressive onboarding

Implements `TACTILE-REDESIGN.md` end-to-end on `codex-rebuild`. The
security guarantee from `PROGRESS-SECURITY.md` (*no safe breachable with
a forged result, regardless of composition*) is preserved and extended
to the new `chesspuzzle` lock; the anti-cheat suite re-runs green with
new cases.

## 1. Roster audit — final decision for all 36 games

Every game component was read (and the interactive ones exercised with
pointer-event tests) before deciding. Your grep table was mostly right
but under-sold how broken parts of the arcade cluster were.

### KEPT as-is (19)

`slider, keypad, memorymatch, sudoku, jigsaw, spotdiff, wire, cipher,
logic, wordsearch, numsequence, quickmath, colorcode, sequence,
rotation, fingerprint, morse, timing, pattern`

All verified tap/pointer-native with no keyboard requirement and no
autonomous hazards; all randomness is puzzle *generation*, not outcome
chance. Notes worth knowing:

- `timing`: the target position comes from unseeded `Math.random()`
  (`_shared/modules.ts`), but play itself is a pure function of elapsed
  time (frame-rate independent). Generation randomness — allowed.
- `cipher` / `wordsearch`: wrong guesses cost nothing, so both lean
  "speed" more than "deduction". Kept; flagged as future tuning.
- `sequence`: regenerates per round with `Math.random()` — that's
  Simon-says round generation, not outcome chance. Kept.

### KEPT with fixes (3)

| Game | Problem found | Fix shipped |
|---|---|---|
| `breakout` | Ball moved a fixed step per rAF frame → 2× speed on a 120 Hz screen; rAF loop was rebuilt on every brick hit | Fixed-timestep accumulator (60 Hz sim steps, 250 ms catch-up clamp); loop now survives brick hits via refs |
| `reaction` | Could hang forever if the player never tapped ('go' had no timeout); final round's time was dropped from the average (stale closure) | 2 s per-round timeout scored as a 1500 ms miss; final round included via a synchronous times ref |
| `combination` | **Failed "skill, not chance"**: 3–4 digit hidden code, 2–5 blind attempts, zero feedback → P(win) < 1 % regardless of ability | Per-digit ▲ higher / ▼ lower / ✓ feedback after each wrong attempt (binary-search solvable in ≤ 4), attempts raised to 5–8, 45 s. Seed-derived secret and server answer verification untouched |

### REWORKED to direct manipulation (3 + DslRunner)

| Game | Was | Now |
|---|---|---|
| `DslRunner` (every player-built DSL game) | Keyboard + on-screen D-pad | **Tap a board cell to auto-walk there** (greedy per-tick steps), swipe for a single step; D-pad removed; keyboard secondary. The per-tick input trace is unchanged, so `replayDslTrace` server verification still holds (round-trip tests green) |
| `tetris` | Buttons + keyboard only; board inert | Drag on the board steers the piece column-by-column under the finger, tap rotates, swipe down hard-drops; buttons/keyboard kept as secondary. Already seed-deterministic |
| `safedial` | Two tap buttons, one notch per tap (a 37-notch turn = 37 taps); wheel not draggable | Drag-to-spin the dial (atan2 notch tracking, wrap-safe); buttons/keyboard secondary. Already seed-deterministic |
| `maze` | D-pad + arrows only; cells not tappable | Tap any square → BFS path → player walks it; D-pad removed, keyboard secondary. No hazards, purely input-driven |

### CUT (11) — retired from the equippable roster

`pacman, spaceinvaders, frogger, donkeykong, centipede, asteroids,
snake, galaga, digdug, qbert, wordscramble`

Every one is D-pad/virtual-button-only (zero direct manipulation across
the whole set — principle 1 fails regardless of anything else). On top
of that, the audit found:

- **RNG that beats you** (principle 2 fails): `galaga` (random enemy
  fire, one hit = instant death), `digdug`/`qbert` (random enemy
  movement/respawn every tick), `asteroids` (random split trajectories +
  possible spawn-adjacent instant loss), `frogger` (random lane spawns
  into your lane).
- **Broken outcome reporting**: `donkeykong` is literally unwinnable
  (its collision/scoring block is dead code — barrels never reach the
  "ground" y the check expects); `pacman` and `frogger` have
  stale-closure timers that submit score 0 on the only realistic exit
  path; `wordscramble` always submits 0/false (its only end path closes
  over round-one state) and its only input is a virtual QWERTY.
- None of the 11 accept the issued `seed`; none is server-verifiable.

Judgment calls you may want to review:
- `spaceinvaders` and `centipede` are deterministic and fair — they were
  cut on principle 1 alone (button-only, no direct manipulation). They
  are the two most plausible candidates for a future gesture rework.
- `wordscramble` could have been rebuilt around tapping letter tiles;
  cut instead because word-skill is already covered by `wordsearch` +
  `cipher` and the component needed a ground-up rewrite.
- `tetris` stayed despite being "arcade" — it is seed-deterministic
  (pure skill) and got a genuine direct-manipulation scheme.

## 2. How retirement works (no deletions, no broken safes)

`supabase/functions/_shared/roster.ts` (client barrel
`src/game/roster.ts`) is the single source of truth:

- `RETIRED_MODULE_TYPES` / `ACTIVE_MODULE_TYPES(_BY_CATEGORY)`.
  Equip/pick surfaces (GamePicker), client + server bot generation
  (`generateBotLoadout`, matchmaking, aiBotService pools) all draw from
  the ACTIVE lists. Registry entries and `MODULE_CONFIG` for retired
  types remain, so history rows and old attack snapshots still render.
- `migrateRetiredLoadout(loadout)` substitutes each retired built-in
  with a kept analog (`RETIRED_REPLACEMENTS`: e.g. galaga→breakout,
  qbert→maze, wordscramble→wordsearch), preserving slot id + difficulty
  and never touching custom games. It runs in two places:
  - zustand persist `migrate` (v1) for local state;
  - `useHydrateFromServer`, which also writes the fixed loadout back via
    `api.updateLoadout` so the server copy heals on next login.
- `playerStore.setModuleType` refuses retired types, so nothing can
  re-equip them.

**Security invariant, tested** (`roster.test.ts`): every retired type
and every replacement is class-2, so migration can never change a
loadout's `verifiableCount` — the composition rule in `submit_result`
holds for every safe before and after the change, and no safe becomes
forgeable. Bot loadouts keep their slot-0 verifiable lock and stay
seed-deterministic.

## 3. Progressive disclosure — as built

`src/game/progression.ts` (pure) + `src/store/useUnlockTier.ts` (React
bindings). Tier is derived from **counters the server already records**
(settled attack rows), so progression is server-persistent without a new
table: `useHydrateFromServer` calls `api.getAttackStats(userId)` (count
of non-pending attacks + count of wins) on every session.

| Tier | Condition | Unlocks |
|---|---|---|
| 0 | new player | Safe + Heist only; default loadout `keypad, slider, memorymatch` (keypad first keeps the verifiable-lock guarantee); heist list surfaces soft bots first with a "GOOD FIRST TARGET" callout |
| 1 | 1 completed heist (win **or** lose) | Security (full picker + difficulty tuning), History |
| 2 | 3 completed heists | Insurance, Marketplace (equip community locks) |
| 3 | 5 completed heists **or** first successful breach | Create / AI Workshop |

- **Announced**: crossing a tier live shows a brief skippable "…
  unlocked" dialog (Layout). Dismiss = `markTierAnnounced`.
- **Visible depth**: locked nav items stay in the bottom nav, dimmed,
  with a lock glyph and the unlock condition in their label/tooltip.
  Same for the gated entry buttons on Home/Security/GamePicker.
- **Grandfathering**: server counts can only *raise* local progression
  (`setProgressionFromServer` uses max), and hydration-driven tier jumps
  are pre-marked as announced, so an existing account (yours included)
  gets full access with zero fanfare on any device. Pre-ladder local
  profiles with evidence of play are also grandfathered in the persist
  migration.
- **Presentation only**: no Edge Function or RLS policy consults the
  tier. A direct API caller can use any endpoint at tier 0; the security
  model never depended on UI visibility.

## 4. `chesspuzzle` — new game, verification class 1a

No third-party puzzle data is bundled. Instead
`supabase/functions/_shared/chess-puzzle.ts` is a dependency-free chess
engine (movegen, checkmate/stalemate, bounded mate search, deterministic
best-defense) shared verbatim by client and server, and **the position
itself is derived from `(seed, difficulty)`** — piece-only endgames:

- difficulty < 0.34 → mate in 1 · < 0.67 → mate in 2 · else mate in 3
- Same seed + difficulty → identical puzzle on client and server,
  offline by construction. (The Lichess DB was considered per the brief;
  generating from seed was chosen instead — nothing to license or
  bundle, and it drops straight into the existing seed-answer
  verification model. Attribution note therefore not needed.)

Play is tap-piece → tap-destination (`ChessPuzzleGame.tsx`), no
keyboard, zero chance: the opponent's replies are deterministic
(`bestDefense`), so the entire game is a pure function of the player's
moves. 3 attempts, 60 s.

**Server verification** (`verify.ts`): the client submits the actual
white move list as `answer`; `verifyChessAnswer` re-derives the puzzle,
replays those moves against the same deterministic defense, and passes
iff checkmate lands within the puzzle's move budget. Client
`passed`/`score` are ignored — including the reverse direction (a
winning line submitted with `passed:false` is corrected to a win).
`chesspuzzle` counts toward `verifiableCount`, strengthening the
composition guarantee. Registered in the registry/catalog (Featured,
puzzle category, ♞) and equippable like any lock.

## 5. Verification status — honest accounting

- Touch flows exercised with real pointer/touch events in tests:
  DslRunner (tap-to-walk, swipe, no D-pad), Tetris (drag/tap/swipe),
  SafeDial (full combination by drag only), Maze (tap-to-walk via BFS,
  wall taps inert), ChessPuzzle (tap-tap mate-in-1 whose answer passes
  the real server verifier), CombinationLock (feedback + correct-code
  flow), ReactionGame (no-input termination). Breakout's frame-rate
  independence is asserted by simulating different rAF timestamp
  patterns.
- **Not fully verified**: the 19 kept-as-is games were verified by code
  reading (input handlers, RNG usage), not all by new pointer-event
  tests — the pre-existing suite covers several (pattern, keypad,
  colorcode, …). No on-device (real phone) testing was possible from
  this environment; the gesture code paths are tested under happy-dom
  synthetic pointer events.
- Class-2 modules remain plausibility-only (unchanged residual from
  PROGRESS-SECURITY.md); the composition rule still guarantees no safe
  is forgeable.

## 6. Test / build / deploy

- Full suite: **381 passing across 57 files** (was 311 before this work), `npm run build`
  and `npm run lint` green.
- New/updated coverage: roster retirement + migration invariants,
  unlock ladder (tier maths, nav gating, announcements, grandfathering),
  chess engine (movegen, mate search, seed determinism sweeps,
  verifyChessAnswer accept/reject), anti-cheat rows for `chesspuzzle`
  forgeries, plus the touch tests above. Updated for intended behavior
  changes: onboarding/reachability tests (new default loadout,
  grandfathered nav), smoke-test count 36 → 37, featured-roster size.
- Edge Functions redeployed to `cqacfzkyxmtmjzpksznj`: `submit_result` (bundles the new chess engine + verify branch), `start_attack`, `list_targets`, `resolve_defense` (retired-roster bot pools).
  No DB migrations needed (progression derives from existing attack
  rows; retirement/chess logic lives in function code).

## 7. Follow-up (2026-07-27): version-skew incident, guards, backfill

### 7.1 The live bug

The Edge Functions were redeployed with `chesspuzzle` in the dealable
roster while `main` — and therefore the shipped frontend — still had no
component for it. `MiniGameHost` rendered "Unknown module … Counting as
a failed lock", so under all-or-nothing a player who drew one of those
targets (~6% of live targets; 5 of 6 sampled lists contained one)
forfeited their whole stake through no fault of their own.

**Fixed** by merging `codex-rebuild` into `main` and pushing
(commit `7df16b8`), which triggered the Vercel deploy.

**Verified live** on safe-orpin-xi.vercel.app: the new bundle
(`assets/index-Dk2BLbAM.js`) contains `chesspuzzle`; a real exposed
heist against a bot dealt a "Checkmate" lock in slot 2 with its crown
glyph in the breach rail (no "Unknown module"); and the game itself was
played to completion in the Security → Try-it harness — board rendered
"Mate in 1 · White to move" with a legal position (black king a8, white
queen h7, rook g5, king e4), tapping the rook then g8 highlighted legal
destinations and played **Rg8#**, which the component accepted as a win.
No console errors. "Checkmate" is also selectable and equippable in the
game picker.

### 7.2 Guard (a) — an unrenderable lock never costs a stake

**Choice: void the attack and refund**, rather than skipping the module.

A non-scoring *skip* would be unsafe: under all-or-nothing, a module
that "doesn't count" is one fewer thing standing between an attacker and
the loot, so forcing an unrenderable module would become a cheaper
breach. A *void* has no such edge — it pays zero loot and moves no
defender balance, so it is exactly equivalent to never having attacked
and is strictly worse for an attacker than a genuine win.

- `verifyAttack` now reports `unsupportedCount` / `unsupportedTypes`,
  computed from the **server's own loadout snapshot** (never a client
  claim, so it can't be triggered on demand). The module is still
  recorded as **not passed** and `allPassed` is false.
- `submit_result` voids on `unsupportedCount > 0`: status `abandoned`,
  loot 0, a single `attack_void_refund` ledger entry returning the
  stake, no defender movement, no insurance, no royalties. The client
  surfaces "Raid voided — nothing lost" and skips MMR/history.
- `MiniGameHost` no longer scores the unknown module as a failed lock;
  it offers "End raid & refund stake" and routes to that settlement.

Tested both directions (`verify.unsupported.test.ts`,
`submit_result.void.test.ts`): the player is refunded and made whole and
the lock they *did* beat is still credited; and a forged all-pass over
an unrenderable lock yields a void with zero loot, cannot rescue an
otherwise-failed attack, and does not inflate `verifiableCount`.

### 7.3 Guard (b) — the server can't deal what the client can't render

- `SUPPORTED_MODULE_TYPES` in `_shared/roster.ts` is the shipped
  contract; `clientSupportedModuleTypes()` reports the actual client
  registry keys and is sent with `start_attack`.
- `start_attack` intersects the two and refuses **before debiting the
  stake** — 409 `unsupported_module_types`, no attack row, no ledger
  entry. Omitting the field (an older client) falls back to the server
  contract, so the guard is backward-compatible.
- `rosterContract.test.ts` asserts server-dealable ⊆ client registry
  (and that every `MODULE_CONFIG` type has a component), so CI fails if
  the two ever drift again — which is what would have caught this.

### 7.4 Backfill of retired loadouts

Retirement migration was lazy (client-side on login), so safes whose
owners hadn't logged in since still publicly served retired games —
trevor.mentis was live with `spaceinvaders`.

`migrations/20260727120000_backfill_retired_loadouts.sql` applies the
same replacement map server-side to every safe in one idempotent,
self-verifying transaction (it raises and rolls back if any safe still
carries a retired type afterwards, or if a module array is corrupted).
Custom games are skipped. `retiredBackfill.test.ts` parses the SQL and
asserts its map equals `RETIRED_REPLACEMENTS` and its names/weights
equal `MODULE_CONFIG`, so the SQL cannot drift from the TypeScript.

**Applied to production** (`supabase db push`): *1 safe to migrate, 1
safe rewritten, verified — 0 safes carry a retired type*. Independently
re-checked through the public view: all 7 rows in
`public_safe_snapshots` are clean, and trevor.mentis now reads
`breakout, keypad, timing`.

**Invariant re-asserted:** every retired type and every replacement is
class-2, so `verifiableCount` is unchanged for every migrated safe
(tested for all 11 retired types across three compositions, plus
trevor.mentis's exact live loadout, which keeps its `keypad`). No safe
became forgeable; the guarantee in PROGRESS-SECURITY.md is intact.

`effectiveScore` is deliberately left as stored — it is a cached display
value; `start_attack` recomputes the security score from the loadout
itself, and the client recomputes on hydrate.

### 7.5 State

- Suite **405 passing** (was 381), build + lint green.
- Edge Functions redeployed: `start_attack`, `submit_result` (guards),
  earlier `list_targets`, `resolve_defense`. Migration pushed.
- `main` has the tactile release (§1–§6). The §7 guards are committed on
  `codex-rebuild` and **not merged** — the deployed server side is
  backward-compatible with the current `main` bundle, so nothing is
  broken while they await your review.
