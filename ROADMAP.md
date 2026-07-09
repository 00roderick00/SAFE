# SAFE — Full Review & Pathway to MVP

*Review of github.com/00roderick00/SAFE — July 2026*

## Verdict

A polished, well-typed client-only prototype with strong bones: 36 minigames (~8,250 lines), a thoughtfully specced economy, and a clear core fantasy (games guard safes). But the core attack loop is broken, several headline features are mockups, and everything is client-side and therefore cheatable. It's roughly 60% of an MVP — the remaining 40% is fixing the loop and adding a server.

## What works

- **36 minigames** across 3 categories (12 locks / 12 arcade / 12 puzzle), each self-contained, touch+mouse support, framer-motion polish, continuous 0–1 difficulty.
- **Economy design** (`src/game/economy.ts`, `constants.ts`): stake fee `F = √V·(a + b/(1+S))`, 30% loot fraction, 15k loot cap, 8% platform cut, MMR system, insurance presets. The formulas are sensible.
- **Good stack**: React 19, Vite 7, Tailwind 4, Zustand 5, strict TypeScript, Vercel + GH Pages deploys.
- **Bot personality system** (`matchmaking.ts`): 9 archetypes, target-attractiveness scoring — good foundation for liquidity bots later.

## What's broken (critical)

1. **Attacks crash for 24 of 36 module types.** `AttackScreen.tsx:153` calls `generateMiniGameConfig()` unconditionally on every render; `modules.ts:186` throws for any type except `pattern`/`keypad`/`timing`. Bots pick loadouts from all 36 types, so most attacks crash before a game renders. No error boundary.
2. **Only 12 of 36 games are wired into combat.** `AttackScreen` hand-writes render branches for 12 types; the other 24 are playable in preview only — dead in the core loop.
3. **Two contradictory breach models.** Live model (`heistStore.completeAttack`) is all-or-nothing; the spec model (`calculateBreachResult`, 0.65 threshold, logistic success probability) is never called. The "success chance" shown on target cards is disconnected from how wins are decided.
4. **Insurance never pays out.** Premiums are deducted; `processInsuranceClaim` is never invoked; `simulateDefense` hardcodes `insurancePayout: 0`.
5. **Defense is a 5% coin flip**, not gameplay — and only ticks while you're in heist mode.

## What's fake

- **Multiplayer**: zero networking. All opponents are procedural bots; the leaderboard is 20 hardcoded names with random scores.
- **AI bots**: a real Anthropic API call path exists in `aiBotService.ts` but is never configured or invoked; only local `Math.random` heuristics run.
- **Custom game "AI"**: `CustomGameScreen` fakes an AI rating with regex keyword matching behind a 1.5s `setTimeout`. `builtGameCode` is never set; no custom game is ever built or playable. `CustomGameSuggest.tsx` is a second, unused duplicate of the same fake.

## Code health

No tests, no test runner. README is unmodified Vite boilerplate. Dead code throughout `economy.ts` and `aiBotService.ts`. The 36-type list is defined in 3 places. `simulateDefense` uses old fee params `(0.8, 1.6)` that contradict `ECONOMY.feeParams (0.5, 1.0)`. All state is unsigned localStorage — balance, MMR, and any game result can be edited or spoofed from devtools. Fine vs bots; fatal for any real economy.

---

# Pathway forward

## Phase 1 — Fix the core loop (client-only, ~1–2 weeks)

1. **Unify the minigame contract.** One interface: `{ difficulty: number, seed: string, onComplete(result) }`. Migrate the 3 legacy config-based locks. Build a registry (`Record<ModuleType, Component>`) and replace `AttackScreen`'s branch chain and `generateMiniGameConfig` crash with registry dispatch + an error boundary. This single refactor fixes bugs 1 and 2 and is the foundation for user-generated games later.
2. **Pick one breach model.** Keep all-or-nothing (skill-based feels better and matches the design comments); use `economy.ts` scoring for payout size only. Delete the dead model or the misleading success-chance UI.
3. **Make defense real.** Async defense: when a bot attacks, resolve it against your loadout's actual difficulty scores (deterministic, from `modules.ts` weights), not a coin flip. Optionally let the player "replay" notable defenses.
4. **Wire insurance payouts or cut insurance from MVP.** A paid feature that never pays out is worse than absent.
5. **Hygiene**: single source of truth for module types, delete dead code, fix the fee-param mismatch, real README, Vitest with tests for `economy.ts` + a render smoke test per minigame (would have caught the crash).

