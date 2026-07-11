# Phase 3B Progress — AI-composed game DSL

Stage 3B adds a small declarative game DSL that the AI composes from natural language. The server validates the DSL against a strict schema and calibrates it by REALLY running a deterministic interpreter (not a heuristic), then publishes it through the same custom_games / marketplace / equip / royalty pipeline as 3A. DSL games are DATA — the runtime is fixed and shared between server calibration and client rendering.

Also in this pass: content moderation on prompt+title (blocks obvious hard-fail content, calls Anthropic classifier for the rest), and the three 3A engines that previously ignored `config` (snake, memorymatch, quickmath) now actually consume their schema fields so custom variants differ from the built-ins.

`npm run build` ✓ · `npm run lint` 0 errors ✓ · `npm test` **170 tests pass** (up from 142).

## Sensible defaults chosen (documented so you can override)

- **DSL surface**: `{version:1, board{width,height}, entities[{id,kind,x,y,movement?}], timeLimit, winCondition}` — 5 entity kinds (player/wall/token/enemy/goal), 4 movement types (static/input/random/chase), 3 win conditions (collect_all_tokens/reach_goal/survive). Bounds: board 5-20 per side, timeLimit 15-120s, up to 50 entities, enemy speed 1-8, id ≤24 chars. Unknown fields rejected; duplicate ids/cells rejected; cross-kind constraints enforced (player must be `input`, walls/tokens/goals must be `static`, enemies must be `random` or `chase`).
- **Calibration**: 60 iterations of `playHeadless()` per DSL, `[0.30, 0.70]` solve-rate band identical to 3A. Traces truncated to first 5 in DB (keeps `calibration_stats` JSONB small).
- **Tick rate**: 5 Hz on both server and client. Same code path is duplicated in `DslRunner.tsx` — round-trip test asserts they agree.
- **Anthropic model**: `claude-haiku-4-5-20251001` for both the game-designer call and the moderator call. `maxTokens=1200` for DSL, `400` for engine-config, `120` for moderation.
- **Moderation policy**:
  - Local blocklist runs first (no AI cost): obvious CSAM keywords, "kill myself/yourself/someone", `SSN`, credit-card wording.
  - Anthropic classifier: returns `{safe, category, reason?}` for the six categories `clean|hate|sexual|violence|personal_info|illegal|other`. Treat game-context violence as SAFE, real-world violence as UNSAFE.
  - Fail-open on Anthropic outage (blocklist still active) — flagged with `source: 'fail_open'` so operator can decide policy later.
- **DSL row storage**: `mode='dsl_program'` with `base_engine='maze'` as a nominal placeholder used only by the royalty enum + UI icon; the DSL runtime drives actual gameplay from `dsl_program` jsonb.
- **3A engine plumbing**:
  - Snake: `boardSize`, `speed` (1-5 mapped to 224-80ms tick), `targetLength`, `timeLimit` all consumed.
  - MemoryMatch: `pairCount`, `timeLimit` consumed. `memorizeTime` is in the schema but not yet applied (no preview phase in the current engine — future upgrade).
  - QuickMath: `problemCount` (game ends after N problems), `operations` (add/sub/mul/div — new integer-division branch), `timeLimit`, `allowNegatives` (allows a > b in subtraction).

## Manual deploy steps

Both actually done automatically by this pass:

