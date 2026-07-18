import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Not throwing here — the app can render its onboarding/auth-required
  // screen even when Supabase isn't configured. Server-touching code
  // paths use `assertConfigured()` before making requests.
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. ' +
      'Auth and API calls will fail until .env.local is populated.'
  );
}

export const supabase = createClient(url ?? 'https://placeholder.supabase.co', anonKey ?? 'placeholder', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// supabase-js refreshes the access token on a timer, but that timer can
// stall while the tab is backgrounded — the exact cause of the mid-use
// "JWT expired" bounces in TESTING-FINDINGS P1.2. Re-arm the refresh
// loop whenever the tab becomes visible again (and pause it when hidden)
// so a returning user always has a fresh token. Guarded for non-browser
// (test/SSR) environments.
if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
  const syncAutoRefresh = () => {
    if (document.visibilityState === 'visible') {
      // Kick an immediate refresh-if-needed, then resume the timer.
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  };
  document.addEventListener('visibilitychange', syncAutoRefresh);
  // Arm it now for the initial (visible) load.
  syncAutoRefresh();
}

export function isSupabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}
