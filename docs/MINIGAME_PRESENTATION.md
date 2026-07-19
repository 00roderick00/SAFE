# Minigame presentation contract

This guide describes how a future engine integrates with SAFE without changing the server-authoritative `MiniGameProps` / `MiniGameResult` contract.

## Layer ownership

The attack screen owns persistent heist context:

- target identity;
- stake at risk and net loot;
- remaining attack time;
- current lock and total locks;
- overall breach progress and the complete lock rail;
- instruction gating for unfamiliar games;
- settlement, vault outcome, sound preference, and haptic feedback.

The minigame owns its focused playfield:

- exact objective and pass requirement;
- local timer or progress when meaningful to that engine;
- score/goal feedback;
- labeled touch controls and keyboard handling;
- a single final `onComplete` result.

Do not duplicate the target payout or full breach rail inside an engine. Use `MiniGameChrome` for the compact objective, timer, progress, status message, and controls layout demonstrated by Pattern Lock, Tetris, and Safe Dial.

## Adding an engine

1. Implement `MiniGameProps` and clamp continuous `difficulty` to the valid 0–1 range before deriving configuration.
2. Derive seeded challenges with deterministic helpers when the server needs replay or verification. Never use generated code or unverified config as executable logic.
3. Report `score` as 0–1, a truthful `passed` value, elapsed `timeSpent`, and the registered module identifiers. Call `onComplete` exactly once.
4. Add the engine to `registry.ts` with `lazyGame(() => import('./Engine'), 'ExportName')` so it remains a separate bundle chunk.
5. Add catalog metadata: category, skills, expected time, control type, solve rate when calibrated, and instruction text.
6. Add focused interaction tests and keep the registry smoke test passing.

## Controls and accessibility

- Give the playfield the largest usable area and remove spacer-only vertical gaps.
- Touch controls must be visible, labeled, and at least 44 × 44 CSS pixels.
- Add keyboard controls where the interaction has a natural mapping; prevent default scrolling only for keys used while the game is active.
- The instruction brief states the exact objective, pass requirement, and controls in a few lines. The attack shell lets returning players skip it.
- Do not encode success or failure with a generic check/cross alone. Pair mechanical or spatial feedback with concise text.
- Keep focus indicators visible, assign accessible names to icon-only controls, and mark decorative SVG/canvas layers appropriately.
- If canvas is used, provide equivalent textual status and controls outside the canvas.

## Motion, sound, and haptics

- All looping motion must stop under `prefers-reduced-motion: reduce`.
- Success, near-miss, and failure may use short one-shot mechanical feedback; the result text must carry the same meaning without motion.
- Call the shared feedback utility for sound/haptics. Sound is user-controlled and muted by default. Browser audio and vibration APIs must be feature detected.
- Never make sound, vibration, or animation necessary to complete a game.

## Verification checklist

- Run the game at difficulty 0, 0.5, and 1 with a fixed seed.
- Exercise touch and keyboard completion, timeout, near miss, success, and failure.
- Verify reduced motion and 200% text zoom do not hide controls or outcome text.
- Check 390 × 844, a larger phone, and desktop.
- Run `npm test`, `npm run lint`, and `npm run build`; confirm the engine remains a separate output chunk.