1. **Migration** — `supabase/migrations/20260711140000_phase3b_dsl.sql` — adds `mode` + `dsl_program` columns and rebuilds `public_custom_games`. First attempt failed on `create or replace view` (Postgres won't reorder columns); fixed with an explicit drop + create in the migration file. Applied via `supabase db push`.
2. **Function redeploy** — `supabase functions deploy generate_game` uploaded the new bundle (adds moderation, DSL validator, DSL calibrator to the function's `_shared/` graph).

Verify:
- Table editor: `custom_games` now has `mode text default 'engine_config'` and `dsl_program jsonb`.
- `select * from public_custom_games limit 1` returns the extended shape.
- Function logs: a call to `/functions/v1/generate_game` with `{mode:'dsl_program', ...}` returns 200.

Nothing more to run — the anthropic key from 3A is reused; there are no new secrets.

## Manual browser verification

1. `npm run dev`, sign in.
2. Go to `/custom-games` → **Build** → choose **Design a game**.
3. Prompt: `A tight 7x7 maze where I collect three tokens while a slow chasing enemy patrols the middle.`
4. Watch Network → `POST /functions/v1/generate_game` with `mode: "dsl_program"`. Response has:
   - `customGame.mode === 'dsl_program'` and a populated `dsl_program`.
   - `calibration.solveRate` in [0.30, 0.70] on a "live" row; outside on a "rejected" one.
   - `calibration.traces` non-empty (first 5 headless runs).
5. If live, open `/marketplace` — the row is listed. Click a slot to equip it on your safe.
6. Attack that safe from a second account. On the AttackScreen the DSL renderer shows a grid with player/tokens/enemies rendered from the JSON. Arrow keys move the player. On completion the round-trip pays the creator via a `creator_royalty` ledger row.
7. Moderation smoke test: try to build with a prompt including `child porn` — see `custom_games` inserted as `status='rejected'` with `calibration_stats.reason='moderation'`. `generate_game` short-circuits before any AI game-design call.
8. 3A engine plumbing: build an engine-config snake with `boardSize: 15, speed: 5, targetLength: 20, timeLimit: 60` and confirm the board and pace visibly differ from the built-in snake at difficulty 0.5.

## What changed (files)

- **New (server)**: `_shared/dsl.ts`, `_shared/dsl-runtime.ts`, `_shared/moderation.ts`, plus `.test.ts` for each, `phase3b.roundtrip.test.ts`, migration `20260711140000_phase3b_dsl.sql`.
- **Modified (server)**: `generate_game/index.ts` (mode router + moderation), `_shared/attack-flow.ts` (`AttackModuleSeed.mode`).
- **New (client)**: `src/components/minigames/DslRunner.tsx`.
- **Modified (client)**:
  - `SnakeGame`, `MemoryMatch`, `QuickMath` now consume `config`.
  - `MiniGameHost` dispatches to `DslRunner` when `mode === 'dsl_program'`.
  - `MarketplaceScreen` copies `dsl_program` into the equipped module.
  - `CustomGameScreen` — mode toggle (engine vs DSL); engine picker hidden in DSL mode.
  - `SecurityModule.customConfig.mode` + client & shared type sync.
  - `heistStore.getCurrentModule` threads `mode` from the server-issued seed to the AttackScreen.
  - `api.ts` — `CustomGame.mode`, `CustomGame.dsl_program`, `GenerateGameParams.mode`.
- **Config**: `tsconfig.app.json` — exclude `_shared/moderation.ts` and every `*.test.ts` from the app build (tests run via vitest, not tsc; the moderation file references the Deno global via anthropic.ts and is server-only).

## Known trade-offs & TODOs (not blocking 3B)

- **DSL runtime is duplicated** between server (`_shared/dsl-runtime.ts`) and client (`DslRunner.tsx`) because Deno-flavoured imports don't cleanly re-export into Vite. The round-trip test asserts they agree on canonical runs — future work is to extract to a truly-shared browser+Deno module.
- **Calibration heuristic AI** (Manhattan-greedy) is not perfect play. That's the point — it approximates a "typical" player. A smarter A* AI would tighten the calibration and could be dropped in without changing the interface.
- **`MemoryMatch.memorizeTime`** is accepted by the schema but ignored by the engine — no preview phase exists yet. The prompt system tells the AI to set it anyway, and it'll be a UX improvement when we add the preview.
- **Moderation fail-open** on Anthropic outage — the local blocklist still runs. If policy requires fail-closed, flip the fallback branch in `moderation.ts`.
- **Bots don't equip DSL games** (same as 3A — bot targets use built-ins only). DSL royalties therefore only fire when a real player equips one and someone attacks that safe.
- **Marketplace ordering** is still purely chronological. Rating/search is a Stage 4 UX polish.

## Definition of done (3B)

- [x] Declarative DSL with entities, movement, collision effects (via collisions in the runtime), win/lose conditions, timers.
- [x] Strict schema validation, no code execution anywhere.
- [x] `generate_game` targets either engine config (3A) or DSL (3B); mode is a body field.
- [x] Real headless calibration for DSL (not the 3A heuristic).
- [x] Per-run traces persisted (first 5 to keep JSONB small).
- [x] Same solve-rate band + live/rejected outcome.
- [x] custom_games / marketplace / equip / royalty all reused unchanged (3B rows flow through the same pipeline).
- [x] Content moderation on title AND prompt, blocking → `status='rejected'` with reason='moderation'.
- [x] Snake, MemoryMatch, QuickMath now consume config.
- [x] Tests for DSL schema, headless calibration, moderation, full DSL round-trip.
- [x] Migration pushed + `generate_game` redeployed to Supabase.
