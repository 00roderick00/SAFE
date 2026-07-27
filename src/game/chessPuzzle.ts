// Client-facing barrel over the shared chess puzzle engine.
// Source of truth: supabase/functions/_shared/chess-puzzle.ts — the
// SAME derivation/replay code runs in the Edge Functions, so the board
// the player sees and the line the server verifies can never disagree.
export * from '@shared/chess-puzzle.ts';
