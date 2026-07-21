# Deploying SAFE

> ## ⚠️ Deploy ONLY the nested `~/SAFE/SAFE` repo
> The app that must ship is the **nested** repository **`~/SAFE/SAFE`** on branch **`codex-rebuild`** (merged into **`main`**, the production source).
> The **parent `~/SAFE` is an obsolete build. Never deploy it.**
> **Before deploying, run `npm run verify-repo`** — it's read-only and exits non-zero if you are not in the rebuilt app (`scripts/verify-repo.sh`). Suggested: `npm run verify-repo && npm run build`.
> The Vercel project below is Git-connected to `main`, so a normal deploy is just `git push origin main` from this repo.

## Production

- **URL:** https://safe-orpin-xi.vercel.app  (stable alias — always points at the latest production deploy)
- **Host:** Vercel
- **Vercel project:** `safe` (team `roderickjones-7159s-projects`)
- **Git:** connected to `github.com/00roderick00/SAFE`, **production branch = `main`**
- **Framework:** Vite (`vercel.json`: build `npm run build`, output `dist`, SPA rewrite so deep links like `/heist` serve `index.html`)

## Build-time env vars (set in Vercel — Production **and** Preview)

Vite inlines `VITE_*` at build time, so these must exist before the build:

| Var | Where the value comes from |
|-----|----------------------------|
| `VITE_SUPABASE_URL` | `https://cqacfzkyxmtmjzpksznj.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the `sb_publishable_…` key — kept in `~/SAFE/SAFE/.env.local` (gitignored), **never committed** |

Manage them: `vercel env ls`, `vercel env add <NAME> <production|preview>`, `vercel env rm <NAME> <env>`.
The anon key is the *publishable* client key (safe to ship in the browser bundle), but it still isn't stored in the repo — only in Vercel and `.env.local`.

## Supabase Auth (project `cqacfzkyxmtmjzpksznj`)

So magic-link sign-in redirects to production (not `localhost`):

- **Site URL:** `https://safe-orpin-xi.vercel.app`
- **Redirect URL allowlist (`uri_allow_list`):**
  - `https://safe-orpin-xi.vercel.app/**`
  - `http://localhost:5173/**`
  - `http://localhost:5174/**`
  - `http://localhost:5175/**`

Set via the Management API (`PATCH /v1/projects/cqacfzkyxmtmjzpksznj/config/auth`, fields `site_url` + `uri_allow_list`) or the dashboard: Authentication → URL Configuration.
Auth emails send via AgentMail SMTP — see `EMAIL-SETUP.md`.

> If the production URL ever changes (e.g. a custom domain), update **both** the Vercel deployment/alias **and** these two Supabase values, or sign-in links will break.

## Redeploy

- **Normal:** `git push origin main`. The connected Git integration builds and promotes to production automatically.
- **Manual / from local:** from `~/SAFE/SAFE`, `vercel --prod` (add `--token <token> --scope roderickjones-7159s-projects` when not interactively logged in). Deploys the current local tree straight to production.

## Roll back

- `vercel ls` (list deployments) → find the previous good production deployment URL.
- `vercel rollback <deployment-url>` — instantly re-points the production alias at that older deployment (no rebuild).
- Or Vercel dashboard → project `safe` → **Deployments** → pick a previous one → **Promote to Production**.

Rolling back only changes which deployment is live; it doesn't touch git. To also revert the source, `git revert` on `main` and push.

## Local dev

`.env.local` already holds the Supabase values. `npm run dev` serves on `localhost:5173` (5174/5175 as fallbacks), all allow-listed above.
