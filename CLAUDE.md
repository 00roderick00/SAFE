# SAFE — Project Context

A game where players guard virtual token safes with minigames and raid other players' safes by beating theirs. React 19 + Vite 7 + TypeScript + Tailwind 4 + Zustand 5 + framer-motion. Client-only for now (no backend); state persists in localStorage via zustand persist.

**Read ROADMAP.md first** — it contains the full code review and the phased plan. Work through it in order unless told otherwise.

## Commands

- `npm install` — setup
- `npm run dev` — Vite dev server
- `npm run build` — `tsc -b && vite build`
- `npm run lint` — ESLint

No test runner yet — adding Vitest is part of Phase 1.

## Architecture

- `src/screens/` — routed screens; `App.tsx` gates on onboarding, routes via react-router 7
- `src/store/` — Zustand stores: playerStore (balance/loadout/MMR), gameStore (bot feed/history), heistStore (active attack, not persisted), socialStore (fake leaderboard), customGameStore (mock UGC)
- `src/game/` — economy.ts (pure formulas), constants.ts (all tunables + 36 module configs), modules.ts (legacy config/scoring for 3 original locks), matchmaking.ts (bot generation)
- `src/components/minigames/` — 36 games, registered in index.ts

## Known critical bugs (Phase 1 targets)

1. `AttackScreen.tsx:153` calls `generateMiniGameConfig()` unconditionally; `modules.ts` throws for all module types except pattern/keypad/timing → attacking most bots crashes. No error boundary.
2. Only 12 of 36 minigames have render branches in AttackScreen; the other 24 never appear in combat.
3. Two contradictory breach models: live all-or-nothing in `heistStore.completeAttack` vs the never-called weighted model in `economy.ts` (`calculateBreachResult`). Target-card "success chance" UI reflects the dead model.
4. Insurance premiums are charged but `processInsuranceClaim` is never called — payouts always 0.
5. `gameStore.simulateDefense` hardcodes old fee params (0.8, 1.6) contradicting `ECONOMY.feeParams` (0.5, 1.0); defense is a 5% coin flip, not gameplay.
6. Module type list duplicated in types/index.ts, matchmaking.ts, aiBotService.ts.

## Conventions

- Minigame contract (target state after Phase 1 refactor): `{ difficulty: number, seed: string, onComplete(result: MiniGameResult) }` dispatched via a single registry — no per-screen switch chains.
- All economy math lives in `src/game/economy.ts` as pure functions; don't re-implement loot/fee math inline in stores or screens.
- All tunables live in `src/game/constants.ts`.
- Custom-game "AI rating" in customGameStore/CustomGameSuggest is fake (regex + setTimeout) — do not extend it; it gets replaced by the real AI builder in Phase 3.
