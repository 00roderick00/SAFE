// Client-facing barrel over the shared lock-solutions module.
// Source of truth: supabase/functions/_shared/lock-solutions.ts.
// The verifiable-lock minigames import deriveLockSolution from here so
// the client presents exactly the secret the server will verify against.
export * from '@shared/lock-solutions.ts';
