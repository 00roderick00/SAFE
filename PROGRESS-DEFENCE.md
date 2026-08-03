# PROGRESS — Making defence real

Three fictions removed, one rule protected.

## What was fiction

1. **Exposure existed only in the browser.** `heistModeActive` /
   `heistModeExpiresAt` lived in the zustand store. No column recorded
   it and no Edge Function checked it, so every safe was attackable at
   any time whether or not its owner was raiding. The core bargain —
   *you can only be raided while you are yourself raiding* — was not
   enforced anywhere.
2. **Defence was a coin flip that minted tokens.** `resolve_defense`
   fabricated raids: `Math.random() > ATTACK_FIRE_CHANCE` decided
   whether an imaginary attacker appeared, rolled a fake skill value
   against the loadout, and then wrote **real ledger entries** for the
   invented outcome. No genuine player attack ever reached it.
3. **Defence never appeared in History as a real event**, because there
   were no real events.

## 1. Server-enforced exposure

`safes.exposed_until timestamptz` is the single source of truth
(migration `20260802120000`).

- **Written only by `set_exposure`** (new Edge Function). The client
  sends `{exposed: boolean}` and nothing else; the window length is
  derived server-side from `ECONOMY.heistDuration`, so a tampered
  client can't grant itself a shorter exposure (same raiding rights,
  less risk) or a longer one.
- **`start_attack` refuses an unexposed defender**: `409
  target_not_exposed`, returned *before* the attack row is inserted and
  *before* the stake is debited — the same pre-debit pattern as the
  `unsupported_module_types` guard. A test asserts the guard's position
  in the file precedes both the insert and the debit.
- **`list_targets` lists only currently-exposed real players.** Bots are
  unaffected and keep backfilling, so the list never empties.
- **`search_targets`** shows an unexposed player with
  `unattackableReason: 'not_exposed'` rather than hiding them — same
  principle as the cooldown case ("Dave's vault is recovering" beats
  "not found").
- **Backfill:** existing safes get `NULL` — nobody starts exposed. That
  is the correct default and strands nobody: any player can expose
  themselves at will, and the target list stays full of bots meanwhile.

The public snapshot view was recreated to carry `exposed_until` so the
filter can run. It still exposes no email and no user id.

## 2. Real defence reporting

`resolve_defense` is now a **pure reporting endpoint**. It performs no
writes at all — no ledger, no insert, no update, no upsert, no delete,
no RPC (asserted by test). Its only source is the `attacks` table:

- in-flight = rows where this user is the defender and `status =
  'pending'`;
- resolved = rows settled since the client's last check.

Outcomes are read from the row that `submit_result` already decided
(`row.status === 'won'`). This endpoint reports; it does not adjudicate.
Deleting it would not change a single token movement.

Defence events land in the defender's History via
`buildDefenseEventFromAttack`, keyed `defense-${attackId}` so
re-reporting can't duplicate a row. `success` is from the defender's
point of view (the row stores `won` when the *attacker* breached).

## 3. Live warning while exposed

`useDefenseWatch` polls `resolve_defense` every 5s **only while
exposed**, and stops the moment the window closes or the component
unmounts — no background battery drain. Polling, not Realtime:
simpler, and no RLS questions about who may subscribe to whose rows.

`UnderAttackAlert` shows "*trevor.mentis* is cracking your vault" as a
slim bar pinned above the bottom nav — deliberately not a modal, so it
never obscures the target list or blocks the attack flow while the
player is mid-raid themselves. It respects `useReducedMotion` (the
pulse is dropped, the alert stays).

**On lock-by-lock progress:** not built, deliberately. There is no
channel for it — `start_attack` opens the row and `submit_result`
closes it, with nothing in between. Adding one would mean trusting the
*attacker's* client to tell the defender how frightened to be. The
alert shows elapsed time and the defender's own lock count, which are
both server-known facts. Everything here is cosmetic and can never
influence settlement.

## 4. Exit closes the door; it does not cancel

Exiting exposure clears `exposed_until`, so **no new attacks can
begin**. That is the whole benefit.

It does **not** cancel, pause or refund a raid already in flight. Those
rows keep their pending status and settle normally through
`submit_result`, which never consults exposure at all (asserted by
test). Once a stake is committed, the contest resolves — win or lose.

