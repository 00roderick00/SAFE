# SAFE

A game about guarding a virtual token safe with minigames, and raiding other players' safes by beating theirs. Currently a client-only prototype — 36 minigames, an economy layer, and enough scaffolding for a working core loop against procedurally-generated bots. See [ROADMAP.md](ROADMAP.md) for what still needs to happen to turn this into a real, multiplayer, uncheatable product.

## Core fantasy

- You have a safe with tokens in it.
- You lock it behind 1–3 minigames of your choice, at difficulties you set.
- Enter **heist mode** and other players' (currently: bot) safes become attackable.
- To breach a safe you must beat *every* lock on it. Beat them all → steal a fraction of the balance. Fail any → forfeit your stake.
- While your safe is exposed, other players can attack you. If they beat all your locks, they take a share of your balance. If insurance is active, it reimburses part of the loss.

## Stack

- **React 19** + **Vite 7** (SPA, client-only for now)
- **TypeScript 5** in strict mode
- **Tailwind 4** for styling
- **Zustand 5** for state (`playerStore`, `gameStore`, `heistStore`, `socialStore`, `customGameStore`), persisted to `localStorage`
- **framer-motion** for game animations
- **react-router 7** for routing

## Commands

```sh
npm install         # first time only
npm run dev         # start Vite dev server on localhost:5173
npm run build       # tsc -b && vite build
npm run lint        # ESLint
```

There is no test runner yet — Vitest + smoke tests are the next hygiene step.

## Project layout

```
src/
  screens/          Routed screens (App.tsx routes via react-router 7)
  store/            Zustand stores; heistStore is intentionally not persisted
  game/
    constants.ts    All tunables — economy, module config for 36 games, bot names
    economy.ts      Pure formulas: fees, loot, security score, insurance, etc.
    modules.ts      Per-module difficulty→config generation + scoring helpers
    matchmaking.ts  Bot safe generation + target attractiveness score
  components/
    minigames/      36 minigames + registry + MiniGameHost + error boundary
    ui/             Design-system primitives
    safe/           Safe visualization
  services/
    aiBotService.ts Local heuristics + (unwired) Claude API path for richer bots
  types/index.ts    Shared type declarations
```

## Minigame contract

Every minigame is a component with the shape:

```ts
({ difficulty, seed, onComplete }: {
  difficulty: number;             // 0..1
  seed: string;                   // reserved for deterministic replay in Phase 2
  onComplete: (result: MiniGameResult) => void;
}) => JSX.Element
```

They register in `src/components/minigames/registry.ts`, keyed by `ModuleType`. Screens dispatch through `<MiniGameHost>`, which does the lookup and wraps the game in an error boundary so a bad module fails a lock rather than crashing the app.

## Current status (July 2026)

Working:
- All 36 minigames are playable inside real attacks (previously only 12 were wired in).
- Deterministic all-or-nothing breach model both directions (attack and defense).
- Insurance premiums are charged **and** paid out on breach.
- Attack economy (fees, loot, platform cut, principal floor, cooldowns) is fully computed from `economy.ts`.

Faked / stubbed:
- **Multiplayer is bots**. There's no network layer. The leaderboard is 20 hardcoded names + random scores.
- **AI bot pathways exist** in `aiBotService.ts` but the Anthropic API call is never configured; only local heuristics run.
- **Custom-game AI rating** in `customGameStore` / `CustomGameSuggest` is regex keywords behind a `setTimeout`. No custom game is ever built or playable. This gets replaced by the real AI builder in Phase 3.
- **All state is unsigned localStorage** — balances, MMR, and results are trivially editable from devtools. Fine for solo play against bots, unacceptable for a real economy. Phase 2 moves state to a server.

See [ROADMAP.md](ROADMAP.md) for the phased plan to Phase 2 (Supabase-backed real backend + async PvP) and Phase 3 (AI-first user game builder).

## Legal note

Stake-to-win token mechanics that ever become cash-convertible walk into gambling regulation in most jurisdictions. Tokens are non-cashable in this prototype and should stay that way until legal review before any real-money bridge.
