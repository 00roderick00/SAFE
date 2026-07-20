# PROGRESS — Closing the outcome-verification gap in `submit_result`

## Root cause

`submit_result` decides win/loss from the client's submitted per-module
results. Only **DSL custom games** were verified server-side (deterministic
replay of a recorded input trace). Every other module — the built-in
locks and `engine_config` custom games — was only run through
`_shared/plausibility.ts`, which sanity-checks *time* and *score* but
never confirms the game was actually beaten.

The reason non-DSL locks couldn't be verified: each lock generated its
secret **client-side with `Math.random()`** (`_shared/modules.ts`,
`ColorCodeLock`, `CombinationLock`, …). The server never knew the secret,
so it could only trust the self-reported score.

**Exploit:** a safe made entirely of non-DSL modules could be breached by
POSTing `passed: true` with fabricated (but plausible-looking) scores —
the server had nothing to check against. Real players' tokens were
stealable with a forged request.

## The fix — two verification classes + a composition guarantee

### Class 1a — deterministic-answer locks (now server-verified)

`keypad`, `colorcode`, `combination` have a single correct solution
derivable purely from `(seed, difficulty)`.

- **`_shared/lock-solutions.ts`** (new, pure, shared client+server):
  `deriveLockSolution(type, seed, difficulty)` builds the secret from the
  same `createRng(seed)` both sides already share, so client and server
  compute **identical** codes. `verifyLockAnswer(...)` recomputes the
  secret and compares.
- The **client** minigames now derive the puzzle from the issued `seed`
  (not `Math.random()`) and submit the **player's actual answer**
  (`MiniGameResult.answer` → `submit_result` payload). See `Keypad.tsx`,
  `ColorCodeLock.tsx`, `CombinationLock.tsx`.
- The **server** (`_shared/verify.ts`) recomputes the expected answer and
  passes the module iff it matches exactly. **The client's
  `passed`/`score` are ignored** for these locks.

### Class 1b — DSL custom games (unchanged)

Still verified by deterministic replay of the input trace
(`replayDslTrace`). The phase-3b round-trip and existing verify tests are
untouched and still pass.

### Class 2 — skill/score games (not independently verifiable)

Arcade games (`pacman`, `snake`, …), the remaining locks (`timing`,
`pattern`, `sequence`, `slider`, `rotation`, `wire`, `fingerprint`,
`morse`, `safedial`) and `engine_config` custom games have no single
answer and no replay this pass, so they still use plausibility. They can
**never be the only thing guarding a safe** — see the composition rule.

### Composition rule (rule 2, option a — enforced server-side)

Because breach is all-or-nothing, a forged result can only breach a safe
if *nothing* in it is server-verifiable. So:

- **`verifyAttack` returns `verifiableCount`** = number of class-1a/1b
  modules in the loadout.
- **`submit_result` forces a loss** whenever `verifiableCount === 0`,
  regardless of the client's claim (`clientWon && !noVerifiableLock`). A
  safe with no verifiable lock therefore **cannot be breached by any
  result, forged or not** — no tokens are ever moved. This is the
  authoritative guarantee.
- **Bots always get a verifiable lock**: `generateBotLoadout` seeds slot 0
  with one of the verifiable lock types, so bots stay both beatable *and*
  forge-proof (and `list_targets` + `start_attack` regenerate identically
  from the seed).
- **Client Security screen** surfaces a clear "This safe can't defend real
  stakes" warning (with a fix action) when the equipped loadout has no
  verifiable lock, so real defenders don't accidentally sit in the
  auto-forfeit state. Default loadouts include `keypad`, so they're
  already covered.

**Why option (a):** it's the strongest guarantee with the smallest blast
radius — enforcement lives at the single authoritative point
(`submit_result`), needs no new endpoint or migration, and can't be
bypassed by a client that skips the warning.

## Guarantee

> No safe can be breached with a forged result, regardless of its lock
> composition.

- Safe contains ≥1 answer lock or DSL game → a forger fails that module's
  recomputation/replay → all-or-nothing sinks the attack.
- Safe contains **only** class-2 modules → `verifiableCount === 0` →
  `submit_result` forces the attack to a loss.

## Tests (new; fail on the old code, pass now)

- `_shared/verify.test.ts`:
  - Fabricated all-pass against a **non-DSL** safe (keypad+combination+
    colorcode, made-up scores, no real answers) → **rejected**
    (`allPassed=false`, every row `method:'answer'`, not passed). *(Old
    code passed it via plausibility.)*
  - Plausible-but-wrong answers → rejected.
  - Legitimately-solved submission (correct seed-derived answers) →
    **accepted** (`method:'answer'`).
  - Class-2 module still gets the plausibility fraud floor (5 ms perfect →
    `implausible_result`).
  - `verifiableCount` reported (3 for an all-answer-lock safe; 0 for an
    all-arcade safe).
- `submit_result.settlement.test.ts`: a plausible all-pass against an
  **all-arcade** safe is **forced to a loss** with no loot / nothing
  stolen. *(Old code paid it out.)*
- `_shared/lock-solutions.test.ts`: derivation determinism, alphabet/
  length per type, answer accept/reject, `normalizeAnswer`, composition
  counting.

Full suite: **286 passing**, build + lint green.

## Deploy

No migrations (all logic is in the Edge Functions). Redeployed to project
`cqacfzkyxmtmjzpksznj`: `submit_result`, `start_attack`, `list_targets`,
`resolve_defense` (the last three so bot loadouts stay in lockstep with
the new `generateBotLoadout`).

## Still NOT fully replay-verified (documented residual)

- **Class-2 modules** (arcade games, `engine_config` customs, and the
  locks not listed in Class 1a) are plausibility-only. They are safe today
  because the composition rule guarantees every defendable safe also has a
  verifiable lock, but they are not *independently* proven. Next steps to
  close this fully: (a) add seed-derived verification to the remaining
  deterministic locks (`sequence` is multi-round; `pattern` is a
  connected-walk secret — both need per-round/per-step modelling), and
  (b) give arcade `engine_config` games an input-trace replay like DSL.
- The composition rule currently **forces a loss** for an all-class-2
  safe rather than blocking it at `start_attack`. That's fully secure
  (nothing can be stolen) but means such a safe reads as "perfect
  defense" to an attacker; a future refinement could refuse the attack up
  front (and filter it from the target list) so no stake is wagered.
