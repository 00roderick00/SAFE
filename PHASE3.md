# Phase 3 — AI Game Builder (the differentiator)

Users design their own minigames in plain English, the games guard their safe, and creators earn tokens when others stake against them. Built in two stages. Real Anthropic AI from the start, called server-side only.

Prereq: Phase 2 backend (server-authoritative tokens, Edge Functions, RLS) is live.

## Stage 3A — AI-configured templates (build first)

Idea: don't let AI write code. Let AI produce a validated **config** for the 36 existing minigame engines. Every output is guaranteed playable and balance-checkable.

### 1. Config-driven minigames
- Extend the minigame contract to `{ difficulty, seed, config?, onComplete }`. Each engine reads the params it supports from `config` (grid size, speed, rule toggles, win condition, theme/colors, timers) and falls back to current defaults when absent.
- Define a JSON Schema per supported game type describing its tunable params and allowed ranges. Start with a strong subset of engines (e.g. maze, snake, timing, pattern, memory, quickmath) and expand.

### 2. Real AI generation (server-side)
- Edge Function `generate_game`: takes the user's natural-language prompt + chosen base engine, calls the Anthropic API, and returns a config JSON.
- The Anthropic key is a **server secret** (e.g. `ANTHROPIC_API_KEY`) set via `supabase secrets set` — never shipped to the client, never in `.env.local`. (Note: secret names cannot start with `SUPABASE_`.)
- Strictly validate the model output against the target engine's JSON Schema server-side. Reject/repair anything out of range. AI output is DATA, never executed as code.

### 3. Calibration gate (non-negotiable)
- Before a custom game can guard a safe, a headless auto-player plays it N times (server-side or a deterministic sim) and the measured solve-rate must fall in a target band for its stated difficulty (e.g. 30–70%).
- Fail calibration -> not deployable. Pass -> store the measured difficulty and use THAT in the economy formulas. This kills the "unwinnable safe = untouchable tokens" exploit.

### 4. Creator economy
- Table `custom_games`: id, creator_id, base_engine, config (jsonb), stated_difficulty, calibrated_difficulty, calibration_stats, plays, status (draft/calibrating/live/rejected), created_at.
- When a live custom game is staked against, the creator earns a royalty (a share of the 8% platform cut) via `insert_ledger` with a new reason `creator_royalty`; add a defense bonus when the game successfully repels an attack.
- Extend Phase 2 `submit_result` plausibility/validation to custom games using the stored config (server knows the expected params, so scores can be bounded/validated).

### 5. Marketplace
- Browse, rate, and equip community games onto safe slots. Replace the FAKE regex "AI rating" in `customGameStore`/`CustomGameSuggest` entirely — delete it.

### 6. Tests
- Schema validation (in-range and out-of-range configs), calibration band logic, royalty ledger math, and a round-trip: generate -> calibrate -> equip -> attacked -> creator paid.

## Stage 3B — AI-composed game DSL (after 3A ships)

- Define a small declarative DSL: entities, movement rules, collision effects, win/lose conditions, timers. One sandboxed runtime interprets it (no arbitrary JS).
- AI compiles NL -> DSL; server validates the DSL and can replay it deterministically for anti-cheat.
- Same calibration gate and creator economy as 3A. This is where "design ANY game" becomes real without code-execution risk.

## Guardrails throughout
- Never execute AI-generated or user-generated code. Config/DSL only, schema-validated server-side.
- All token movement stays server-authoritative through `insert_ledger`.
- Content moderation pass on user prompts/titles before a game goes live.
- Keep tokens non-cashable (gambling-regulation caution from Phase 4 still applies).

## Definition of done (3A)
- A user types a game idea, gets a real AI-built playable variant, it passes calibration, they equip it on their safe, another account attacks it, and the creator's balance increases from the royalty — all server-verified.
