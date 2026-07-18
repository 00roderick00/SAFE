# Testing Findings #2 — Live two-account attack/royalty test

Completed the two-account test that was previously blocked (signed in a real second account, `trevor.mentis`, and attacked the first account `roderick.jones`, whose safe has two live custom games equipped: Frostbite Maze (engine) + Warden Run (DSL)). This surfaced serious issues in the **attack/win path** that unit tests did not catch because they exercise the happy path in isolation.

## What works (verified live)
- Attacking a **real** player's safe serves that safe's **actual custom-game loadout** (both custom modules came back on `start_attack`, `custom:true`).
- Play counts increment correctly: both equipped games went `plays 0 → 1`; the unequipped "Inject" stayed 0.
- The royalty computation **attributes to the right creator and games** (`customGameIds` = the two equipped games).
- **Losses resolve correctly** (status `lost`, stake forfeited, defender earns a defense fee).
- Balances remain server-authoritative (can't be edited directly — still true from Phase 2).

## P0 — Attack WIN path is both broken and insecure

### P0.1 (SECURITY) — `submit_result` accepts fabricated wins
Submitting `{passed:true, score:0.85, timeSpent:18000}` for **every module — without playing anything** — was validated as a **win** (`outcome:"won"`, loot 291.9 computed). `_shared/plausibility.ts` only rejects *physically impossible* claims (perfect score under a min-time floor, score out of 0..1). It never verifies the game was actually played, so any attacker can POST `passed:true` for all modules and take any safe. This defeats "games guard safes."
- **Fix:** server-side **deterministic replay from the issued seeds**. The DSL runtime is already deterministic (calibration runs it headless) — reuse it to recompute the true result server-side and ignore the client's `passed`/`score`. For seed-based lock games, replay likewise. For non-deterministic arcade games, require and replay an **input trace**, or gate those games out of real-stake defense until replayable.
- Note: this reframes the earlier "uncheatable" result — *balances* can't be edited, but *attack outcomes* are self-reported and only sanity-checked, which is the bigger hole.

### P0.2 (FUNCTIONAL) — winning attacks don't persist
Even setting aside the fabrication: the `won` response was returned, but the `attacks` row stayed **`pending`**, **no `attack_loot` ledger entry** was written, loot was **not** credited to the attacker or debited from the defender, and the pending attack now **lingers** (which blocks the attacker from starting new attacks — the old dangling-pending bug returns). Losses persist fine; only the **win branch fails to commit** its status/loot/royalty writes.
- **Fix:** trace the win branch in `supabase/functions/submit_result/index.ts` — the multi-step loot + creator-royalty + defender-debit writes likely error and abort before `status='won'` is set. Wrap the resolution in a single transaction/RPC so it's all-or-nothing, and return an error (not a fake `won`) if it can't commit.

## P1 — Real players never appear as attack targets
The heist UI renders **client-generated bots** (`generateBotFeed` in `gameStore`), not the server `list_targets`. Verified: `list_targets` returned `roderick.jones` as target **#1** (`isBot:false`), but the on-screen list was 15 unrelated bots (BrutalBox…, none in the server response). Because real safes are the only ones carrying custom games, **creator royalties can never fire through normal play** — the entire creator economy is unreachable from the UI.
- **Fix:** render `list_targets` output as the source of truth; only fall back to client bots if the fetch genuinely fails (and surface that state). Confirm `api.fetchTargetList` isn't erroring silently.

## P1 — Loss royalties floor to zero
On a loss, creator royalty = 2% of stake. For typical stakes (16–35 tokens) that's 0.3–0.7 → **floors to 0**. Verified live: `creatorRoyalty {perCreator:0, total:0}` on a 16-stake loss. Since attacks on well-defended safes are *usually* losses, creators earn essentially nothing.
- **Fix:** rethink the creator economics — a higher rate, a flat per-play micro-royalty, or accumulate fractional royalties and pay out at whole-token thresholds. (Win royalty does pay: a fabricated win computed `perCreator:5`, so the win side is non-zero — but see P0, wins don't persist.)

## Test pollution to clean up
- `trevor.mentis` has 1 dangling `pending` attack (from the failed win) that will block its next attack — resolve/abandon it (`update attacks set status='abandoned' where status='pending'`).
- `roderick.jones` balance drifted (+ defense fees from trevor's losses); play money, no action needed.

## Bottom line
The AI-builder half of the product (generate → validate → calibrate → moderate → marketplace → equip) is solid and verified. The **attack/settlement half is not launch-ready**: wins don't pay out or persist, and outcomes aren't actually verified server-side (fabricated wins pass). P0.1 + P0.2 should be the top priority before any real-stakes use.
