# SAFE

SAFE is a neo-noir tactical heist game about building a three-lock vault, exposing it to attack, and breaching other players' defenses. Its primary loop is:

> Build defenses → expose your vault → select a target → crack every lock → win loot or lose the stake → upgrade and defend again.

The interface is optimized for a 390 × 844 mobile viewport and expands into a constrained game canvas with contextual desktop side space. The visual language uses matte graphite surfaces, circular secure geometry, triangular warning shapes, fractured breach treatments, and an acid-lime/amber/red-orange state system that is always paired with text, shape, or motion.

## Gameplay

- Equip three locks and tune each lock's continuous difficulty.
- Test one lock or the full defensive sequence before exposing the vault.
- Review exposure duration, insurance, and the amount potentially at risk before entering heist mode.
- Filter target dossiers by stake, net payout, difficulty, and familiar game types.
- Pay the displayed stake and crack every target lock before time expires.
- A complete breach awards the server-settled net loot. Any failed lock loses the displayed stake.
- Server-authoritative multiplayer state requires authentication; the interactive tutorial explains the gameplay before sign-in.

Target and settlement screens distinguish all economic values explicitly:

- **Stake**: the amount forfeited on a failed attack.
- **Gross loot**: the amount removed from the target before fees.
- **Platform cut**: the existing economy formula's fee.
- **Net payout / net loot**: the amount the attacker receives after the cut.

Economy constants and settlement formulas live in the existing client and Supabase economy modules and are not presentation tunables.

## Architecture

- React 19, TypeScript 5, React Router 7, Vite 7, Tailwind 4
- Zustand stores for client presentation and locally cached state
- Supabase Auth, Postgres migrations, row-level security, and Edge Functions
- Server-issued attack sessions and server-authoritative settlement
- Deterministic seed/replay verification for DSL games
- Radix primitives, Lucide/custom SVG iconography, and Framer Motion
- Vitest, Testing Library, happy-dom, and Deno-compatible Edge Function tests

The Supabase implementation is under `supabase/`:

- migrations define profiles, vault loadouts, attacks, results, custom games, royalties, and RLS;
- `list_targets`, `start_attack`, `submit_result`, and `resolve_defense` implement the attack flow;
- shared economy, calibration, plausibility, moderation, DSL runtime, and replay verification modules keep settlement authoritative;
- `generate_game` supports the existing custom-game pipeline while treating generated output as data, never executable code.

When Supabase is unavailable, the UI labels local targets as practice bots and keeps offline behavior clearly separate from persistent multiplayer state.

## Project layout

```text
src/
  components/game/       Shared game icons, state badges, breach HUD, outcomes
  components/minigames/  36 lazy-loaded engines, host, boundary, shared chrome
  game/                   Economy, catalog, matchmaking, and presentation helpers
  screens/                Home, defense builder, heist, attack, onboarding, social
  services/               Supabase client, API, session, and hydration adapters
  store/                  Player, heist, social, custom-game, and marketplace state
  utils/                  Browser-native sound and haptic feedback hooks
supabase/
  migrations/             Database contracts and RLS
  functions/              Edge Functions and deterministic verification tests
docs/
  VISUAL_STATE_SYSTEM.md
  MINIGAME_PRESENTATION.md
```

## Minigame runtime

Every minigame implements `MiniGameProps`:

```ts
interface MiniGameProps {
  difficulty: number; // continuous 0..1
  seed: string;       // server-issued deterministic seed
  config?: unknown;   // verified data/configuration, never executable code
  onComplete: (result: MiniGameResult) => void;
}
```

`src/components/minigames/registry.ts` keeps the registry keyed by `ModuleType`, but each of the 36 engines is now a separate lazy Vite chunk. `MiniGameHost` supplies an accessible loading state and retains the error boundary, so an engine failure fails safely instead of crashing the attack shell.

Pattern Lock, Tetris, and Safe Dial are the polished reference engines. They demonstrate the shared chrome, keyboard and labeled touch controls, deterministic setup, continuous difficulty, reduced motion, near-miss feedback, and user-controlled sound/haptic hooks. The other engines inherit the shared attack shell and accessibility presentation without changing their verification behavior.

See [Visual state system](docs/VISUAL_STATE_SYSTEM.md) and [Minigame presentation contract](docs/MINIGAME_PRESENTATION.md) before adding presentation or engines.

## Commands

Use the existing dependencies; the overhaul does not require new packages or network access.

```sh
npm run dev            # Vite development server
npm test               # complete Vitest suite
npm run test:watch     # interactive Vitest
npm run test:coverage  # V8 coverage
npm run lint           # ESLint
npm run build          # TypeScript project build + production Vite bundle
npm run preview        # serve the production build locally
```

For local responsive inspection without test credentials, development builds only accept `?visualQa=1` (for example, `/heist?visualQa=1`). This bypass is removed by Vite's production build and does not alter the authentication flow or persisted multiplayer boundary.

The tests cover economy and target presentation, state badges, game catalog metadata, interactive onboarding, lazy registry loading, the reference minigames, stores, API adapters, DSL logic, and server attack/settlement flows.

## Accessibility and motion

- Interactive targets are at least 44 × 44 CSS pixels.
- Icon-only controls have accessible names.
- Secure, warning, attack, crack, failure, and breach states use labels and geometry in addition to color.
- Focus-visible styles are high contrast and consistent across tactical controls.
- Bottom navigation and action trays include safe-area insets and do not cover scrollable content.
- `prefers-reduced-motion` removes nonessential scans, pulses, shakes, and mechanical loops.
- Touch controls are labeled; the reference games also support keyboard input.
- Sound is off by default and can be enabled during a breach. Haptics use feature-detected browser APIs.

## Environment

The browser client reads the repository's documented Vite Supabase environment values. Persistent accounts, balances, matchmaking, royalties, and settlement require a configured Supabase project. Never put service-role credentials in client environment files.

Email authentication setup is documented in [docs/AUTH_EMAIL_SETUP.md](docs/AUTH_EMAIL_SETUP.md).
