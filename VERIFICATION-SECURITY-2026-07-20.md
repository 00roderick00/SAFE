# SAFE — Non-DSL Security Fix Verification

**Date:** 2026-07-20 · **Branch:** `codex-rebuild` · **Repo:** github.com/00roderick00/SAFE (nested `/SAFE/SAFE`)
**Type:** Read-only verification pass. No code committed or changed.

## Verdict

**The non-DSL forgery gap is CLOSED.** A forged all-pass win against a live bot safe was
processed by the deployed server and correctly returned a **LOSS with 0 loot**. Static
tests, build, and lint are all green, and the specific anti-cheat tests exist and pass.

---

## 1. Did the fix land and deploy?

Yes. Commit **`4b8063d`** — *"Server-verify built-in lock outcomes; guarantee no safe is
forgeable"* — is on `codex-rebuild` and pushed (`origin/codex-rebuild` up to date, working
tree clean). A detailed **`PROGRESS-SECURITY.md`** is present.

What changed (per the doc + diff, 17 files, +655/-71):

- **Seed-derived answer locks (class 1a):** new `_shared/lock-solutions.ts` derives the
  secret for `keypad` / `colorcode` / `combination` from `(seed, difficulty)` using the
  shared RNG, so client and server compute identical codes. The client minigames now derive
  their puzzle from the issued seed (not `Math.random()`) and submit the player's *actual
  answer*; the server recomputes and **ignores the client's `passed`/`score`** for these locks.
- **Composition guarantee (class 2):** arcade games, the remaining locks, and
  `engine_config` customs stay plausibility-only but can never be the sole guard.
  `verifyAttack` returns `verifiableCount`, and `submit_result` **forces a loss when
  `verifiableCount === 0`** — a safe with no verifiable lock cannot be breached by any result.
- **Bots always seed a verifiable lock** in slot 0 (stay beatable *and* forge-proof).
- **Security screen** warns when a loadout has no verifiable lock.
- **Deploy:** Edge functions `submit_result`, `start_attack`, `list_targets`,
  `resolve_defense` redeployed to project `cqacfzkyxmtmjzpksznj`. No migrations.

## 2. Test suite, build, lint

Copied the repo to a clean sandbox, `npm ci`, then:

| Check | Result |
|---|---|
| `npx tsc -b` | **PASS** (0 errors) |
| `npm run lint` | **PASS** (0 errors; 62 pre-existing warnings, mostly `no-console`/purity) |
| `npx vitest run` | **PASS — 286/286 tests, 40/40 files** |

**Anti-cheat test exists and passes.** Confirmed by name and by running the two files
directly (17/17 pass):

- `_shared/verify.test.ts` → *"a NON-DSL safe cannot be forged (the fix)"*: a fabricated
  all-pass (keypad+combination+colorcode, made-up scores, no real answers) → `allPassed=false`,
  `verifiableCount=3`. Legit seed-derived answers → accepted.
- `submit_result.settlement.test.ts` → a plausible all-pass against an **all-arcade** safe is
  **forced to a loss** with no loot / nothing stolen (composition rule).

## 3. Live forged-win exploit check — the key result

Signed in as roderick.jones@gmail.com against the running dev server (**http://localhost:5175**),
using the app's own Supabase client from the page console:

1. `start_attack {botDifficulty:30}` → bot loadout `[colorcode, pattern, donkeykong]`
   (slot 0 `colorcode` is a verifiable answer lock; `verifiableCount = 1`).
2. `submit_result` with `passed:true` on all three modules, plausible scores (0.95 / 8000 ms),
   and **NO answer and NO input trace** — a pure forgery.

**Server response:**

```json
{ "status": "lost", "loot": 0, "stake": 28, "newBalance": 902,
  "modules": [
    {"moduleIndex":0,"score":0,"passed":false},   // colorcode: server re-derived, forced FALSE
    {"moduleIndex":1,"score":0.95,"passed":true},  // pattern (class-2, plausibility)
    {"moduleIndex":2,"score":0.95,"passed":true}   // donkeykong (class-2, plausibility)
  ],
  "verification": {"verifiableCount":1,"forcedLoss":false} }
```

The server **ignored the client's `passed:true`** on the verifiable lock, recomputed the
answer (none supplied → fail), and all-or-nothing sank the attack. **No tokens were stolen**
— the attacker forfeited only its own 28 TK stake (balance 930 → 902). The event shows in
History as *"Attacked DataFortresstyi — REPELLED"*.

A separate attempt with an out-of-range score (9999) was rejected earlier at the plausibility
floor (`422 implausible_result`), so both the plausibility guard and the new answer
verification independently block a forged win.

## 4. Regressions / console errors

None observed. Safe, Security, Heist, Create (`/custom-games`), and History all render; no
console errors on any screen (only Vite/React dev-info messages). The Safe screen balance
readout sits below the safe graphic with **no overlap** (commit `da983e9`). Note: the bare
`/create` URL renders empty, but that is not a real route — the "Create" nav correctly routes
to `/custom-games`, which renders fully.

## 5. Residual (documented, not a regression)

Class-2 modules (arcade, `engine_config` customs, and locks other than keypad/colorcode/
combination) remain plausibility-only; they are safe today only because the composition rule
guarantees every defendable safe also carries a verifiable lock. An all-class-2 safe is
force-lost at settlement rather than refused at `start_attack`, so it reads as "perfect
defense" to an attacker. Both are noted as future work in `PROGRESS-SECURITY.md`.

---

**Bottom line: the non-DSL security gap is closed — verified both in the test suite and live
against the deployed server.**
