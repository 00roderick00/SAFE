import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    rules: {
      // react-hooks v7 introduced three rules that flag patterns pervasive
      // in this codebase's 36 minigames (mount-time `useRef(Date.now())`,
      // setState calls inside gameplay effects, and forward references to
      // useCallback-defined game-end handlers from earlier effects). They
      // surface real code smells but each fix requires per-file review to
      // avoid changing behavior. Kept on as warnings so future PRs can chip
      // away, but not blocking Phase 1's bug-fix scope. Revisit before
      // shipping if telemetry shows any of these firing in production.
      'react-hooks/purity': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
    },
  },
  // Deno Edge Function handler files. They import from esm.sh URLs and
  // use the Deno global; ESLint would otherwise complain about missing
  // browser globals and non-npm module resolution. Type-safety here is
  // covered by supabase's own Deno tooling, not by our client tsc.
  {
    files: ['supabase/functions/**/index.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
])