`set_exposure` returns `inFlightAttacks` so the UI can be honest rather
than implying safety:

> **Exposure closed.** No new raids can start against your vault. But
> **2 raids already underway will still play out** — once a raider has
> committed their stake, the contest finishes either way.

No escape hatch was built, on purpose. Cancelling in-flight raids would
hand all the upside of raiding to whoever bails fastest, turn every
exchange into a reflex contest that a trivial auto-bail script always
wins (directly contrary to `ANTI-AUTOMATION.md`), and grief an attacker
who has already committed a stake.

## Security posture unchanged

The forgery guarantee, the composition rule and `verifiableCount` are
untouched. Exposure gates *whether a contest may start*; it has no say
in *who wins*. `verify.ts` contains no reference to exposure, and
`submit_result` still forces a loss when `verifiableCount === 0`.

## Verified live (production, read-only)

Called the deployed functions with a real signed-in session:

- `list_targets` → 15 targets, **0 real players**, 15 bots. All six other
  real safes are currently unexposed and were correctly excluded, and
  the list still filled.
- `resolve_defense` → returns only `{checkedAt, exposed, exposedUntil,
  balance, inFlight, resolved}`. None of the fabricated fields
  (`attacked`, `attackerName`, `moduleResults`) exist any more; no
  tokens moved.
- Migration applied; `exposed_until` present on all 7 safes, all `NULL`.

## Verified live (production, full round trip through the real UI)

The deployed frontend on `main` doesn't carry this code yet, so this was
run locally against the live backend with a real signed-in session:

| Step | Result |
|---|---|
| Click "Expose for 10 minutes" | `exposed_until` written server-side to now + 10 min (`21:51:51`) |
| While exposed | `resolve_defense` returns `{exposed: true, inFlight: [], resolved: []}` — real state, no fabrication, no token movement |
| Click "Exit exposure" | `exposed_until` → `NULL`, returned to the vault; no notice shown, correctly, because there were 0 raids in flight |
| After exit | **0 `resolve_defense` calls in 16 s** (fetch instrumented) — polling genuinely stops, no background drain |
| Throughout | 0 of 7 safes exposed before and after; the account was left exactly as found |

One transient `resolve_defense` non-2xx fired on the very first poll —
a cold start on the just-deployed function. It did not recur over
subsequent cycles, and the hook swallowed it without inventing an
outcome, which is the behaviour `a failed poll never invents an outcome`
asserts.

## NOT verified — needs two live accounts

I deliberately did **not** exercise these against production:

- **The `409 target_not_exposed` refusal end-to-end.** Verifying it
  means calling `start_attack` for real; if the guard were broken that
  would debit a real stake from your balance without asking. It is
  covered by unit tests (including that the guard precedes both the
  insert and the debit in the code path), but not by a live call.
- **In-flight settlement after exit.** Needs a second account to start
  a raid, then the first to exit exposure mid-raid, then confirm the
  raid still settles correctly for both sides. Covered by tests that
  assert `submit_result` never reads exposure and `set_exposure` never
  touches attack rows — but the full two-player choreography is
  unverified.
- **The live warning firing on a genuine inbound raid.** The polling,
  history-writing and de-duplication are unit-tested against mocked
  payloads; nobody has actually watched the banner appear because that
  needs a second player attacking you.

## Tests

`_shared/exposure-defence.test.ts` (18) — exposure is server state; the
window is derived from `ECONOMY.heistDuration` and never from the body;
the pre-debit position of the guard; list filters on a live window while
bots still backfill; `resolve_defense` has no randomness, no writes and
reads outcomes rather than deciding them; exit clears only the window
and reports what keeps running; `submit_result`/`verify` never mention
exposure.

`services/useDefenseWatch.test.tsx` (11) — no polling when unexposed or
signed out, polling while exposed, **stops** when exposure ends and on
unmount, in-flight surfaced, empty report writes nothing, a failed poll
never invents an outcome, defence events land in History and don't
duplicate.

Suite **576 passing**, build + lint green.

## A bug the tests caught

`useDefenseWatch` originally depended on the `session` object. `useSession`
returns a fresh object each render, so the effect re-ran every render —
and because the effect sets state, it span forever. It hung the whole
test suite. It now depends on `session.user.id`, a stable primitive, and
the not-exposed branch only clears state when there is something to
clear.
