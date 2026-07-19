# UX / Gameplay Findings — codex-rebuild browser pass (2026-07-19)

Live walkthrough of every screen at desktop viewport (1568×694), signed in as
roderick.jones, including a full committed attack. Fixed items are already
committed; open items are prioritized for follow-up.

## Fixed in this pass ✅

1. **Safe screen: balance hidden behind lock slot 3.** `.tactical-vault__readout`
   (bottom 10.5%) and `.tactical-vault__lock--3` (bottom 1%, 50px) were both
   anchored bottom-center, so the lock badge covered the balance digits.
   Readout moved to bottom 21%, z-index above the slot. Verified live.

2. **Attack confirm sheet could render below the fold.** The "FINAL ATTACK
   CHECK" dialog is `position:fixed`, but it was mounted inside the screen's
   animating (transformed) subtree — a transformed ancestor becomes the
   containing block for fixed elements, so the sheet anchored to the page
   bottom (~1046px) instead of the viewport and looked like a dead click.
   Now portaled to `document.body`. Verified live.

3. **Breach clock was cosmetic.** The HUD countdown hit 0s and the minigame
   stayed playable forever (digits still accepted). AttackScreen now fails the
   current lock and settles the attack as a loss when the shared timer
   expires — matching the "stake is committed" copy.

4. **Lock chunk loading burned breach time.** Each minigame is a lazy chunk
   loaded only when its lock starts, with the clock running ("Loading lock
   mechanism…"). The registry now exposes `preloadMiniGames()` and
   AttackScreen warms every lock's chunk the moment the attack mounts.

5. **Last content row hidden behind the fixed bars.** Trailing padding only
   cleared the action bar, not action bar + nav (150px stacked). Now clears
   both.

6. **Security screen TEST/REPLACE buttons overlapped their icons** at desktop
   width (actions column was 200px for 4 buttons). Widened to 258px.

All 255 branch tests pass after these changes (two QA-contract tests updated
to match the intentional new padding + registry export).

## Open items, prioritized

- **P1 — History ignores server attacks.** The 31 TK loss from a live attack
  never appeared in History (client-side notifications only). Feed settled
  server attacks (attacker & defender side) into the history list, or read
  history from the `attacks` table.
- **P1 — No loss recap when abandoning.** Backing out mid-attack silently
  settles as a loss (balance just drops). Route abandons through the same
  outcome screen as a played loss ("Stake forfeited −31 TK").
- **P2 — Create/History screens still old theme.** Both use the pre-rebuild
  light-header styling and read as a different app; Custom Games renders
  near-invisible text on dark background in places. Restyle to the noir
  system (BreachHud/StateFrame vocabulary).
- **P2 — "Untouchable" tagline reads as "can't attack".** Bot flavor taglines
  ("Untouchable", "Vault of the void") sit right under the name where a
  status would be; players may read them as game state. Consider visually
  separating flavor text from status.
- **P2 — Rejected custom games display their raw prompt.** Own-games list
  shows moderation-rejected prompts verbatim (including offensive test data).
  Show a generic "Rejected: moderation" placeholder instead.
- **P3 — Verify mouse-wheel scrolling on real hardware.** Automated wheel
  events did not scroll (keyboard did); html/body/#root all use
  `height:100%` + `overflow-x:hidden` on body, which makes the scroll
  container ambiguous. If wheel scroll misbehaves for real users, change to
  `min-height` and move overflow clipping to `html`.
- **P3 — First-attack onboarding.** The first minigame starts with only a
  one-line goal ("Reach at least 50% of the calibrated objective…"). A 2–3s
  "how this lock works" card per unfamiliar game (the briefing phase exists
  already) would soften the first-heist cliff.

## What plays well

The core loop reads dramatically better than the old build: the exposure
protocol interstitial explains the risk trade cleanly, dossier cards show
stake/gross/cut/net with lock previews and familiarity hints, the confirm
sheet states both outcomes explicitly, and the breach HUD keeps target,
lock rail, stake and net loot visible during play. Coverage analysis on the
Security screen (skill-type gaps) is a strong addition.
