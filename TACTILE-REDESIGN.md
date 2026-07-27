# SAFE — Tactile roster + progressive onboarding (implementation brief)

Player feedback drives three changes. Work through this doc top to bottom.
Everything here is additive or subtractive at the roster/navigation level —
**do not** weaken the server-side verification work in `PROGRESS-SECURITY.md`.

## The three principles

1. **Tactile only.** Every playable lock must work with a finger on a phone,
   by *direct manipulation* — you touch the thing you are affecting. Tap-to-act
   counts (SliderLock's tap-a-tile-to-slide is the reference feel). On-screen
   D-pads/virtual buttons are **not** acceptable as a primary control scheme.
2. **Skill, not chance.** A player's outcome must depend on their input, never
   on RNG that can beat them regardless of skill. Randomised *puzzle generation*
   (which code/word/layout you get) is fine and should stay — that is procedural
   generation, not chance. Autonomous RNG-driven enemies that can kill you
   through no fault of your own are not fine.
3. **Simple to enter, deep to stay.** The full feature set remains, but a brand
   new player must not be shown all of it at once. Gate advanced surfaces behind
   progression.

---

## Section 1 — Roster audit (do this first, and verify my data)

I classified the 36 built-ins by grepping input handlers. **Verify each call
before acting on it** — my grep counts handlers, it doesn't prove playability.
Actually run/read each game before you cut or keep it.

### 1a. Keyboard-dependent (touch parity must be proven or the game is cut)

These register arrow/WASD/keydown handlers. Several also have tap handlers, so
some may already have touch parity — **confirm by reading the component**,
don't assume:

| Game | keydown handlers | has tap handlers |
|---|---|---|
| SnakeGame | 11 | yes |
| GalagaGame | 8 | yes |
| TetrisGame | 7 | yes |
| DigDugGame | 6 | yes |
| MazeGame | 6 | yes |
| QbertGame | 6 | yes |
| SafeDialLock | 4 | yes |
| WordScramble | 1 | yes |

**`DslRunner.tsx` is the critical one** — it is keyboard-driven (`ArrowUp` etc.)
and it powers *every player-built DSL game*. If it isn't fully touch-playable,
the entire creator economy is unplayable on a phone. Fix this one first, and it
must be direct manipulation (e.g. tap/swipe the destination cell), not a D-pad.

For each game above: either give it a genuinely tactile control scheme, or cut
it (see 1c).

### 1b. Chance-dependent (candidates for cut under principle 2)

Arcade games with autonomous, RNG-driven hazards that can end a run irrespective
of player skill: `asteroids`, `centipede`, `digdug`, `frogger`, `galaga`,
`pacman`, `qbert`, `spaceinvaders`, `donkeykong`.

Verify each: does randomness during play determine the outcome, or is it
deterministic-from-seed and merely *hard*? Anything genuinely seed-deterministic
(same seed + same inputs → same result) is skill, and may stay.

Note the strong overlap with 1a — cutting this cluster serves both principles.

### 1c. How to cut a game safely

Do **not** delete component files in this pass. Instead:

- Remove the type from the equippable/pickable roster so it can no longer guard
  a safe or be selected in `GamePickerScreen`.
- Keep the registry entry so historical loadouts/attacks referencing it still
  render and settle without crashing. Add a migration path: any *existing*
  equipped loadout containing a retired type must be transparently substituted
  (or the player prompted to re-equip) — a live safe must never become
  unplayable or unverifiable.
- Confirm `verifiableCount` / the composition rule in `submit_result` still
  holds for every safe after the roster change. **No safe may become forgeable.**

### 1d. Keep (tactile + skill, the healthy core)

Tap/pointer-native and skill-determined — these are the spine of the new roster:
`slider`, `keypad`, `memorymatch`, `sudoku`, `jigsaw`, `spotdiff`, `wire`,
`cipher`, `logic`, `wordsearch`, `numsequence`, `quickmath`, `combination`,
`colorcode`, `sequence`, `rotation`, `fingerprint`, `morse`, `timing`,
`reaction`, `pattern` (already drag-based), `breakout` (drag-based; verify its
ball physics are deterministic).

---

## Section 2 — Add chess puzzles (new game: `chesspuzzle`)

A perfect fit for all three principles and for the security model.

- **Tactile:** tap a piece, tap its destination square. No keyboard.
- **Skill:** zero chance — the position is fixed and the solution is forced.
- **Server-verifiable:** the solution is deterministic given the puzzle, so this
  belongs in **verification class 1a** alongside `keypad`/`colorcode`/
  `combination` (see `_shared/lock-solutions.ts`). Derive the puzzle from
  `(seed, difficulty)`, submit the player's move(s) as the answer, and have the
  server recompute and compare. Do **not** trust client `passed`.
- **Difficulty ladder:** mate-in-1 (easy) → mate-in-2 (medium) → mate-in-3 or
  find-the-winning-tactic (hard). Map onto the existing 0..1 difficulty scale.
- **Puzzle source:** bundle a curated, license-compatible set locally (the
  Lichess puzzle database is openly licensed and rated — check and honour its
  licence, and record the attribution in the repo). Do not add a runtime
  dependency on a third-party API — puzzles must be available offline and
  identical client- and server-side for replay verification.
- Implement to the standard minigame contract
  (`{ difficulty, seed, onComplete }`), register it, and give it catalog
  metadata + a thumbnail motif like every other game.

---

## Section 3 — Progressive disclosure

Full feature set stays; it unlocks. Extend the existing `catalog.ts` /
navigation rather than inventing a parallel system, and persist progression
server-side (profile), not just in localStorage.

Proposed ladder — adjust if the code suggests better seams:

- **Tier 0 — new player.** Bottom nav shows **Safe** and **Heist** only.
  Loadout is pre-filled with three of the simplest tap games (suggest
  `keypad`, `slider`, `memorymatch`). First heist is against a soft practice
  bot. Insurance, Create, Marketplace, and the full game picker are hidden.
- **Tier 1 — after first completed heist (win or lose).** Unlock **Security**
  (full game picker + difficulty tuning) and the History tab.
- **Tier 2 — after 3 completed heists.** Unlock **Insurance** and
  **Marketplace** (equip community locks).
- **Tier 3 — after 5 completed heists, or first successful breach.** Unlock
  **Create / AI Workshop** (building your own games).

Requirements:

- Each unlock must be **announced** — a brief, skippable moment ("Marketplace
  unlocked"), not a silent nav change.
- Show locked tiers as visibly locked with the unlock condition, so players know
  depth exists. Don't hide the game's ambition, just stage it.
- Existing players (anyone with heists already recorded, e.g. my account) must
  be grandfathered to full access — never regress someone to Tier 0.
- The gating is **presentation only**. Do not gate any server-side capability;
  a determined API caller may still hit any endpoint, and the security model
  must not depend on the UI hiding things.

---

## Section 4 — Constraints (non-negotiable)

- **Do not regress security.** The forgery guarantee in `PROGRESS-SECURITY.md`
  holds: no safe breachable with a forged result, regardless of composition.
  Re-run the anti-cheat tests; add cases for the new roster and `chesspuzzle`.
- Keep `npm run build`, `npm run lint`, and the full test suite green
  (currently **311 passing**). Add tests for: the retired-game migration path,
  the unlock ladder (each tier shows/hides the right surfaces, grandfathering
  works), and `chesspuzzle` solution derivation + server verification.
- Touch-test claims must be **verified**, not asserted — exercise the games with
  pointer/touch events in tests, and state honestly which ones you could not
  fully verify.
- Deploy any changed Edge Functions and push migrations yourself; committing
  does not deploy.
- Work on branch `codex-rebuild`. Do **not** merge to `main` — I'll review and
  merge, which triggers the live Vercel deploy.
- Write `PROGRESS-TACTILE.md` documenting: the final keep/rework/cut decision
  for all 36 games with the reason for each, how retired games are migrated,
  the unlock ladder as built, and anything you could not verify.

## Section 5 — Order of work

1. `DslRunner` touch parity (unblocks the entire creator economy on mobile).
2. Roster audit + cut/rework decisions, with the safe-migration path.
3. Progressive disclosure ladder.
4. `chesspuzzle` (new game + class-1a server verification).
5. Tests, docs, deploy edge functions, commit.

If any decision is genuinely ambiguous (especially which games to cut), make the
call, ship it, and list it clearly in `PROGRESS-TACTILE.md` for me to review —
don't stall waiting on me.
