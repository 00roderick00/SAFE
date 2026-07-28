# SAFE — Anti-automation design

**Status: design only. Nothing here is built.** This documents the threat model and
the layered response so it's ready when real value is at stake. The one thing worth
doing *before* then is cheap instrumentation (§5) — you cannot detect anomalies
without a baseline, and baselines take months to accumulate.

Not legal advice. The regulatory points need a gaming/privacy lawyer.

---

## 1. The threat

SAFE's economy is adversarial by construction: beating a lock takes value from
another player. Once tokens are worth money, a bot that reliably breaches safes is
a direct extraction pipeline. The attacker profile that matters is not one person
with a script — it's someone running many accounts, cheaply, continuously.

**What we already defend (and it isn't this).** The server-side verification work
(`_shared/verify.ts`, `PROGRESS-SECURITY.md`) proves an *outcome* is real: class-1a
locks recompute the seed-derived answer, class-1b DSL games replay the input trace,
and a safe with zero verifiable locks is forced to a loss. That stops **forgery** —
claiming a win you didn't play.

It does nothing against automation. **A bot that genuinely solves the puzzle passes
replay legitimately**, because it did in fact win. Forgery and automation are
separate problems and need separate answers.

---

## 2. Time pressure is the wrong lever

The intuition is that speed pressure favours humans. It's backwards: **a machine is
faster than a person at everything.** Making outcomes depend on speed selects *for*
automation. Any lock that rewards raw reaction time is a lock bots win by default.

The correct use of time is inverted — **too fast is a detection signal, not a
barrier**. That already exists in `_shared/plausibility.ts`:

- `MIN_TIME_MS_BY_TYPE` — per-type floors (`timing` 400 ms, `keypad` 600 ms,
  `slider` 1500 ms, …), `DEFAULT_MIN_TIME_MS` 3000 ms for arcade/puzzle games.
- A pass claimed below the floor is rejected as `implausible_result`.

Keep and extend that. Do **not** design new locks around speed.

A second-order signal matters more than the floor: **variance**. Humans have good
and bad attempts; their completion times form a wide, skewed distribution. Bots are
suspiciously *consistent*. Low intra-account variance over many plays is a stronger
tell than any single fast run.

---

## 3. Which locks are actually at risk

Ranked by how cheaply a bot beats them:

| Risk | Locks | Why |
|---|---|---|
| **Highest** | `chesspuzzle`, `sudoku`, `logic`, `cipher`, `numsequence`, `quickmath` | Purely computational. Stockfish solves mate-in-3 instantly and perfectly; a sudoku solver is a first-year exercise. Zero motor skill required. |
| **High** | `keypad`, `colorcode`, `combination`, `sequence`, `morse` | Deterministic answers; trivial once the state is read from the DOM. |
| **Moderate** | `memorymatch`, `wordsearch`, `spotdiff`, `jigsaw` | Solvable, but need more perception work; still DOM-readable. |
| **Lowest** | `slider`, `safedial`, `tetris`, `maze`, `breakout`, `pattern` | Continuous analog input. The bot must fake *plausible human motion*, not just compute an answer — a meaningfully harder problem. |

**The strategic tension worth naming:** the legal push toward "skill, not chance"
(to distance the product from gambling) drives the roster toward deterministic
puzzles — which are precisely the games automation dominates most completely. The
tactile-only direction (`TACTILE-REDESIGN.md`) accidentally pulls the other way and
is a genuine asset here.

**Implication for composition.** Just as `verifiableCount` guarantees no safe is
forgeable, consider an analogous rule at real-money launch: a safe defending real
stakes should contain at least one **motor-skill** lock, so a purely computational
bot cannot clear it end to end.

---

## 4. The architectural truth

Every signal below is collected on a client the attacker controls. A determined
adversary can forge any of it. This is the same lesson the forged-win exploit taught:
**never trust the client**.

So behavioural signals are **statistical deterrence that raises cost** — never proof.
They belong in a *scoring* system that flags accounts for review or restriction, not
in a hard block. A false positive on a real player is worse than several missed bots.

The only signals with cryptographic weight come from outside the page: **platform
attestation** (§6).

---

## 5. Instrument now (cheap, no behaviour change)

The highest-value thing to do before launch is start collecting a baseline. Detection
models are worthless without months of honest human data to compare against.

**Capture per module attempt, client-side, and send with the existing result payload:**

- **Timing distribution** — not just total `timeSpent`, but inter-event intervals:
  gaps between taps, dwell time per press, time-to-first-input.
- **Pointer geometry** — `PointerEvent.pressure`, `width`/`height` (contact area),
  `tiltX`/`tiltY` where available. Synthetic events typically report defaults
  (pressure exactly 0 or 0.5, zero contact area).
- **Motion quality** (drag locks especially) — path curvature vs straight-line,
  peak/mean velocity ratio, count of direction reversals (humans overshoot and
  correct), and jerk. Human pointing follows characteristic minimum-jerk profiles.
- **Event provenance** — `event.isTrusted`, and whether coalesced events are present.
- **Correction behaviour** — wrong taps before the right one, hesitation, backtracking.

**Store derived features, not raw event streams.** A dozen floats per attempt is
cheap, bounded, and far less privacy-sensitive than a full input recording. Raw
traces are already retained for DSL replay; don't duplicate them.

**Design constraints:**

- Purely additive and advisory. It must not affect settlement, and the payload must
  stay optional so an older client still works (same backward-compatibility pattern
  as `supportedModuleTypes`).
- Never let a missing/rejected telemetry blob cost a player their stake.
- **Privacy:** behavioural biometrics are personal data under GDPR and adjacent to
  special-category. Disclose it in the privacy policy before collecting, keep
  retention bounded, and keep it tied to gameplay integrity only. Get this reviewed —
  Illinois BIPA in particular carries statutory damages.

---

## 6. Build at real-money launch

In descending order of value per unit of effort:

**1. Platform attestation — the strongest practical lever.** Apple App Attest and
Google Play Integrity cryptographically assert that a genuine, unmodified build is
running on a real device. This kills cheap scaled botting, which is the variant that
actually threatens the economy. Note it requires native app wrappers; the current
build is a web SPA, so this is a platform decision, not just a feature.

**2. Behavioural anomaly scoring.** Feed §5 features into a per-account model.
Flag → shadow-restrict → manual review. Never auto-confiscate. Weight *consistency
across sessions* heavily, per §2.

**3. Economic throttles.** Heist rate limits, escalating cooldowns, stake caps per
window, and a minimum account age before high-stake targets unlock. This is the most
robust category because it doesn't require *detecting* the bot — it caps what any
account can extract, making automation unprofitable rather than impossible. Cheap to
build and hard to evade.

**4. Matchmaking segregation.** Suspected-automation accounts drift into a pool where
they predominantly face each other. Reduces harm to real players without a
false-positive ban.

**5. Withdrawal-time identity (KYC).** Verify identity at cash-out, which you will
need for AML compliance regardless. Puts friction at the one moment users accept it.

---

## 7. Explicitly rejected: camera / liveness during play

Rejected as a gameplay mechanic, for a reason that isn't obvious:

**A camera proves a human is present, not that a human is playing.** Someone sits in
frame while a script plays the game. It feels like strong verification and largely
isn't — it defeats casual cheating while leaving the scaled attacker untouched.

Against that: biometric data is special-category under GDPR; Illinois BIPA carries
statutory damages that have produced very large settlements; and it adds consent
flows, storage duty, vendor cost, meaningful player drop-off, and accessibility
exclusion.

The identity budget is better spent at withdrawal (§6.5), where it's legally required
anyway and where friction is expected.

---

## 8. Honest limits

You will not design a skill game a determined AI cannot beat. Every category above
is evadable by a well-resourced attacker: telemetry can be synthesised, attestation
can be attacked on jailbroken devices, rate limits can be spread across accounts.

The objective is not "unbeatable". It is:

> **Make automation cost more than it earns, and make the top of the ladder — where
> the money concentrates — expensive to fake.**

Layered, that is achievable. Any single measure sold as a solution is not.

## 9. Open questions

- Does going native (required for attestation) fit the product plan, or does the
  web-first distribution advantage outweigh it?
- Should motor-skill locks be *mandatory* on real-stake safes, mirroring the
  `verifiableCount` composition rule?
- What false-positive rate is acceptable before a flag restricts an account, and
  who reviews?
- Retention period for behavioural features, and the disclosure wording.