## Phase 2 — Real backend (required for a true MVP, ~3–4 weeks)

Client-only tokens can never be earned or trusted. Recommended: **Supabase** (auth + Postgres + edge functions + realtime) — fastest path for a solo dev.

- Server-authoritative balances, stakes, and loot. Client requests an attack session; server issues module list + RNG seeds; client submits results; server validates (time floors, score plausibility, seed-deterministic replay for replayable games).
- **Async PvP**: attack snapshots of real players' loadouts — no live netcode needed, which is the right scope. Bots backfill target liquidity when player density is low.
- Real leaderboard, attack history, and notifications from the DB.
- Anti-cheat basics: rate limits, per-target cooldowns (constants already exist), server-side session tokens.

## Phase 3 — AI-first user game builder

This is the differentiator, and it should be AI-first. Three options, in ascending ambition:

**Option A — AI-configured templates (build first).** Parameterize the existing 36 games deeply (grid sizes, speeds, themes, rule toggles, win conditions). An AI agent converts a user's natural-language design ("a maze where walls shift every 5 seconds, neon theme") into a validated config JSON rendered by existing engines. Cheap, safe, every output is playable and balance-checkable, ships in weeks on top of the Phase 1 registry.

**Option B — AI-composed game DSL (the real product).** Define a small declarative DSL: entities, movement rules, collision effects, win/lose conditions, timers. One sandboxed runtime executes it; AI compiles user descriptions to DSL. Far larger design space than templates while staying deterministic, replayable server-side (anti-cheat), and impossible to inject code through. This is where "design any game" becomes true without the risks of Option C.

**Option C — AI-generated freeform code.** LLM writes JS run in a sandboxed iframe/worker. Maximum flexibility, but hard problems: sandbox escapes, undetectable difficulty exploits, no server-side replay, moderation burden. Skip for MVP; revisit once A/B prove demand.

**Non-negotiable regardless of option — calibration.** The exploit to design against: a creator makes an unwinnable game and puts it on their safe = untouchable tokens. Every user game must pass automated calibration before it can guard a safe: a headless bot (or AI agent) plays it N times and it must land in a target solve-rate band (e.g. 30–70% at stated difficulty). Fail calibration → not deployable. This also gives an honest difficulty score to feed the economy formulas.

**Creator economics.** Creators earn a royalty (e.g. a share of the 8% platform cut) each time their game is staked against, plus a bonus when it successfully defends. Popularity marketplace: browse, rate, and equip community games. This closes the loop — design games → others use them → you earn tokens — and gives the platform UGC network effects.

## Phase 4 — Economy hardening & launch

- Balance sinks/sources (loot cap, fees, insurance margin) with real telemetry.
- One caution worth flagging early: **stake-to-win mechanics with tokens that ever become cash-convertible walk into gambling regulation** in most jurisdictions. Keep tokens non-cashable for MVP; get legal advice before any real-money bridge.

## Suggested order of work

| # | Work | Outcome |
|---|------|---------|
| 1 | Minigame registry + unified contract + error boundary | All 36 games playable in attacks; crash fixed |
| 2 | One breach model, real defense, insurance wired or cut | Coherent core loop |
| 3 | Tests + hygiene + README | Stable base |
| 4 | Supabase backend, async PvP, server validation | Real, uncheatable MVP |
| 5 | Option A: AI template builder + calibration pipeline + royalties | UGC differentiator live |
| 6 | Option B: game DSL | "Design any game" fulfilled |
